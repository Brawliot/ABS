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

/** Línea de una transacción: qué, cuánto y a qué precio (copiado al registrar). */
export interface LineaDatos {
  /** Oferta del catálogo de la que sale la línea (opcional: línea libre). */
  readonly ofertaId?: string;
  readonly ofertaVersion?: number;
  readonly descripcion: string;
  /** Cantidad en milésimas (1,5 unidades → 1500). */
  readonly cantidadMilesimas: number;
  /** Precio unitario sin IVA en céntimos. */
  readonly precioCentimos: number;
  readonly ivaPct: number;
}

/**
 * Datos de negocio de una transacción. Solo referencias opacas a Parte:
 * la PII vive en ParteIdentityStore, nunca en eventos.
 */
export interface TransaccionDatos {
  readonly parteId: string;
  /** Fecha de negocio (AAAA-MM-DD). */
  readonly fecha: string;
  /** Referencia libre del negocio (matrícula, mesa, nº de obra…). */
  readonly referencia?: string;
  readonly notas?: string;
  readonly lineas: readonly LineaDatos[];
}

/** Nace una transacción con sus datos. Primer evento de su historial. */
export interface AltaEvent extends EventBase {
  readonly kind: "alta";
  readonly lifecycleId: string;
  readonly sedeId?: string;
  readonly datos: TransaccionDatos;
}

/** Cambio de datos de una transacción (no cambia su estado). */
export interface DatosEvent extends EventBase {
  readonly kind: "datos";
  readonly cambios: Partial<TransaccionDatos>;
}

export type DomainEvent =
  | TransitionEvent
  | ExceptionEvent
  | ModificationEvent
  | ExpirationEvent
  | AltaEvent
  | DatosEvent;

export type AppendOnlyEvent = Readonly<DomainEvent>;
