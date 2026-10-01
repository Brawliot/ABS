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

export interface DrainOutboxOptions {
  readonly maxRetries?: number;
  readonly onError?: (row: OutboxRow, error: Error) => Promise<void>;
}

export interface DrainOutboxResult {
  readonly succeeded: number;
  readonly failed: number;
  readonly failedRows?: readonly OutboxRow[] | undefined;
}

/**
 * Publicador con retry y observabilidad.
 * Si handler falla, reintenta con exponential backoff.
 * Si maxRetries agotados: callback onError (para logging/alerting).
 */
export async function drainOutbox(
  pool: Pool,
  companyId: string,
  handler: (row: OutboxRow) => Promise<void>,
  options?: DrainOutboxOptions,
): Promise<DrainOutboxResult> {
  const maxRetries = options?.maxRetries ?? 3;
  const onError = options?.onError;
  const rows = await claimUnpublished(pool, companyId);

  let succeeded = 0;
  let failed = 0;
  const failedRows: OutboxRow[] = [];

  for (const row of rows) {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await handler(row);
        await markPublished(pool, companyId, row.id);
        succeeded += 1;
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, 8s
          const delayMs = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    if (lastError !== null) {
      failed += 1;
      failedRows.push(row);
      if (onError) {
        try {
          await onError(row, lastError);
        } catch (logErr) {
          // Logging failed, don't throw
          console.error(`Error calling onError callback for outbox ${row.id}:`, logErr);
        }
      }
    }
  }

  return { succeeded, failed, failedRows: failedRows.length > 0 ? failedRows : undefined };
}
