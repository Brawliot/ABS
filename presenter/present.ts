/**
 * Orquestación del Presentador: caducidad → contrato → Filtro → colocación → experimento.
 */

import {
  assertInsightContract,
  type Insight,
} from "../contracts/insight.js";
import type { CompiledRuleSet } from "../policies/types.js";
import type { FilterPolicy, FilterReader } from "../filter/types.js";
import type { UiSpec } from "../presentation/types.js";
import { assignExperimentVariant } from "./experiment.js";
import { filterInsightFacts } from "./filter-insight.js";
import { resolvePlacement } from "./placement.js";
import type {
  OmittedInsight,
  PresentInsightsResult,
  PresentedInsight,
} from "./types.js";
import { PresenterError } from "./types.js";

export interface PresentInsightsInput {
  readonly insights: readonly Insight[];
  readonly uiSpec: UiSpec;
  readonly reader: FilterReader;
  readonly ruleSet: CompiledRuleSet;
  readonly now: string;
  /**
   * Clave estable de audiencia (parteId / actorId) para experimentos.
   * Independiente de la sesión.
   */
  readonly audienceKey: string;
  readonly filterPolicy?: FilterPolicy;
}

function isExpired(insight: Insight, now: string): boolean {
  return Date.parse(now) >= Date.parse(insight.expiresAt);
}

/**
 * Presenta Insights simulados/reales de capa 3 en la capa 2.
 */
export function presentInsights(
  input: PresentInsightsInput,
): PresentInsightsResult {
  const shown: PresentedInsight[] = [];
  const omitted: OmittedInsight[] = [];

  for (const insight of input.insights) {
    try {
      assertInsightContract(insight);
    } catch (e) {
      omitted.push({
        insightId: insight.id,
        reason: "contract_invalid",
        detail: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    if (!insight.baseFacts.length) {
      omitted.push({
        insightId: insight.id,
        reason: "no_base_facts",
        detail: "Ningún Insight se muestra sin hechos base",
      });
      continue;
    }

    if (isExpired(insight, input.now)) {
      omitted.push({
        insightId: insight.id,
        reason: "expired",
        detail: `Caducó en ${insight.expiresAt}`,
      });
      continue;
    }

    const filtered = filterInsightFacts({
      insight,
      reader: input.reader,
      ruleSet: input.ruleSet,
      at: input.now,
      ...(input.filterPolicy !== undefined
        ? { policy: input.filterPolicy }
        : {}),
    });

    if (!filtered.rowVerdict.ok) {
      omitted.push({
        insightId: insight.id,
        reason: "filter_row_denied",
        detail: filtered.rowVerdict.reason,
      });
      continue;
    }

    if (!filtered.ok || filtered.visibleFacts.length === 0) {
      omitted.push({
        insightId: insight.id,
        reason: "facts_filtered_empty",
        detail: `Hechos redactados por Filtro: [${filtered.redactedFieldKeys.join(", ")}]`,
      });
      continue;
    }

    let placement;
    try {
      placement = resolvePlacement(
        insight,
        input.uiSpec,
        input.reader.roles,
      );
    } catch (e) {
      omitted.push({
        insightId: insight.id,
        reason: "no_placement",
        detail: e instanceof PresenterError ? e.message : String(e),
      });
      continue;
    }

    const experimentVariant =
      insight.experiment && insight.experiment.variants.length > 0
        ? assignExperimentVariant(
            insight.experiment.experimentId,
            input.audienceKey,
            insight.experiment.variants,
          )
        : null;

    shown.push({
      insightId: insight.id,
      type: insight.type,
      moduleId: placement.moduleId,
      viewId: placement.viewId,
      subjectKind: insight.subject.kind,
      subjectId: insight.subject.id,
      title: insight.title,
      summary: insight.summary,
      baseFacts: filtered.visibleFacts,
      confidence: insight.confidence,
      generatedAt: insight.generatedAt,
      expiresAt: insight.expiresAt,
      experimentVariant,
      suggestedAction: insight.suggestedAction ?? null,
      filterRowVerdict: filtered.rowVerdict,
    });
  }

  return { shown, omitted };
}
