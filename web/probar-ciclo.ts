/**
 * Recorre cada proceso de un negocio desde el alta hasta el cierre con éxito,
 * con datos de prueba, y dice dónde se para. Lo usan el test de ciclos y
 * `npm run generar`.
 */

import type { Lifecycle } from "../core/lifecycle.js";
import { executeUiAction } from "./action-handler.js";
import type { AppRuntime } from "./runtime.js";
import type { AppBootResult } from "./types.js";

/** Pasos más cortos del estado inicial a un estado de éxito. */
export function caminoAlExito(lc: Lifecycle): string[] {
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

export interface ResultadoCiclo {
  readonly lifecycleId: string;
  /** "OK" si llega al cierre; si no, el paso donde se para. */
  readonly paradoEn: string;
  /** Mensaje del último intento fallido (para explicar el porqué). */
  readonly motivo?: string;
}

/** Prueba el ciclo completo de todos los procesos del negocio. */
export async function probarCiclos(boot: AppBootResult, rt: AppRuntime): Promise<ResultadoCiclo[]> {
  const out: ResultadoCiclo[] = [];
  for (const slice of boot.input.lifecycles) {
    // Datos adicionales como los rellenaría el negocio (fianza > 0; el resto vacío = 0)
    const campos: Record<string, number | boolean | string> = Object.fromEntries(
      rt.camposDeProceso(slice.id).filter((c) => c.campo.includes("fianza")).map((c) => [c.campo, 50]),
    );

    // Agregar cliente_id para arquetipos que lo requieren
    if (slice.archetypeId === "venta" || slice.archetypeId === "servicio" || slice.archetypeId === "servicio_proyecto") {
      campos.cliente_id = "parte-demo-1";
    }
    // Agregar proveedor_id para compras
    if (slice.archetypeId === "compra") {
      campos.proveedor_id = "parte-demo-1";
    }

    const lineas = [{ descripcion: "Servicio", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }];
    const alta = rt.crearTransaccion(
      {
        lifecycleId: slice.id,
        parteId: "parte-demo-1",
        fecha: "2026-09-01",
        lineas,
        campos,
      },
      "prueba",
    );
    if (!alta.ok) {
      out.push({ lifecycleId: slice.id, paradoEn: "alta", motivo: alta.errors.join(" ") });
      continue;
    }

    // Detectar si el proceso tiene hitos (servicio_proyecto) y registrar pagos antes de t_ejecutar
    const tieneHitos = slice.archetypeId === "servicio_proyecto";
    const totalExpediente = lineas.reduce((sum, l) => sum + (l.precioCentimos * l.cantidadMilesimas / 1000), 0);

    let n = 0;
    let parado = "";
    let motivo = "";
    for (const t of caminoAlExito(slice.lifecycle)) {
      // Si hay hitos y es t_ejecutar, registrar el primer 50% de pago
      if (tieneHitos && t === "t_ejecutar") {
        const mitad = Math.round(totalExpediente / 2);
        rt.registrarCobro(alta.id, { importeCentimos: mitad, hitoId: "h1", medio: "prueba" }, "test");
      }

      let ok = false;
      motivo = "";
      for (const r of boot.roles) {
        const res = await executeUiAction(rt, {
          actionId: `action.${slice.id}.${t}`,
          subjectId: alta.id,
          clientRequestId: `${alta.id}-${n++}`,
          roleId: r.id,
          parteId: "parte-demo-1",
          channel: "backoffice",
          kind: "boton",
        });
        if (res.ok) {
          ok = true;
          break;
        }
        // El motivo útil es el de un rol con permiso, no el «no tiene permiso» del resto
        if (!motivo || !/permiso/i.test(res.flash.text)) motivo = res.flash.text;
      }
      if (!ok) {
        parado = t;
        break;
      }

      // Si hay hitos, registrar el segundo 50% de pago después de t_presentar
      if (tieneHitos && t === "t_presentar") {
        const mitad = Math.round(totalExpediente / 2);
        rt.registrarCobro(alta.id, { importeCentimos: mitad, hitoId: "h2", medio: "prueba" }, "test");
      }
    }
    out.push(parado ? { lifecycleId: slice.id, paradoEn: parado, motivo } : { lifecycleId: slice.id, paradoEn: "OK" });
  }
  return out;
}
