/**
 * Dimensión 1 — CORRECCIÓN: regla de especificación ↔ cumple / incumple.
 * Fuentes: PRINCIPLES.md P5–P8, validator, GRANULARITY.md, VERSIONING.md.
 */

import { describe, expect, it } from "vitest";
import { validateLifecycle } from "../../../core/validator.js";
import { deriveState, DerivationError } from "../../../core/derivation.js";
import {
  MetaObjectRegistry,
  MetaObjectRegistryError,
} from "../../../core/metaobject.js";
import { InMemoryEventStore, EventStoreError } from "../../../core/event-store.js";
import { validateComposition } from "../../../archetypes/composition.js";
import { ventaArchetype } from "../../../archetypes/venta.js";
import { minimalExampleLifecycle, minimalExampleSpec } from "../../../archetypes/minimal-example.js";
import { assertTransactionClosure } from "../../../elements/closure.js";
import {
  corruptLifecycle,
  mkTransitionEvent,
  ventaAcceptEvent,
} from "./_helpers.js";

describe("Madurez Capa0 · CORRECCIÓN", () => {
  describe("3. Validador de ciclos de vida", () => {
    it("CUMPLE: máquina mínima válida es aceptada", () => {
      expect(validateLifecycle(minimalExampleLifecycle)).toEqual({ ok: true });
    });

    it("RECHAZA: sin estado inicial (regla de validez)", () => {
      const bad = corruptLifecycle(minimalExampleLifecycle, 0);
      const r = validateLifecycle(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.issues.some((i) => i.code === "EXACTLY_ONE_INITIAL")).toBe(
          true,
        );
      }
    });

    it("RECHAZA: terminal con salida", () => {
      const bad = corruptLifecycle(minimalExampleLifecycle, 3);
      const r = validateLifecycle(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.issues.some((i) => i.code === "TERMINAL_WITH_EXIT")).toBe(
          true,
        );
      }
    });
  });

  describe("4. Registro de metaobjetos", () => {
    it("CUMPLE: registra máquina válida", () => {
      const reg = new MetaObjectRegistry();
      expect(() =>
        reg.register(minimalExampleSpec, { codigo: "ejemplo" }),
      ).not.toThrow();
    });

    it("RECHAZA: no registra máquina inválida (P — ninguna inválida)", () => {
      const reg = new MetaObjectRegistry();
      const badLife = corruptLifecycle(minimalExampleLifecycle, 1);
      expect(() =>
        reg.register(
          { ...minimalExampleSpec, lifecycle: badLife },
          { subtype: "x" },
        ),
      ).toThrow(MetaObjectRegistryError);
    });
  });

  describe("5–6. Derivación y replay (P5)", () => {
    it("CUMPLE: avance con evidencia exigida", () => {
      const ev = ventaAcceptEvent("e1");
      const d = deriveState(ventaArchetype.lifecycle, [ev]);
      expect(d.currentStateId).toBe("aceptada");
      expect(d.eventCount).toBe(1);
    });

    it("RECHAZA: avance sin evidencia válida", () => {
      const life = ventaArchetype.lifecycle;
      const t = life.transitions.find((x) => x.id === "t_aceptar")!;
      const bad = mkTransitionEvent("e-bad", "s", t.id, t.from, t.to, {
        evidence: {
          kind: "sistema",
          reference: "",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      });
      expect(() => deriveState(life, [bad])).toThrow(DerivationError);
    });

    it("CUMPLE: replay idéntico (misma secuencia → mismo estado)", () => {
      const ev = ventaAcceptEvent("e1");
      const a = deriveState(ventaArchetype.lifecycle, [ev]);
      const b = deriveState(ventaArchetype.lifecycle, [ev]);
      expect(a).toEqual(b);
    });
  });

  describe("7. EventStore append-only (P5)", () => {
    it("CUMPLE: append y lectura", () => {
      const s = new InMemoryEventStore();
      s.append(ventaAcceptEvent("e1"));
      expect(s.getById("e1")?.id).toBe("e1");
    });

    it("RECHAZA: replace y remove", () => {
      const s = new InMemoryEventStore();
      s.append(ventaAcceptEvent("e1"));
      expect(() => s.replace("e1", ventaAcceptEvent("e2"))).toThrow(
        EventStoreError,
      );
      expect(() => s.remove("e1")).toThrow(EventStoreError);
    });
  });

  describe("12. Composición sin ciclos", () => {
    it("CUMPLE: concesionaria sin ciclo", () => {
      const r = validateComposition({
        dominant: "venta",
        secondaries: [
          {
            secondaryArchetypeId: "financiera",
            bornInDominantState: "aceptada",
            bloquea: "en_entrega",
          },
        ],
      });
      expect(r.ok).toBe(true);
    });

    it("RECHAZA: bloqueo circular A↔B", () => {
      const r = validateComposition({
        dominant: "venta",
        secondaries: [
          {
            secondaryArchetypeId: "financiera",
            bornInDominantState: "aceptada",
            bloquea: "en_entrega",
          },
          {
            secondaryArchetypeId: "servicio_proyecto",
            bornInDominantState: "en_entrega",
            bloquea: "aceptada",
          },
        ],
      });
      // Puede o no detectar según grafo bornIn/bloquea; si ok=true es fallo de madurez
      // La spec exige sin ciclos. Composición A bloquea estado X y B bloquea de forma circular.
      expect(r.ok).toBe(false);
    });
  });

  describe("14. Terminal no se reabre (P7)", () => {
    it("RECHAZA: transición desde terminal", () => {
      const life = minimalExampleLifecycle;
      const accept = mkTransitionEvent(
        "e1",
        "s",
        "t_aceptar",
        "borrador",
        "activo",
      );
      const close = mkTransitionEvent("e2", "s", "t_cerrar", "activo", "cerrado", {
        evidence: {
          kind: "sistema",
          reference: "sys",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      });
      // Ajustar evidencias según máquina mínima
      const tAccept = life.transitions.find((t) => t.id === "t_aceptar")!;
      const tClose = life.transitions.find((t) => t.id === "t_cerrar")!;
      const e1 = mkTransitionEvent(
        "e1",
        "s",
        tAccept.id,
        tAccept.from,
        tAccept.to,
        {
          evidence: {
            kind: tAccept.requiredEvidence,
            reference: "r1",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      );
      const e2 = mkTransitionEvent("e2", "s", tClose.id, tClose.from, tClose.to, {
        evidence: {
          kind: tClose.requiredEvidence,
          reference: "r2",
          recordedAt: "2026-01-01T00:00:01.000Z",
        },
      });
      const closed = deriveState(life, [e1, e2]);
      expect(closed.currentStateId).toBe("cerrado");
      const reopen = mkTransitionEvent(
        "e3",
        "s",
        tAccept.id,
        "cerrado",
        "activo",
        {
          evidence: {
            kind: tAccept.requiredEvidence,
            reference: "r3",
            recordedAt: "2026-01-01T00:00:02.000Z",
          },
        },
      );
      expect(() => deriveState(life, [e1, e2, reopen])).toThrow(DerivationError);
    });
  });

  describe("15. Invariantes de cierre", () => {
    it("CUMPLE: contexto válido pasa", () => {
      expect(() =>
        assertTransactionClosure({
          currentStateId: "cerrada",
          fulfilledCommitmentIds: new Set(["a"]),
          pendingCommitmentIds: new Set(),
          fieldValues: {},
          balance: 0,
          resourcesSettled: true,
          evidenceComplete: true,
        }),
      ).not.toThrow();
    });

    it("RECHAZA: saldo ≠ 0", () => {
      expect(() =>
        assertTransactionClosure({
          currentStateId: "cerrada",
          fulfilledCommitmentIds: new Set(["a"]),
          pendingCommitmentIds: new Set(),
          fieldValues: {},
          balance: 10,
          resourcesSettled: true,
          evidenceComplete: true,
        }),
      ).toThrow();
    });
  });

  describe("16. Granularidad (spec/GRANULARITY.md)", () => {
    it("RECHAZA: composición que fusiona unidades no independientes debe emitir GRANULARIDAD_VIOLATION", () => {
      const r = validateComposition({
        dominant: "venta",
        secondaries: [
          { secondaryArchetypeId: "financiera", bornInDominantState: "aceptada", bloquea: "entregada" },
          { secondaryArchetypeId: "servicio_proyecto", bornInDominantState: "aceptada", bloquea: "entregada" },
        ],
      });
      const codes =
        r.ok === false
          ? r.issues.map((i) => i.code)
          : ([] as string[]);
      expect(codes.includes("GRANULARITY_VIOLATION")).toBe(true);
    });
  });
})