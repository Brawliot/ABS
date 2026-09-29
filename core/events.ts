/**
 * Eventos del núcleo — única fuente de verdad (principio 5).
 * Tipos cerrados; inmutables una vez registrados.
 */

import type { ActorKind, EvidenceKind, EventKind } from "./grammar.js";

export interface EvidenceRecord {
  readonly kind: EvidenceKind;
  readonly reference: string;
  readonly recordedAt: string;
}

export interface EventBase {
  readonly id: string;
  readonly kind: EventKind;
  /** Identificador del metaobjeto / ejemplar al que aplica. */
  readonly subjectId: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorKind: ActorKind;
  readonly evidence: EvidenceRecord;
}

export interface TransitionEvent extends EventBase {
  readonly kind: "transicion";
  readonly transitionId: string;
  readonly fromStateId: string;
  readonly toStateId: string;
  /**
   * Datos de capa 1 aplicados en la transición (cálculos, versión del RuleSet).
   * El núcleo de derivación los ignora; sirven para reconstrucción y auditoría.
   */
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface ExceptionEvent extends EventBase {
  readonly kind: "excepcion";
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly reason: string;
}

/**
 * Válvula de escape: texto libre para lo que el modelo no cubre.
 * Siempre se guarda; es señal de aprendizaje (perfil).
 */
export interface ModificationEvent extends EventBase {
  readonly kind: "modificacion";
  readonly freeText: string;
}

export interface ExpirationEvent extends EventBase {
  readonly kind: "vencimiento";
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly commitmentId: string;
}

export type DomainEvent =
  | TransitionEvent
  | ExceptionEvent
  | ModificationEvent
  | ExpirationEvent;

export type AppendOnlyEvent = Readonly<DomainEvent>;
