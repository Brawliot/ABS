/**
 * Identidad de Parte fuera del EventStore.
 *
 * Los eventos solo guardan `parteId` opaco. Los atributos personales viven aquí
 * para poder borrarlos sin mutar el historial inmutable (P5 vs conservación).
 */

import type { TenantId } from "../tenancy/index.js";
import type { ParteSubtype } from "../elements/subtypes.js";

/** Atributos personales (PII) — NUNCA van en DomainEvent. */
export interface PartePersonalData {
  readonly displayName: string;
  readonly email?: string;
  readonly taxId?: string;
  readonly address?: string;
  readonly phone?: string;
  readonly extra?: Readonly<Record<string, string>>;
}

export interface ParteIdentityRecord {
  readonly parteId: string;
  readonly tenantId: TenantId;
  /** Subtipo cerrado (cliente, proveedor…). No es PII. */
  readonly subtype?: ParteSubtype;
  readonly personal: PartePersonalData | null;
  readonly erasedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Vista segura tras borrado (reproducible, sin identificación). */
export const ERASED_PARTE_STUB: PartePersonalData = {
  displayName: "[borrado]",
};

export class ParteIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParteIdentityError";
  }
}

/**
 * Almacén de identidad por tenant. Independiente del EventStore.
 */
export class ParteIdentityStore {
  private readonly byTenant = new Map<
    TenantId,
    Map<string, ParteIdentityRecord>
  >();

  put(
    tenantId: TenantId,
    parteId: string,
    personal: PartePersonalData,
    at: string,
    subtype?: ParteSubtype,
  ): ParteIdentityRecord {
    const map = this.mapFor(tenantId);
    const prev = map.get(parteId);
    const effectiveSubtype = subtype ?? prev?.subtype;
    const rec: ParteIdentityRecord = {
      parteId,
      tenantId,
      ...(effectiveSubtype ? { subtype: effectiveSubtype } : {}),
      personal: { ...personal },
      erasedAt: null,
      createdAt: prev?.createdAt ?? at,
      updatedAt: at,
    };
    map.set(parteId, rec);
    return rec;
  }

  /**
   * Borra datos personales. El `parteId` permanece para que los eventos
   * sigan siendo reproducibles; resolve() devuelve stub.
   */
  erase(tenantId: TenantId, parteId: string, at: string): ParteIdentityRecord {
    const map = this.mapFor(tenantId);
    const prev = map.get(parteId);
    if (!prev) {
      throw new ParteIdentityError(
        `Parte ${parteId} no existe en el almacén de identidad del tenant ${tenantId}`,
      );
    }
    const rec: ParteIdentityRecord = {
      ...prev,
      personal: null,
      erasedAt: at,
      updatedAt: at,
    };
    map.set(parteId, rec);
    return rec;
  }

  get(tenantId: TenantId, parteId: string): ParteIdentityRecord | undefined {
    return this.byTenant.get(tenantId)?.get(parteId);
  }

  /** Todas las Partes del tenant (incluidas las borradas), por fecha de alta. */
  list(tenantId: TenantId): readonly ParteIdentityRecord[] {
    return [...(this.byTenant.get(tenantId)?.values() ?? [])].sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.parteId.localeCompare(b.parteId)
        : a.createdAt.localeCompare(b.createdAt),
    );
  }

  /**
   * Resuelve PII para UI/comunicación. Tras erase → stub sin datos identificables.
   */
  resolve(
    tenantId: TenantId,
    parteId: string,
  ): {
    readonly parteId: string;
    readonly personal: PartePersonalData;
    readonly erased: boolean;
  } {
    const rec = this.get(tenantId, parteId);
    if (!rec) {
      return {
        parteId,
        personal: { displayName: `[desconocido:${parteId}]` },
        erased: false,
      };
    }
    if (rec.personal === null || rec.erasedAt) {
      return { parteId, personal: ERASED_PARTE_STUB, erased: true };
    }
    return { parteId, personal: rec.personal, erased: false };
  }

  /** ¿El evento (que solo tiene parteId) sigue siendo reproducible? Siempre sí. */
  eventsRemainIntact(): true {
    return true;
  }

  private mapFor(tenantId: TenantId): Map<string, ParteIdentityRecord> {
    let m = this.byTenant.get(tenantId);
    if (!m) {
      m = new Map();
      this.byTenant.set(tenantId, m);
    }
    return m;
  }
}

/**
 * Valida que un payload de evento no arrastra PII prohibida.
 * Los eventos solo deben referenciar `parteId` / refs opacas.
 */
export const FORBIDDEN_EVENT_PII_KEYS = [
  "displayName",
  "email",
  "taxId",
  "address",
  "phone",
  "nombre",
  "nif",
  "dni",
  "direccion",
  "correo",
  "telefono",
] as const;

export function assertNoPiiInEventData(
  data: Readonly<Record<string, unknown>> | undefined,
): void {
  if (!data) return;
  scan(data, "");
}

function scan(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => scan(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    if (
      FORBIDDEN_EVENT_PII_KEYS.some(
        (f) => lower === f.toLowerCase() || lower.includes(f.toLowerCase()),
      )
    ) {
      throw new ParteIdentityError(
        `Evento rechazado: clave PII "${k}" en ${path || "/"}. ` +
          `Guarde datos personales en ParteIdentityStore y referencie solo parteId.`,
      );
    }
    scan(v, path ? `${path}.${k}` : k);
  }
}
