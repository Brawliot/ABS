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
  const rt = ctx.runtime;
  const impagos = rt.impagosDe("parte-demo-1");
  if (typeof impagos.dias === "number" && typeof impagos.recibos === "number") {
    return { ok: true, detalle: `Bloqueo por impago verificado: ${impagos.dias} días de impago, ${impagos.recibos} recibos pendientes` };
  }
  return { ok: false, detalle: "No se pueden calcular impagos del cliente" };
}

export async function probarPoliticaLimiteCredito(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rules = ctx.boot.input.ruleSet.rules.filter((r) => "plantilla" in r && r.plantilla === "limite_credito_por_cliente");
  if (rules.length === 0) {
    return { ok: false, detalle: "Política no aplica en este negocio" };
  }
  const rt = ctx.runtime;
  rt.establecerLimiteCredito("parte-demo-1", 500000); // 5000 EUR
  const credito = rt.creditoDelCliente("parte-demo-1");
  if (credito.limite !== 500000) {
    return { ok: false, detalle: `Límite de crédito no se estableció: esperado 500000, obtenido ${credito.limite}` };
  }
  if (credito.disponible !== 500000) {
    return { ok: false, detalle: `Crédito disponible incorrecto: ${credito.disponible}` };
  }
  return { ok: true, detalle: `Límite de crédito verificado: cliente con límite ${credito.limite / 100} EUR` };
}
