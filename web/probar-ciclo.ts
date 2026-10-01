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

/** Detecta si hay reglas de pagosPorHitos. */
function tieneHitosGlobal(boot: AppBootResult): boolean {
  // Buscar en las plantillas compiladas dentro del RuleSet
  const result = boot.input.ruleSet.rules.some((r: any) => "plantilla" in r && r.plantilla === "tpl.hitos_pago");
  // Buscar también en policyTemplates (invocaciones sin compilar)
  const policyTemplatesWithHitos = (boot.input as any).policyTemplates?.some((p: any) => p.plantilla === "tpl.hitos_pago");

  const plantillas = boot.input.ruleSet.rules.filter((r: any) => "plantilla" in r).map((r: any) => r.plantilla);
  const policyTemplates = (boot.input as any).policyTemplates?.map((p: any) => p.plantilla) ?? [];
  console.log(`[DEBUG] Reglas compiladas con plantilla: ${plantillas.join(", ")} ; Policy templates: ${policyTemplates.join(", ")}`);
  console.log(`[DEBUG] Tiene tpl.hitos_pago en reglas: ${result}, en policyTemplates: ${policyTemplatesWithHitos}`);

  return result || !!policyTemplatesWithHitos;
}

/** Prueba el ciclo completo de todos los procesos del negocio. */
export async function probarCiclos(boot: AppBootResult, rt: AppRuntime): Promise<ResultadoCiclo[]> {
  const out: ResultadoCiclo[] = [];
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
    if (!alta.ok) {
      out.push({ lifecycleId: slice.id, paradoEn: "alta", motivo: alta.errors.join(" ") });
      continue;
    }

    // Detecta si hay pagosPorHitos y extrae los IDs reales
    const tienePagosPorHitos = tieneHitosGlobal(boot);
    console.log(`[DEBUG] Ciclo ${slice.id}: tienePagosPorHitos=${tienePagosPorHitos}`);
    const totalExp = 10000; // céntimos (100 EUR)
    const mitad = Math.round(totalExp / 2);

    let hitoIds: string[] = [];
    if (tienePagosPorHitos) {
      const hitosRule = boot.input.ruleSet.rules.find(
        (r: any) => "plantilla" in r && r.plantilla === "tpl.hitos_pago"
      ) as any;
      if (hitosRule?.parametros?.hitosJson) {
        try {
          const hitos = JSON.parse(hitosRule.parametros.hitosJson);
          hitoIds = hitos.map((h: any) => h.id ?? `h${hitos.indexOf(h) + 1}`);
          console.log(`[DEBUG] Ciclo ${slice.id}: Hitos encontrados:`, hitoIds);
        } catch (e) {
          // Si falla el parse, genera IDs genéricos
          hitoIds = ["h1", "h2"];
          console.log(`[DEBUG] Ciclo ${slice.id}: Parse error, usando IDs genéricos:`, hitoIds);
        }
      } else {
        console.log(`[DEBUG] Ciclo ${slice.id}: No hitosJson encontrado`);
      }
    }

    let n = 0;
    let parado = "";
    let motivo = "";
    let hitosPagados = false;
    for (const t of caminoAlExito(slice.lifecycle)) {
      let ok = false;
      motivo = "";

      // Después de aceptar (t_acordar) o en el siguiente paso crítico, registra pagos
      if (tienePagosPorHitos && !hitosPagados && (t === "t_ejecutar" || t === "t_presentar" || t === "t_cerrar")) {
        // Registra cada hito con su importe proporcional
        for (const hitoId of hitoIds) {
          if (hitoId) {
            rt.registrarCobro(
              alta.id,
              { importeCentimos: mitad, hitoId, medio: "transferencia" },
              "prueba-hitos"
            );
          }
        }
        hitosPagados = true;
      }

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
    }
    out.push(parado ? { lifecycleId: slice.id, paradoEn: parado, motivo } : { lifecycleId: slice.id, paradoEn: "OK" });
  }
  return out;
}
