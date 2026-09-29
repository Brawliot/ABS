export * from "./types.js";
export {
  buildHitosTemplateInvocation,
  compilePolicyTemplate,
  compilePolicyTemplates,
  catalogFieldsForTemplate,
  catalogFieldsForTemplates,
  PolicyTemplateError,
} from "./compile.js";
export type { CompiledTemplates } from "./compile.js";
export {
  buildAvisoPlazoInsight,
  prioritizeAvisoPlazo,
} from "./aviso-plazo.js";
export type { AvisoPlazoContext } from "./aviso-plazo.js";
// types re-exporta POLICY_TEMPLATE_IDS, POLICY_TEMPLATE_IDS_EXTRA, ALL_POLICY_TEMPLATE_IDS
