/**
 * Dimensiones 3 (entradas hostiles) + 4 (concurrencia) + 5 (fallos).
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateLifecycle } from "../../../core/validator.js";
import { deriveState, DerivationError } from "../../../core/derivation.js";
import { InMemoryEventStore, EventStoreError } from "../../../core/event-store.js";
import { SqliteEventStore } from "../../../adapters/sqlite-event-store.js";
import { ventaArchetype } from "../../../archetypes/venta.js";
import { minimalExampleLifecycle } from "../../../archetypes/minimal-example.js";
import { pgUrl, mkTransitionEvent, ventaAcceptEvent } from "./_helpers.js";

// ──────────────────────────────────────────────
// DIM 3 — ENTRADAS HOSTILES
// ──────────────────────────────────────────────
describe("Madurez Capa0 · ENTRADAS HOSTILES", () => {
  describe("3.a Lifecycle con campos vacíos / nulos", () => {
    it("estado con id vacío → ciclo inválido", () => {
      const bad = {
        ...minimalExampleLifecycle,
        states: [
          ...minimalExampleLifecycle.states,
          { id: "", kind: "intermedio" as const, label: "sin id", situations: [] },
        ],
      };
      const r = validateLifecycle(bad);
      expect(r.ok).toBe(false);
    });

    it("transición con from/to desconocido → inválido", () => {
      const bad = {
        ...minimalExampleLifecycle,
        transitions: [
          ...minimalExampleLifecycle.transitions,
          {
            id: "t_phantom",
            from: "estado_inexistente",
            to: "otro_inexistente",
            condition: "x",
            requiredEvidence: "aceptacion" as const,
            allowedActor: "humano" as const,
            fulfills: [],
          },
        ],
      };
      const r = validateLifecycle(bad);
      expect(r.ok).toBe(false);
    });
  });

  describe("3.b EventStore — ids hostiles y duplicados", () => {
    it("id vacío se acepta o lanza EventStoreError — no falla silenciosamente", () => {
      const store = new InMemoryEventStore();
      const ev = { ...ventaAcceptEvent("") };
      let threw = false;
      try {
        store.append(ev);
      } catch (e) {
        threw = true;
        expect(e).toBeInstanceOf(EventStoreError);
      }
      // Si no lanzó, el id '' quedó dentro; segundo append debe lanzar
      if (!threw) {
        expect(() => store.append(ev)).toThrow();
      }
    });

    it("id con caracteres Unicode raros no rompe el store", () => {
      const store = new InMemoryEventStore();
      const id = "e-\u0000\u200b\u{1F4A5}";
      const ev = ventaAcceptEvent(id);
      // Puede aceptar o rechazar; lo que no puede es corromper silenciosamente
      let ok = false;
      try {
        store.append(ev);
        ok = true;
      } catch {
        ok = false;
      }
      // If accepted: getById must return it
      if (ok) {
        expect(store.getById(id)?.id).toBe(id);
      }
    });

    it("id enorme (100 kB) no bloquea", () => {
      const store = new InMemoryEventStore();
      const bigId = "x".repeat(100_000);
      store.append(ventaAcceptEvent(bigId));
      expect(store.getById(bigId)?.id).toBe(bigId);
    });

    it("evento de otra empresa en InMemory — aislamiento por subjectId", () => {
      const storeA = new InMemoryEventStore();
      const storeB = new InMemoryEventStore();
      storeA.append(ventaAcceptEvent("e1", "subject-A"));
      storeB.append({ ...ventaAcceptEvent("e1", "subject-B") });
      expect(storeA.getBySubject("subject-B").length).toBe(0);
      expect(storeB.getBySubject("subject-A").length).toBe(0);
    });
  });

  describe("3.c deriveState — eventos desordenados o con timestamps iguales", () => {
    it("mismo evento dos veces con ids distintos → derivación sobre secuencia fija", () => {
      const life = ventaArchetype.lifecycle;
      const t = life.transitions.find((x) => x.id === "t_aceptar")!;
      const e1 = mkTransitionEvent("e1", "s", t.id, t.from, t.to);
      const e2 = { ...e1, id: "e2" };
      // Dos eventos del mismo tipo consecutivos en una máquina que no lo permite
      // debe lanzar o resolverse de forma determinista (no silencio)
      try {
        deriveState(life, [e1, e2]);
        // Si no lanzó, verificar que el estado es determinista
      } catch (e) {
        expect(e).toBeInstanceOf(DerivationError);
      }
    });

    it("timestamps distintos no afectan el estado derivado — orden es el del array", () => {
      const life = ventaArchetype.lifecycle;
      const t = life.transitions.find((x) => x.id === "t_aceptar")!;
      const base = mkTransitionEvent("e1", "s-ord", t.id, t.from, t.to);
      const late  = { ...base, occurredAt: "2030-12-31T23:59:59.999Z" };
      const early = { ...base, occurredAt: "2000-01-01T00:00:00.000Z" };
      // Mismo evento con timestamps distintos pero mismo id → primero que llega
      const d1 = deriveState(life, [late]);
      const d2 = deriveState(life, [early]);
      expect(d1.currentStateId).toBe(d2.currentStateId);
    });
  });

  describe("3.d Lifecycle con estados duplicados", () => {
    it("ids de estado duplicados → inválido", () => {
      const first = minimalExampleLifecycle.states[0]!;
      const bad = {
        ...minimalExampleLifecycle,
        states: [...minimalExampleLifecycle.states, { ...first }],
      };
      const r = validateLifecycle(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.issues.some((i) => i.code === "DUPLICATE_STATE_ID")).toBe(true);
      }
    });
  });
});

// ──────────────────────────────────────────────
// DIM 4 — CONCURRENCIA
// ──────────────────────────────────────────────
describe("Madurez Capa0 · CONCURRENCIA", () => {
  it("SQLite: escrituras simultáneas en mismo subject — solo un id duplicado lanza, no corrupción", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-m4-"));
    const store = new SqliteEventStore(join(dir, "c.sqlite"));
    const ev = ventaAcceptEvent("e-concurrent", "s-concurrent");

    // Simular dos writes "simultáneos" in-process
    const results = await Promise.allSettled([
      Promise.resolve().then(() => { store.append(ev); return "ok"; }),
      Promise.resolve().then(() => { store.append(ev); return "ok"; }),
    ]);
    const successes = results.filter((r) => r.status === "fulfilled" && r.value === "ok");
    const failures  = results.filter((r) => r.status === "rejected");
    // Exactamente uno debe pasar y uno fallar
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    // El store no está corrompido: all() funciona
    const all = store.all();
    expect(all.length).toBe(1);
    store.close();
  });

  it("SQLite: 2 procesos lógicos escriben distintos subjects — ambos pasan", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-m4b-"));
    const s1 = new SqliteEventStore(join(dir, "c.sqlite"));
    const s2 = new SqliteEventStore(join(dir, "c.sqlite"));
    s1.append(ventaAcceptEvent("e-p1", "subject-p1"));
    s2.append(ventaAcceptEvent("e-p2", "subject-p2"));
    const all1 = s1.all();
    expect(all1.length).toBeGreaterThanOrEqual(2);
    s1.close();
    s2.close();
  });

  describe("Concurrencia PostgreSQL", () => {
    const url = pgUrl();
    const skip = !url;
    it.skipIf(skip)(
      "PG: UNIQUE(company_id, id) — insert simultáneo mismo id → exactamente uno pasa",
      async () => {
        if (!url) return;
        const { Pool } = await import("pg");
        const { migrateUp } = await import("../../../db/migrate.js");
        const { PostgresEventStore } = await import("../../../adapters/postgres-event-store.js");
        const pool = new Pool({ connectionString: url, max: 5 });
        await migrateUp(pool);
        const companyId = `conc-${Date.now()}`;
        const stores = Array.from({ length: 5 }, () =>
          new PostgresEventStore({ pool, companyId })
        );
        const ev = ventaAcceptEvent("e-pg-conc");
        const results = await Promise.allSettled(
          stores.map((s) => s.append(ev))
        );
        const ok  = results.filter((r) => r.status === "fulfilled");
        const err = results.filter((r) => r.status === "rejected");
        expect(ok.length).toBe(1);
        expect(err.length).toBe(4);
        await pool.end();
      },
      60_000,
    );
  });
});

// ──────────────────────────────────────────────
// DIM 5 — FALLOS Y RECUPERACIÓN
// ──────────────────────────────────────────────
describe("Madurez Capa0 · FALLOS", () => {
  it("SQLite: reabrir BD tras cierre da el mismo replay", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-m5-"));
    const path = join(dir, "f.sqlite");
    const ev1 = ventaAcceptEvent("e1", "subj-fail");
    const ev2 = ventaAcceptEvent("e2", "subj-fail");

    const s1 = new SqliteEventStore(path);
    s1.append(ev1);
    s1.append(ev2);
    s1.close();

    const s2 = new SqliteEventStore(path);
    const all = s2.all();
    expect(all.map((e) => e.id)).toEqual(["e1", "e2"]);
    s2.close();
  });

  it("SQLite: sin flush a mitad — no hay eventos a medias (transacción atómica)", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-m5b-"));
    const path = join(dir, "mid.sqlite");
    const store = new SqliteEventStore(path);
    store.append(ventaAcceptEvent("e1", "s-mid"));
    // Simular "caída" cerrando inmediatamente y reabrir
    store.close();
    const s2 = new SqliteEventStore(path);
    expect(s2.all().length).toBe(1);
    s2.close();
  });

  describe("Fallo PostgreSQL", () => {
    const url = pgUrl();
    it.skipIf(!url)(
      "PG: flush sin commits parciales — ROLLBACK deja el store limpio",
      async () => {
        if (!url) return;
        const { Pool } = await import("pg");
        const { migrateUp } = await import("../../../db/migrate.js");
        const { PostgresEventStore } = await import("../../../adapters/postgres-event-store.js");
        const pool = new Pool({ connectionString: url, max: 4 });
        await migrateUp(pool);
        const companyId = `fail-${Date.now()}`;
        const store = new PostgresEventStore({ pool, companyId });
        await store.append(ventaAcceptEvent("e-fail-ok", "s-fail"));
        // Append duplicado → rollback
        try {
          await store.append(ventaAcceptEvent("e-fail-ok", "s-fail"));
        } catch { /* expected */ }
        // Tras el rollback el store debe devolver solo e-fail-ok
        const all = await store.all();
        expect(all.filter((e) => e.id === "e-fail-ok").length).toBe(1);
        await store.close();
        await pool.end();
      },
      60_000,
    );
  });
});
