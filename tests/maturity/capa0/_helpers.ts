/**
 * Utilidades compartidas — madurez Capa 0.
 * Semilla fija 0xA11CE; 2000 runs por defecto en esta suite.
 */

import { createHash } from "node:crypto";
import type { Lifecycle, Transition } from "../../../core/lifecycle.js";
import type { DomainEvent, TransitionEvent } from "../../../core/events.js";
import { ventaArchetype } from "../../../archetypes/venta.js";
import { PROPERTY_SEED } from "../../../quality/config.js";
import { PERF_THRESHOLDS } from "../../../quality/config.js";

export const MATURITY_SEED = PROPERTY_SEED; // 0xa11ce
export const MATURITY_NUM_RUNS = Number(
  process.env.ABS_PROPERTY_SEEDS ?? "2000",
);

export const THRESHOLDS = PERF_THRESHOLDS;

export function hashEvents(events: readonly DomainEvent[]): string {
  const h = createHash("sha256");
  for (const e of events) {
    h.update(e.id);
    h.update("\0");
    h.update(e.kind);
    h.update("\0");
    h.update(e.subjectId);
    h.update("\0");
    h.update(JSON.stringify(e));
    h.update("\n");
  }
  return h.digest("hex");
}

export function hashDerived(state: {
  currentStateId: string;
  fulfilledCommitmentIds: ReadonlySet<string>;
  pendingCommitmentIds: ReadonlySet<string>;
  eventCount: number;
}): string {
  const h = createHash("sha256");
  h.update(state.currentStateId);
  h.update("\0");
  h.update([...state.fulfilledCommitmentIds].sort().join(","));
  h.update("\0");
  h.update([...state.pendingCommitmentIds].sort().join(","));
  h.update("\0");
  h.update(String(state.eventCount));
  return h.digest("hex");
}

export function mkTransitionEvent(
  id: string,
  subjectId: string,
  transitionId: string,
  fromStateId: string,
  toStateId: string,
  extras?: Partial<TransitionEvent>,
): TransitionEvent {
  return {
    id,
    kind: "transicion",
    subjectId,
    occurredAt: extras?.occurredAt ?? "2026-01-01T00:00:00.000Z",
    actorId: extras?.actorId ?? "actor-1",
    actorKind: extras?.actorKind ?? "humano",
    evidence: extras?.evidence ?? {
      kind: "aceptacion",
      reference: "ref-1",
      recordedAt: "2026-01-01T00:00:00.000Z",
    },
    transitionId,
    fromStateId,
    toStateId,
    ...extras,
  };
}

/** Primera transición válida desde el inicial de venta (t_aceptar). */
export function ventaAcceptEvent(
  id: string,
  subjectId = "subj-1",
): TransitionEvent {
  const life = ventaArchetype.lifecycle;
  const t = life.transitions.find((x) => x.id === "t_aceptar")!;
  return mkTransitionEvent(id, subjectId, t.id, t.from, t.to);
}

export function corruptLifecycle(base: Lifecycle, mode: number): Lifecycle {
  const life = structuredClone(base) as Lifecycle & {
    states: Lifecycle["states"][number][];
    transitions: Transition[];
  };
  const m = Math.abs(mode) % 4;
  if (m === 0 && life.states[0]) {
    const init = life.states.find((s) => s.kind === "inicial");
    if (init) (init as { kind: string }).kind = "intermedio";
  } else if (m === 1) {
    life.states = life.states.filter((s) => s.kind !== "terminal_exito");
  } else if (m === 2 && life.transitions[0]) {
    (life.transitions[0] as { requiredEvidence: string }).requiredEvidence =
      "no_existe" as never;
  } else if (m === 3) {
    const term = life.states.find((s) => s.kind === "terminal_exito");
    if (term && life.transitions[0]) {
      life.transitions.push({
        ...life.transitions[0],
        id: `t_from_terminal_${mode}`,
        from: term.id,
        to: life.states[0]!.id,
      });
    }
  }
  return life;
}

export function pgUrl(): string | undefined {
  return process.env.ABS_POSTGRES_URL;
}

export function requirePgOrThrow(): string {
  const u = pgUrl();
  if (!u) {
    throw new Error(
      "NO_VERIFICABLE: ABS_POSTGRES_URL ausente — no se puede omitir en silencio",
    );
  }
  return u;
}
