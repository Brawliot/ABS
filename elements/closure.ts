/**
 * Contexto e invariantes de cierre de transacción (terminal de éxito).
 * Las 4 condiciones son obligatorias para cerrar.
 */

import type { Invariant, InvariantContext } from "../core/invariants.js";
import {
  InvariantEngine,
  structuralPredicateEvaluator,
} from "../core/invariants-engine.js";

export interface ClosureContext extends InvariantContext {
  /**
   * Saldo neto global (compat). Si se aporta balanceByParty, el cierre
   * exige además saldo 0 en cada parte.
   */
  readonly balance: number;
  /** Saldo por parte (pago multi-parte / reparto). */
  readonly balanceByParty?: Readonly<Record<string, number>>;
  /** Todos los recursos en consumido o devuelto (liberados). */
  readonly resourcesSettled: boolean;
  /** Toda evidencia requerida por el camino recorrido está validada. */
  readonly evidenceComplete: boolean;
}

export const CLOSURE_SUCCESS_STATE = "cerrada";

export const transactionClosureInvariants: readonly Invariant[] = [
  {
    id: "inv_cierre_compromisos",
    appliesInStates: [CLOSURE_SUCCESS_STATE],
    predicate: "closure_commitments_resolved",
    description: "Compromisos resueltos (ninguno pendiente)",
  },
  {
    id: "inv_cierre_saldo",
    appliesInStates: [CLOSURE_SUCCESS_STATE],
    predicate: "closure_balance_zero",
    description: "Saldo de movimientos de valor en cero",
  },
  {
    id: "inv_cierre_recursos",
    appliesInStates: [CLOSURE_SUCCESS_STATE],
    predicate: "closure_resources_settled",
    description: "Recursos liberados o consumidos",
  },
  {
    id: "inv_cierre_evidencia",
    appliesInStates: [CLOSURE_SUCCESS_STATE],
    predicate: "closure_evidence_complete",
    description: "Evidencia completa",
  },
];

export function closurePredicateEvaluator(
  predicate: string,
  context: InvariantContext,
): boolean {
  const ctx = context as ClosureContext;
  switch (predicate) {
    case "closure_commitments_resolved":
      return ctx.pendingCommitmentIds.size === 0;
    case "closure_balance_zero":
      if (ctx.balance !== 0) return false;
      if (ctx.balanceByParty) {
        return Object.values(ctx.balanceByParty).every((b) => b === 0);
      }
      return true;
    case "closure_resources_settled":
      return ctx.resourcesSettled === true;
    case "closure_evidence_complete":
      return ctx.evidenceComplete === true;
    default:
      return structuralPredicateEvaluator(predicate, context);
  }
}

export function assertTransactionClosure(context: ClosureContext): void {
  const engine = new InvariantEngine(
    transactionClosureInvariants,
    closurePredicateEvaluator,
  );
  engine.assertAll(context);
  if (context.balanceByParty) {
    const pending = Object.entries(context.balanceByParty).filter(
      ([, b]) => b !== 0,
    );
    if (pending.length > 0) {
      throw new Error(
        `Invariantes violadas: inv_cierre_saldo_partes: saldo ≠ 0 en ${pending
          .map(([p, b]) => `${p}=${b}`)
          .join(", ")}`,
      );
    }
  }
}

/** Saldo = Σ(dirección * importe) por moneda; aquí asume moneda única ya normalizada. */
export function computeBalance(
  movements: readonly {
    readonly amount: number;
    readonly direction: "in" | "out";
  }[],
): number {
  return movements.reduce((acc, m) => {
    const signed = m.direction === "in" ? m.amount : -m.amount;
    return acc + signed;
  }, 0);
}

export type PartyMovement = {
  readonly amount: number;
  readonly direction: "in" | "out";
  readonly parteId: string;
};

/** Saldo por parte: cierre exige 0 en todas. */
export function computeBalanceByParty(
  movements: readonly PartyMovement[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of movements) {
    const signed = m.direction === "in" ? m.amount : -m.amount;
    out[m.parteId] = (out[m.parteId] ?? 0) + signed;
  }
  return out;
}

export function assertAllPartiesBalanceZero(
  movements: readonly PartyMovement[],
): void {
  const byParty = computeBalanceByParty(movements);
  const bad = Object.entries(byParty).filter(([, b]) => b !== 0);
  if (bad.length > 0) {
    throw new Error(
      `Saldo no cero por parte: ${bad.map(([p, b]) => `${p}=${b}`).join(", ")}`,
    );
  }
}
