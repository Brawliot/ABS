/**
 * Contratos estables entre capas.
 * Insight: capa 3 produce → Presentador (capa 2) consume.
 */

export {
  INSIGHT_CONTRACT_VERSION,
  assertInsightContract,
} from "./insight.js";
export type {
  Insight,
  InsightType,
  InsightSubjectKind,
  InsightSubjectRef,
  InsightFact,
  InsightSuggestedAction,
  InsightExperimentSpec,
} from "./insight.js";
