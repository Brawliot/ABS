export { generateUiSpec, applyOverlay, structuralHash, actionsVisibleToRole } from "./generate.js";
export {
  runProcessUiOracle,
  functionalFingerprint,
} from "./oracle.js";
export type { OracleReport, OracleFinding } from "./oracle.js";
export {
  validateUiWithDesignSystem,
  assertSpecHasNoLiteralDesignValues,
} from "./validate-ui.js";
export { deduceModules, MODULE_RULES } from "./rules/index.js";
export {
  buildConcesionariaGeneratorInput,
  buildConcesionariaGeneratorInputWithComposition,
  composeConcesionaria,
  concesionariaPolicyDocument,
  concesionariaBusinessProfile,
  CONCESIONARIA_PROFILE_PATH,
  CONCESIONARIA_SYSTEM_IDS,
  CONCESIONARIA_COMPOSITION,
} from "./packs/concesionaria.js";
export * as qa from "./qa/index.js";
export * as security from "./security/index.js";
export * from "./types.js";
export {
  derivePresentationPanels,
  portalVisibilityRoles,
} from "./presentation-rules.js";
export { buildProcessGroups } from "./process-groups.js";
export { LocalizationGenerator } from "./localization-generator.js";
export type { LocalizationContext } from "./localization-generator.js";
export { ViewActionIndex } from "./indexing.js";

// Fase 2: Exportar sistemas extensibles
export { FormTemplateRegistry } from "./form-templates.js";
export type {
  FormTemplateConfig,
  FieldTemplate,
  FormSection,
} from "./form-templates.js";
export {
  ActionBuilder,
  ViewBuilder,
  FormBuilder,
} from "./builders.js";
export {
  PluginManager,
  createValidationPlugin,
  createAuditPlugin,
  createRoleFilterPlugin,
} from "./plugin-system.js";
export type {
  GeneratorPlugin,
  GeneratorHooks,
} from "./plugin-system.js";
