/**
 * Copia aislada del motor para el Probador (EventStore propio).
 */

import {
  DEFAULT_WORLD_FACTS,
  deriveState,
  type DerivedState,
} from "../../core/derivation.js";
import { InMemoryEventStore } from "../../core/event-store.js";
import type { TransitionEvent } from "../../core/events.js";
import type { Lifecycle } from "../../core/lifecycle.js";
import { findState, isTerminalState, outgoing } from "../../core/lifecycle.js";
import type { FactBag } from "../../facts/provider.js";
import {
  attemptJudgedAdvance,
  JudgeRejectionError,
  type JudgeActor,
  type JudgeEvidence,
} from "../../policies/judge.js";
import type { TransactionFields } from "../../policies/judge.js";
import type { CompiledRuleSet } from "../../policies/types.js";

export interface IsolatedSubject {
  readonly subjectId: string;
  readonly lifecycleId: string;
  readonly lifecycle: Lifecycle;
  events: TransitionEvent[];
  fields: Record<string, string | number | boolean>;
}

export interface TryAdvanceInput {
  readonly subject: IsolatedSubject;
  readonly transitionId: string;
  readonly actor: JudgeActor;
  readonly evidence: JudgeEvidence;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
  readonly now: string;
  readonly eventId: string;
  readonly facts?: FactBag;
}

export interface IsolatedEngine {
  readonly store: InMemoryEventStore;
  readonly ruleSet: CompiledRuleSet;
  derived(subject: IsolatedSubject): DerivedState;
  tryAdvance(
    input: TryAdvanceInput,
  ): { ok: true } | { ok: false; reason: string };
  canAnyRoleAct(
    subject: IsolatedSubject,
    actors: readonly JudgeActor[],
    makeEvidence: (transitionId: string) => JudgeEvidence,
    now: string,
  ): boolean;
}

/**
 * Motor aislado: EventStore fresco + RuleSet de la especificación.
 */
export function createQaEngine(ruleSet: CompiledRuleSet): IsolatedEngine {
  const store = new InMemoryEventStore();

  const engine: IsolatedEngine = {
    store,
    ruleSet,
    derived(subject) {
      return deriveState(subject.lifecycle, subject.events);
    },
    tryAdvance(input) {
      const d = deriveState(input.subject.lifecycle, input.subject.events);
    const fields: Record<string, string | number | boolean> = {
      ...input.subject.fields,
      ...(input.fields ?? {}),
    };
      try {
        const result = attemptJudgedAdvance({
          subjectId: input.subject.subjectId,
          lifecycle: input.subject.lifecycle,
          derived: d,
          command: {
            transitionId: input.transitionId,
            eventId: input.eventId,
            actorId: input.actor.id,
            actorKind: input.actor.kind,
            occurredAt: input.now,
            evidence: {
              kind: input.evidence.kind,
              reference: input.evidence.reference,
              recordedAt: input.evidence.recordedAt,
            },
            world: DEFAULT_WORLD_FACTS,
          },
          actor: input.actor,
          evidence: input.evidence,
          fields,
          ruleSet,
          ...(input.facts ? { facts: input.facts } : {}),
          now: input.now,
        });
        const event = result.event as TransitionEvent;
        store.append(event);
        input.subject.events.push(event);
        input.subject.fields = {
          ...input.subject.fields,
          ...fields,
        };
        for (const [k, v] of Object.entries(result.fieldsAfter)) {
          if (
            typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean"
          ) {
            input.subject.fields[k] = v;
          }
        }
        return { ok: true };
      } catch (err) {
        if (err instanceof JudgeRejectionError) {
          return { ok: false, reason: err.trace.reason || err.message };
        }
        return {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    },
    canAnyRoleAct(subject, actors, makeEvidence, now) {
      const d = deriveState(subject.lifecycle, subject.events);
      if (isTerminalState(subject.lifecycle, d.currentStateId)) return true;
      const outs = outgoing(subject.lifecycle, d.currentStateId);
      let seq = 0;
      for (const t of outs) {
        for (const actor of actors) {
          const trialActor: JudgeActor = {
            id: actor.id,
            kind: t.allowedActor,
            roles: actor.roles,
          };
          // Copia efímera: no contamina el sujeto real si el avance tiene éxito
          const probe: IsolatedSubject = {
            subjectId: `${subject.subjectId}:probe:${seq}`,
            lifecycleId: subject.lifecycleId,
            lifecycle: subject.lifecycle,
            events: [...subject.events],
            fields: { ...subject.fields },
          };
          const r = engine.tryAdvance({
            subject: probe,
            transitionId: t.id,
            actor: trialActor,
            evidence: makeEvidence(t.id),
            now,
            eventId: `probe-${seq++}`,
          });
          if (r.ok) return true;
        }
      }
      return false;
    },
  };

  return engine;
}

export function createSubject(
  subjectId: string,
  lifecycleId: string,
  lifecycle: Lifecycle,
  initialFields: Record<string, string | number | boolean> = {},
): IsolatedSubject {
  return {
    subjectId,
    lifecycleId,
    lifecycle,
    events: [],
    fields: { ...initialFields },
  };
}

export function stateKindOf(
  lifecycle: Lifecycle,
  stateId: string,
): string | undefined {
  return findState(lifecycle, stateId)?.kind;
}
