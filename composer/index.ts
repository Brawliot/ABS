export type {
  ComposerResult,
  ComposerSuccess,
  ComposerFailure,
  ComposerQuestion,
  TraceEntry,
  VisibilityRequirement,
  NonComposableItem,
  CompositionRule,
  RuleAction,
} from "./types.js";
export { COMPOSITION_RULES, SAMPLE_PLANTILLA_TO_TPL } from "./rules.js";
export {
  composeBusinessProfile,
  resolveSamplePlantilla,
  type ComposeOptions,
} from "./compose.js";
export { hashComposerOutput } from "./hash.js";
export { mapSampleToV12 } from "./sample-to-v12.js";
export { parseScheduleText } from "./schedule-parser.js";
export type { ScheduleParseResult, ScheduleParseQuestion } from "./schedule-parser.js";
export {
  runCompositionFitOracle,
  ORACLE_EXCEPTIONS,
  type ExpectedCompositionDoc,
  type FitReport,
  type FitFinding,
  type OracleException,
} from "./fit-oracle.js";
export {
  businessProfileThroughComposer,
  applyComposerToMaterialize,
  composeValidatedProfile,
  unifyComposerQuestions,
  type ComposedPipelineResult,
} from "./pipeline.js";
export {
  defaultFinancieraBinding,
  defaultPostventaServicioBinding,
} from "./bindings.js";

// —— Fase 1 Compositor: Precedencia + Normalización + Validación ——
export {
  RULE_PRECEDENCE,
  getRulePriority,
  getRulePrecedenceInfo,
  sortRuleIdsByPrecedence,
  canRulesConflict,
  type RulePrecedence,
} from "./precedence.js";
export {
  normalizeBusinessProfile,
  normalizeCobrosModel,
  normalizeAPlazos,
  normalizeACredito,
  describeNormalization,
  type NormalizationTrace,
} from "./normalizers.js";
export {
  validateFinancialCoherence,
  validateNoForbidConflicts,
  validateFinancieraCombined,
  FinancialCoherenceError,
} from "./financial-validator.js";

// —— Fase 2 Compositor: DSL Extendido + Traceabilidad V2 + Validación ——
export {
  RuleBuilder,
  evaluateCondition,
  describeCondition,
  getConditionDepth,
  countOperands,
  serializeCondition,
  deserializeCondition,
  type RuleCondition,
  type ComposerContext,
} from "./dsl-extended.js";
export {
  Tracer,
  buildFieldSnapshot,
  type TraceEntryV2,
  type FieldSnapshot,
  type RuleDecision,
} from "./trace-v2.js";
export {
  GeneratorInputValidator,
  validateGeneratorInputFast,
  getCriticalValidationErrors,
  type GeneratorInputValidation,
  type ValidationError,
  type ValidationWarning,
  type ValidationErrorType,
} from "./generator-input-validator.js";

// —— Fase 3 Compositor: 11 Reglas Faltantes para Cobertura Completa ——
export { COMPOSITION_RULES_PHASE_3, getAllCompositionRules, getPhase3Coverage } from "./rules-phase3.js";
