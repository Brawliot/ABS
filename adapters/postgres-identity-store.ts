/**
 * ParteIdentityStore respaldado por PostgreSQL con cifrado de campos sensibles.
 * Clave: ABS_IDENTITY_KEY (32 bytes hex o base64).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { TenantId } from "../tenancy/index.js";
import {
  ERASED_PARTE_STUB,
  ParteIdentityError,
  type ParteIdentityRecord,
  type PartePersonalData,
} from "../policies/identity.js";
import { withCompanyContext } from "../db/migrate.js";
import { validateCompanyId } from "../core/validation.js";

function loadKey(): Buffer {
  const raw = process.env.ABS_IDENTITY_KEY;
  if (!raw || raw.length < 32) {
    if (process.env.ABS_ENV === "production" || process.env.NODE_ENV === "production") {
      throw new Error("ABS_IDENTITY_KEY (≥32 chars) obligatorio en producción");
    }
    return Buffer.from("dev-only-identity-key-32bytes!!");
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return Buffer.from(raw.slice(0, 32), "utf8");
}

function seal(plain: PartePersonalData): { ciphertext: Buffer; nonce: Buffer } {
  const key = loadKey();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([
    cipher.update(JSON.stringify(plain), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]), nonce };
}

function open(ciphertext: Buffer, nonce: Buffer): PartePersonalData {
  const key = loadKey();
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
  return JSON.parse(plain) as PartePersonalData;
}

export class PostgresParteIdentityStore {
  constructor(
    private readonly pool: Pool,
    private readonly companyId: TenantId,
  ) {
    validateCompanyId(companyId);
  }

  async put(
    parteId: string,
    personal: PartePersonalData,
    at: string,
  ): Promise<ParteIdentityRecord> {
    const { ciphertext, nonce } = seal(personal);
    const client = await this.pool.connect();
    try {
      return await withCompanyContext(client, this.companyId, async (c) => {
        await c.query(
          `INSERT INTO abs_identity.parte_identity
             (company_id, parte_id, ciphertext, nonce, erased_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NULL, $5::timestamptz, $5::timestamptz)
           ON CONFLICT (company_id, parte_id) DO UPDATE SET
             ciphertext = EXCLUDED.ciphertext,
             nonce = EXCLUDED.nonce,
             erased_at = NULL,
             updated_at = EXCLUDED.updated_at`,
          [this.companyId, parteId, ciphertext, nonce, at],
        );
        return {
          parteId,
          tenantId: this.companyId,
          personal: { ...personal },
          erasedAt: null,
          createdAt: at,
          updatedAt: at,
        };
      });
    } finally {
      client.release();
    }
  }

  async erase(parteId: string, at: string): Promise<ParteIdentityRecord> {
    const client = await this.pool.connect();
    try {
      return await withCompanyContext(client, this.companyId, async (c) => {
        const prev = await c.query(
          `SELECT 1 FROM abs_identity.parte_identity
           WHERE company_id = $1 AND parte_id = $2`,
          [this.companyId, parteId],
        );
        if ((prev.rowCount ?? 0) === 0) {
          throw new ParteIdentityError(
            `Parte ${parteId} no existe en identidad ${this.companyId}`,
          );
        }
        const empty = seal(ERASED_PARTE_STUB);
        await c.query(
          `UPDATE abs_identity.parte_identity
           SET ciphertext = $3, nonce = $4, erased_at = $5::timestamptz, updated_at = $5::timestamptz
           WHERE company_id = $1 AND parte_id = $2`,
          [this.companyId, parteId, empty.ciphertext, empty.nonce, at],
        );
        return {
          parteId,
          tenantId: this.companyId,
          personal: null,
          erasedAt: at,
          createdAt: at,
          updatedAt: at,
        };
      });
    } finally {
      client.release();
    }
  }

  async resolve(
    parteId: string,
  ): Promise<{
    parteId: string;
    personal: PartePersonalData;
    erased: boolean;
  }> {
    const client = await this.pool.connect();
    try {
      return await withCompanyContext(client, this.companyId, async (c) => {
        const res = await c.query<{
          ciphertext: Buffer;
          nonce: Buffer;
          erased_at: string | null;
        }>(
          `SELECT ciphertext, nonce, erased_at FROM abs_identity.parte_identity
           WHERE company_id = $1 AND parte_id = $2`,
          [this.companyId, parteId],
        );
        const row = res.rows[0];
        if (!row) {
          throw new ParteIdentityError(`Parte ${parteId} desconocida`);
        }
        if (row.erased_at) {
          return {
            parteId,
            personal: ERASED_PARTE_STUB,
            erased: true,
          };
        }
        return {
          parteId,
          personal: open(row.ciphertext, row.nonce),
          erased: false,
        };
      });
    } finally {
      client.release();
    }
  }
}
