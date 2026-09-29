/**
 * Paso 4 — el dinero: movimientos derivados, hechos de saldo / impago con
 * datos reales, regla «no cerrar con deuda» y pantalla /dinero.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { requireArchetype } from "../archetypes/catalog.js";
import type { TransitionEvent } from "../core/events.js";
import {
  direccionDe,
  importeRegistrado,
  liquidaPago,
  mesMadrid,
  movimientosDe,
  situacionCobro,
} from "../elements/movimientos.js";
import { compilePolicyTemplate } from "../contracts/policy-templates/compile.js";
import { TenantFactProjection, withFactPayload } from "../facts/projection.js";
import { FACT_IDS } from "../facts/catalog.js";
import { AppRuntime, bootProfile, executeUiAction, startWebServer } from "../web/index.js";
import { resumenDinero } from "../web/dinero.js";
import type { ExpedienteDinero } from "../web/runtime.js";

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
function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "abs-dinero-"));
  dirs.push(dir);
  return join(dir, "db.sqlite");
}

const venta = requireArchetype("venta").lifecycle;
const servicio = requireArchetype("servicio_proyecto").lifecycle;
const suscripcion = requireArchetype("suscripcion").lifecycle;
const t = (lc: typeof venta, id: string) => lc.transitions.find((x) => x.id === id)!;

function tev(
  id: string,
  subjectId: string,
  transitionId: string,
  from: string,
  to: string,
  fieldsAfter?: Record<string, unknown>,
  at = "2026-09-10T10:00:00.000Z",
): TransitionEvent {
  return {
    id,
    kind: "transicion",
    subjectId,
    occurredAt: at,
    actorId: "ana",
    actorKind: "humano",
    evidence: { kind: "sistema", reference: "r", recordedAt: at },
    transitionId,
    fromStateId: from,
    toStateId: to,
    ...(fieldsAfter ? { data: { fieldsAfter } } : {}),
  };
}

describe("Qué paso liquida el pago", () => {
  it("venta: al cerrar (cumple c_pagar), no al aceptar", () => {
    expect(liquidaPago(venta, t(venta, "t_cerrar"))).toBe(true);
    expect(liquidaPago(venta, t(venta, "t_aceptar"))).toBe(false);
  });
  it("servicio sin compromiso de pago: al cerrar con éxito, no al fallar", () => {
    expect(liquidaPago(servicio, t(servicio, "t_cerrar"))).toBe(true);
    expect(liquidaPago(servicio, t(servicio, "t_fallar"))).toBe(false);
  });
  it("suscripción: cada renovación pagada", () => {
    expect(liquidaPago(suscripcion, t(suscripcion, "t_renovar"))).toBe(true);
    expect(liquidaPago(suscripcion, t(suscripcion, "t_periodo"))).toBe(false);
  });
  it("sentido del dinero", () => {
    expect(direccionDe("empresa_compra")).toBe("sale");
    expect(direccionDe("empresa_vende")).toBe("entra");
    expect(direccionDe(undefined)).toBe("entra");
  });
});

describe("Movimientos y situación", () => {
  it("usa el importe registrado en el evento (euros → céntimos) y si falta, el total", () => {
    const withAmount = tev("e1", "s", "t_cerrar", "en_entrega", "cerrada", { importe: 256.28 });
    expect(importeRegistrado(withAmount)).toBe(25628);
    const events = [
      tev("e0", "s", "t_aceptar", "propuesta", "aceptada", { importe: 256.28 }),
      tev("e1", "s", "t_iniciar_entrega", "aceptada", "en_entrega", { importe: 256.28 }),
      withAmount,
    ];
    const mov = movimientosDe({
      expedienteId: "s",
      parteId: "p1",
      direccion: "entra",
      lifecycle: venta,
      events,
      totalCentimos: 1,
    });
    expect(mov).toEqual([
      { expedienteId: "s", parteId: "p1", direccion: "entra", importeCentimos: 25628, at: "2026-09-10T10:00:00.000Z", eventId: "e1" },
    ]);
    const legacy = movimientosDe({
      expedienteId: "s",
      parteId: "p1",
      direccion: "entra",
      lifecycle: venta,
      events: [tev("e1", "s", "t_cerrar", "en_entrega", "cerrada")],
      totalCentimos: 999,
    });
    expect(legacy[0]!.importeCentimos).toBe(999);
  });

  it("situación según el estado", () => {
    const s = (stateId: string, mov = 0) =>
      situacionCobro({
        lifecycle: venta,
        stateId,
        movimientos: Array.from({ length: mov }, () => ({}) as never),
      });
    expect(s("propuesta")).toBe("presupuesto");
    expect(s("aceptada")).toBe("pendiente");
    expect(s("en_entrega")).toBe("pendiente");
    expect(s("cerrada", 1)).toBe("liquidado");
    expect(s("cancelada")).toBe("sin_importe");
  });

  it("el mes se cuenta en hora de Madrid", () => {
    expect(mesMadrid("2026-09-30T21:59:00.000Z")).toBe("2026-09");
    expect(mesMadrid("2026-09-30T22:30:00.000Z")).toBe("2026-10");
  });
});

describe("Resumen de dinero", () => {
  const base = {
    lifecycleId: "lc",
    proceso: "P",
    fecha: "2026-09-01",
    estadoId: "x",
    estadoLabel: "X",
  };
  const mov = (id: string, parteId: string, direccion: "entra" | "sale", importe: number, at: string) => ({
    expedienteId: id,
    parteId,
    direccion,
    importeCentimos: importe,
    at,
    eventId: `ev-${id}`,
  });
  const exps: ExpedienteDinero[] = [
    { ...base, id: "a", label: "A", parteId: "p1", direccion: "entra", totalCentimos: 12100, situacion: "liquidado", movimientos: [mov("a", "p1", "entra", 12100, "2026-09-05T10:00:00Z")] },
    { ...base, id: "b", label: "B", parteId: "p1", direccion: "entra", totalCentimos: 24200, situacion: "pendiente", movimientos: [] },
    { ...base, id: "c", label: "C", parteId: "p2", direccion: "entra", totalCentimos: 5000, situacion: "pendiente", movimientos: [] },
    { ...base, id: "d", label: "D", parteId: "p3", direccion: "sale", totalCentimos: 6050, situacion: "liquidado", movimientos: [mov("d", "p3", "sale", 6050, "2026-09-06T10:00:00Z")] },
    { ...base, id: "e", label: "E", parteId: "p3", direccion: "sale", totalCentimos: 1000, situacion: "pendiente", movimientos: [] },
    { ...base, id: "f", label: "F", parteId: "p1", direccion: "entra", totalCentimos: 777, situacion: "presupuesto", movimientos: [] },
    { ...base, id: "g", label: "G", parteId: "p1", direccion: "entra", totalCentimos: 999, situacion: "liquidado", movimientos: [mov("g", "p1", "entra", 999, "2026-08-31T10:00:00Z")] },
    { ...base, id: "h", label: "H", parteId: "p2", direccion: "entra", totalCentimos: 555, situacion: "sin_importe", movimientos: [] },
  ];

  it("cobrado / pagado del mes, pendientes y deuda por cliente", () => {
    const r = resumenDinero(exps, "2026-09");
    expect(r.cobradoMes).toBe(12100);
    expect(r.pagadoMes).toBe(6050);
    expect(r.porCobrar).toBe(24200 + 5000);
    expect(r.porPagar).toBe(1000);
    expect(r.enPresupuesto).toBe(777);
    expect(r.deudaPorCliente).toEqual([
      { parteId: "p1", pendienteCentimos: 24200, expedientes: 1 },
      { parteId: "p2", pendienteCentimos: 5000, expedientes: 1 },
    ]);
    expect(r.deudaConProveedores).toEqual([{ parteId: "p3", pendienteCentimos: 1000, expedientes: 1 }]);
    expect(r.movimientosMes.map((m) => m.expedienteId)).toEqual(["d", "a"]);
    expect(resumenDinero(exps, "2026-08").cobradoMes).toBe(999);
  });
});

describe("Hechos con datos reales", () => {
  const ev = (id: string, subject: string, to: string, facts: Record<string, unknown>) =>
    withFactPayload(tev(id, subject, "t", "x", to), facts as never);

  it("saldo pendiente: suma lo abierto, excluye el propio expediente y no cuenta compras", () => {
    const p = new TenantFactProjection("t");
    p.apply(ev("1", "a", "aceptada", { parteId: "p1", importe: 100 }));
    p.apply(ev("2", "b", "aceptada", { parteId: "p1", importe: 50 }));
    p.apply(ev("3", "c", "aceptada", { parteId: "p1", importe: 70, sentido: "sale" }));
    expect(p.read(FACT_IDS.PARTE_SALDO_PENDIENTE, { parteId: "p1" }).value).toBe(150);
    expect(p.read(FACT_IDS.PARTE_SALDO_PENDIENTE, { parteId: "p1", excludeSubjectId: "a" }).value).toBe(50);
    p.apply(ev("4", "a", "cerrada", { parteId: "p1", importe: 100 }));
    expect(p.read(FACT_IDS.PARTE_SALDO_PENDIENTE, { parteId: "p1" }).value).toBe(50);
  });

  it("importe impagado: solo transacciones en impago", () => {
    const p = new TenantFactProjection("t");
    p.apply(ev("1", "a", "en_curso", { parteId: "p1", importe: 100 }));
    p.apply(ev("2", "b", "impagada", { parteId: "p1", importe: 40 }));
    p.apply(ev("3", "c", "no_devuelta", { parteId: "p1", importe: 5 }));
    expect(p.read(FACT_IDS.PARTE_IMPORTE_IMPAGADO, { parteId: "p1" }).value).toBe(45);
    expect(p.read(FACT_IDS.PARTE_IMPORTE_IMPAGADO, { parteId: "p1", excludeSubjectId: "b" }).value).toBe(5);
    expect(p.read(FACT_IDS.PARTE_IMPORTE_IMPAGADO, { parteId: "otro" }).value).toBe(0);
  });

  it("la regla «no cerrar con deuda» mira impagos, no trabajos en curso", () => {
    const out = compilePolicyTemplate({
      id: "tpl-saldo",
      plantilla: "tpl.restriccion_saldo_antes_de",
      parametros: {},
    } as never);
    const policy = out.policies[0] as { factRestriction?: { factId: string; params: Record<string, string> } };
    expect(policy.factRestriction).toMatchObject({
      factId: "parte.importe_impagado",
      params: { parteId: "$fields.parte_id", excludeSubjectId: "$fields.subject_id" },
    });
  });
});

describe("Runtime: cada paso registra cliente e importe del expediente", () => {
  const PROFILE = "p04-taller-mecanico";
  const SERV = "lc.servicio_proyecto";
  const COMPRAS = "lc.compras";

  async function avanzar(rt: AppRuntime, id: string, lc: string, steps: string[], parteQuePulsa = "parte-demo-2") {
    for (const [i, step] of steps.entries()) {
      const r = await executeUiAction(rt, {
        actionId: `action.${lc}.${step}`,
        subjectId: id,
        clientRequestId: `${id}-${i}`,
        roleId: "dueno",
        parteId: parteQuePulsa,
        channel: "backoffice",
        kind: "boton",
      });
      if (!r.ok) throw new Error(`${step}: ${r.flash.text}`);
    }
  }

  function crear(rt: AppRuntime, lc: string, eur: number, parteId = "parte-demo-1"): string {
    const r = rt.crearTransaccion(
      { lifecycleId: lc, parteId, fecha: "2026-09-01", lineas: [{ descripcion: "X", cantidadMilesimas: 1000, precioCentimos: eur * 100, ivaPct: 21 }] },
      "ana",
    );
    if (!r.ok) throw new Error(r.errors.join());
    return r.id;
  }

  it("dos trabajos abiertos del mismo cliente no se bloquean entre sí al cerrar", async () => {
    const rt = AppRuntime.open(bootProfile(PROFILE), { dbPath: tempDb() });
    const a = crear(rt, SERV, 100);
    const b = crear(rt, SERV, 200);
    await avanzar(rt, b, SERV, ["t_acordar", "t_ejecutar", "t_presentar"]);
    await avanzar(rt, a, SERV, ["t_acordar", "t_ejecutar", "t_presentar", "t_cerrar"]);

    const cierre = rt.store
      .getBySubject(a)
      .find((e) => e.kind === "transicion" && e.transitionId === "t_cerrar") as TransitionEvent;
    const after = (cierre.data as { fieldsAfter: Record<string, unknown> }).fieldsAfter;
    // Cliente del expediente (no el de quien pulsa) y total con IVA en euros
    expect(after).toMatchObject({ parte_id: "parte-demo-1", importe: 121, sentido: "entra", subject_id: a });

    const ea = rt.expedientesDinero().find((e) => e.id === a)!;
    expect(ea.situacion).toBe("liquidado");
    expect(ea.movimientos).toHaveLength(1);
    expect(ea.movimientos[0]!.importeCentimos).toBe(12100);
    expect(rt.expedientesDinero().find((e) => e.id === b)!.situacion).toBe("pendiente");
    rt.close();
  });

  it("las compras salen y no cuentan como deuda del proveedor", async () => {
    const rt = AppRuntime.open(bootProfile(PROFILE), { dbPath: tempDb() });
    const serv = crear(rt, SERV, 200);
    await avanzar(rt, serv, SERV, ["t_acordar"]);
    const compra = crear(rt, COMPRAS, 50);
    await avanzar(rt, compra, COMPRAS, ["t_aceptar", "t_iniciar_entrega", "t_cerrar"]);
    const e = rt.expedientesDinero().find((x) => x.id === compra)!;
    expect(e.direccion).toBe("sale");
    expect(e.movimientos[0]).toMatchObject({ direccion: "sale", importeCentimos: 6050 });
    const saldo = rt.facts.prepare(rt.tenantId, [
      { factId: FACT_IDS.PARTE_SALDO_PENDIENTE, params: { parteId: "parte-demo-1" } },
    ]);
    expect(Object.values(saldo.entries)[0]!.value).toBe(242);
    rt.close();
  });
});

describe("Web: /dinero y fichas", () => {
  it("resumen, ficha del expediente y ficha del cliente", async () => {
    const h = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath: tempDb() });
    try {
      const rt = h.runtime;
      const mk = (eur: number) => {
        const r = rt.crearTransaccion(
          { lifecycleId: "lc.servicio_proyecto", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: [{ descripcion: "X", cantidadMilesimas: 1000, precioCentimos: eur * 100, ivaPct: 21 }] },
          "ana",
        );
        if (!r.ok) throw new Error(r.errors.join());
        return r.id;
      };
      const a = mk(100);
      const b = mk(200);
      let n = 0;
      for (const [id, steps] of [
        [a, ["t_acordar", "t_ejecutar", "t_presentar", "t_cerrar"]],
        [b, ["t_acordar"]],
      ] as const) {
        for (const s of steps) {
          const r = await executeUiAction(rt, {
            actionId: `action.lc.servicio_proyecto.${s}`,
            subjectId: id,
            clientRequestId: `w${n++}`,
            roleId: "dueno",
            parteId: "parte-demo-1",
            channel: "backoffice",
            kind: "boton",
          });
          expect(r.ok, r.flash.text).toBe(true);
        }
      }

      const dinero = await (await fetch(`${h.url}dinero?role=dueno`)).text();
      expect(dinero).toMatch(/data-kpi="cobrado">[\s\S]*?121,00 €/);
      expect(dinero).toMatch(/data-kpi="por-cobrar">[\s\S]*?242,00 €/);
      expect(dinero).toContain("data-deuda-clientes");
      expect(dinero).toContain('data-movimiento="entra"');

      const otroMes = await (await fetch(`${h.url}dinero?role=dueno&mes=2020-01`)).text();
      expect(otroMes).toContain("data-movimientos-vacio");

      const fichaA = await (await fetch(`${h.url}expedientes/${a}?role=dueno`)).text();
      expect(fichaA).toContain('data-situacion="liquidado"');
      expect(fichaA).toContain("Cobrado 121,00 €");
      const fichaB = await (await fetch(`${h.url}expedientes/${b}?role=dueno`)).text();
      expect(fichaB).toContain("Pendiente de cobro: 242,00 €");

      const cliente = await (await fetch(`${h.url}partes/parte-demo-1?role=dueno`)).text();
      expect(cliente).toMatch(/data-te-debe>242,00 €/);
      expect(cliente).toContain("data-parte-expedientes");

      const home = await (await fetch(`${h.url}?role=dueno`)).text();
      expect(home).toContain('data-maestros="dinero"');
      expect((await fetch(`${h.url}dinero?role=cliente`)).status).toBe(403);
    } finally {
      await h.close();
    }
  });
});
