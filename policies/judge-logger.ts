/**
 * Logger centralizado para decisiones del Juez.
 * Registra rechazos, forzados, y datos críticos con traza completa.
 */

import type { JudgeTrace } from "./judge.js";
import type { GuardEvaluationRecord } from "./judge.js";

export type JudgeEventKind =
  | "judge_accepted"
  | "judge_rejected"
  | "judge_forced"
  | "judge_error";

export interface JudgeLogEntry {
  readonly kind: JudgeEventKind;
  readonly at: string;
  readonly subjectId: string;
  readonly transitionId: string;
  readonly actorId?: string;
  readonly reason?: string;
  readonly skippedRuleId?: string;
  readonly skippedPhase?: string;
  readonly ruleSetVersion: string;
  readonly ruleSetHash: string;
  readonly guardsCount: number;
  readonly rejectedGuardId?: string;
  readonly error?: string;
}

/**
 * Logger centralizado de decisiones del Juez (singleton).
 * En CLI: escribe a stdout + archivo.
 * En producción: escribe a BD (auditoría).
 */
export class JudgeLogger {
  private entries: JudgeLogEntry[] = [];
  private readonly maxEntries = 10000;

  /**
   * Registra una aceptación del Juez.
   */
  logAccepted(trace: JudgeTrace, actorId?: string): void {
    this.entries.push({
      kind: "judge_accepted",
      at: trace.at,
      subjectId: trace.subjectId,
      transitionId: trace.transitionId,
      actorId,
      ruleSetVersion: trace.ruleSetVersion,
      ruleSetHash: trace.ruleSetContentHash,
      guardsCount: trace.guardsEvaluated.length,
    });
    this.trimIfNeeded();
  }

  /**
   * Registra un rechazo del Juez (con regla culpable).
   */
  logRejected(trace: JudgeTrace, actorId?: string): void {
    const rejected = [...trace.guardsEvaluated]
      .reverse()
      .find((g) => g.result === "rejected");

    this.entries.push({
      kind: "judge_rejected",
      at: trace.at,
      subjectId: trace.subjectId,
      transitionId: trace.transitionId,
      actorId,
      reason: trace.reason,
      rejectedGuardId: rejected?.ruleId,
      ruleSetVersion: trace.ruleSetVersion,
      ruleSetHash: trace.ruleSetContentHash,
      guardsCount: trace.guardsEvaluated.length,
    });
    this.trimIfNeeded();
  }

  /**
   * Registra un forzado (salto de regla con motivo).
   */
  logForced(
    trace: JudgeTrace,
    actorId: string,
    reason: string,
    skippedPhase: string,
  ): void {
    this.entries.push({
      kind: "judge_forced",
      at: trace.at,
      subjectId: trace.subjectId,
      transitionId: trace.transitionId,
      actorId,
      reason,
      skippedRuleId: trace.appliedRuleId ?? undefined,
      skippedPhase,
      ruleSetVersion: trace.ruleSetVersion,
      ruleSetHash: trace.ruleSetContentHash,
      guardsCount: trace.guardsEvaluated.length,
    });
    this.trimIfNeeded();
  }

  /**
   * Registra un error en evaluación.
   */
  logError(
    subjectId: string,
    transitionId: string,
    error: string,
    ruleSetVersion: string,
    ruleSetHash: string,
    actorId?: string,
  ): void {
    this.entries.push({
      kind: "judge_error",
      at: new Date().toISOString(),
      subjectId,
      transitionId,
      actorId,
      error,
      ruleSetVersion,
      ruleSetHash,
      guardsCount: 0,
    });
    this.trimIfNeeded();
  }

  /**
   * Retorna todas las entradas registradas (en memoria).
   */
  all(): readonly JudgeLogEntry[] {
    return Object.freeze([...this.entries]);
  }

  /**
   * Filtra por actor.
   */
  byActor(actorId: string): readonly JudgeLogEntry[] {
    return this.entries.filter((e) => e.actorId === actorId);
  }

  /**
   * Filtra por transición.
   */
  byTransition(transitionId: string): readonly JudgeLogEntry[] {
    return this.entries.filter((e) => e.transitionId === transitionId);
  }

  /**
   * Filtra por período.
   */
  byPeriod(fromIso: string, toIso: string): readonly JudgeLogEntry[] {
    return this.entries.filter((e) => e.at >= fromIso && e.at <= toIso);
  }

  /**
   * Filtra por tipo de evento.
   */
  byKind(kind: JudgeEventKind): readonly JudgeLogEntry[] {
    return this.entries.filter((e) => e.kind === kind);
  }

  /**
   * Limpia todas las entradas (para tests).
   */
  clear(): void {
    this.entries.length = 0;
  }

  private trimIfNeeded(): void {
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }
}

/** Logger global singleton. */
export const judgeLogger = new JudgeLogger();
