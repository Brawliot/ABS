/**
 * Infraestructura LLM común (Intérprete, Consultor, Redactor, Diseñador, Diagnóstico).
 * Ninguna salida se ejecuta directamente: validadores + Intérprete → Juez.
 */

export type {
  FailureMode,
  LlmAdapter,
  LlmCallKind,
  LlmCallLogEntry,
  LlmComponentId,
  LlmCompletionRequest,
  LlmProviderId,
  LlmRawCompletion,
  LlmRuntimeMode,
  LlmStructuredOutcome,
  LlmTokenUsage,
  StructuredCallOptions,
  WithConfidence,
} from "./types.js";
export {
  LlmProviderError,
  LlmTimeoutError,
  LlmValidationError,
} from "./types.js";

export {
  CALL_KIND_PRIVACY,
  privacyDocFor,
  type CallKindPrivacyDoc,
} from "./call-kinds.js";

export {
  minimizeText,
  minimizePayload,
  assertNoObviousPii,
  type MinimizeOptions,
  type MinimizeResult,
} from "./privacy.js";

export { estimateCostUsd, MODEL_PRICE_USD_PER_MTOK } from "./cost.js";
export {
  DEFAULT_CONFIDENCE_THRESHOLDS,
  resolveConfidenceThreshold,
  isAboveConfidenceThreshold,
} from "./confidence.js";
export { parseAndValidate, withConfidenceSchema } from "./validate.js";
export {
  createCallLogEntry,
  memoryLogSink,
  getMemoryLog,
  clearMemoryLog,
  assertLogHasNoPii,
  type LlmLogSink,
} from "./log.js";

export { OpenAiLlmAdapter, DEFAULT_OPENAI_MODEL } from "./openai-adapter.js";
export {
  HeuristicLlmAdapter,
  defaultHeuristicContent,
  type HeuristicResponder,
} from "./heuristic-adapter.js";
export {
  CassetteLlmAdapter,
  cassetteFingerprint,
  loadCassette,
  saveCassette,
  defaultCassetteDir,
  type CassetteRecord,
} from "./cassette.js";

export { LlmClient, createLlmClientFromEnv, type LlmClientOptions } from "./client.js";
