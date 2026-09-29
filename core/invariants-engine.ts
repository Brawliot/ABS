/**
 * Motor de invariantes: evalúa las condiciones aplicables al estado derivado.
 */

import type {
  InvariantCheckResult,
  InvariantContext,
  InvariantSet,
  PredicateEvaluator,
} from "./invariants.js";

export class InvariantEngine {
  constructor(
    private readonly invariants: InvariantSet,
    private readonly evaluator: PredicateEvaluator,
  ) {}

  checkAll(context: InvariantContext): readonly InvariantCheckResult[] {
    const applicable = this.invariants.filter(
      (inv) =>
        inv.appliesInStates.length === 0 ||
        inv.appliesInStates.includes(context.currentStateId),
    );

    return applicable.map((inv) => {
      try {
        const ok = this.evaluator(inv.predicate, context);
        return ok
          ? { ok: true as const, invariantId: inv.id }
          : {
              ok: false as const,
              invariantId: inv.id,
              reason: `Predicado falló: ${inv.predicate}`,
            };
      } catch (err) {
        return {
          ok: false as const,
          invariantId: inv.id,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    });
  }

  assertAll(context: InvariantContext): void {
    const results = this.checkAll(context);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      const detail = failed
        .map((f) => `${f.invariantId}: ${"reason" in f ? f.reason : ""}`)
        .join("; ");
      throw new Error(`Invariantes violadas: ${detail}`);
    }
  }
}

/**
 * Evaluador estructural mínimo: predicados conocidos del arnés.
 * Sin lógica de dominio de negocio.
 */
export function structuralPredicateEvaluator(
  predicate: string,
  context: InvariantContext,
): boolean {
  switch (predicate) {
    case "always_true":
      return true;
    case "has_pending_commitments":
      return context.pendingCommitmentIds.size > 0;
    case "no_pending_commitments":
      return context.pendingCommitmentIds.size === 0;
    case "has_fulfilled_commitments":
      return context.fulfilledCommitmentIds.size > 0;
    default:
      throw new Error(`Predicado estructural desconocido: ${predicate}`);
  }
}
