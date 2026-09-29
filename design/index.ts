export * from "./schema.js";
export { contrastRatio, relativeLuminance, parseHex } from "./contrast.js";
export { validateDesignSystem } from "./validate.js";
export type { ValidationIssue, ValidationResult } from "./validate.js";
export {
  HeuristicLayer4Stub,
} from "./layer4-stub.js";
export type { Layer4Stub, Layer4BrandHints } from "./layer4-stub.js";
export {
  proposeDesignSystems,
  buildLowContrastSystem,
} from "./propose.js";
export type {
  DesignIdentityInput,
  DesignProposalBatch,
} from "./propose.js";
export {
  DesignStore,
  DesignRejectionError,
  hashDesignSystem,
  selectValidProposal,
  runDesignSession,
  designSystemToOverlay,
} from "./approve.js";
export type { DesignSystemVersion, DesignOverlayState } from "./approve.js";

/** Arquitecto de información */
export * as ia from "./ia/index.js";

/** Redactor de interfaz */
export * as copy from "./copy/index.js";
