/**
 * Checklist: puntos de funcionalidad que MIDEN de verdad con pruebas ejecutables.
 * Cada punto se da por cubierto solo si una prueba lo verifica.
 */

import type { AppBootResult } from "../web/types.js";
import type { AppRuntime } from "../web/runtime.js";
import { probarCicloCompleto } from "./pruebas/ciclos.js";
import {
  probarCobroHitos,
  probarCobroSena,
  probarCobroCredito,
  probarCobroPlazos,
  probarCobroFianza,
} from "./pruebas/cobros.js";
import {
  probarPoliticaImporte,
  probarPoliticaIncidencias,
  probarPoliticaSaldo,
  probarPoliticaDescuento,
  probarPoliticaImpago,
  probarPoliticaLimiteCredito,
} from "./pruebas/politicas.js";

export type EstadoPunto = "CUBIERTO" | "FALLA" | "SIN_PRUEBA" | "MANUAL";

export interface Punto {
  readonly id: string;
  readonly nombre: string;
  readonly estado: EstadoPunto;
  readonly detalle: string;
  readonly origen?: string;
}

export interface ContextoPrueba {
  readonly boot: AppBootResult;
  readonly runtime: AppRuntime;
}

export interface ResultadoPrueba {
  readonly ok: boolean;
  readonly detalle: string;
}

export interface PuntoConPrueba {
  readonly id: string;
  readonly nombre: string;
  readonly origen?: string;
  readonly requiereData: (boot: AppBootResult) => boolean;
  readonly prueba?: (ctx: ContextoPrueba) => Promise<ResultadoPrueba>;
}

/** Detecta si un negocio tiene habilitada cierta funcionalidad de cobros basándose en reglas. */
function tieneCobroHabilitado(ruleSet: AppBootResult["input"]["ruleSet"], tipo: "hitos" | "senal" | "credito" | "plazos" | "fianza"): boolean {
  const plantillas: Record<"hitos" | "senal" | "credito" | "plazos" | "fianza", string[]> = {
    hitos: ["tpl.hitos_pago"],
    senal: ["tpl.senal_pago"],
    credito: ["tpl.credito_cliente", "limite_credito"],
    plazos: ["tpl.financiacion"],
    fianza: ["tpl.fianza"],
  };
  return ruleSet.rules.some((r: any) => plantillas[tipo].includes(r.plantilla ?? ""));
}

/** Genera la lista de puntos a revisar según el perfil. */
export function generarPuntos(boot: AppBootResult): readonly PuntoConPrueba[] {
  const puntos: PuntoConPrueba[] = [];

  // Ciclos completos
  for (const lc of boot.input.lifecycles) {
    puntos.push({
      id: `ciclo.${lc.id}`,
      nombre: `Ciclo completo: ${lc.label ?? lc.id}`,
      requiereData: () => true,
      prueba: (ctx: ContextoPrueba) => probarCicloCompleto(ctx, lc.id),
    });
  }

  // Cobros - solo si están habilitados
  if (tieneCobroHabilitado(boot.input.ruleSet, "hitos")) {
    puntos.push({
      id: "cobro.hitos",
      nombre: "Cobro: hitos bloqueados sin pago",
      requiereData: () => true,
      prueba: probarCobroHitos,
    });
  }

  if (tieneCobroHabilitado(boot.input.ruleSet, "senal")) {
    puntos.push({
      id: "cobro.senal",
      nombre: "Cobro: seña al aceptar",
      requiereData: () => true,
      prueba: probarCobroSena,
    });
  }

  if (tieneCobroHabilitado(boot.input.ruleSet, "credito")) {
    puntos.push({
      id: "cobro.a_cuenta",
      nombre: "Cobro: a crédito",
      requiereData: () => true,
      prueba: probarCobroCredito,
    });
  }

  if (tieneCobroHabilitado(boot.input.ruleSet, "plazos")) {
    puntos.push({
      id: "cobro.plazos",
      nombre: "Cobro: a plazos",
      requiereData: () => true,
      prueba: probarCobroPlazos,
    });
  }

  if (tieneCobroHabilitado(boot.input.ruleSet, "fianza")) {
    puntos.push({
      id: "cobro.fianza",
      nombre: "Cobro: fianza",
      requiereData: () => true,
      prueba: probarCobroFianza,
    });
  }

  // Políticas
  const rulasUnique = new Map<string, (typeof boot.input.ruleSet.rules)[number]>();
  for (const r of boot.input.ruleSet.rules) {
    if ("plantilla" in r) {
      const key = `${r.plantilla}`;
      if (!rulasUnique.has(key)) {
        rulasUnique.set(key, r);
      }
    }
  }

  for (const [plantilla] of rulasUnique.entries()) {
    if (plantilla === "importe_requiere_aprobacion") {
      puntos.push({
        id: "politica.importe_requiere_aprobacion",
        nombre: `Política: importe requiere aprobación`,
        origen: "politica.importe_requiere_aprobacion",
        requiereData: () => true,
        prueba: probarPoliticaImporte,
      } as PuntoConPrueba);
    } else if (plantilla === "plazo_devolucion") {
      puntos.push({
        id: "politica.plazo_devolucion",
        nombre: `Política: plazo de devolución`,
        origen: "politica.plazo_devolucion",
        requiereData: () => true,
        prueba: probarPoliticaIncidencias,
      } as PuntoConPrueba);
    } else if (plantilla === "restriccion_saldo_antes_de") {
      puntos.push({
        id: "politica.restriccion_saldo_antes_de",
        nombre: "Política: restricción de saldo antes de",
        origen: "politica.restriccion_saldo_antes_de",
        requiereData: () => true,
        prueba: probarPoliticaSaldo,
      } as PuntoConPrueba);
    } else if (plantilla === "descuento_maximo_sin_aprobacion") {
      puntos.push({
        id: "politica.descuento_maximo",
        nombre: `Política: descuento máximo`,
        origen: "politica.descuento_maximo_sin_aprobacion",
        requiereData: () => true,
        prueba: probarPoliticaDescuento,
      } as PuntoConPrueba);
    } else if (plantilla === "bloqueo_por_impago") {
      puntos.push({
        id: "politica.bloqueo_por_impago",
        nombre: "Política: bloqueo por impago",
        origen: "politica.bloqueo_por_impago",
        requiereData: () => true,
        prueba: probarPoliticaImpago,
      } as PuntoConPrueba);
    } else if (plantilla === "limite_credito") {
      puntos.push({
        id: "politica.limite_credito",
        nombre: `Política: límite de crédito`,
        origen: "politica.limite_credito",
        requiereData: () => true,
        prueba: probarPoliticaLimiteCredito,
      } as PuntoConPrueba);
    }
  }

  return puntos;
}

/** Revisa todos los puntos y devuelve su estado. */
export async function revisar(boot: AppBootResult, runtime: AppRuntime): Promise<readonly Punto[]> {
  const puntosBase = generarPuntos(boot);
  const ctx: ContextoPrueba = { boot, runtime };
  const resultado: Punto[] = [];

  for (const punto of puntosBase) {
    if (!punto.requiereData(boot)) {
      resultado.push({
        id: punto.id,
        nombre: punto.nombre,
        estado: "MANUAL",
        detalle: "Punto no aplica a este negocio",
        ...(punto.origen && { origen: punto.origen }),
      });
      continue;
    }

    if (!punto.prueba) {
      resultado.push({
        id: punto.id,
        nombre: punto.nombre,
        estado: "SIN_PRUEBA",
        detalle: "Prueba aún no implementada",
        ...(punto.origen && { origen: punto.origen }),
      });
      continue;
    }

    if (!punto.prueba) {
      // No debería pasar pero por si acaso
      resultado.push({
        id: punto.id,
        nombre: punto.nombre,
        estado: "SIN_PRUEBA",
        detalle: "Prueba no definida",
        ...(punto.origen && { origen: punto.origen }),
      });
      continue;
    }

    try {
      const res = await punto.prueba(ctx);
      resultado.push({
        id: punto.id,
        nombre: punto.nombre,
        estado: res.ok ? "CUBIERTO" : "FALLA",
        detalle: res.detalle,
        ...(punto.origen && { origen: punto.origen }),
      });
    } catch (err) {
      resultado.push({
        id: punto.id,
        nombre: punto.nombre,
        estado: "FALLA",
        detalle: `Error al probar: ${err instanceof Error ? err.message : String(err)}`,
        ...(punto.origen && { origen: punto.origen }),
      });
    }
  }

  return resultado;
}
