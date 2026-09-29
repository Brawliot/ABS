export {
  createAuthRuntime,
  loginWithPassword,
  logoutSession,
  identityForAction,
  type AuthRuntime,
} from "./auth-bridge.js";
export { executeUiAction, type ActionRequestBody, type ActionResult } from "./action-handler.js";
export { AppRuntime, type FlashMessage, type RuntimeSubject, type ActiveBlockInfo } from "./runtime.js";
export type {
  AppBootResult,
  DevSession,
  RenderAppOptions,
  SampleRow,
} from "./types.js";
export {
  bootProfile,
  bootSampleProfile,
  bootConcesionaria,
  listSampleProfileIds,
  allBootableIds,
} from "./boot-profile.js";
export { renderAppHtml, resolveSession, extractDomMarkers } from "./render-app.js";
export { startWebServer, type WebServerHandle } from "./server.js";
export {
  startMultiTenantWebServer,
  type MultiTenantHandle,
  type TenantSlot,
} from "./multi-tenant-server.js";
export {
  runDiagnosis,
  renderDiagnosisHtml,
  noMatchAnswers,
  answersFromForm,
} from "./diagnosis-page.js";
export {
  processGroupsForRole,
  viewsInGroups,
  actionVisibleForRole,
  actionsForView,
} from "./visibility.js";
export { buildSampleRows, DEFAULT_SAMPLE_PARTES } from "./sample-data.js";
