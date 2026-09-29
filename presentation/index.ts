export * from "./types.js";
export * from "./tokens.js";
export * from "./patterns.js";
export { resolveTokenMap } from "./resolve-tokens.js";
export { bindDesignToUiSpec, warningsForView } from "./bind-design.js";
export type {
  UiDesignBinding,
  PatternWarning,
  ViewPatternBinding,
} from "./bind-design.js";
export {
  renderUiSpecHtml,
  renderModuleDesignComparison,
} from "./renderer.js";
export {
  uiSpecZod,
  SUPPORTED_PRESENTATION_SCHEMA_VERSIONS,
} from "./uispec-schema.js";
export {
  validateUiSpec,
  validateUiSpecReport,
  serializeValidatedUiSpec,
  parseAndValidateUiSpec,
  UiSpecValidationError,
} from "./uispec-validator.js";
export type {
  UiSpecValidationCode,
  UiSpecValidationIssue,
  UiSpecValidationReport,
} from "./uispec-validator.js";
export {
  isValidatedUiSpec,
  sealValidatedUiSpec,
  UISPEC_VALIDATION_SEAL,
} from "./validated.js";
export type { ValidatedUiSpec } from "./validated.js";
/** Lectura L2 solo a través del Filtro. */
export {
  readThroughFilter,
  createPresentationReadGateway,
  sealAgainstLayer2DirectAccess,
  assertNoDirectStoreAccess,
  Layer2DirectAccessError,
} from "../filter/index.js";
