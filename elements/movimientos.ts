/**
 * Movimiento de valor (derivado): el dinero que entra o sale con cada
 * transacción. No es un evento propio: se deduce de las transiciones que
 * liquidan el pago, y el importe queda registrado en el evento de esa
 * transición (`data.fieldsAfter.importe`, en euros).
 */

import type { DomainEvent, TransitionEvent } from "../core/events.js";
import type { Lifecycle, Transition } from "../core/lifecycle.js";

/** Compromisos que significan «pago liquidado» en los arquetipos. */
export const PAYMENT_COMMITMENTS: ReadonlySet<string> = new Set([
  "c_pagar",
  "c_cobrar_uso",
  "c_periodo_pagado",
  "c_comision",
  "c_amortizar",
]);

export type Direccion = "entra" | "sale";

export interface Movimiento {
  readonly expedienteId: string;
  readonly parteId: string;
  readonly direccion: Direccion;
  readonly importeCentimos: number;
  /** Momento del cobro / pago (ISO). */
  readonly at: string;
  readonly eventId: string;
}

export function direccionDe(
  exchangeDirection: "empresa_vende" | "empresa_compra" | undefined,
): Direccion {
  return exchangeDirection === "empresa_compra" ? "sale" : "entra";
}

function tienePago(lifecycle: Lifecycle): boolean {
  return lifecycle.commitments.some((c) => PAYMENT_COMMITMENTS.has(c.id));
}

/**
 * ¿Esta transición liquida el pago? Sí si cumple un compromiso de pago; en
 * ciclos sin compromiso de pago (p. ej. servicio por proyecto), si termina
 * con éxito.
 */
export function liquidaPago(lifecycle: Lifecycle, t: Transition): boolean {
  if (tienePago(lifecycle)) {
    return t.fulfills.some((c) => PAYMENT_COMMITMENTS.has(c));
  }
  const target = lifecycle.states.find((s) => s.id === t.to);
  return target?.kind === "terminal_exito";
}

/** Importe registrado en el evento (euros → céntimos), si lo hay. */
export function importeRegistrado(e: TransitionEvent): number | undefined {
  const data = e.data as Record<string, unknown> | undefined;
  const after = data?.fieldsAfter as Record<string, unknown> | undefined;
  const raw = after?.importe;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

/**
 * Movimientos de un expediente. `totalCentimos` es el total actual, que se
 * usa solo si un evento antiguo no registró importe.
 */
export function movimientosDe(params: {
  readonly expedienteId: string;
  readonly parteId: string;
  readonly direccion: Direccion;
  readonly lifecycle: Lifecycle;
  readonly events: readonly DomainEvent[];
  readonly totalCentimos: number;
}): Movimiento[] {
  const out: Movimiento[] = [];
  for (const e of params.events) {
    if (e.kind !== "transicion") continue;
    const t = params.lifecycle.transitions.find((x) => x.id === e.transitionId);
    if (!t || !liquidaPago(params.lifecycle, t)) continue;
    out.push({
      expedienteId: params.expedienteId,
      parteId: params.parteId,
      direccion: params.direccion,
      importeCentimos: importeRegistrado(e) ?? params.totalCentimos,
      at: e.occurredAt,
      eventId: e.id,
    });
  }
  return out;
}

/** Situación de cobro de un expediente según su estado. */
export type SituacionCobro =
  /** Todavía es presupuesto / propuesta: no se debe nada. */
  | "presupuesto"
  /** Comprometido y sin liquidar: pendiente de cobro (o de pago). */
  | "pendiente"
  /** Liquidado (al menos una vez, en ciclos sin renovación). */
  | "liquidado"
  /** Cancelado / fallido / incumplido: no hay dinero. */
  | "sin_importe";

export function situacionCobro(params: {
  readonly lifecycle: Lifecycle;
  readonly stateId: string;
  readonly movimientos: readonly Movimiento[];
}): SituacionCobro {
  const st = params.lifecycle.states.find((s) => s.id === params.stateId);
  const kind = st?.kind;
  if (kind === "inicial") return "presupuesto";
  if (kind === "terminal_exito") return "liquidado";
  if (kind === "terminal_excepcion") {
    return params.movimientos.length > 0 ? "liquidado" : "sin_importe";
  }
  return "pendiente";
}

/** Mes AAAA-MM de un instante en hora de Madrid. */
export function mesMadrid(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${y}-${m}`;
}
