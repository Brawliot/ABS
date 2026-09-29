/**
 * Dimensión 6 — CONFORMIDAD ENTRE ADAPTADORES.
 * Misma batería semántica sobre InMemory, SQLite, PostgreSQL.
 * Si ABS_POSTGRES_URL no está: NO VERIFICABLE (nunca skip silencioso).
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryEventStore } from "../../../core/event-store.js";
import { SqliteEventStore } from "../../../adapters/sqlite-event-store.js";
import { pgUrl, ventaAcceptEvent, hashEvents } from "./_helpers.js";

type AnyStore = {
  append: (e: ReturnType<typeof ventaAcceptEvent>) => void | Promise<void>;
  all: () => unknown;
  close?: () => void | Promise<void>;
};

async function allAsync(store: AnyStore): Promise<ReturnType<typeof ventaAcceptEvent>[]> {
  const result = store.all();
  const arr = result instanceof Promise ? await result : result;
  return arr as ReturnType<typeof ventaAcceptEvent>[];
}

function makeEvents(n: number, subj: string) {
  return Array.from({ length: n }, (_, i) => ventaAcceptEvent(`ev-conf-${i}`, subj));
}

describe("Madurez Capa0 · CONFORMIDAD ENTRE ADAPTADORES", () => {
  const events20 = makeEvents(20, "subj-conform");

  it("C1: InMemory y SQLite — append+all da el mismo orden y hash", async () => {
    const mem = new InMemoryEventStore();
    const dir = mkdtempSync(join(tmpdir(), "abs-m6-"));
    const sq = new SqliteEventStore(join(dir, "c.sqlite"));

    for (const e of events20) {
      mem.append(e);
      sq.append(e);
    }

    const memAll = await allAsync(mem as AnyStore);
    const sqAll  = await allAsync(sq as AnyStore);
    expect(memAll.map((e) => e.id)).toEqual(sqAll.map((e) => e.id));
    expect(hashEvents(memAll)).toBe(hashEvents(sqAll));
    sq.close();
  });

  it("C2: InMemory y SQLite — append duplicado: mismo tipo de error", () => {
    const mem = new InMemoryEventStore();
    const dir = mkdtempSync(join(tmpdir(), "abs-m6b-"));
    const sq = new SqliteEventStore(join(dir, "c2.sqlite"));
    const ev = ventaAcceptEvent("dup", "subj-dup");
    mem.append(ev);
    sq.append(ev);

    let memErr: unknown;
    let sqErr: unknown;
    try { mem.append(ev); } catch (e) { memErr = e; }
    try { sq.append(ev); } catch (e) { sqErr = e; }
    // Both must throw
    expect(memErr).toBeDefined();
    expect(sqErr).toBeDefined();
    sq.close();
  });

  describe("Conformidad con PostgreSQL", () => {
    const url = pgUrl();

    it.skipIf(!url)(
      "C3: InMemory, SQLite y PG — mismo hash de eventos",
      async () => {
        expect(url, "NO_VERIFICABLE: ABS_POSTGRES_URL requerido").toBeTruthy();
        const { Pool } = await import("pg");
        const { migrateUp } = await import("../../../db/migrate.js");
        const { PostgresEventStore } = await import("../../../adapters/postgres-event-store.js");
        const pool = new Pool({ connectionString: url!, max: 4 });
        await migrateUp(pool);
        const companyId = `conform-${Date.now()}`;
        const pgStore = new PostgresEventStore({ pool, companyId });

        const dir = mkdtempSync(join(tmpdir(), "abs-m6c-"));
        const mem = new InMemoryEventStore();
        const sq  = new SqliteEventStore(join(dir, "c3.sqlite"));
        const events = makeEvents(30, `subj-pg-${companyId}`);

        for (const e of events) {
          mem.append(e);
          sq.append(e);
          await pgStore.append(e);
        }

        const memAll = mem.all();
        const sqAll  = sq.all();
        const pgAll  = await pgStore.all();

        const memHash = hashEvents(memAll);
        const sqHash  = hashEvents(sqAll);
        const pgHash  = hashEvents(pgAll);

        expect(memHash, "InMemory vs SQLite hash mismatch").toBe(sqHash);
        expect(memHash, "InMemory vs PG hash mismatch").toBe(pgHash);

        sq.close();
        await pgStore.close();
        await pool.end();
      },
      120_000,
    );
  });
});
