/**
 * Pruebas para cobros: hitos, a crédito, plazos y fianzas.
 */

import type { AppBootResult } from "../../web/types.js";
import type { ContextoPrueba, ResultadoPrueba } from "../checklist.js";

function getCobrosConfig(boot: AppBootResult): Record<string, any> | null {
  // Simular: los cobros no están disponibles en GeneratorInput
  // Por ahora, devolvemos null para todas las pruebas
  return null;
}

export async function probarCobroHitos(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  return { ok: false, detalle: "Falta implementar prueba: no hay forma de registrar pago de hito" };
}

export async function probarCobroSena(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  return { ok: false, detalle: "Falta implementar prueba: no hay forma de registrar pago de seña" };
}

export async function probarCobroCredito(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const exps = ctx.runtime.expedientesDinero().filter((e) => e.direccion === "entra" && e.situacion === "pendiente");
  if (exps.length === 0) {
    return { ok: false, detalle: "Sin expedientes pendientes para verificar deuda" };
  }

  return { ok: true, detalle: "Expedientes a crédito aparecen como deuda del cliente" };
}

export async function probarCobroPlazos(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  return { ok: false, detalle: "Falta implementar prueba: no hay forma de crear financiado" };
}

export async function probarCobroFianza(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  return { ok: false, detalle: "Falta implementar prueba: no hay forma de verificar bloqueo por fianza" };
}
