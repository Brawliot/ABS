/**
 * Conmutación lógica: eventos confirmados en primario siguen legibles tras
 * “promote” (basculación de ruta a réplica/destino ya sincronizado).
 * Stack HA físico: infra/self-hosted-postgres/scripts/failover-test.sh
 */

import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { migrateUp } from "../db/migrate.js";
import { PostgresEventStore } from "../adapters/postgres-event-store.js";
import {
  CompanyDatabaseRegistry,
  exportCompany,
  importCompanyPackage,
  PoolRouter,
} from "../hosting/index.js";

const primaryUrl = process.env.ABS_POSTGRES_URL;
const standbyUrl =
  process.env.ABS_HA_STANDBY_URL ??
  process.env.ABS_POSTGRES_DEDICATED_URL ??
  process.env.ABS_POSTGRES_RESTORE_URL;

describe.runIf(Boolean(primaryUrl && standbyUrl))(
  "Hosting conmutación sin pérdida de confirmados",
  () => {
    it(
      "evento confirmado en primario visible tras bascular ruta al standby sincronizado",
      async () => {
        const companyId = `fail-${Date.now()}`;
        const registry = new CompanyDatabaseRegistry(":memory:");
        registry.upsert({
          companyId,
          mode: "shared",
          databaseUrl: primaryUrl!,
          readOnly: false,
        });

        const primary = new Pool({ connectionString: primaryUrl });
        const standby = new Pool({ connectionString: standbyUrl });
        await migrateUp(primary);
        await migrateUp(standby);

        const store = new PostgresEventStore({ pool: primary, companyId });
        await store.append({
          id: "pre-failover",
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
        await store.close();
        const pkg = await exportCompany(primary, companyId);
        await importCompanyPackage(standby, pkg);
        expect(pkg.manifest.eventCount).toBe(1);

        // “Promote”: bascular enrutado al standby (sin perder confirmados)
        registry.upsert({
          companyId,
          mode: "dedicated",
          databaseUrl: standbyUrl!,
          readOnly: false,
        });

        const router = new PoolRouter(registry);
        const after = router.eventStore(companyId);
        const all = await after.all();
        expect(all.map((e) => e.id)).toEqual(["pre-failover"]);

        await after.append({
          id: "post-failover",
          kind: "transicion",
          subjectId: "s",
          occurredAt: "2026-01-01T00:00:01.000Z",
          actorId: "a",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-01-01T00:00:01.000Z",
          },
          transitionId: "t",
          fromStateId: "a",
          toStateId: "b",
        });
        expect((await after.all()).map((e) => e.id)).toEqual([
          "pre-failover",
          "post-failover",
        ]);

        await router.end();
        await primary.end();
        await standby.end();
        registry.close();
      },
      120_000,
    );
  },
);
