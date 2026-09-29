/**
 * Orquestación: puntuar → urgencia → aprendizaje → suelo cumplimiento → tope interrupciones.
 */

import type { Insight } from "../contracts/insight.js";
import type {
  InsightTypeResponseStats,
} from "../response-registrar/type-stats.js";
import type { ResponseRegistrarReadPort } from "../response-registrar/reader.js";
import {
  applyLearningAndComplianceFloor,
  learningAdjustmentForType,
} from "./learning.js";
import { resolveInterruptLimit } from "./limits.js";
import { scoreInsight, scoreToUrgency } from "./scoring.js";
import type {
  PrioritizeResult,
  PrioritizedInsight,
  PrioritizerConfig,
  UrgencyLevel,
} from "./types.js";
import {
  DEFAULT_PRIORITIZER_CONFIG,
  URGENCY_RANK,
  demoteUrgency,
} from "./types.js";

export interface PrioritizeInput {
  readonly insights: readonly Insight[];
  readonly roles: readonly string[];
  readonly now: string;
  /**
   * Interrupciones ya consumidas hoy por esta persona
   * (otras sesiones / lotes previos).
   */
  readonly interruptsAlreadyToday?: number;
  /** Stats del Registrador; si se omite, sin aprendizaje. */
  readonly typeStats?: readonly InsightTypeResponseStats[];
  readonly responseReader?: ResponseRegistrarReadPort;
  readonly config?: PrioritizerConfig;
}

interface ScoredDraft {
  readonly insight: Insight;
  readonly score: number;
  urgency: UrgencyLevel;
  demotedByLearning: boolean;
  complianceFloorApplied: boolean;
  interruptDeferred: boolean;
}

/**
 * Prioriza Insights para una audiencia. Respeta el tope de interrupciones.
 */
export function prioritizeInsights(
  input: PrioritizeInput,
): PrioritizeResult {
  const config = input.config ?? DEFAULT_PRIORITIZER_CONFIG;
  const interruptLimit = resolveInterruptLimit(input.roles, config);
  const already = input.interruptsAlreadyToday ?? 0;
  const remainingSlots = Math.max(0, interruptLimit - already);

  const stats =
    input.typeStats ??
    input.responseReader?.statsByInsightType() ??
    [];

  const drafts: ScoredDraft[] = input.insights.map((insight) => {
    const learn = learningAdjustmentForType(insight.type, stats, config);
    const score = scoreInsight(
      insight,
      input.now,
      config,
      learn.scoreMultiplier,
    );
    const baseUrgency = scoreToUrgency(score, config);
    const adjusted = applyLearningAndComplianceFloor({
      urgency: baseUrgency,
      demoteLevel: learn.demoteLevel,
      complianceDerived: insight.complianceDerived === true,
    });
    return {
      insight,
      score,
      urgency: adjusted.urgency,
      demotedByLearning: adjusted.demotedByLearning,
      complianceFloorApplied: adjusted.complianceFloorApplied,
      interruptDeferred: false,
    };
  });

  // Orden: urgencia desc, score desc, id estable
  drafts.sort((a, b) => {
    const ur = URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency];
    if (ur !== 0) return ur;
    if (b.score !== a.score) return b.score - a.score;
    return a.insight.id.localeCompare(b.insight.id);
  });

  let interruptUsed = 0;
  for (const d of drafts) {
    if (d.urgency !== "interrumpir") continue;
    if (interruptUsed < remainingSlots) {
      interruptUsed += 1;
      continue;
    }
    // Diferir interrupción → destacar (sigue visible, no interrumpe)
    d.urgency = demoteUrgency("interrumpir"); // destacar
    d.interruptDeferred = true;
    // Cumplimiento: ya está en destacar (floor), ok
    if (d.insight.complianceDerived) {
      d.complianceFloorApplied = true;
    }
  }

  const items: PrioritizedInsight[] = drafts.map((d) => ({
    insightId: d.insight.id,
    urgency: d.urgency,
    score: d.score,
    demotedByLearning: d.demotedByLearning,
    complianceFloorApplied: d.complianceFloorApplied,
    interruptDeferred: d.interruptDeferred,
  }));

  return {
    items,
    interruptCount: already + interruptUsed,
    interruptLimit,
  };
}
