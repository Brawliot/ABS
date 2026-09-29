/**
 * Capa 4 — Invariantes: condiciones que deben cumplirse según el estado.
 * Sin lógica de dominio: solo el contrato estructural.
 */

export interface Invariant {
  readonly id: string;
  /** Estados en los que aplica; vacío = aplica en todos. */
  readonly appliesInStates: readonly string[];
  /** Predicado estructural declarado (evaluación delegada al motor). */
  readonly predicate: string;
  readonly description: string;
}

export type InvariantSet = readonly Invariant[];

export type InvariantCheckResult =
  | { readonly ok: true; readonly invariantId: string }
  | { readonly ok: false; readonly invariantId: string; readonly reason: string };

/**
 * Evaluador inyectable: la fase actual solo comprueba el contrato
 * (existencia y aplicabilidad), no reglas de negocio concretas.
 */
export type PredicateEvaluator = (
  predicate: string,
  context: InvariantContext,
) => boolean;

export interface InvariantContext {
  readonly currentStateId: string;
  readonly fulfilledCommitmentIds: ReadonlySet<string>;
  readonly pendingCommitmentIds: ReadonlySet<string>;
  readonly fieldValues: Readonly<Record<string, unknown>>;
}
