/**
 * Puntuación: tipo × confianza × impacto × caducidad.
 */

import type { Insight } from "../contracts/insight.js";
import type { PrioritizerConfig } from "./types.js";
import { DEFAULT_PRIORITIZER_CONFIG } from "./types.js";

const IMPACT_REF = 10_000; // valor de referencia para normalizar

export function resolveEstimatedImpact(insight: Insight): number {
  if (insight.estimatedImpact !== undefined) {
    return Math.max(0, insight.estimatedImpact);
  }
  for (const f of insight.baseFacts) {
    if (
      (f.fieldKey === "importe" ||
        f.fieldKey === "valor" ||
        f.id === "importe") &&
      typeof f.value === "number"
    ) {
      return Math.max(0, f.value);
    }
  }
  return 0;
}

/**
 * Caducidad: 0 cerca de generatedAt, → 1 al acercarse a expiresAt.
 */
export function expiryUrgencyFactor(
  insight: Insight,
  nowIso: string,
): number {
  const gen = Date.parse(insight.generatedAt);
  const exp = Date.parse(insight.expiresAt);
  const now = Date.parse(nowIso);
  if (!(exp > gen)) return 1;
  if (now >= exp) return 1;
  if (now <= gen) return 0;
  return (now - gen) / (exp - gen);
}

export function impactFactor(impact: number): number {
  if (impact <= 0) return 0.15;
  return Math.min(1, Math.log1p(impact) / Math.log1p(IMPACT_REF));
}

/**
 * Score en [0, 1] aprox. (puede superar 1 ligeramente antes de clamp).
 */
export function scoreInsight(
  insight: Insight,
  nowIso: string,
  config: PrioritizerConfig = DEFAULT_PRIORITIZER_CONFIG,
  acceptanceBoost = 1,
): number {
  const typeW = config.typeWeights[insight.type] ?? 0.5;
  const conf = Math.min(1, Math.max(0, insight.confidence));
  const impact = impactFactor(resolveEstimatedImpact(insight));
  const expiry = expiryUrgencyFactor(insight, nowIso);
  // Pesos: tipo 30%, confianza 25%, impacto 25%, caducidad 20%
  const raw =
    typeW * 0.3 + conf * 0.25 + impact * 0.25 + expiry * 0.2;
  const boosted = raw * acceptanceBoost;
  return Math.min(1.15, Math.max(0, boosted));
}

export function scoreToUrgency(
  score: number,
  config: PrioritizerConfig = DEFAULT_PRIORITIZER_CONFIG,
): import("./types.js").UrgencyLevel {
  const t = config.scoreThresholds;
  if (score >= t.interrumpir) return "interrumpir";
  if (score >= t.destacar) return "destacar";
  if (score >= t.mostrar_en_contexto) return "mostrar_en_contexto";
  return "solo_bajo_consulta";
}
