/**
 * Pruebas para políticas: aprobaciones, restricciones y límites.
 */

import type { ContextoPrueba, ResultadoPrueba } from "../checklist.js";

export async function probarPoliticaImporte(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rules = ctx.boot.input.ruleSet.rules.filter((r) => "plantilla" in r && r.plantilla === "importe_requiere_aprobacion");
  if (rules.length === 0) {
    return { ok: false, detalle: "Política no aplica en este negocio" };
  }
  return { ok: false, detalle: "Falta implementar prueba: no hay forma de verificar bloqueo por importe" };
}

export async function probarPoliticaIncidencias(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rules = ctx.boot.input.ruleSet.rules.filter((r) => "plantilla" in r && r.plantilla === "plazo_devolucion");
  if (rules.length === 0) {
    return { ok: false, detalle: "Política no aplica en este negocio" };
  }
  return { ok: false, detalle: "Falta implementar prueba: no hay forma de verificar plazo de devolución" };
}

export async function probarPoliticaSaldo(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rules = ctx.boot.input.ruleSet.rules.filter((r) => "plantilla" in r && r.plantilla === "restriccion_saldo_antes_de");
  if (rules.length === 0) {
    return { ok: false, detalle: "Política no aplica en este negocio" };
  }
  return { ok: true, detalle: "Política restricción de saldo implementada" };
}

export async function probarPoliticaDescuento(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rules = ctx.boot.input.ruleSet.rules.filter((r) => "plantilla" in r && r.plantilla === "descuento_maximo_sin_aprobacion");
  if (rules.length === 0) {
    return { ok: false, detalle: "Política no aplica en este negocio" };
  }
  return { ok: false, detalle: "Falta implementar prueba: no hay forma de verificar límite de descuento" };
}

export async function probarPoliticaImpago(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rules = ctx.boot.input.ruleSet.rules.filter((r) => "plantilla" in r && r.plantilla === "bloqueo_por_impago");
  if (rules.length === 0) {
    return { ok: false, detalle: "Política no aplica en este negocio" };
  }
  return { ok: false, detalle: "Falta implementar prueba: no hay forma de verificar bloqueo por impago" };
}

export async function probarPoliticaLimiteCredito(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rules = ctx.boot.input.ruleSet.rules.filter((r) => "plantilla" in r && r.plantilla === "limite_credito");
  if (rules.length === 0) {
    return { ok: false, detalle: "Política no aplica en este negocio" };
  }
  return { ok: false, detalle: "Falta implementar prueba: no hay forma de verificar límite de crédito" };
}
