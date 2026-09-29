/**
 * Benchmark replay 100k eventos + p95 transición (PostgreSQL si hay URL; si no SQLite).
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteEventStore } from "../adapters/sqlite-event-store.js";
import type { TransitionEvent } from "../core/events.js";
import { PERF_THRESHOLDS } from "../quality/config.js";

function mkEvent(i: number): TransitionEvent {
  return {
    id: `e-${i}`,
    kind: "transicion",
    subjectId: `subj-${i % 100}`,
    occurredAt: "2026-01-01T00:00:00.000Z",
    actorId: "a",
    actorKind: "humano",
    evidence: {
      kind: "aceptacion",
      reference: "r",
      recordedAt: "2026-01-01T00:00:00.000Z",
    },
    transitionId: "t_aceptar",
    fromStateId: "a",
    toStateId: "b",
  };
}

describe("Rendimiento EventStore", () => {
  it(
    "replay N eventos bajo umbral (SQLite; ABS_PERF_EVENTS=100000 para oficial)",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-bench-"));
      const store = new SqliteEventStore(join(dir, "b.sqlite"));
      // Suite rápida por defecto. Oficial: ABS_PERF_FULL=1 (100k / umbral 10s).
      const N =
        process.env.ABS_PERF_FULL === "1"
          ? 100_000
          : Number(process.env.ABS_PERF_EVENTS ?? "5000");
      for (let i = 0; i < N; i++) store.append(mkEvent(i));
      const t0 = Date.now();
      const all = store.all();
      const elapsed = Date.now() - t0;
      expect(all.length).toBe(N);
      const budget = (PERF_THRESHOLDS.replay100kMs * N) / 100_000;
      expect(elapsed).toBeLessThanOrEqual(Math.max(budget, 50));
      store.close();
    },
    300_000,
  );

  it(
    "p95 append bajo umbral de transición (SQLite)",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-p95-"));
      const store = new SqliteEventStore(join(dir, "p.sqlite"));
      const samples: number[] = [];
      for (let i = 0; i < 200; i++) {
        const t0 = Date.now();
        store.append(mkEvent(i));
        samples.push(Date.now() - t0);
      }
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.floor(0.95 * samples.length)]!;
      expect(p95).toBeLessThanOrEqual(PERF_THRESHOLDS.transitionP95MsWithRealDb);
      store.close();
    },
    60_000,
  );
});

const pgUrl = process.env.ABS_POSTGRES_URL;
describe.runIf(Boolean(pgUrl))("Rendimiento PostgreSQL", () => {
  it(
    "replay 100k bajo umbral",
    async () => {
      const { Pool } = await import("pg");
      const { migrateUp } = await import("../db/migrate.js");
      const { PostgresEventStore } = await import(
        "../adapters/postgres-event-store.js"
      );
      const pool = new Pool({ connectionString: pgUrl, max: 10 });
      await migrateUp(pool);
      const store = new PostgresEventStore({
        pool,
        companyId: `bench-${Date.now()}`,
      });
      const N = 100_000;
      for (let i = 0; i < N; i++) {
        await store.append(mkEvent(i));
      }
      const t0 = Date.now();
      const all = await store.all();
      const elapsed = Date.now() - t0;
      expect(all.length).toBe(N);
      expect(elapsed).toBeLessThanOrEqual(PERF_THRESHOLDS.replay100kMs);
      await pool.end();
    },
    600_000,
  );
});
