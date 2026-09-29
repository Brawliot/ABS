/**
 * Presentador — lleva Insights (capa 3) a la capa 2.
 */

import type { Insight, InsightFact, InsightSuggestedAction, InsightType } from "../contracts/insight.js";
import type { RowVerdict } from "../filter/types.js";

export class PresenterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresenterError";
  }
}

/** Insight listo para UI tras Filtro, colocación y experimento. */
export interface PresentedInsight {
  readonly insightId: string;
  readonly type: InsightType;
  readonly moduleId: string;
  readonly viewId: string;
  readonly subjectKind: Insight["subject"]["kind"];
  readonly subjectId: string;
  readonly title: string;
  readonly summary: string;
  /** Hechos base visibles (tras Filtro) — nunca vacío. */
  readonly baseFacts: readonly InsightFact[];
  readonly confidence: number;
  readonly generatedAt: string;
  readonly expiresAt: string;
  readonly experimentVariant: string | null;
  readonly suggestedAction: InsightSuggestedAction | null;
  readonly filterRowVerdict: RowVerdict;
}

export type InsightOmitReason =
  | "expired"
  | "no_base_facts"
  | "facts_filtered_empty"
  | "filter_row_denied"
  | "no_placement"
  | "contract_invalid";

export interface OmittedInsight {
  readonly insightId: string;
  readonly reason: InsightOmitReason;
  readonly detail: string;
}

export interface PresentInsightsResult {
  readonly shown: readonly PresentedInsight[];
  readonly omitted: readonly OmittedInsight[];
}
