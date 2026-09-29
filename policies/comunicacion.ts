/**
 * Comunicación de capa 1: documento formal, mensaje externo, notificación interna.
 * Se genera a partir de un evento + plantilla. No altera el estado derivado.
 * Todo envío queda en la traza; los documentos formales también como Evidencia.
 */

import type { DomainEvent, EvidenceRecord } from "../core/events.js";

export type CommunicationChannel =
  | "documento_formal"
  | "mensaje_externo"
  | "notificacion_interna";

export interface CommunicationTemplate {
  readonly id: string;
  readonly channel: CommunicationChannel;
  /** Cuerpo con placeholders {{campo}}. */
  readonly body: string;
  /** Para documento_formal: tipado de evidencia (factura, contrato, …). */
  readonly evidenceReferenceType?: string;
  readonly evidenceKind?: EvidenceRecord["kind"];
}

export interface CommunicationSendInput {
  readonly template: CommunicationTemplate;
  /** Evento que dispara el envío (no se muta). */
  readonly triggerEvent: DomainEvent;
  /** Valores para interpolar la plantilla (sin PII cruda preferible: refs). */
  readonly variables: Readonly<Record<string, string>>;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly documentId?: string;
}

export interface CommunicationRecord {
  readonly id: string;
  readonly channel: CommunicationChannel;
  readonly templateId: string;
  readonly triggerEventId: string;
  readonly subjectId: string;
  readonly occurredAt: string;
  readonly actorId: string;
  /** Cuerpo ya interpolado (puede contener datos resueltos en el momento). */
  readonly renderedBody: string;
  /** No afecta al estado: solo auditoría. */
  readonly affectsState: false;
  readonly evidence?: EvidenceRecord & { readonly referenceType?: string };
}

export class CommunicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunicationError";
  }
}

/** Traza append-only de envíos (capa 1; no es EventStore del núcleo). */
export class CommunicationTrace {
  private readonly records: CommunicationRecord[] = [];

  all(): readonly CommunicationRecord[] {
    return this.records;
  }

  bySubject(subjectId: string): readonly CommunicationRecord[] {
    return this.records.filter((r) => r.subjectId === subjectId);
  }

  byTrigger(eventId: string): readonly CommunicationRecord[] {
    return this.records.filter((r) => r.triggerEventId === eventId);
  }

  append(record: CommunicationRecord): void {
    this.records.push(Object.freeze({ ...record }));
  }
}

/**
 * Genera un envío desde evento + plantilla.
 * Documento formal → además produce Evidencia tipada.
 */
export function sendCommunication(
  input: CommunicationSendInput,
  trace: CommunicationTrace,
): CommunicationRecord {
  const renderedBody = renderTemplate(input.template.body, input.variables);
  const id =
    input.documentId ??
    `comm:${input.template.id}:${input.triggerEvent.id}:${input.occurredAt}`;

  let evidence: CommunicationRecord["evidence"];
  if (input.template.channel === "documento_formal") {
    const refType = input.template.evidenceReferenceType ?? "documento";
    const kind = input.template.evidenceKind ?? "fisica";
    evidence = {
      kind,
      reference: `${refType}:${id}`,
      recordedAt: input.occurredAt,
      referenceType: refType,
    };
  }

  const record: CommunicationRecord = {
    id,
    channel: input.template.channel,
    templateId: input.template.id,
    triggerEventId: input.triggerEvent.id,
    subjectId: input.triggerEvent.subjectId,
    occurredAt: input.occurredAt,
    actorId: input.actorId,
    renderedBody,
    affectsState: false,
    ...(evidence !== undefined ? { evidence } : {}),
  };

  trace.append(record);
  return record;
}

export function renderTemplate(
  body: string,
  variables: Readonly<Record<string, string>>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    if (variables[key] === undefined) {
      throw new CommunicationError(`Plantilla: falta variable "{{${key}}}"`);
    }
    return variables[key]!;
  });
}

/** Plantilla MVP de factura formal. */
export const FACTURA_TEMPLATE: CommunicationTemplate = {
  id: "tpl-factura",
  channel: "documento_formal",
  body: "Factura {{doc_numero}} — Parte {{parte_ref}} — Importe {{importe}}",
  evidenceReferenceType: "factura",
  evidenceKind: "fisica",
};
