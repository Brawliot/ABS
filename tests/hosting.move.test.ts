/**
 * Mover empresa shared → dedicated → shared con verificación completa.
 */

import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { migrateUp } from "../db/migrate.js";
import { PostgresEventStore } from "../adapters/postgres-event-store.js";
import { PostgresParteIdentityStore } from "../adapters/postgres-identity-store.js";
import {
  CompanyDatabaseRegistry,
  exportCompany,
  moveCompany,
} from "../hosting/index.js";

const sharedUrl = process.env.ABS_POSTGRES_URL;

async function dedicatedUrl(shared: string): Promise<string> {
  if (process.env.ABS_POSTGRES_DEDICATED_URL) {
    return process.env.ABS_POSTGRES_DEDICATED_URL;
  }
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

describe.runIf(Boolean(sharedUrl))("Hosting move shared↔dedicated", () => {
  it(
    "mover ida y vuelta con hash/replay/identidad y origen vacío",
    async () => {
      const destUrl = await dedicatedUrl(sharedUrl!);
      const companyId = `move-${Date.now()}`;
      const registry = new CompanyDatabaseRegistry(":memory:");
      registry.upsert({
        companyId,
        mode: "shared",
        databaseUrl: sharedUrl!,
        readOnly: false,
      });

      const src = new Pool({ connectionString: sharedUrl });
      await migrateUp(src);
      const store = new PostgresEventStore({ pool: src, companyId });
      for (let i = 0; i < 15; i++) {
        await store.append({
          id: `m-${i}`,
          kind: "transicion",
          subjectId: "subj",
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
      const identity = new PostgresParteIdentityStore(src, companyId);
      await identity.put(
        "parte-1",
        { displayName: "Cliente Move", email: "m@ex.com" },
        "2026-01-01T00:00:00.000Z",
      );
      await store.close();
      const before = await exportCompany(src, companyId);
      expect(before.manifest.eventCount).toBe(15);
      await src.end();

      const toDedicated = await moveCompany({
        registry,
        companyId,
        targetMode: "dedicated",
        targetDatabaseUrl: destUrl,
      });
      expect(toDedicated.verification.ok).toBe(true);
      expect(toDedicated.verification.eventStreamHashMatch).toBe(true);
      expect(toDedicated.verification.identityHashMatch).toBe(true);
      expect(toDedicated.verification.sourceCleared).toBe(true);
      expect(registry.require(companyId).mode).toBe("dedicated");
      expect(registry.require(companyId).databaseUrl).toBe(destUrl);

      const back = await moveCompany({
        registry,
        companyId,
        targetMode: "shared",
        targetDatabaseUrl: sharedUrl!,
      });
      expect(back.verification.ok).toBe(true);
      expect(back.verification.details.destHash).toBe(
        before.manifest.eventStreamHash,
      );
      expect(registry.require(companyId).mode).toBe("shared");

      registry.close();
    },
    180_000,
  );
});
