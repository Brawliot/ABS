/**
 * Cada proceso de cada negocio de ejemplo completa su ciclo (del presupuesto
 * al cierre con éxito) con datos reales. Los pendientes conocidos se listan
 * aparte y se comprueba que siguen parando exactamente donde se espera: si un
 * arreglo los desbloquea, el test obliga a sacarlos de la lista.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Lifecycle } from "../core/lifecycle.js";
import { AppRuntime, allBootableIds, bootProfile, executeUiAction } from "../web/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

/** Pendientes conocidos: proceso → paso en el que se para (y por qué). */
const PENDIENTES: Readonly<Record<string, string>> = {
  // Cobros por hitos (necesitan cobros parciales)
  "p02-clinica-dental/lc.servicio_proyecto": "t_ejecutar",
  "p10-reformas/lc.servicio_proyecto": "t_ejecutar",
  "p10-reformas/lc.subcontrata": "t_ejecutar",
  // La regla de hitos del trabajo se aplica también a las compras (reglas sin ámbito de proceso)
  "p10-reformas/lc.compras": "t_cerrar",
  // Plazo de desistimiento colocado en «aceptar» (necesita flujo de devoluciones)
  "p07-tienda-online/lc.venta": "t_aceptar",
  "p07-tienda-online/lc.compras": "t_aceptar",
};

function caminoAlExito(lc: Lifecycle): string[] {
  const init = lc.states.find((s) => s.kind === "inicial")!.id;
  const exito = new Set(lc.states.filter((s) => s.kind === "terminal_exito").map((s) => s.id));
  const prev = new Map<string, [string, string]>();
  const cola = [init];
  const vistos = new Set([init]);
  while (cola.length > 0) {
    const s = cola.shift()!;
    if (exito.has(s)) {
      const out: string[] = [];
      for (let c = s; c !== init; c = prev.get(c)![0]) out.unshift(prev.get(c)![1]);
      return out;
    }
    for (const t of lc.transitions) {
      if (t.from === s && !vistos.has(t.to)) {
        vistos.add(t.to);
        prev.set(t.to, [s, t.id]);
        cola.push(t.to);
      }
    }
  }
  return [];
}

describe("Ciclo completo en los 12 negocios", () => {
  it("cada proceso llega al cierre, salvo los pendientes conocidos", async () => {
    const resultado: Record<string, string> = {};
    for (const id of allBootableIds()) {
      const boot = bootProfile(id);
      const dir = mkdtempSync(join(tmpdir(), "abs-ciclo-"));
      dirs.push(dir);
      const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });
      for (const slice of boot.input.lifecycles) {
        // Datos adicionales como los rellenaría el negocio (fianza > 0; el resto vacío = 0)
        const campos = Object.fromEntries(
          rt.camposDeProceso(slice.id).filter((c) => c.campo.includes("fianza")).map((c) => [c.campo, 50]),
        );
        const alta = rt.crearTransaccion(
          {
            lifecycleId: slice.id,
            parteId: "parte-demo-1",
            fecha: "2026-09-01",
            lineas: [{ descripcion: "Servicio", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }],
            campos,
          },
          "prueba",
        );
        expect(alta.ok, `${id}/${slice.id}: ${alta.ok ? "" : alta.errors.join(" ")}`).toBe(true);
        if (!alta.ok) continue;
        let n = 0;
        let parado = "";
        for (const t of caminoAlExito(slice.lifecycle)) {
          let ok = false;
          for (const r of boot.roles) {
            const out = await executeUiAction(rt, {
              actionId: `action.${slice.id}.${t}`,
              subjectId: alta.id,
              clientRequestId: `${alta.id}-${n++}`,
              roleId: r.id,
              parteId: "parte-demo-1",
              channel: "backoffice",
              kind: "boton",
            });
            if (out.ok) {
              ok = true;
              break;
            }
          }
          if (!ok) {
            parado = t;
            break;
          }
        }
        resultado[`${id}/${slice.id}`] = parado || "OK";
      }
      rt.close();
    }
    const esperado = Object.fromEntries(
      Object.keys(resultado).map((k) => [k, PENDIENTES[k] ?? "OK"]),
    );
    expect(resultado).toEqual(esperado);
    expect(Object.keys(resultado).length).toBeGreaterThanOrEqual(25);
  });
});

describe("Arreglos del paso 0", () => {
  function open(id: string) {
    const dir = mkdtempSync(join(tmpdir(), "abs-p0-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile(id), { dbPath: join(dir, "db.sqlite") });
  }
  const linea = [{ descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }];

  it("los datos adicionales salen de las reglas y frenan con un mensaje claro", async () => {
    const rt = open("p05-restaurante");
    expect(rt.camposDeProceso("lc.uso_temporal")).toEqual([{ campo: "fianza_eur", tipo: "numero" }]);
    expect(rt.etiquetas.campo("fianza_eur")).toBe("Fianza (€)");
    const sin = rt.crearTransaccion({ lifecycleId: "lc.uso_temporal", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea }, "t");
    if (!sin.ok) throw new Error();
    const r = await executeUiAction(rt, {
      actionId: "action.lc.uso_temporal.t_reservar", subjectId: sin.id, clientRequestId: "f1",
      roleId: "gerente", parteId: "parte-demo-1", channel: "backoffice", kind: "boton",
    });
    expect(r.ok).toBe(false);
    expect(r.flash.text).toContain("«Fianza (€)»");
    rt.close();
  });

  it("días de impago y recibos pendientes se calculan del cliente", () => {
    const rt = open("p03-ferreteria");
    expect(rt.impagosDe("parte-demo-1")).toEqual({ dias: 0, recibos: 0 });
    rt.close();
  });

  it("un secundario solo bloquea a su expediente principal", async () => {
    const rt = open("concesionaria");
    const mk = (lc: string, vinculadoA?: string) => {
      const r = rt.crearTransaccion({ lifecycleId: lc, parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea, ...(vinculadoA ? { vinculadoA } : {}) }, "t");
      if (!r.ok) throw new Error(r.errors.join());
      return r.id;
    };
    const venta = mk("lc.venta");
    expect(rt.esSecundario("lc.financiera")).toBe(true);
    expect(rt.principalesAbiertos().some((s) => s.id === venta)).toBe(true);
    const fin = mk("lc.financiera", venta);
    expect(rt.vinculadosA(venta).map((s) => s.id)).toEqual([fin]);
    let n = 0;
    const paso = (id: string, lc: string, t: string, role: string) =>
      executeUiAction(rt, { actionId: `action.${lc}.${t}`, subjectId: id, clientRequestId: `v${n++}`, roleId: role, parteId: "parte-demo-1", channel: "backoffice", kind: "boton" });
    expect((await paso(venta, "lc.venta", "t_aceptar", "comercial")).ok).toBe(true);
    const bloq = await paso(venta, "lc.venta", "t_iniciar_entrega", "gerente");
    expect(bloq.ok).toBe(false);
    // Otra venta sin financiación vinculada no se bloquea
    const otra = mk("lc.venta");
    expect((await paso(otra, "lc.venta", "t_aceptar", "comercial")).ok).toBe(true);
    expect((await paso(otra, "lc.venta", "t_iniciar_entrega", "gerente")).ok).toBe(true);
    expect(rt.crearTransaccion({ lifecycleId: "lc.financiera", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea, vinculadoA: "no-existe" }, "t").ok).toBe(false);
    rt.close();
  });
});
