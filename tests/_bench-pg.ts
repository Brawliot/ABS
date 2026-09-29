import { Pool } from "pg";
import { migrateUp } from "../db/migrate.js";
import { PostgresEventStore } from "../adapters/postgres-event-store.js";

const pool = new Pool({
  connectionString: process.env.ABS_POSTGRES_URL,
  max: 4,
});
await migrateUp(pool);
const store = new PostgresEventStore({
  pool,
  companyId: `bench-micro-${Date.now()}`,
});
const N = 2000;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  await store.append({
    id: `e-${i}`,
    kind: "transicion",
    subjectId: `s${i % 10}`,
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
const appendMs = Date.now() - t0;
const t1 = Date.now();
const all = await store.all();
const replayMs = Date.now() - t1;
console.log(
  JSON.stringify({
    N,
    appendMs,
    perAppend: appendMs / N,
    replayMs,
    count: all.length,
    extrapolate100kAppendSec: ((appendMs / N) * 100_000) / 1000,
    extrapolate100kReplayMs: (replayMs / N) * 100_000,
  }),
);
await store.close();
await pool.end();
