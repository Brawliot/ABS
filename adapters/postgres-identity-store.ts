/**
 * ParteIdentityStore respaldado por PostgreSQL con cifrado de campos sensibles.
 * Clave: ABS_IDENTITY_KEY (32 bytes hex o base64).
 */

import type { Pool } from "pg";
import type { TenantId } from "../tenancy/index.js";
import {
  ERASED_PARTE_STUB,
  ParteIdentityError,
  type ParteIdentityRecord,
  type PartePersonalData,
} from "../policies/identity.js";
import { withCompanyContext } from "../db/migrate.js";
import {
  openPersonal as open,
  sealPersonal as seal,
} from "./identity-crypto.js";

export class PostgresParteIdentityStore {
  constructor(
    private readonly pool: Pool,
    private readonly companyId: TenantId,
  ) {}

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
