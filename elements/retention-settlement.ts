/**
 * Extensión: liquidación de fianza/retención antes del cierre.
 * El cierre NUNCA se fuerza con retención abierta (saldo de retención > 0).
 */

import {
  assertTransactionClosure,
  type ClosureContext,
} from "./closure.js";

export class RetentionSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetentionSettlementError";
  }
}

export interface RetentionSettlementContext extends ClosureContext {
  /** Importe de movimientos `retencion` aún no liberados/reembolsados. */
  readonly openRetentionAmount: number;
}

/** true si la retención abierta impide cerrar. */
export function retentionBlocksClosure(openRetentionAmount: number): boolean {
  return openRetentionAmount > 0;
}

/**
 * Exige liquidación de retención y después las 4 invariantes de cierre.
 * No modifica assertTransactionClosure: envuelve y endurece.
 */
export function assertRetentionSettledBeforeClosure(
  context: RetentionSettlementContext,
): void {
  if (retentionBlocksClosure(context.openRetentionAmount)) {
    throw new RetentionSettlementError(
      `Retención abierta (${context.openRetentionAmount}): liquidar/reembolsar antes del cierre`,
    );
  }
  // Tras liquidar, el saldo global también debe ser 0 (invariante de cierre).
  assertTransactionClosure(context);
}

/**
 * Libera retención: reduce openRetention y ajusta balance (puro, para tests).
 */
export function settleRetention(input: {
  readonly openRetentionAmount: number;
  readonly balance: number;
  readonly mode: "liberar" | "reembolsar";
}): { readonly openRetentionAmount: number; readonly balance: number } {
  if (input.openRetentionAmount <= 0) {
    return {
      openRetentionAmount: 0,
      balance: input.balance,
    };
  }
  const amount = input.openRetentionAmount;
  if (input.mode === "liberar") {
    // Liberar a favor de la empresa: retención deja de estar abierta; balance
    // neto se considera ya contabilizado → open=0, balance sin cambio forzado.
    return { openRetentionAmount: 0, balance: input.balance };
  }
  // Reembolsar al cliente: sale valor → balance se mueve hacia 0 típico.
  return {
    openRetentionAmount: 0,
    balance: input.balance - amount,
  };
}
