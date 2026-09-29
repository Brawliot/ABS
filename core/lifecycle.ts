/**
 * Capa 3 — Ciclo de vida: máquina de estados según la gramática.
 *
 * El estado NUNCA se asigna a mano: se deriva de compromisos cumplidos
 * (con evidencia) y pendientes. Esta capa declara la máquina posible;
 * el motor de derivación calcula el estado actual.
 */

import type { ActorKind, EvidenceKind, StateKind } from "./grammar.js";
import { isTerminalKind } from "./grammar.js";

/**
 * Situación de compromisos que identifica un estado:
 * cumplidos (con evidencia validada) y pendientes.
 * Debe particionar el conjunto de compromisos de la máquina.
 */
export interface CommitmentSituation {
  readonly fulfilled: readonly string[];
  readonly pending: readonly string[];
}

export interface StateNode {
  readonly id: string;
  readonly kind: StateKind;
  /** Etiqueta estructural (no contenido de negocio). */
  readonly label: string;
  /**
   * Situaciones que identifican este estado.
   * Varias entradas cubren caminos distintos (p. ej. cancelación temprana/tardía).
   */
  readonly situations: readonly CommitmentSituation[];
}

/**
 * Compromiso estructural ligado a un estado o transición.
 * Cumplido = hay evidencia registrada; pendiente = aún no.
 */
export interface CommitmentRef {
  readonly id: string;
  readonly label: string;
}

export interface Transition {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Condición estructural (predicado declarado; evaluación en fase de reglas). */
  readonly condition: string;
  /** Toda transición exige evidencia (regla de validez). */
  readonly requiredEvidence: EvidenceKind;
  readonly allowedActor: ActorKind;
  /** Compromisos que esta transición cumple al ejecutarse. */
  readonly fulfills: readonly string[];
}

export interface Lifecycle {
  readonly states: readonly StateNode[];
  readonly transitions: readonly Transition[];
  /** Compromisos que la máquina puede cumplir o dejar pendientes. */
  readonly commitments: readonly CommitmentRef[];
}

/** Construye una situación que particiona todos los compromisos de la máquina. */
export function commitmentSituation(
  allCommitmentIds: readonly string[],
  fulfilledIds: readonly string[],
): CommitmentSituation {
  const fulfilledSet = new Set(fulfilledIds);
  return {
    fulfilled: allCommitmentIds.filter((id) => fulfilledSet.has(id)),
    pending: allCommitmentIds.filter((id) => !fulfilledSet.has(id)),
  };
}

/**
 * Define estados con una o más variantes de cumplidos
 * (el resto de compromisos queda pendiente).
 */
export function defineStates(
  commitments: readonly CommitmentRef[],
  defs: readonly {
    readonly id: string;
    readonly kind: StateKind;
    readonly label: string;
    readonly fulfilledVariants: readonly (readonly string[])[];
  }[],
): StateNode[] {
  const allIds = commitments.map((c) => c.id);
  return defs.map((d) => ({
    id: d.id,
    kind: d.kind,
    label: d.label,
    situations: d.fulfilledVariants.map((fulfilled) =>
      commitmentSituation(allIds, fulfilled),
    ),
  }));
}

export function findState(
  lifecycle: Lifecycle,
  stateId: string,
): StateNode | undefined {
  return lifecycle.states.find((s) => s.id === stateId);
}

export function outgoing(
  lifecycle: Lifecycle,
  stateId: string,
): readonly Transition[] {
  return lifecycle.transitions.filter((t) => t.from === stateId);
}

export function isTerminalState(lifecycle: Lifecycle, stateId: string): boolean {
  const state = findState(lifecycle, stateId);
  return state !== undefined && isTerminalKind(state.kind);
}

export function situationKey(situation: CommitmentSituation): string {
  const f = [...situation.fulfilled].sort().join(",");
  const p = [...situation.pending].sort().join(",");
  return `${f}|${p}`;
}

export function setsEqual(
  a: ReadonlySet<string> | readonly string[],
  b: ReadonlySet<string> | readonly string[],
): boolean {
  const aSet = a instanceof Set ? a : new Set(a);
  const bSet = b instanceof Set ? b : new Set(b);
  if (aSet.size !== bSet.size) return false;
  for (const x of aSet) {
    if (!bSet.has(x)) return false;
  }
  return true;
}
