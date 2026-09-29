/**
 * Tasas de respuesta por tipo de Insight (aprendizaje del Priorizador).
 */

import type { InsightResponseRecord } from "./types.js";

export interface InsightTypeResponseStats {
  readonly insightType: string;
  readonly shown: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly ignored: number;
  readonly acceptanceRate: number;
  readonly ignoreRate: number;
}

export function responseStatsByInsightType(
  records: readonly InsightResponseRecord[],
): readonly InsightTypeResponseStats[] {
  const scoped = records.filter((r) => r.shownAt !== null);
  const byType = new Map<
    string,
    { shown: number; accepted: number; rejected: number; ignored: number }
  >();

  for (const r of scoped) {
    let s = byType.get(r.insightType);
    if (!s) {
      s = { shown: 0, accepted: 0, rejected: 0, ignored: 0 };
      byType.set(r.insightType, s);
    }
    s.shown += 1;
    if (r.outcome === "aceptado") s.accepted += 1;
    else if (r.outcome === "rechazado") s.rejected += 1;
    else if (r.outcome === "ignorado") s.ignored += 1;
  }

  return [...byType.entries()]
    .map(([insightType, s]) => ({
      insightType,
      shown: s.shown,
      accepted: s.accepted,
      rejected: s.rejected,
      ignored: s.ignored,
      acceptanceRate: s.shown === 0 ? 0 : s.accepted / s.shown,
      ignoreRate: s.shown === 0 ? 0 : s.ignored / s.shown,
    }))
    .sort((a, b) => a.insightType.localeCompare(b.insightType));
}
