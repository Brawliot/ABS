/**
 * Runtime Cobros: Gestión de pagos, financiación y crédito
 * Métodos delegados desde AppRuntime
 */

import { randomUUID } from "node:crypto";
import type { AppRuntime } from "./runtime.js";
import { proyectarTransaccion } from "../elements/transaccion.js";

const ESTADOS_IMPAGO = new Set([
  "impago",
  "en_cobro",
  "parcialmente_cobrado",
]);

export interface CobrosRuntimeFunctions {
  registrarCobro(
    expedienteId: string,
    { importeCentimos, hitoId, medio }: { readonly importeCentimos: number; readonly hitoId?: string; readonly medio: string },
    actorId: string,
  ): { ok: true } | { ok: false; error: string };
  cobrosDelExpediente(expedienteId: string): readonly { readonly importeCentimos: number; readonly fecha: string; readonly hitoId?: string; readonly medio: string; readonly actor: string }[];
  impagosDe(parteId: string, nowMs?: number): { readonly dias: number; readonly recibos: number };
  crearFinanciado(
    expedienteId: string,
    importeCentimos: number,
    plazoMeses: number,
    tasaInteres: number,
    actorId: string,
  ): { ok: true; financiadoId: string } | { ok: false; error: string };
  financiadoDe(
    expedienteId: string,
  ): { readonly id: string; readonly plazoMeses: number; readonly tasaInteres: number; readonly cuotaMensualCentimos: number; readonly cuotas: readonly { readonly numeroOrden: number; readonly vencimientoEn: string; readonly importeCentimos: number; readonly estado: "pendiente" | "pagada" | "cancelada" }[] } | undefined;
  pagarCuotaFinanciado(expedienteId: string, numeroOrden: number, actorId: string): { ok: true } | { ok: false; error: string };
  creditoDelCliente(clienteId: string): { readonly activo: number; readonly limite: number; readonly disponible: number; readonly enBloqueo: boolean };
  establecerLimiteCredito(clienteId: string, limiteCentimos: number): void;
}

export function createCobrosFunctions(runtime: AppRuntime): CobrosRuntimeFunctions {
  return {
    registrarCobro(
      expedienteId: string,
      { importeCentimos, hitoId, medio }: { readonly importeCentimos: number; readonly hitoId?: string; readonly medio: string },
      actorId: string,
    ): { ok: true } | { ok: false; error: string } {
      if (!Number.isSafeInteger(importeCentimos) || importeCentimos <= 0) {
        return { ok: false, error: "El importe debe ser mayor que 0." };
      }
      const tx = runtime.datosDe(expedienteId);
      if (!tx) return { ok: false, error: "El expediente no existe." };
      const totalCobrado = runtime.cobros.totalParcial(runtime.tenantId, expedienteId);
      const totalPendiente = tx.datos.lineas.reduce((sum, l) => sum + l.precioCentimos * l.cantidadMilesimas / 1000, 0);
      if (totalCobrado + importeCentimos > totalPendiente) {
        return { ok: false, error: "El cobro supera el importe total del expediente." };
      }
      runtime.cobros.registrar(runtime.tenantId, {
        expediente: expedienteId,
        importeCentimos,
        fecha: new Date().toISOString(),
        ...(hitoId ? { hitoId } : {}),
        medio,
        actor: actorId,
      });
      return { ok: true };
    },

    cobrosDelExpediente(
      expedienteId: string,
    ): readonly { readonly importeCentimos: number; readonly fecha: string; readonly hitoId?: string; readonly medio: string; readonly actor: string }[] {
      return runtime.cobros.deExpediente(runtime.tenantId, expedienteId);
    },

    impagosDe(parteId: string, nowMs = Date.now()): { readonly dias: number; readonly recibos: number } {
      let oldest: number | undefined;
      let recibos = 0;
      for (const sub of runtime.subjects) {
        const events = runtime.store.getBySubject(sub.id);
        const tx = proyectarTransaccion(events);
        if (tx?.datos.parteId !== parteId) continue;
        const estado = runtime.estadoDe(sub.id)?.id ?? "";
        if (!ESTADOS_IMPAGO.has(estado)) continue;
        recibos += 1;
        const entrada = [...events]
          .reverse()
          .find((e) => e.kind !== "alta" && e.kind !== "datos" && "toStateId" in e && e.toStateId === estado);
        const t = Date.parse(entrada?.occurredAt ?? tx.creadaEn);
        if (oldest === undefined || t < oldest) oldest = t;
      }
      return {
        dias: oldest === undefined ? 0 : Math.max(0, Math.floor((nowMs - oldest) / 86_400_000)),
        recibos,
      };
    },

    crearFinanciado(
      expedienteId: string,
      importeCentimos: number,
      plazoMeses: number,
      tasaInteres: number,
      actorId: string,
    ): { ok: true; financiadoId: string } | { ok: false; error: string } {
      if (plazoMeses <= 0) return { ok: false, error: "El plazo debe ser mayor a 0 meses." };
      if (importeCentimos <= 0) return { ok: false, error: "El importe debe ser mayor a 0." };
      if (tasaInteres < 0) return { ok: false, error: "La tasa de interés no puede ser negativa." };

      const financiadoId = `fin-${randomUUID()}`;
      const now = new Date().toISOString();

      let cuotaMensualCentimos: number;
      if (tasaInteres <= 0) {
        cuotaMensualCentimos = Math.ceil(importeCentimos / plazoMeses);
      } else {
        const tasaMensual = tasaInteres / 100 / 12;
        const cuotaMensualNum = (importeCentimos / 100) * (
          (tasaMensual * Math.pow(1 + tasaMensual, plazoMeses)) /
          (Math.pow(1 + tasaMensual, plazoMeses) - 1)
        );
        cuotaMensualCentimos = Math.round(cuotaMensualNum * 100);
      }

      runtime.financiados.crearFinanciado(runtime.tenantId, {
        id: financiadoId,
        expedienteOrigen: expedienteId,
        plazoMeses,
        tasaInteres,
        cuotaMensualCentimos,
        fecha: now,
      });

      for (let i = 1; i <= plazoMeses; i++) {
        const vencimiento = new Date(now);
        vencimiento.setMonth(vencimiento.getMonth() + i);
        runtime.financiados.agregarCuota(runtime.tenantId, {
          financiadoId,
          numeroOrden: i,
          vencimientoEn: vencimiento.toISOString(),
          importeCentimos: cuotaMensualCentimos,
        });
      }

      return { ok: true, financiadoId };
    },

    financiadoDe(
      expedienteId: string,
    ): { readonly id: string; readonly plazoMeses: number; readonly tasaInteres: number; readonly cuotaMensualCentimos: number; readonly cuotas: readonly { readonly numeroOrden: number; readonly vencimientoEn: string; readonly importeCentimos: number; readonly estado: "pendiente" | "pagada" | "cancelada" }[] } | undefined {
      const fin = runtime.financiados.deExpediente(runtime.tenantId, expedienteId);
      if (!fin) return undefined;
      const cuotas = runtime.financiados.cuotasDelFinanciado(runtime.tenantId, fin.id!).map((c) => ({
        numeroOrden: c.numeroOrden,
        vencimientoEn: c.vencimientoEn,
        importeCentimos: c.importeCentimos,
        estado: c.estado,
      }));
      return {
        id: fin.id!,
        plazoMeses: fin.plazoMeses,
        tasaInteres: fin.tasaInteres,
        cuotaMensualCentimos: fin.cuotaMensualCentimos,
        cuotas,
      };
    },

    pagarCuotaFinanciado(
      expedienteId: string,
      numeroOrden: number,
      actorId: string,
    ): { ok: true } | { ok: false; error: string } {
      const fin = runtime.financiados.deExpediente(runtime.tenantId, expedienteId);
      if (!fin) return { ok: false, error: "Este expediente no tiene un financiado." };

      const cuotas = runtime.financiados.cuotasDelFinanciado(runtime.tenantId, fin.id!);
      const cuota = cuotas.find((c) => c.numeroOrden === numeroOrden);
      if (!cuota) return { ok: false, error: `No existe la cuota ${numeroOrden}.` };
      if (cuota.estado !== "pendiente") return { ok: false, error: `La cuota ${numeroOrden} ya está pagada o cancelada.` };

      const now = new Date().toISOString();
      runtime.financiados.pagarCuota(runtime.tenantId, fin.id!, numeroOrden, now);

      const todasPagadas = cuotas.every((c) => c.estado === "pagada" || c.numeroOrden === numeroOrden);
      if (todasPagadas) {
        runtime.financiados.actualizarEstadoFinanciado(runtime.tenantId, fin.id!, "pagado");
      }

      return { ok: true };
    },

    creditoDelCliente(clienteId: string): { readonly activo: number; readonly limite: number; readonly disponible: number; readonly enBloqueo: boolean } {
      const limite = runtime.creditoCliente.obtenerLimite(runtime.tenantId, clienteId);
      const activo = runtime.expedientesDinero()
        .filter((e) => e.parteId === clienteId && e.direccion === "entra" && e.situacion === "pendiente")
        .reduce((sum, e) => sum + e.totalCentimos, 0);
      const impagos = this.impagosDe(clienteId);
      const enBloqueo = impagos.dias > 0 || impagos.recibos > 0;
      return {
        activo,
        limite,
        disponible: Math.max(0, limite - activo),
        enBloqueo,
      };
    },

    establecerLimiteCredito(clienteId: string, limiteCentimos: number): void {
      runtime.creditoCliente.establecerLimite(runtime.tenantId, clienteId, limiteCentimos);
    },
  };
}
