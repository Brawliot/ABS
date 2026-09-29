/**
 * Consultor: pregunta NL → consulta estructurada → Filtro → respuesta con cálculo.
 */

import { createHash } from "node:crypto";
import type { FilterReader } from "../filter/types.js";
import type { CompiledRuleSet } from "../policies/types.js";
import {
  HeuristicConsultantExtractor,
  type ConsultantTextExtractor,
} from "./extractor.js";
import { executeStructuredQuery } from "./execute.js";
import type { UnansweredGapLog } from "./gaps.js";
import type {
  ConsultantOutcome,
  MetricFactRow,
} from "./types.js";

export interface ConsultInput {
  readonly question: string;
  readonly reader: FilterReader;
  readonly ruleSet: CompiledRuleSet;
  readonly facts: readonly MetricFactRow[];
  readonly defaultYear?: number;
  readonly at?: string;
  readonly extractor?: ConsultantTextExtractor;
  readonly gapLog?: UnansweredGapLog;
}

function gapId(question: string, readerId: string): string {
  return createHash("sha256")
    .update(`${readerId}:${question}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Traduce y ejecuta. Bajo umbral / fuera de catálogo → aclaración (sin cifra).
 */
export function consult(input: ConsultInput): ConsultantOutcome {
  const extractor =
    input.extractor ?? new HeuristicConsultantExtractor();
  const defaultYear = input.defaultYear ?? 2026;
  const extracted = extractor.extract(input.question, { defaultYear });

  if (!extracted.query || extracted.reason !== "ok") {
    if (input.gapLog && extracted.reason === "out_of_catalog") {
      input.gapLog.record({
        id: gapId(input.question, input.reader.id),
        at: input.at ?? new Date().toISOString(),
        question: input.question,
        reason: extracted.reason,
        readerId: input.reader.id,
        missingHint: extracted.missingHint ?? "fuera de catálogo",
      });
    }
    return {
      kind: "aclaracion",
      question:
        extracted.clarificationQuestion ??
        "¿Puedes reformular la consulta sobre una métrica del catálogo?",
      confidence: extracted.confidence,
      reason:
        extracted.reason === "ok"
          ? "ambiguous"
          : extracted.reason,
      ...(extracted.suggestedMetrics
        ? { suggestedMetrics: extracted.suggestedMetrics }
        : {}),
      clarificationAsked: true,
    };
  }

  const executed = executeStructuredQuery({
    query: extracted.query,
    facts: input.facts,
    reader: input.reader,
    ruleSet: input.ruleSet,
    ...(input.at !== undefined ? { at: input.at } : {}),
  });

  return {
    kind: "respuesta",
    query: extracted.query,
    buckets: executed.buckets,
    total: executed.total,
    calculation: executed.calculation,
    clarificationAsked: false,
  };
}
