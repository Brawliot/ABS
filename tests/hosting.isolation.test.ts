/**
 * Hosting: 2 empresas shared + 1 dedicated a la vez; aislamiento total.
 * Requiere ABS_POSTGRES_URL; la dedicada usa ABS_POSTGRES_DEDICATED_URL o
 * crea la BD abs_dedicated en el mismo servidor.
 */

import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { migrateUp } from "../db/migrate.js";
import {
  CompanyDatabaseRegistry,
  PoolRouter,
} from "../hosting/index.js";
import { PostgresEventStore } from "../adapters/postgres-event-store.js";

const sharedUrl = process.env.ABS_POSTGRES_URL;
const dedicatedUrlEnv = process.env.ABS_POSTGRES_DEDICATED_URL;

async function ensureDedicatedUrl(shared: string): Promise<string> {
  if (dedicatedUrlEnv) return dedicatedUrlEnv;
  const admin = new Pool({ connectionString: shared });
  try {
    const exists = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = 'abs_dedicated'`,
    );
    if ((exists.rowCount ?? 0) === 0) {
      await admin.query(`CREATE DATABASE abs_dedicated OWNER CURRENT_USER`);
    }
  } finally {
    await admin.end();
  }
  return shared.replace(/\/[^/?]+(\?|$)/, "/abs_dedicated$1");
}

function sample(id: string, subject = "s1") {
  return {
    id,
    kind: "transicion" as const,
    subjectId: subject,
    occurredAt: "2026-01-01T00:00:00.000Z",
    actorId: "a",
    actorKind: "humano" as const,
    evidence: {
      kind: "aceptacion" as const,
      reference: "r",
      recordedAt: "2026-01-01T00:00:00.000Z",
    },
    transitionId: "t",
    fromStateId: "a",
    toStateId: "b",
  };
}

describe.runIf(Boolean(sharedUrl))("Hosting aislamiento shared+dedicated", () => {
  it(
    "dos shared y una dedicated: sin cruce de datos",
    async () => {
      const dedicatedUrl = await ensureDedicatedUrl(sharedUrl!);
      const sharedPool = new Pool({ connectionString: sharedUrl });
      const dedicatedPool = new Pool({ connectionString: dedicatedUrl });
      await migrateUp(sharedPool);
      await migrateUp(dedicatedPool);

      const registry = new CompanyDatabaseRegistry(":memory:");
      const coA = `host-a-${Date.now()}`;
      const coB = `host-b-${Date.now()}`;
      const coC = `host-c-${Date.now()}`;
      registry.upsert({
        companyId: coA,
        mode: "shared",
        databaseUrl: sharedUrl!,
        readOnly: false,
      });
      registry.upsert({
        companyId: coB,
        mode: "shared",
        databaseUrl: sharedUrl!,
        readOnly: false,
      });
      registry.upsert({
        companyId: coC,
        mode: "dedicated",
        databaseUrl: dedicatedUrl,
        readOnly: false,
      });

      const router = new PoolRouter(registry);
      const storeA = router.eventStore(coA);
      const storeB = router.eventStore(coB);
      const storeC = router.eventStore(coC);

      await storeA.append(sample("e-a"));
      await storeB.append(sample("e-b"));
      await storeC.append(sample("e-c"));

      expect((await storeA.all()).map((e) => e.id)).toEqual(["e-a"]);
      expect((await storeB.all()).map((e) => e.id)).toEqual(["e-b"]);
      expect((await storeC.all()).map((e) => e.id)).toEqual(["e-c"]);

      // Misma URL shared: RLS sigue aislando A vs B
      expect(await storeA.getById("e-b")).toBeUndefined();
      expect(await storeB.getById("e-a")).toBeUndefined();

      // Dedicated: pool distinto — C no ve A aunque se consulte su pool con companyId A
      const leak = new PostgresEventStore({
        pool: dedicatedPool,
        companyId: coA,
      });
      expect((await leak.all()).length).toBe(0);

      // Router: URL de C ≠ URL de A
      expect(router.resolveUrl(coC)).toBe(dedicatedUrl);
      expect(router.resolveUrl(coA)).toBe(sharedUrl);

      await router.end();
      await sharedPool.end();
      await dedicatedPool.end();
      registry.close();
    },
    120_000,
  );
});
