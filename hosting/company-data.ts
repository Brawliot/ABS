/**
 * Export / hash / verificación de una empresa en PostgreSQL (estándar).
 */

import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { migrateUp, withCompanyContext } from "../db/migrate.js";
import { PostgresEventStore } from "../adapters/postgres-event-store.js";
import type {
  CompanyExportManifest,
  CompanyExportPackage,
  ExportedEventRow,
  ExportedIdentityRow,
  ExportedOutboxRow,
  MoveVerification,
} from "./types.js";

export async function exportCompany(
  pool: Pool,
  companyId: string,
): Promise<CompanyExportPackage> {
  await migrateUp(pool);
  const client = await pool.connect();
  try {
    return await withCompanyContext(client, companyId, async (c) => {
      const eventsRes = await c.query<{
        id: string;
        company_id: string;
        subject_id: string;
        stream_version: string;
        payload: string;
        seq: string;
        created_at: string;
      }>(
        `SELECT id, company_id, subject_id, stream_version::text, payload,
                seq::text, created_at::text
         FROM abs_events.events
         WHERE company_id = $1
         ORDER BY seq ASC`,
        [companyId],
      );
      const identityRes = await c.query<{
        company_id: string;
        parte_id: string;
        ciphertext: Buffer;
        nonce: Buffer;
        erased_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT company_id, parte_id, ciphertext, nonce, erased_at::text,
                created_at::text, updated_at::text
         FROM abs_identity.parte_identity
         WHERE company_id = $1
         ORDER BY parte_id ASC`,
        [companyId],
      );
      const outboxRes = await c.query<{
        id: string;
        company_id: string;
        kind: string;
        payload: unknown;
        created_at: string;
        published_at: string | null;
      }>(
        `SELECT id, company_id, kind, payload, created_at::text, published_at::text
         FROM abs_outbox.outbox
         WHERE company_id = $1
         ORDER BY created_at ASC, id ASC`,
        [companyId],
      );

      const events: ExportedEventRow[] = eventsRes.rows.map((r) => ({
        id: r.id,
        companyId: r.company_id,
        subjectId: r.subject_id,
        streamVersion: r.stream_version,
        payload: r.payload,
        seq: r.seq,
        createdAt: r.created_at,
      }));
      const identity: ExportedIdentityRow[] = identityRes.rows.map((r) => ({
        companyId: r.company_id,
        parteId: r.parte_id,
        ciphertextBase64: Buffer.from(r.ciphertext).toString("base64"),
        nonceBase64: Buffer.from(r.nonce).toString("base64"),
        erasedAt: r.erased_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      const outbox: ExportedOutboxRow[] = outboxRes.rows.map((r) => ({
        id: r.id,
        companyId: r.company_id,
        kind: r.kind,
        payloadJson: JSON.stringify(r.payload),
        createdAt: r.created_at,
        publishedAt: r.published_at,
      }));

      const eventStreamHash = hashEventStream(events);
      const identityHash = hashIdentity(identity);
      const manifest: CompanyExportManifest = {
        version: 1,
        companyId,
        exportedAt: new Date().toISOString(),
        eventCount: events.length,
        identityCount: identity.length,
        outboxCount: outbox.length,
        eventStreamHash,
        identityHash,
      };
      return { manifest, events, identity, outbox };
    });
  } finally {
    client.release();
  }
}

export function hashEventStream(events: readonly ExportedEventRow[]): string {
  const sorted = [...events].sort((a, b) => {
    const bySubject = a.subjectId.localeCompare(b.subjectId);
    if (bySubject !== 0) return bySubject;
    const byVer = Number(a.streamVersion) - Number(b.streamVersion);
    if (byVer !== 0) return byVer;
    return a.id.localeCompare(b.id);
  });
  const h = createHash("sha256");
  for (const e of sorted) {
    h.update(e.id);
    h.update("\0");
    h.update(e.subjectId);
    h.update("\0");
    h.update(e.streamVersion);
    h.update("\0");
    h.update(e.payload);
    h.update("\n");
  }
  return h.digest("hex");
}

export function hashIdentity(rows: readonly ExportedIdentityRow[]): string {
  const h = createHash("sha256");
  for (const r of rows) {
    h.update(r.parteId);
    h.update("\0");
    h.update(r.ciphertextBase64);
    h.update("\0");
    h.update(r.nonceBase64);
    h.update("\n");
  }
  return h.digest("hex");
}

export async function importCompanyPackage(
  pool: Pool,
  pkg: CompanyExportPackage,
): Promise<void> {
  await migrateUp(pool);
  const companyId = pkg.manifest.companyId;
  const client = await pool.connect();
  try {
    await withCompanyContext(client, companyId, async (c) => {
      await c.query("BEGIN");
      try {
        for (const e of pkg.events) {
          await c.query(
            `INSERT INTO abs_events.events
               (id, company_id, subject_id, stream_version, payload, created_at)
             VALUES ($1, $2, $3, $4::bigint, $5, $6::timestamptz)
             ON CONFLICT (company_id, id) DO NOTHING`,
            [
              e.id,
              e.companyId,
              e.subjectId,
              e.streamVersion,
              e.payload,
              e.createdAt,
            ],
          );
        }
        for (const row of pkg.identity) {
          await c.query(
            `INSERT INTO abs_identity.parte_identity
               (company_id, parte_id, ciphertext, nonce, erased_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::timestamptz)
             ON CONFLICT (company_id, parte_id) DO UPDATE SET
               ciphertext = EXCLUDED.ciphertext,
               nonce = EXCLUDED.nonce,
               erased_at = EXCLUDED.erased_at,
               updated_at = EXCLUDED.updated_at`,
            [
              row.companyId,
              row.parteId,
              Buffer.from(row.ciphertextBase64, "base64"),
              Buffer.from(row.nonceBase64, "base64"),
              row.erasedAt,
              row.createdAt,
              row.updatedAt,
            ],
          );
        }
        for (const o of pkg.outbox) {
          await c.query(
            `INSERT INTO abs_outbox.outbox
               (id, company_id, kind, payload, created_at, published_at)
             VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
             ON CONFLICT (company_id, id) DO NOTHING`,
            [
              o.id,
              o.companyId,
              o.kind,
              o.payloadJson,
              o.createdAt,
              o.publishedAt,
            ],
          );
        }
        await c.query("COMMIT");
      } catch (err) {
        await c.query("ROLLBACK");
        throw err;
      }
    });
  } finally {
    client.release();
  }
}

export async function deleteCompanyData(
  pool: Pool,
  companyId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await withCompanyContext(client, companyId, async (c) => {
      await c.query("BEGIN");
      try {
        // Bypass append-only: operaciones de administración usan rol con BYPASSRLS
        // o desactivan trigger temporalmente en la misma TX de borrado controlado.
        await c.query(`ALTER TABLE abs_events.events DISABLE TRIGGER trg_events_no_update`);
        await c.query(
          `DELETE FROM abs_outbox.outbox WHERE company_id = $1`,
          [companyId],
        );
        await c.query(
          `DELETE FROM abs_identity.parte_identity WHERE company_id = $1`,
          [companyId],
        );
        await c.query(
          `DELETE FROM abs_events.events WHERE company_id = $1`,
          [companyId],
        );
        await c.query(`ALTER TABLE abs_events.events ENABLE TRIGGER trg_events_no_update`);
        await c.query("COMMIT");
      } catch (err) {
        await c.query("ROLLBACK");
        try {
          await c.query(
            `ALTER TABLE abs_events.events ENABLE TRIGGER trg_events_no_update`,
          );
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } finally {
    client.release();
  }
}

export async function countCompanyEvents(
  pool: Pool,
  companyId: string,
): Promise<number> {
  const client = await pool.connect();
  try {
    return await withCompanyContext(client, companyId, async (c) => {
      const res = await c.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM abs_events.events WHERE company_id = $1`,
        [companyId],
      );
      return Number(res.rows[0]?.c ?? 0);
    });
  } finally {
    client.release();
  }
}

export async function verifyMove(
  sourcePool: Pool,
  destPool: Pool,
  companyId: string,
  expected: CompanyExportPackage,
  opts: { expectSourceCleared: boolean },
): Promise<MoveVerification> {
  const destPkg = await exportCompany(destPool, companyId);
  const store = new PostgresEventStore({ pool: destPool, companyId });
  const replay = await store.all();
  await store.close();

  const sourceCount = await countCompanyEvents(sourcePool, companyId);
  const eventCountMatch =
    destPkg.manifest.eventCount === expected.manifest.eventCount;
  const eventStreamHashMatch =
    destPkg.manifest.eventStreamHash === expected.manifest.eventStreamHash;
  const identityHashMatch =
    destPkg.manifest.identityHash === expected.manifest.identityHash;
  const replayLengthMatch = replay.length === expected.manifest.eventCount;
  const sourceCleared = opts.expectSourceCleared ? sourceCount === 0 : true;

  const ok =
    eventCountMatch &&
    eventStreamHashMatch &&
    identityHashMatch &&
    replayLengthMatch &&
    sourceCleared;

  return {
    eventCountMatch,
    eventStreamHashMatch,
    identityHashMatch,
    replayLengthMatch,
    sourceCleared,
    ok,
    details: {
      sourceEvents: sourceCount,
      destEvents: destPkg.manifest.eventCount,
      sourceHash: expected.manifest.eventStreamHash,
      destHash: destPkg.manifest.eventStreamHash,
      sourceIdentityHash: expected.manifest.identityHash,
      destIdentityHash: destPkg.manifest.identityHash,
      replayCount: replay.length,
    },
  };
}
