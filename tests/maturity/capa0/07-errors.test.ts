/**
 * Dimensión 10 — ERRORES.
 * Los errores deben ser instancias de clases tipadas (no Error genérico)
 * y contener mensajes explicativos en español (no codes opacos).
 */

import { describe, it, expect } from "vitest";
import { deriveState, DerivationError } from "../../../core/derivation.js";
import { validateLifecycle } from "../../../core/validator.js";
import { InMemoryEventStore, EventStoreError } from "../../../core/event-store.js";
import { MetaObjectRegistry, MetaObjectRegistryError } from "../../../core/metaobject.js";
import { ventaArchetype } from "../../../archetypes/venta.js";
import { minimalExampleLifecycle, minimalExampleSpec } from "../../../archetypes/minimal-example.js";
import { mkTransitionEvent, ventaAcceptEvent } from "./_helpers.js";

const life = ventaArchetype.lifecycle;
const tAccept = life.transitions.find((t) => t.id === "t_aceptar")!;

describe("Madurez Capa0 · ERRORES — tipado y mensajes", () => {
  describe("10.a DerivationError — siempre tipado, nunca genérico", () => {
    it("transición desconocida → DerivationError con mensaje explicativo", () => {
      const ev = mkTransitionEvent("e1", "s", "PHANTOM_ID", tAccept.from, tAccept.to);
      expect(() => deriveState(life, [ev])).toThrowError(DerivationError);
      try {
        deriveState(life, [ev]);
      } catch (e) {
        expect(e).toBeInstanceOf(DerivationError);
        expect((e as DerivationError).message.length).toBeGreaterThan(10);
        // No debe ser solo un código opaco
        expect((e as DerivationError).message).toMatch(/[a-záéíóúA-Z]/);
      }
    });

    it("evidencia incorrecta → DerivationError con el tipo exigido y el recibido", () => {
      const ev = mkTransitionEvent("e2", "s", tAccept.id, tAccept.from, tAccept.to, {
        evidence: { kind: "contrato" as never, reference: "r", recordedAt: "2026-01-01T00:00:00.000Z" },
      });
      try {
        deriveState(life, [ev]);
      } catch (e) {
        expect(e).toBeInstanceOf(DerivationError);
        const msg = (e as DerivationError).message;
        // Debe mencionar qué evidencia era exigida o cuál fue recibida
        expect(msg).toMatch(/[Ee]videncia/);
      }
    });

    it("reapertura de terminal → DerivationError con mención a 'terminal'", () => {
      const tAccept = life.transitions.find((t) => t.id === "t_aceptar")!;
      const tInitDeliver = life.transitions.find((t) => t.id === "t_iniciar_entrega")!;
      const tClose = life.transitions.find((t) => t.id === "t_cerrar")!;
      
      // Ruta hasta terminal: propuesta → aceptada → en_entrega → cerrada
      const e1 = mkTransitionEvent("ec1", "s-t", tAccept.id, tAccept.from, tAccept.to, {
        evidence: { kind: tAccept.requiredEvidence, reference: "r1", recordedAt: "2026-01-01T00:00:00.000Z" },
      });  // propuesta → aceptada
      
      const e2 = mkTransitionEvent("ec2", "s-t", tInitDeliver.id, tInitDeliver.from, tInitDeliver.to, {
        evidence: { kind: tInitDeliver.requiredEvidence, reference: "r2", recordedAt: "2026-01-01T00:00:00.000Z" },
      });  // aceptada → en_entrega
      
      const e3 = mkTransitionEvent("ec3", "s-t", tClose.id, tClose.from, tClose.to, {
        evidence: { kind: tClose.requiredEvidence, reference: "r3", recordedAt: "2026-01-01T00:00:00.000Z" },
      });  // en_entrega → cerrada (TERMINAL)
      
      const derived = deriveState(life, [e1, e2, e3]);
      expect(derived.currentStateId).toBe("cerrada");  // Confirmamos que es terminal
      
      // Ahora intenta aplicar cualquier evento más → debe lanzar
      const e4 = mkTransitionEvent("ec4", "s-t", tAccept.id, tAccept.from, tAccept.to, {
        evidence: { kind: tAccept.requiredEvidence, reference: "r4", recordedAt: "2026-01-01T00:00:00.000Z" },
      });
      
      try {
        deriveState(life, [e1, e2, e3, e4]);
        throw new Error("Debería haber lanzado DerivationError");
      } catch (e) {
        expect(e).toBeInstanceOf(DerivationError);
        expect((e as DerivationError).message.toLowerCase()).toMatch(/terminal|nunca|cerrada/);
      }
    });

    it("actor incorrecto → DerivationError con el actor exigido", () => {
      const ev = mkTransitionEvent("e3", "s", tAccept.id, tAccept.from, tAccept.to, {
        actorKind: "sistema" as never,
      });
      try {
        deriveState(life, [ev]);
      } catch (e) {
        expect(e).toBeInstanceOf(DerivationError);
        expect((e as DerivationError).message).toMatch(/[Aa]ctor/);
      }
    });
  });

  describe("10.b EventStoreError — tipado, nunca genérico", () => {
    it("append duplicado → EventStoreError con el id implicado", () => {
      const store = new InMemoryEventStore();
      const ev = ventaAcceptEvent("dup-err");
      store.append(ev);
      try {
        store.append(ev);
      } catch (e) {
        expect(e).toBeInstanceOf(EventStoreError);
        const msg = (e as EventStoreError).message;
        // El mensaje debe mencionar el id
        expect(msg).toContain("dup-err");
      }
    });

    it("replace → EventStoreError 'inmutable'", () => {
      const store = new InMemoryEventStore();
      store.append(ventaAcceptEvent("e-immut"));
      try {
        store.replace("e-immut", ventaAcceptEvent("e-immut"));
      } catch (e) {
        expect(e).toBeInstanceOf(EventStoreError);
        expect((e as EventStoreError).message.toLowerCase()).toMatch(/inmutat|inmutab|modif/);
      }
    });

    it("remove → EventStoreError 'inmutable'", () => {
      const store = new InMemoryEventStore();
      store.append(ventaAcceptEvent("e-remove"));
      try {
        store.remove("e-remove");
      } catch (e) {
        expect(e).toBeInstanceOf(EventStoreError);
        expect((e as EventStoreError).message.toLowerCase()).toMatch(/inmutat|inmutab|bor/);
      }
    });
  });

  describe("10.c MetaObjectRegistryError — tipado, nunca genérico", () => {
    it("registrar con lifecycle inválido → MetaObjectRegistryError", () => {
      const reg = new MetaObjectRegistry();
      const badLife = {
        ...minimalExampleLifecycle,
        states: [],
        transitions: [],
      };
      try {
        reg.register({ ...minimalExampleSpec, lifecycle: badLife }, { subtype: "x" });
      } catch (e) {
        expect(e).toBeInstanceOf(MetaObjectRegistryError);
        expect((e as MetaObjectRegistryError).message.length).toBeGreaterThan(5);
      }
    });

    it("buscar tipo no registrado → devuelve undefined (comportamiento documentado: get es opcional)", () => {
      const reg = new MetaObjectRegistry();
      const result = reg.get("tipo_fantasma");
      // get() devuelve undefined — no lanza, es el comportamiento correcto
      expect(result).toBeUndefined();
    });
  });

  describe("10.d validateLifecycle — resultado explícito con issues tipadas", () => {
    it("lifecycle sin estados terminales → issues con código descriptivo", () => {
      const bad = {
        ...minimalExampleLifecycle,
        states: minimalExampleLifecycle.states.filter(
          (s) => s.kind !== "terminal_exito" && s.kind !== "terminal_excepcion",
        ),
      };
      const r = validateLifecycle(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.issues.length).toBeGreaterThan(0);
        // Cada issue debe tener un code y un message
        for (const issue of r.issues) {
          expect(issue.code).toBeTruthy();
          expect(issue.message).toBeTruthy();
          expect(issue.message.length).toBeGreaterThan(5);
        }
      }
    });
  });
});
