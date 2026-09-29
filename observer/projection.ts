/**
 * Observador (MVP): proyección de solo lectura de desviaciones respecto a la política.
 * NO bloquea, NO modifica políticas ni CompiledRuleSet — solo deja constancia.
 */

import type {
  AppendOnlyEvent,
  DomainEvent,
  ModificationEvent,
  TransitionEvent,
} from "../core/events.js";
import type { EventStore } from "../core/event-store.js";
import type { ForcedDeviation } from "../policies/judge.js";

export type DeviationKind =
  | "forced_transition"
  | "modification"
  | "automation_cancelled";

export interface DeviationRecord {
  readonly kind: DeviationKind;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly subjectId: string;
  /** Regla saltada (solo forced_transition). */
  readonly skippedRuleId?: string;
  readonly ruleSetVersion?: string;
  readonly ruleSetContentHash?: string;
  readonly transitionId?: string;
  readonly reason?: string;
  readonly freeText?: string;
  readonly automationId?: string;
}

export interface DeviationSnapshot {
  readonly deviations: readonly DeviationRecord[];
  readonly eventCount: number;
}

export class ObserverWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObserverWriteError";
  }
}

/**
 * Proyecta desviaciones desde un historial de eventos (función pura / determinista).
 */
export function projectDeviations(
  events: readonly DomainEvent[],
): DeviationSnapshot {
  const deviations: DeviationRecord[] = [];

  for (const ev of events) {
    if (ev.kind === "transicion") {
      const forced = extractForcedDeviation(ev);
      if (forced) {
        deviations.push({
          kind: "forced_transition",
          eventId: ev.id,
          occurredAt: ev.occurredAt,
          actorId: forced.actorId || ev.actorId,
          subjectId: ev.subjectId,
          skippedRuleId: forced.skippedRuleId,
          ruleSetVersion: forced.ruleSetVersion,
          ruleSetContentHash: forced.ruleSetContentHash,
          transitionId: ev.transitionId,
          reason: forced.reason,
        });
      }
      const cancelled = extractAutomationCancelled(ev);
      if (cancelled) {
        deviations.push({
          kind: "automation_cancelled",
          eventId: ev.id,
          occurredAt: ev.occurredAt,
          actorId: ev.actorId,
          subjectId: ev.subjectId,
          transitionId: ev.transitionId,
          automationId: cancelled.automationId,
          reason: cancelled.reason,
        });
      }
    } else if (ev.kind === "modificacion") {
      deviations.push(fromModification(ev));
      const autoFromMod = automationFromModification(ev);
      if (autoFromMod) {
        deviations.push(autoFromMod);
      }
    }
  }

  return {
    deviations: Object.freeze([...deviations]),
    eventCount: events.length,
  };
}

function extractForcedDeviation(
  ev: TransitionEvent,
): ForcedDeviation | undefined {
  const data = ev.data as { deviation?: ForcedDeviation } | undefined;
  const d = data?.deviation;
  if (!d || d.kind !== "forced_transition") return undefined;
  return d;
}

function extractAutomationCancelled(
  ev: TransitionEvent | { readonly data?: Readonly<Record<string, unknown>> },
): { automationId: string; reason: string } | undefined {
  const data = ev.data as
    | {
        automationCancelled?: {
          automationId?: string;
          reason?: string;
        };
      }
    | undefined;
  const a = data?.automationCancelled;
  if (!a?.automationId) return undefined;
  return {
    automationId: a.automationId,
    reason: a.reason?.trim() || "cancelada a mano",
  };
}

function fromModification(ev: ModificationEvent): DeviationRecord {
  return {
    kind: "modification",
    eventId: ev.id,
    occurredAt: ev.occurredAt,
    actorId: ev.actorId,
    subjectId: ev.subjectId,
    freeText: ev.freeText,
    reason: ev.freeText,
  };
}

function automationFromModification(
  ev: ModificationEvent,
): DeviationRecord | undefined {
  const m = /^\[automation_cancel:([^\]]+)\]\s*(.*)$/s.exec(ev.freeText);
  if (!m) return undefined;
  return {
    kind: "automation_cancelled",
    eventId: ev.id,
    occurredAt: ev.occurredAt,
    actorId: ev.actorId,
    subjectId: ev.subjectId,
    automationId: m[1]!.trim(),
    reason: m[2]!.trim() || ev.freeText,
  };
}

/** Consultas simples sobre un snapshot. */
export function deviationsByRule(
  snapshot: DeviationSnapshot,
  ruleId: string,
): readonly DeviationRecord[] {
  return snapshot.deviations.filter((d) => d.skippedRuleId === ruleId);
}

export function deviationsByActor(
  snapshot: DeviationSnapshot,
  actorId: string,
): readonly DeviationRecord[] {
  return snapshot.deviations.filter((d) => d.actorId === actorId);
}

export function deviationsByPeriod(
  snapshot: DeviationSnapshot,
  fromIso: string,
  toIso: string,
): readonly DeviationRecord[] {
  return snapshot.deviations.filter(
    (d) => d.occurredAt >= fromIso && d.occurredAt <= toIso,
  );
}

/**
 * Observador: se suscribe al almacén y mantiene proyección de solo lectura.
 * Cualquier intento de escritura en políticas/reglas lanza.
 */
export class DeviationObserver {
  private snapshot: DeviationSnapshot = { deviations: [], eventCount: 0 };
  private unsubscribe: (() => void) | undefined;
  private readonly buffer: DomainEvent[] = [];

  attach(store: EventStore): void {
    this.detach();
    this.rebuild(store.all());
    this.unsubscribe = store.subscribe((ev) => {
      this.buffer.push(ev as DomainEvent);
      this.snapshot = projectDeviations(this.buffer);
    });
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /** Reconstruye desde cero (determinista). */
  rebuild(events: readonly DomainEvent[] | readonly AppendOnlyEvent[]): void {
    this.buffer.length = 0;
    this.buffer.push(...(events as DomainEvent[]));
    this.snapshot = projectDeviations(this.buffer);
  }

  current(): DeviationSnapshot {
    return this.snapshot;
  }

  byRule(ruleId: string): readonly DeviationRecord[] {
    return deviationsByRule(this.snapshot, ruleId);
  }

  byActor(actorId: string): readonly DeviationRecord[] {
    return deviationsByActor(this.snapshot, actorId);
  }

  byPeriod(fromIso: string, toIso: string): readonly DeviationRecord[] {
    return deviationsByPeriod(this.snapshot, fromIso, toIso);
  }

  /** El Observador no tiene acceso de escritura a /policies. */
  writePolicy(_document: unknown): never {
    throw new ObserverWriteError(
      "Observador de solo lectura: no puede escribir políticas",
    );
  }

  /** El Observador no tiene acceso de escritura al CompiledRuleSet. */
  writeCompiledRuleSet(_ruleSet: unknown): never {
    throw new ObserverWriteError(
      "Observador de solo lectura: no puede escribir CompiledRuleSet",
    );
  }
}
