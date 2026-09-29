import { Pool } from "pg";
import { migrateUp } from "../db/migrate.js";
import { PostgresEventStore } from "../adapters/postgres-event-store.js";

const pool = new Pool({ connectionString: process.env.ABS_POSTGRES_URL });
await migrateUp(pool);
const store = new PostgresEventStore({ pool, companyId: "dbg-trig" });
await store.append({
  id: "e1",
  kind: "transicion",
  subjectId: "s",
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
console.log("got", (await store.getById("e1"))?.id);
try {
  await store.tryUpdatePayload("e1");
  console.log("UPDATE resolved");
} catch (e) {
  console.log("UPDATE threw", e instanceof Error ? e.message.slice(0, 160) : e);
}
try {
  await store.tryDelete("e1");
  console.log("DEL resolved");
} catch (e) {
  console.log("DEL threw", e instanceof Error ? e.message.slice(0, 160) : e);
}
await pool.end();
