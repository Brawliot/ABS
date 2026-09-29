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
