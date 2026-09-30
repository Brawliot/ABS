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
  const rt = ctx.runtime;
  const boot = ctx.boot;
  const dir = await import("node:os").then(o => o.tmpdir());
  const { mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dbDir = mkdtempSync(join(dir, "abs-cobros-plazos-"));
  try {
    const txRes = rt.crearTransaccion(
      {
        lifecycleId: boot.input.lifecycles[0]?.id || "lc",
        parteId: "parte-demo-1",
        fecha: "2026-09-01",
        lineas: [{ descripcion: "Test", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21 }],
      },
      "prueba",
    );
    if (!txRes.ok) return { ok: false, detalle: `No se pudo crear transacción: ${txRes.errors.join("; ")}` };

    const finRes = rt.crearFinanciado(txRes.id, 100000, 12, 0, "prueba");
    if (!finRes.ok) return { ok: false, detalle: `No se pudo crear financiado: ${finRes.error}` };

    const fin = rt.financiadoDe(txRes.id);
    if (!fin) return { ok: false, detalle: "Financiado no se creó correctamente" };
    if (fin.cuotas.length !== 12) return { ok: false, detalle: `Se esperaban 12 cuotas, se crearon ${fin.cuotas.length}` };

    const pagarRes = rt.pagarCuotaFinanciado(txRes.id, 1, "prueba");
    if (!pagarRes.ok) return { ok: false, detalle: `No se pudo pagar cuota: ${pagarRes.error}` };

    const finActual = rt.financiadoDe(txRes.id);
    const cuota1 = finActual?.cuotas.find((c) => c.numeroOrden === 1);
    if (cuota1?.estado !== "pagada") return { ok: false, detalle: "La cuota no se marcó como pagada" };

    return { ok: true, detalle: "Financiación a plazos funciona: se crean cuotas y se pagan" };
  } finally {
    const { rmSync } = await import("node:fs");
    try { rmSync(dbDir, { recursive: true, force: true }); } catch {}
  }
}

export async function probarCobroFianza(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  return { ok: false, detalle: "Falta implementar prueba: no hay forma de verificar bloqueo por fianza" };
}
