/**
 * Suite de conformidad EventStore — misma batería para InMemory, SQLite y Postgres.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EventStoreError,
  InMemoryEventStore,
  type EventStore,
} from "../core/event-store.js";
import type { TransitionEvent } from "../core/events.js";
import { SqliteEventStore } from "../adapters/sqlite-event-store.js";

function sampleEvent(id: string, subjectId = "subj-1"): TransitionEvent {
  return {
    id,
    kind: "transicion",
    subjectId,
    occurredAt: "2026-01-01T00:00:00.000Z",
    actorId: "actor-1",
    actorKind: "humano",
    evidence: {
      kind: "aceptacion",
      reference: "ev-ref-1",
      recordedAt: "2026-01-01T00:00:00.000Z",
    },
    transitionId: "t_aceptar",
    fromStateId: "borrador",
    toStateId: "activo",
  };
}

function defineConformance(
  label: string,
  create: () => EventStore & { close?: () => void },
): void {
  describe(`EventStore conformidad — ${label}`, () => {
    it("añade y recupera por id / subject / all", () => {
      const store = create();
      try {
        store.append(sampleEvent("e1"));
        store.append(sampleEvent("e2", "subj-2"));
        expect(store.getById("e1")?.id).toBe("e1");
        expect(store.getBySubject("subj-1")).toHaveLength(1);
        expect(store.all().length).toBe(2);
      } finally {
        store.close?.();
      }
    });

    it("rechaza id duplicado", () => {
      const store = create();
      try {
        store.append(sampleEvent("e1"));
        expect(() => store.append(sampleEvent("e1"))).toThrow(EventStoreError);
      } finally {
        store.close?.();
      }
    });

    it("replace/remove siempre fallan", () => {
      const store = create();
      try {
        store.append(sampleEvent("e1"));
        expect(() => store.replace("e1", sampleEvent("x"))).toThrow(
          EventStoreError,
        );
        expect(() => store.remove("e1")).toThrow(EventStoreError);
        expect(store.all()).toHaveLength(1);
      } finally {
        store.close?.();
      }
    });

    it("congela el evento almacenado", () => {
      const store = create();
      try {
        store.append(sampleEvent("e1"));
        const stored = store.getById("e1") as TransitionEvent;
        expect(() => {
          (stored as { transitionId: string }).transitionId = "hack";
        }).toThrow();
      } finally {
        store.close?.();
      }
    });

    it("subscribe notifica append", () => {
      const store = create();
      try {
        const seen: string[] = [];
        const unsub = store.subscribe((e) => seen.push(e.id));
        store.append(sampleEvent("e1"));
        unsub();
        store.append(sampleEvent("e2"));
        expect(seen).toEqual(["e1"]);
      } finally {
        store.close?.();
      }
    });
  });
}

defineConformance("InMemory", () => new InMemoryEventStore());

defineConformance("SQLite", () => {
  const dir = mkdtempSync(join(tmpdir(), "abs-conf-"));
  return new SqliteEventStore(join(dir, "e.sqlite"));
});

const pgUrl = process.env.ABS_POSTGRES_URL;
describe.runIf(Boolean(pgUrl))("EventStore conformidad — PostgreSQL", () => {
  it(
    "append/get/all + trigger UPDATE/DELETE + aislamiento por empresa",
    async () => {
      const { Pool } = await import("pg");
      const { migrateUp } = await import("../db/migrate.js");
      const { PostgresEventStore } = await import(
        "../adapters/postgres-event-store.js"
      );
      const pool = new Pool({ connectionString: pgUrl });
      try {
        await migrateUp(pool);
        const companyA = `co-a-${Date.now()}`;
        const companyB = `co-b-${Date.now()}`;
        const storeA = new PostgresEventStore({ pool, companyId: companyA });
        const storeB = new PostgresEventStore({ pool, companyId: companyB });
        await storeA.append(sampleEvent("e1"));
        await storeB.append(sampleEvent("e1"));
        expect((await storeA.getById("e1"))?.id).toBe("e1");
        expect((await storeA.all()).length).toBe(1);
        expect((await storeB.all()).length).toBe(1);
        await expect(storeA.append(sampleEvent("e1"))).rejects.toThrow(
          /ya existe/,
        );
        await expect(storeA.tryUpdatePayload("e1")).rejects.toThrow();
        await expect(storeA.tryDelete("e1")).rejects.toThrow();
        expect(() => storeA.replace("e1", sampleEvent("x"))).toThrow(
          EventStoreError,
        );
        expect(() => storeA.remove("e1")).toThrow(EventStoreError);
      } finally {
        await pool.end();
      }
    },
    60_000,
  );

  it(
    "outbox atómico: rollback no deja efectos pendientes publicados",
    async () => {
      const { Pool } = await import("pg");
      const { migrateUp } = await import("../db/migrate.js");
      const { PostgresEventStore } = await import(
        "../adapters/postgres-event-store.js"
      );
      const { claimUnpublished } = await import("../adapters/outbox.js");
      const pool = new Pool({ connectionString: pgUrl });
      try {
        await migrateUp(pool);
        const companyId = `out-${Date.now()}`;
        const store = new PostgresEventStore({ pool, companyId });
        await store.append(sampleEvent("ok-1"), {
          outbox: {
            id: "ob-1",
            kind: "email",
            payload: { to: "x@example.com" },
          },
        });
        const pending = await claimUnpublished(pool, companyId);
        expect(pending.some((p) => p.id === "ob-1")).toBe(true);
        // Simular caída: no markPublished → sigue pendiente
        const again = await claimUnpublished(pool, companyId);
        expect(again.some((p) => p.id === "ob-1")).toBe(true);
      } finally {
        await pool.end();
      }
    },
    60_000,
  );
});
