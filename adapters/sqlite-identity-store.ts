/**
 * ParteIdentityStore respaldado por SQLite (persistente entre reinicios).
 * PII cifrada con AES-256-GCM; subtipo y fechas en claro (no son PII).
 * Fuera del EventStore: los eventos solo referencian `parteId`.
 */

import Database from "better-sqlite3";
import { ParteSubtypes, type ParteSubtype } from "../elements/subtypes.js";
import {
  ParteIdentityError,
  ParteIdentityStore,
  type ParteIdentityRecord,
  type PartePersonalData,
} from "../policies/identity.js";
import type { TenantId } from "../tenancy/index.js";
import { openPersonal, sealPersonal } from "./identity-crypto.js";

interface Row {
  readonly tenant_id: string;
  readonly parte_id: string;
  readonly subtype: string | null;
  readonly ciphertext: Buffer | null;
  readonly nonce: Buffer | null;
  readonly erased_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

function toSubtype(raw: string | null): ParteSubtype | undefined {
  return raw && (ParteSubtypes as readonly string[]).includes(raw)
    ? (raw as ParteSubtype)
    : undefined;
}

function toRecord(row: Row): ParteIdentityRecord {
  const subtype = toSubtype(row.subtype);
  return {
    parteId: row.parte_id,
    tenantId: row.tenant_id,
    ...(subtype ? { subtype } : {}),
    personal:
      row.erased_at || !row.ciphertext || !row.nonce
        ? null
        : openPersonal(row.ciphertext, row.nonce),
    erasedAt: row.erased_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteParteIdentityStore extends ParteIdentityStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    super();
    this.db = new Database(path);
    if (path !== ":memory:") {
      this.db.pragma("journal_mode = WAL");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS parte_identity (
        tenant_id TEXT NOT NULL,
        parte_id TEXT NOT NULL,
        subtype TEXT,
        ciphertext BLOB,
        nonce BLOB,
        erased_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, parte_id)
      );
    `);
  }

  override put(
    tenantId: TenantId,
    parteId: string,
    personal: PartePersonalData,
    at: string,
    subtype?: ParteSubtype,
  ): ParteIdentityRecord {
    const prev = this.get(tenantId, parteId);
    const effectiveSubtype = subtype ?? prev?.subtype ?? null;
    const { ciphertext, nonce } = sealPersonal(personal);
    this.db
      .prepare(
        `INSERT INTO parte_identity
           (tenant_id, parte_id, subtype, ciphertext, nonce, erased_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
         ON CONFLICT (tenant_id, parte_id) DO UPDATE SET
           subtype = excluded.subtype,
           ciphertext = excluded.ciphertext,
           nonce = excluded.nonce,
           erased_at = NULL,
           updated_at = excluded.updated_at`,
      )
      .run(tenantId, parteId, effectiveSubtype, ciphertext, nonce, at, at);
    return this.get(tenantId, parteId)!;
  }

  override erase(
    tenantId: TenantId,
    parteId: string,
    at: string,
  ): ParteIdentityRecord {
    const res = this.db
      .prepare(
        `UPDATE parte_identity
         SET ciphertext = NULL, nonce = NULL, erased_at = ?, updated_at = ?
         WHERE tenant_id = ? AND parte_id = ?`,
      )
      .run(at, at, tenantId, parteId);
    if (res.changes === 0) {
      throw new ParteIdentityError(
        `Parte ${parteId} no existe en el almacén de identidad del tenant ${tenantId}`,
      );
    }
    return this.get(tenantId, parteId)!;
  }

  override get(
    tenantId: TenantId,
    parteId: string,
  ): ParteIdentityRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM parte_identity WHERE tenant_id = ? AND parte_id = ?`,
      )
      .get(tenantId, parteId) as Row | undefined;
    return row ? toRecord(row) : undefined;
  }

  override list(tenantId: TenantId): readonly ParteIdentityRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM parte_identity WHERE tenant_id = ?
         ORDER BY created_at ASC, parte_id ASC`,
      )
      .all(tenantId) as Row[];
    return rows.map(toRecord);
  }

  close(): void {
    this.db.close();
  }
}
