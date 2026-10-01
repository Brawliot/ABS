/**
 * API de auditoría para consultar decisiones del Juez.
 * Proporciona vistas filtradas de logs de decisiones críticas.
 */

import { judgeLogger, type JudgeLogEntry, type JudgeEventKind } from "../policies/index.js";

export interface AuditQuery {
  readonly kind?: JudgeEventKind;
  readonly actorId?: string;
  readonly transitionId?: string;
  readonly subjectId?: string;
  readonly fromIso?: string;
  readonly toIso?: string;
  readonly limit?: number;
}

export interface AuditReport {
  readonly query: AuditQuery;
  readonly entries: readonly JudgeLogEntry[];
  readonly total: number;
  readonly generatedAt: string;
}

/**
 * Consulta el log de decisiones del Juez con filtros opcionales.
 */
export function queryAuditLog(query: AuditQuery): AuditReport {
  let entries = judgeLogger.all();

  if (query.kind) {
    entries = entries.filter((e) => e.kind === query.kind);
  }

  if (query.actorId) {
    entries = entries.filter((e) => e.actorId === query.actorId);
  }

  if (query.transitionId) {
    entries = entries.filter((e) => e.transitionId === query.transitionId);
  }

  if (query.subjectId) {
    entries = entries.filter((e) => e.subjectId === query.subjectId);
  }

  if (query.fromIso && query.toIso) {
    entries = entries.filter(
      (e) => e.at >= query.fromIso! && e.at <= query.toIso!
    );
  }

  if (query.limit && query.limit > 0) {
    entries = entries.slice(-query.limit);
  }

  return {
    query,
    entries,
    total: entries.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Genera reporte de auditoría por actor.
 */
export function auditByActor(actorId: string, limit?: number): AuditReport {
  const query: AuditQuery = { actorId };
  if (limit) query.limit = limit;
  return queryAuditLog(query);
}

/**
 * Genera reporte de auditoría de forzados (desviaciones de política).
 */
export function auditForcedTransitions(limit?: number): AuditReport {
  const query: AuditQuery = { kind: "judge_forced" };
  if (limit) query.limit = limit;
  return queryAuditLog(query);
}

/**
 * Genera reporte de auditoría de rechazos por período.
 */
export function auditRejectionsByPeriod(
  fromIso: string,
  toIso: string,
  limit?: number
): AuditReport {
  const query: AuditQuery = { kind: "judge_rejected", fromIso, toIso };
  if (limit) query.limit = limit;
  return queryAuditLog(query);
}

/**
 * Genera resumen estadístico de decisiones.
 */
export function auditStatistics(): {
  readonly total: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly forced: number;
  readonly errors: number;
  readonly byActor: Readonly<Record<string, number>>;
  readonly byTransition: Readonly<Record<string, number>>;
} {
  const all = judgeLogger.all();
  const stats = {
    total: all.length,
    accepted: 0,
    rejected: 0,
    forced: 0,
    errors: 0,
    byActor: {} as Record<string, number>,
    byTransition: {} as Record<string, number>,
  };

  for (const entry of all) {
    switch (entry.kind) {
      case "judge_accepted":
        stats.accepted++;
        break;
      case "judge_rejected":
        stats.rejected++;
        break;
      case "judge_forced":
        stats.forced++;
        break;
      case "judge_error":
        stats.errors++;
        break;
    }

    if (entry.actorId) {
      stats.byActor[entry.actorId] = (stats.byActor[entry.actorId] || 0) + 1;
    }
    if (entry.transitionId) {
      stats.byTransition[entry.transitionId] =
        (stats.byTransition[entry.transitionId] || 0) + 1;
    }
  }

  return stats;
}
