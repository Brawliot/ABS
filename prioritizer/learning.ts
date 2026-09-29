/**
 * Aprendizaje desde el Registrador: tasas por tipo ajustan puntuación/nivel.
 */

import type { InsightType } from "../contracts/insight.js";
import type { InsightTypeResponseStats } from "../response-registrar/type-stats.js";
import type { PrioritizerConfig, UrgencyLevel } from "./types.js";
import {
  DEFAULT_PRIORITIZER_CONFIG,
  demoteUrgency,
  maxUrgency,
} from "./types.js";

export interface LearningAdjustment {
  /** Multiplicador de score (tipos bien aceptados suben un poco). */
  readonly scoreMultiplier: number;
  /** Si true, bajar un nivel de urgencia. */
  readonly demoteLevel: boolean;
  readonly ignoreRate: number;
  readonly observations: number;
}

export function learningAdjustmentForType(
  insightType: InsightType | string,
  stats: readonly InsightTypeResponseStats[],
  config: PrioritizerConfig = DEFAULT_PRIORITIZER_CONFIG,
): LearningAdjustment {
  const s = stats.find((x) => x.insightType === insightType);
  if (!s || s.shown < config.minObservationsForLearning) {
    return {
      scoreMultiplier: 1,
      demoteLevel: false,
      ignoreRate: s?.ignoreRate ?? 0,
      observations: s?.shown ?? 0,
    };
  }

  // Ajuste suave por aceptación: [0.85, 1.15]
  const scoreMultiplier = 0.85 + Math.min(1, s.acceptanceRate) * 0.3;
  const demoteLevel =
    s.ignoreRate >= config.ignoreRateDemotionThreshold;

  return {
    scoreMultiplier,
    demoteLevel,
    ignoreRate: s.ignoreRate,
    observations: s.shown,
  };
}

/**
 * Aplica democión por aprendizaje, respetando suelo de Cumplimiento.
 */
export function applyLearningAndComplianceFloor(input: {
  readonly urgency: UrgencyLevel;
  readonly demoteLevel: boolean;
  readonly complianceDerived: boolean;
}): {
  readonly urgency: UrgencyLevel;
  readonly demotedByLearning: boolean;
  readonly complianceFloorApplied: boolean;
} {
  let urgency = input.urgency;
  let demotedByLearning = false;
  let complianceFloorApplied = false;

  if (input.demoteLevel) {
    urgency = demoteUrgency(urgency);
    demotedByLearning = true;
  }

  if (input.complianceDerived) {
    const floored = maxUrgency(urgency, "destacar");
    if (floored !== urgency) {
      complianceFloorApplied = true;
      urgency = floored;
    }
    // Aunque no cambie el nivel, el floor está activo (no pudo bajar de destacar)
    if (demotedByLearning && urgency === "destacar") {
      complianceFloorApplied = true;
    }
  }

  return { urgency, demotedByLearning, complianceFloorApplied };
}
