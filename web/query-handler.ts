/**
 * Query handlers: consultas de solo lectura del EventStore.
 * GET /api/transacciones/{id}/documentos
 * GET /api/transacciones/{id}/calculos
 * GET /api/transacciones/{id}/audits
 * GET /api/transacciones/{id}/notificaciones
 */

import type { SqliteEventStore } from "../adapters/sqlite-event-store.js";
import type { ModificationEvent } from "../core/events.js";

interface DocumentoResponse {
  readonly id: string;
  readonly tipo: string;
  readonly creado_en: string;
  readonly datos: Record<string, unknown>;
}

interface CalculoResponse {
  readonly id: string;
  readonly campo: string;
  readonly valor: number;
  readonly formula: string;
  readonly timestamp: string;
}

interface NotificacionResponse {
  readonly id: string;
  readonly actor_id: string;
  readonly canal: string;
  readonly asunto: string;
  readonly estado: "preparada" | "enviada";
  readonly timestamp: string;
}

interface AuditEventResponse {
  readonly id: string;
  readonly kind: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorKind: string;
  freeText?: string;
}

export interface QueryResult<T> {
  readonly ok: boolean;
  readonly data?: T[];
  readonly error?: string;
  readonly total?: number;
}

function parseEventMetadata(freeText: string): Record<string, unknown> {
  try {
    return JSON.parse(freeText);
  } catch {
    return {};
  }
}

export function queryDocumentos(
  store: SqliteEventStore,
  transactionId: string,
): QueryResult<DocumentoResponse> {
  try {
    const allEvents = store.getBySubject(transactionId);
    const documentos: DocumentoResponse[] = [];

    for (const event of allEvents) {
      if (event.kind === "modificacion" && event.actorId === "sys-generador") {
        try {
          const metadata = parseEventMetadata(event.freeText ?? "{}");
          if (
            metadata.documento_id &&
            typeof metadata.documento_id === "string"
          ) {
            documentos.push({
              id: metadata.documento_id,
              tipo: String(metadata.tipo ?? "desconocido"),
              creado_en: event.occurredAt,
              datos: (metadata.datos as Record<string, unknown>) ?? {},
            });
          }
        } catch {
          // Skip malformed events
        }
      }
    }

    return {
      ok: true,
      data: documentos,
      total: documentos.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export function queryCalculos(
  store: SqliteEventStore,
  transactionId: string,
): QueryResult<CalculoResponse> {
  try {
    const allEvents = store.getBySubject(transactionId);
    const calculos: CalculoResponse[] = [];

    for (const event of allEvents) {
      if (event.kind === "modificacion" && event.actorId === "sys-calculos") {
        try {
          const metadata = parseEventMetadata(event.freeText ?? "{}");
          if (metadata.campo && typeof metadata.campo === "string") {
            calculos.push({
              id: event.id,
              campo: metadata.campo,
              valor: Number(metadata.valor ?? 0),
              formula: String(metadata.formula ?? ""),
              timestamp: String(metadata.timestamp ?? event.occurredAt),
            });
          }
        } catch {
          // Skip malformed events
        }
      }
    }

    return {
      ok: true,
      data: calculos,
      total: calculos.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export function queryNotificaciones(
  store: SqliteEventStore,
  transactionId: string,
): QueryResult<NotificacionResponse> {
  try {
    const allEvents = store.getBySubject(transactionId);
    const notificaciones: NotificacionResponse[] = [];

    for (const event of allEvents) {
      if (event.kind === "modificacion" && event.actorId === "sys-notificaciones") {
        try {
          const metadata = parseEventMetadata(event.freeText ?? "{}");
          if (metadata.notif_id && typeof metadata.notif_id === "string") {
            notificaciones.push({
              id: metadata.notif_id,
              actor_id: String(metadata.notif_actor_id ?? "desconocido"),
              canal: String(metadata.notif_canal ?? "desconocido"),
              asunto: String(metadata.notif_asunto ?? ""),
              estado: (metadata.estado as "preparada" | "enviada") ?? "preparada",
              timestamp: String(metadata.timestamp ?? event.occurredAt),
            });
          }
        } catch {
          // Skip malformed events
        }
      }
    }

    return {
      ok: true,
      data: notificaciones,
      total: notificaciones.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export function queryAudits(
  store: SqliteEventStore,
  transactionId: string,
): QueryResult<AuditEventResponse> {
  try {
    const allEvents = store.getBySubject(transactionId);
    const audits: AuditEventResponse[] = [];

    for (const event of allEvents) {
      const audit: AuditEventResponse = {
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurredAt,
        actorId: event.actorId,
        actorKind: event.actorKind,
      };
      if (event.kind === "modificacion") {
        audit.freeText = (event as ModificationEvent).freeText;
      }
      audits.push(audit);
    }

    return {
      ok: true,
      data: audits,
      total: audits.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
