/**
 * Tenancy — aislamiento multiempresa.
 * Reexporta el contrato de empresa usado por hechos, políticas y almacenes.
 */

export type TenantId = string;

export {
  AGGREGATE_MIN_COMPANIES,
  AggregatedProfileLayer,
  MultiTenantVault,
  TenantEventStore,
  TenantIsolationError,
  type CompanyId,
} from "../learning/privacy.js";

export {
  ParteIdentityStore,
  assertNoPiiInEventData,
  ERASED_PARTE_STUB,
  type PartePersonalData,
  type ParteIdentityRecord,
} from "../policies/identity.js";
