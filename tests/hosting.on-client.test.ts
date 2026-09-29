/**
 * Export → bootstrap EN CLIENTE: login datos + replay correctos.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { migrateUp } from "../db/migrate.js";
import { PostgresEventStore } from "../adapters/postgres-event-store.js";
import { AccountStore } from "../accounts/store.js";
import {
  CompanyDatabaseRegistry,
  ACCOUNT_PLACEMENT,
  bootstrapOnClient,
  exportCompanyToFile,
  PoolRouter,
} from "../hosting/index.js";

const sharedUrl = process.env.ABS_POSTGRES_URL;
const onClientUrlEnv =
  process.env.ABS_POSTGRES_ON_CLIENT_URL ??
  process.env.ABS_POSTGRES_RESTORE_URL;

describe.runIf(Boolean(sharedUrl && onClientUrlEnv))(
  "Hosting EN CLIENTE desde exportación",
  () => {
    it(
      "export + bootstrap local: cuentas locales, replay e identidad",
      async () => {
        expect(ACCOUNT_PLACEMENT.on_client).toBe("local_install");
        expect(ACCOUNT_PLACEMENT.shared).toBe("control_plane");

        const companyId = `client-${Date.now()}`;
        const src = new Pool({ connectionString: sharedUrl });
        await migrateUp(src);
        const store = new PostgresEventStore({ pool: src, companyId });
        for (let i = 0; i < 8; i++) {
          await store.append({
            id: `c-${i}`,
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
        }
        await store.close();
        await src.end();

        const dir = mkdtempSync(join(tmpdir(), "abs-onclient-"));
        const pkgPath = join(dir, "export.json");
        const pkg = await exportCompanyToFile(sharedUrl!, companyId, pkgPath);
        expect(pkg.manifest.eventCount).toBe(8);

        // Instalación local: registro + cuentas sin nuestros servidores
        const registry = new CompanyDatabaseRegistry(join(dir, "registry.sqlite"));
        const accounts = new AccountStore({ dbPath: join(dir, "accounts.sqlite") });
        const account = accounts.createAccount({
          email: `owner-${companyId}@local.test`,
          displayName: "Dueño local",
          password: "LocalPassw0rd!",
        });
        accounts.addMembership({
          accountId: account.id,
          companyId,
          kind: "dueno",
          roleId: "gerente",
        });

        await bootstrapOnClient({
          registry,
          companyId,
          localDatabaseUrl: onClientUrlEnv!,
          packagePath: pkgPath,
          label: "on-client-lab",
        });

        expect(registry.require(companyId).mode).toBe("on_client");
        const memberships = accounts.listMemberships(account.id);
        expect(memberships.some((m) => m.companyId === companyId)).toBe(true);

        const router = new PoolRouter(registry);
        const localStore = router.eventStore(companyId);
        const all = await localStore.all();
        expect(all.length).toBe(8);
        expect(all.map((e) => e.id)).toEqual(
          Array.from({ length: 8 }, (_, i) => `c-${i}`),
        );

        // Solo lectura durante "migración" simulada
        registry.setReadOnly(companyId, true);
        const ro = router.eventStore(companyId);
        await expect(ro.append(all[0]!)).rejects.toThrow(/solo lectura/);

        registry.setReadOnly(companyId, false);
        writeFileSync(join(dir, "ok"), "1");
        await router.end();
        accounts.close();
        registry.close();
      },
      180_000,
    );
  },
);
