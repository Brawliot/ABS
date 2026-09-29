/**
 * Hosting — registro, enrutado, movimiento y export EN CLIENTE.
 */

export type {
  HostingMode,
  AccountPlacement,
  CompanyRoute,
  CompanyExportManifest,
  CompanyExportPackage,
  MoveVerification,
} from "./types.js";
export { ACCOUNT_PLACEMENT, HostingError } from "./types.js";
export { CompanyDatabaseRegistry } from "./registry.js";
export { PoolRouter } from "./pool-router.js";
export {
  exportCompany,
  importCompanyPackage,
  deleteCompanyData,
  verifyMove,
  hashEventStream,
  hashIdentity,
} from "./company-data.js";
export {
  moveCompany,
  exportCompanyToFile,
  bootstrapOnClient,
} from "./move-company.js";
export {
  DEFAULT_ARCHIVE_POLICY,
  HOSTING_THRESHOLDS,
  estimateEventStoreGrowth,
} from "./archive-policy.js";
