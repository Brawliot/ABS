/**
 * Modos de alojamiento multiempresa — sin dependencia de proveedor gestionado.
 * PostgreSQL estándar en los tres modos; misma semántica de núcleo.
 */

export type HostingMode = "shared" | "dedicated" | "on_client";

/** Dónde viven cuentas + membresías según el modo. */
export type AccountPlacement = "control_plane" | "local_install";

/**
 * Decisión (ver informe):
 * - shared / dedicated (nosotros alojamos): cuentas en plano de control central
 *   porque un usuario puede pertenecer a varias empresas en bases distintas.
 * - on_client: cuentas en la instalación del cliente (sin nuestros servidores).
 */
export const ACCOUNT_PLACEMENT: Record<HostingMode, AccountPlacement> = {
  shared: "control_plane",
  dedicated: "control_plane",
  on_client: "local_install",
};

export interface CompanyRoute {
  readonly companyId: string;
  readonly mode: HostingMode;
  /** URL PostgreSQL estándar (postgres://…). Nunca se cruzan consultas entre URLs. */
  readonly databaseUrl: string;
  /** Solo lectura durante migración / export. */
  readonly readOnly: boolean;
  readonly updatedAt: string;
  readonly label?: string;
}

export interface CompanyExportManifest {
  readonly version: 1;
  readonly companyId: string;
  readonly exportedAt: string;
  readonly eventCount: number;
  readonly identityCount: number;
  readonly outboxCount: number;
  /** SHA-256 hex del flujo de eventos (payloads ordenados por seq). */
  readonly eventStreamHash: string;
  /** SHA-256 hex de filas identidad (parte_id|ciphertext|nonce) ordenadas. */
  readonly identityHash: string;
}

export interface CompanyExportPackage {
  readonly manifest: CompanyExportManifest;
  readonly events: readonly ExportedEventRow[];
  readonly identity: readonly ExportedIdentityRow[];
  readonly outbox: readonly ExportedOutboxRow[];
}

export interface ExportedEventRow {
  readonly id: string;
  readonly companyId: string;
  readonly subjectId: string;
  readonly streamVersion: string;
  readonly payload: string;
  readonly seq: string;
  readonly createdAt: string;
}

export interface ExportedIdentityRow {
  readonly companyId: string;
  readonly parteId: string;
  readonly ciphertextBase64: string;
  readonly nonceBase64: string;
  readonly erasedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ExportedOutboxRow {
  readonly id: string;
  readonly companyId: string;
  readonly kind: string;
  readonly payloadJson: string;
  readonly createdAt: string;
  readonly publishedAt: string | null;
}

export interface MoveVerification {
  readonly eventCountMatch: boolean;
  readonly eventStreamHashMatch: boolean;
  readonly identityHashMatch: boolean;
  readonly replayLengthMatch: boolean;
  readonly sourceCleared: boolean;
  readonly ok: boolean;
  readonly details: {
    readonly sourceEvents: number;
    readonly destEvents: number;
    readonly sourceHash: string;
    readonly destHash: string;
    readonly sourceIdentityHash: string;
    readonly destIdentityHash: string;
    readonly replayCount: number;
  };
}

export class HostingError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unknown_company"
      | "read_only"
      | "cross_database"
      | "verify_failed"
      | "move_failed"
      | "import_failed",
  ) {
    super(message);
    this.name = "HostingError";
  }
}
