/**
 * Agregados para capa 3 / Priorizador (tasas por variante).
 */

import type {
  InsightResponseRecord,
  VariantAcceptanceStats,
} from "./types.js";

/**
 * Tasa de aceptación por variante de un experimento.
 * `acceptanceRate = accepted / shown` (shown = con shownAt no null).
 */
export function acceptanceRateByVariant(
  records: readonly InsightResponseRecord[],
  experimentId: string,
): readonly VariantAcceptanceStats[] {
  const scoped = records.filter(
    (r) => r.experimentId === experimentId && r.shownAt !== null,
  );
  const byVariant = new Map<
    string,
    { shown: number; accepted: number; rejected: number; ignored: number }
  >();

  for (const r of scoped) {
    const v = r.experimentVariant ?? "_none_";
    let s = byVariant.get(v);
    if (!s) {
      s = { shown: 0, accepted: 0, rejected: 0, ignored: 0 };
      byVariant.set(v, s);
    }
    s.shown += 1;
    if (r.outcome === "aceptado") s.accepted += 1;
    else if (r.outcome === "rechazado") s.rejected += 1;
    else if (r.outcome === "ignorado") s.ignored += 1;
  }

  return [...byVariant.entries()]
    .map(([variant, s]) => ({
      experimentId,
      variant,
      shown: s.shown,
      accepted: s.accepted,
      rejected: s.rejected,
      ignored: s.ignored,
      acceptanceRate: s.shown === 0 ? 0 : s.accepted / s.shown,
    }))
    .sort((a, b) => a.variant.localeCompare(b.variant));
}
