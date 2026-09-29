/**
 * Outbox: efectos externos (correo, avisos, LLM) atómicos con el evento.
 */

import type { Pool } from "pg";
import { withCompanyContext } from "../db/migrate.js";

export interface OutboxRow {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly createdAt: string;
}

export async function claimUnpublished(
  pool: Pool,
  companyId: string,
  limit = 50,
): Promise<readonly OutboxRow[]> {
  const client = await pool.connect();
  try {
    return await withCompanyContext(client, companyId, async (c) => {
      const res = await c.query<{
        id: string;
        kind: string;
        payload: unknown;
        created_at: string;
      }>(
        `SELECT id, kind, payload, created_at::text
         FROM abs_outbox.outbox
         WHERE company_id = $1 AND published_at IS NULL
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED`,
        [companyId, limit],
      );
      return res.rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        payload: r.payload,
        createdAt: r.created_at,
      }));
    });
  } finally {
    client.release();
  }
}

export async function markPublished(
  pool: Pool,
  companyId: string,
  id: string,
  at = new Date().toISOString(),
): Promise<void> {
  const client = await pool.connect();
  try {
    await withCompanyContext(client, companyId, async (c) => {
      await c.query(
        `UPDATE abs_outbox.outbox
         SET published_at = $3::timestamptz
         WHERE company_id = $1 AND id = $2`,
        [companyId, id, at],
      );
    });
  } finally {
    client.release();
  }
}

/**
 * Publicador: si el handler falla, no marca published → reintento al reiniciar.
 */
export async function drainOutbox(
  pool: Pool,
  companyId: string,
  handler: (row: OutboxRow) => Promise<void>,
): Promise<number> {
  const rows = await claimUnpublished(pool, companyId);
  let n = 0;
  for (const row of rows) {
    await handler(row);
    await markPublished(pool, companyId, row.id);
    n += 1;
  }
  return n;
}
