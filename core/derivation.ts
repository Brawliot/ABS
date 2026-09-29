/**
 * Motor de derivación de estado.
 *
 * El estado se deriva ÚNICAMENTE de compromisos cumplidos (con evidencia)
 * y pendientes. El replay de eventos solo actualiza ese conjunto; el nodo
 * se resuelve por coincidencia exacta de situación declarada.
 *
 * Un terminal nunca se reabre: cualquier "reapertura" debe crear una
 * transacción nueva vinculada (rechazada aquí a nivel de máquina).
 */

import { assertTransactionClosure } from "../elements/closure.js";
import type { DomainEvent, EvidenceRecord } from "./events.js";
import { isSuccessTerminal } from "./grammar.js";
import type { Lifecycle, Transition } from "./lifecycle.js";
import {
  findState,
  isTerminalState,
  setsEqual,
} from "./lifecycle.js";
import { validateLifecycle } from "./validator.js";

export class DerivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DerivationError";
  }
}

/** Hechos del mundo necesarios para alcanzar un terminal de éxito. */
export interface WorldFacts {
  readonly balance: number;
  readonly resourcesSettled: boolean;
  readonly evidenceComplete: boolean;
}

export const DEFAULT_WORLD_FACTS: WorldFacts = {
  balance: 0,
  resourcesSettled: true,
  evidenceComplete: true,
};

export interface DerivedState {
  readonly currentStateId: string;
  readonly fulfilledCommitmentIds: ReadonlySet<string>;
  readonly pendingCommitmentIds: ReadonlySet<string>;
  readonly eventCount: number;
}

export interface AdvanceCommand {
  readonly transitionId: string;
  readonly evidence: EvidenceRecord;
  readonly actorId: string;
  readonly actorKind: import("./grammar.js").ActorKind;
  readonly occurredAt: string;
  readonly eventId: string;
  /** Obligatorio al avanzar hacia terminal de éxito. */
  readonly world?: WorldFacts;
}

function assertValidLifecycle(lifecycle: Lifecycle): void {
  const result = validateLifecycle(lifecycle);
  if (!result.ok) {
    const detail = result.issues.map((i) => i.message).join("; ");
    throw new DerivationError(`Máquina inválida: ${detail}`);
  }
}

/**
 * Reconstruye el estado actual reproduciendo la secuencia de eventos.
 * Dos reproducciones idénticas producen el mismo DerivedState.
 * El estado se calcula solo por situación de compromisos; si ninguna
 * definición coincide o coinciden varias, lanza error explícito.
 */
export function deriveState(
  lifecycle: Lifecycle,
  events: readonly DomainEvent[],
  world: WorldFacts = DEFAULT_WORLD_FACTS,
): DerivedState {
  assertValidLifecycle(lifecycle);

  const fulfilled = new Set<string>();

  for (const event of events) {
    applyEvent(lifecycle, fulfilled, event);
  }

  const pending = new Set<string>();
  for (const c of lifecycle.commitments) {
    if (!fulfilled.has(c.id)) {
      pending.add(c.id);
    }
  }

  const resolved = resolveStateFromCommitments(lifecycle, fulfilled, pending);
  assertSuccessClosure(lifecycle, resolved, fulfilled, pending, world);

  return {
    currentStateId: resolved,
    fulfilledCommitmentIds: fulfilled,
    pendingCommitmentIds: pending,
    eventCount: events.length,
  };
}

/**
 * Intenta avanzar aplicando una transición. Falla si falta la evidencia exigida,
 * el actor no está permitido, o el origen no es el estado actual / es terminal.
 */
export function assertCanAdvance(
  lifecycle: Lifecycle,
  derived: DerivedState,
  command: AdvanceCommand,
): Transition {
  assertValidLifecycle(lifecycle);

  if (isTerminalState(lifecycle, derived.currentStateId)) {
    throw new DerivationError(
      "Un terminal nunca se reabre; cree una transacción nueva vinculada",
    );
  }

  const transition = lifecycle.transitions.find(
    (t) => t.id === command.transitionId,
  );
  if (!transition) {
    throw new DerivationError(`Transición desconocida: ${command.transitionId}`);
  }

  if (transition.from !== derived.currentStateId) {
    throw new DerivationError(
      `Transición ${transition.id} no parte del estado actual ${derived.currentStateId}`,
    );
  }

  if (!command.evidence || !command.evidence.kind) {
    throw new DerivationError("Es imposible avanzar sin evidencia");
  }

  if (command.evidence.kind !== transition.requiredEvidence) {
    throw new DerivationError(
      `Evidencia exigida: ${transition.requiredEvidence}; recibida: ${command.evidence.kind}`,
    );
  }

  if (!command.evidence.reference || command.evidence.reference.trim() === "") {
    throw new DerivationError("La evidencia debe incluir una referencia");
  }

  if (command.actorKind !== transition.allowedActor) {
    throw new DerivationError(
      `Actor permitido: ${transition.allowedActor}; recibido: ${command.actorKind}`,
    );
  }

  const target = findState(lifecycle, transition.to);
  if (!target) {
    throw new DerivationError(`Destino desconocido: ${transition.to}`);
  }

  if (isSuccessTerminal(target.kind)) {
    const world = command.world ?? DEFAULT_WORLD_FACTS;
    const nextFulfilled = new Set(derived.fulfilledCommitmentIds);
    for (const cid of transition.fulfills) {
      nextFulfilled.add(cid);
    }
    const nextPending = new Set<string>();
    for (const c of lifecycle.commitments) {
      if (!nextFulfilled.has(c.id)) {
        nextPending.add(c.id);
      }
    }
    assertSuccessClosure(
      lifecycle,
      target.id,
      nextFulfilled,
      nextPending,
      world,
    );
  }

  return transition;
}

function applyEvent(
  lifecycle: Lifecycle,
  fulfilled: Set<string>,
  event: DomainEvent,
): void {
  switch (event.kind) {
    case "transicion": {
      const transition = lifecycle.transitions.find(
        (t) => t.id === event.transitionId,
      );
      if (!transition) {
        throw new DerivationError(
          `Evento referencia transición desconocida: ${event.transitionId}`,
        );
      }
      // Origen coherente con la situación actual (antes de aplicar fulfills).
      const pendingBefore = pendingFrom(lifecycle, fulfilled);
      const fromId = resolveStateFromCommitments(
        lifecycle,
        fulfilled,
        pendingBefore,
      );
      if (transition.from !== fromId) {
        throw new DerivationError(
          `Inconsistencia de replay: se esperaba origen ${fromId}, transición parte de ${transition.from}`,
        );
      }
      if (event.evidence.kind !== transition.requiredEvidence) {
        throw new DerivationError(
          `Replay inválido: evidencia ${event.evidence.kind} ≠ ${transition.requiredEvidence}`,
        );
      }
      for (const cid of transition.fulfills) {
        fulfilled.add(cid);
      }
      return;
    }
    case "excepcion":
    case "vencimiento": {
      const pendingBefore = pendingFrom(lifecycle, fulfilled);
      const fromId = resolveStateFromCommitments(
        lifecycle,
        fulfilled,
        pendingBefore,
      );
      if (isTerminalState(lifecycle, fromId)) {
        throw new DerivationError("No se puede salir de un terminal");
      }
      if (event.fromStateId !== fromId) {
        throw new DerivationError(
          `Excepción/vencimiento declara origen ${event.fromStateId}, situación actual es ${fromId}`,
        );
      }
      const edge = lifecycle.transitions.find(
        (t) => t.from === fromId && t.to === event.toStateId,
      );
      if (!edge) {
        throw new DerivationError(
          `Excepción/vencimiento a ${event.toStateId} no declarada desde ${fromId}`,
        );
      }
      const target = findState(lifecycle, edge.to);
      if (!target || !isTerminalState(lifecycle, edge.to)) {
        throw new DerivationError(
          "Excepción/vencimiento debe terminar en un estado terminal declarado",
        );
      }
      if (event.evidence.kind !== edge.requiredEvidence) {
        throw new DerivationError(
          `Replay inválido: evidencia ${event.evidence.kind} ≠ ${edge.requiredEvidence}`,
        );
      }
      for (const cid of edge.fulfills) {
        fulfilled.add(cid);
      }
      return;
    }
    case "modificacion":
      // No cambia compromisos; se conserva como señal de aprendizaje.
      return;
    case "alta":
    case "datos":
      // Datos de negocio de la transacción: no cambian su estado.
      return;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

function pendingFrom(
  lifecycle: Lifecycle,
  fulfilled: ReadonlySet<string>,
): Set<string> {
  const pending = new Set<string>();
  for (const c of lifecycle.commitments) {
    if (!fulfilled.has(c.id)) {
      pending.add(c.id);
    }
  }
  return pending;
}

/**
 * El estado es la única definición cuya situación coincide exactamente
 * con los compromisos cumplidos y pendientes.
 */
function resolveStateFromCommitments(
  lifecycle: Lifecycle,
  fulfilled: ReadonlySet<string>,
  pending: ReadonlySet<string>,
): string {
  const matches = lifecycle.states.filter((s) =>
    matchesSituation(s, fulfilled, pending),
  );

  if (matches.length === 0) {
    throw new DerivationError(
      `Ninguna definición de estado coincide con la situación de compromisos (cumplidos=[${[...fulfilled].sort().join(",")}], pendientes=[${[...pending].sort().join(",")}])`,
    );
  }

  if (matches.length > 1) {
    throw new DerivationError(
      `Varias definiciones de estado coinciden con la misma situación: ${matches.map((m) => m.id).join(", ")}`,
    );
  }

  return matches[0]!.id;
}

export function matchesSituation(
  state: { readonly situations: readonly { readonly fulfilled: readonly string[]; readonly pending: readonly string[] }[] },
  fulfilled: ReadonlySet<string>,
  pending: ReadonlySet<string>,
): boolean {
  return state.situations.some(
    (situation) =>
      setsEqual(situation.fulfilled, fulfilled) &&
      setsEqual(situation.pending, pending),
  );
}

function assertSuccessClosure(
  lifecycle: Lifecycle,
  stateId: string,
  fulfilled: ReadonlySet<string>,
  pending: ReadonlySet<string>,
  world: WorldFacts,
): void {
  const state = findState(lifecycle, stateId);
  if (!state || !isSuccessTerminal(state.kind)) {
    return;
  }

  if (pending.size > 0) {
    throw new DerivationError(
      `Terminal de éxito inalcanzable: compromisos pendientes [${[...pending].sort().join(",")}]`,
    );
  }

  if (world.balance !== 0) {
    throw new DerivationError(
      `Terminal de éxito inalcanzable: saldo ≠ 0 (saldo=${world.balance})`,
    );
  }

  if (!world.resourcesSettled) {
    throw new DerivationError(
      "Terminal de éxito inalcanzable: recursos no liberados ni consumidos",
    );
  }

  if (!world.evidenceComplete) {
    throw new DerivationError(
      "Terminal de éxito inalcanzable: evidencia incompleta",
    );
  }

  // Defensa redundante explícita.
  assertTransactionClosure({
    currentStateId: stateId,
    fulfilledCommitmentIds: fulfilled,
    pendingCommitmentIds: pending,
    fieldValues: {},
    balance: world.balance,
    resourcesSettled: world.resourcesSettled,
    evidenceComplete: world.evidenceComplete,
  });
}
