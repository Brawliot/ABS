/**
 * Agregados: embudo por recorrido y puntos de abandono.
 */

import type {
  ExperienceTelemetryRecord,
  FunnelStepStats,
  RecorridoFunnel,
} from "./types.js";

export function buildRecorridoFunnel(
  recorridoId: string,
  records: readonly ExperienceTelemetryRecord[],
  stepOrder: readonly string[],
): RecorridoFunnel {
  const scoped = records.filter((r) => r.recorridoId === recorridoId);
  const byStep = new Map<string, FunnelStepStats>();

  for (const stepId of stepOrder) {
    byStep.set(stepId, {
      stepId,
      views: 0,
      abandons: 0,
      errors: 0,
      judgeRejections: 0,
      insightShown: 0,
      totalDwellMs: 0,
    });
  }

  for (const r of scoped) {
    let s = byStep.get(r.stepId);
    if (!s) {
      s = {
        stepId: r.stepId,
        views: 0,
        abandons: 0,
        errors: 0,
        judgeRejections: 0,
        insightShown: 0,
        totalDwellMs: 0,
      };
      byStep.set(r.stepId, s);
    }
    switch (r.kind) {
      case "step_view":
        s = { ...s, views: s.views + 1 };
        break;
      case "abandon":
        s = { ...s, abandons: s.abandons + 1 };
        break;
      case "error":
        s = { ...s, errors: s.errors + 1 };
        break;
      case "judge_rejection_shown":
        s = { ...s, judgeRejections: s.judgeRejections + 1 };
        break;
      case "insight_shown":
        s = { ...s, insightShown: s.insightShown + 1 };
        break;
      case "step_dwell":
        s = {
          ...s,
          totalDwellMs: s.totalDwellMs + (r.dwellMs ?? 0),
        };
        break;
    }
    byStep.set(r.stepId, s);
  }

  const steps = stepOrder.map(
    (id) =>
      byStep.get(id) ?? {
        stepId: id,
        views: 0,
        abandons: 0,
        errors: 0,
        judgeRejections: 0,
        insightShown: 0,
        totalDwellMs: 0,
      },
  );

  let topAbandonStepId: string | null = null;
  let maxAbandon = -1;
  for (const s of steps) {
    if (s.abandons > maxAbandon) {
      maxAbandon = s.abandons;
      topAbandonStepId = s.abandons > 0 ? s.stepId : topAbandonStepId;
    }
  }
  if (maxAbandon <= 0) topAbandonStepId = null;

  const sessions = new Set(scoped.map((r) => r.sessionPseudoId));

  return {
    recorridoId,
    steps,
    topAbandonStepId,
    totalSessionsApprox: sessions.size,
  };
}

/** Ranking de pasos por abandonos (desc). */
export function topAbandonmentPoints(
  funnel: RecorridoFunnel,
  limit = 5,
): readonly FunnelStepStats[] {
  return [...funnel.steps]
    .filter((s) => s.abandons > 0)
    .sort((a, b) => b.abandons - a.abandons || a.stepId.localeCompare(b.stepId))
    .slice(0, limit);
}
