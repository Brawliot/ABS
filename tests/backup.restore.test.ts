/**
 * Prueba de restauración: dump → base limpia → mismo número de eventos / replay.
 * Requiere ABS_POSTGRES_URL (origen) y ABS_POSTGRES_RESTORE_URL (destino limpio).
 */

import { describe, expect, it } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const src = process.env.ABS_POSTGRES_URL;
const dst = process.env.ABS_POSTGRES_RESTORE_URL;

describe.runIf(Boolean(src && dst))("Backup restore verificado", () => {
  it(
    "pg_dump → restore → mismo count",
    async () => {
      const { Pool } = await import("pg");
      const { migrateUp } = await import("../db/migrate.js");
      const { PostgresEventStore } = await import(
        "../adapters/postgres-event-store.js"
      );
      const poolSrc = new Pool({ connectionString: src });
      await migrateUp(poolSrc);
      const companyId = `bak-${Date.now()}`;
      const store = new PostgresEventStore({ pool: poolSrc, companyId });
      for (let i = 0; i < 20; i++) {
        await store.append({
          id: `be-${i}`,
          kind: "transicion",
          subjectId: "s1",
          occurredAt: "2026-01-01T00:00:00.000Z",
          actorId: "a",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
          transitionId: "t",
          fromStateId: "a",
          toStateId: "b",
        });
      }
      const before = (await store.all()).length;
      const dir = mkdtempSync(join(tmpdir(), "abs-dump-"));
      const dumpPath = join(dir, "dump.sql");
      execFileSync(
        "pg_dump",
        ["--no-owner", "--schema=abs_events", "--schema=abs_outbox", "--schema=abs_identity", "-f", dumpPath, src!],
        { stdio: "inherit" },
      );
      const poolDst = new Pool({ connectionString: dst });
      await poolDst.query(
        `DROP SCHEMA IF EXISTS abs_events CASCADE;
         DROP SCHEMA IF EXISTS abs_identity CASCADE;
         DROP SCHEMA IF EXISTS abs_outbox CASCADE;`,
      );
      await poolDst.end();
      execFileSync("psql", [dst!, "-v", "ON_ERROR_STOP=1", "-f", dumpPath], {
        stdio: "inherit",
      });
      const poolCheck = new Pool({ connectionString: dst });
      const { rows } = await poolCheck.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM abs_events.events WHERE company_id = $1`,
        [companyId],
      );
      expect(Number(rows[0]!.c)).toBe(before);
      await poolCheck.end();
      await poolSrc.end();
      writeFileSync(join(dir, "ok"), "1");
    },
    120_000,
  );
});
