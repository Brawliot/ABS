/**
 * RGPD — exportación / rectificación / supresión de PII de Parte.
 * La supresión usa ParteIdentityStore: eventos intactos, replay idéntico.
 */

import {
  ParteIdentityStore,
  type PartePersonalData,
} from "../policies/identity.js";
import type { TenantId } from "../tenancy/index.js";
import { logSecurityEvent } from "../auth/security-log.js";
import type { PersonalDataAccessRecord } from "../filter/types.js";

const accessLog: PersonalDataAccessRecord[] = [];

export function drainPersonalAccessLog(): readonly PersonalDataAccessRecord[] {
  const copy = [...accessLog];
  accessLog.length = 0;
  return copy;
}

export interface ParteExportBundle {
  readonly exportedAt: string;
  readonly tenantId: TenantId;
  readonly parteId: string;
  readonly erased: boolean;
  readonly personal: PartePersonalData | null;
  readonly format: "json-portable-v1";
  readonly note: string;
}

export function exportPartePersonal(
  store: ParteIdentityStore,
  tenantId: TenantId,
  parteId: string,
  readerId: string,
): ParteExportBundle {
  const resolved = store.resolve(tenantId, parteId);
  const at = new Date().toISOString();
  const fields = resolved.erased
    ? []
    : Object.keys(resolved.personal as unknown as Record<string, unknown>).filter(
        (k) =>
          (resolved.personal as unknown as Record<string, unknown>)[k] != null,
      );
  accessLog.push({
    at,
    readerId,
    tenantId,
    subjectKind: "parte",
    subjectId: parteId,
    fields,
    purpose: "consulta",
  });
  logSecurityEvent({
    at,
    kind: "personal_data_access",
    companyId: tenantId,
    accountId: readerId,
    detail: `export parte:${parteId}`,
  });
  return {
    exportedAt: at,
    tenantId,
    parteId,
    erased: resolved.erased,
    personal: resolved.erased ? null : { ...resolved.personal },
    format: "json-portable-v1",
    note: "Portabilidad / derecho de acceso. PENDIENTE DE REVISIÓN LEGAL si se entrega a tercero.",
  };
}

export function rectifyPartePersonal(
  store: ParteIdentityStore,
  tenantId: TenantId,
  parteId: string,
  personal: PartePersonalData,
  at = new Date().toISOString(),
): void {
  store.put(tenantId, parteId, personal, at);
}

export function erasePartePersonal(
  store: ParteIdentityStore,
  tenantId: TenantId,
  parteId: string,
  at = new Date().toISOString(),
): void {
  store.erase(tenantId, parteId, at);
  logSecurityEvent({
    at,
    kind: "personal_data_access",
    companyId: tenantId,
    detail: `erase parte:${parteId}`,
  });
}

/** Tras erase: ninguna vista debe mostrar PII (solo stub). */
export function assertNoPiiInResolved(
  store: ParteIdentityStore,
  tenantId: TenantId,
  parteId: string,
): void {
  const r = store.resolve(tenantId, parteId);
  if (!r.erased) {
    throw new Error(`Parte ${parteId} aún no está borrada`);
  }
  const p = r.personal;
  if (p.email || p.taxId || p.phone || p.address) {
    throw new Error("PII residual tras erase");
  }
  if (p.displayName !== "[borrado]") {
    throw new Error(`displayName inesperado: ${p.displayName}`);
  }
}
