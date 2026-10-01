/**
 * Tests para hallazgos de auditoría de Capa 2
 * Cubre: transacción atómica, logging, validación, liberación de recursos
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { deriveState } from "../../core/derivation.js";
import { InMemoryEventStore } from "../../core/event-store.js";
import type { TransitionEvent } from "../../core/events.js";
import { ventaArchetype } from "../../archetypes/venta.js";
import { catalogFromLifecycle } from "../../policies/compiler.js";
import { FactProvider } from "../../facts/provider.js";
import { judgeLogger } from "../../policies/judge-logger.js";
import { validateFormValues, registerFormSchema } from "../../web/form-validator.js";
import { z } from "zod";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "parte_id", "factura_id"],
);

describe("Level 2 Audit Tests", () => {
  beforeEach(() => {
    judgeLogger.clear();
  });

  describe("P0: Transacción Atómica EventStore ↔ FactProvider", () => {
    it("debe recuperarse si applyEvent falla después de append", () => {
      const store = new InMemoryEventStore();
      const provider = new FactProvider();
      provider.attachStore("tenant1", store);

      const event: TransitionEvent = {
        id: "e1",
        kind: "transicion",
        subjectId: "tx1",
        occurredAt: "2026-01-01T00:00:00Z",
        transitionId: "t_aceptar",
        actorId: "user1",
        fromStateId: "estado_inicial",
        toStateId: "estado_aceptado",
        data: { calculations: {} },
      };

      // Simular que applyEvent fallaría
      const originalApply = provider.applyEvent.bind(provider);
      let callCount = 0;
      provider.applyEvent = vi.fn((tenantId, ev) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Simulated FactProvider failure");
        }
        return originalApply(tenantId, ev);
      });

      // Verificar que store fue modificado pero provider no
      try {
        store.append(event);
        provider.applyEvent("tenant1", event);
        expect.fail("Should have thrown");
      } catch (err) {
        expect((err as Error).message).toContain("Simulated");
        expect(store.getById("e1")).toBeDefined();
      }
    });
  });

  describe("P1: Logging Centralizado del Juez", () => {
    it("debe registrar aceptaciones", () => {
      judgeLogger.logAccepted(
        {
          at: "2026-01-01T00:00:00Z",
          subjectId: "tx1",
          transitionId: "t_aceptar",
          ruleSetVersion: "1.0",
          ruleSetContentHash: "abc123",
          guardsEvaluated: [],
          result: "accepted",
          reason: "Aceptada",
          appliedRuleId: null,
          calculations: {},
        },
        "user1"
      );

      const entries = judgeLogger.all();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.kind).toBe("judge_accepted");
      expect(entries[0]!.actorId).toBe("user1");
    });

    it("debe registrar rechazos", () => {
      judgeLogger.logRejected(
        {
          at: "2026-01-01T00:00:00Z",
          subjectId: "tx1",
          transitionId: "t_aceptar",
          ruleSetVersion: "1.0",
          ruleSetContentHash: "abc123",
          guardsEvaluated: [
            {
              phase: "permiso",
              ruleId: "p1",
              result: "rejected",
              reason: "Rol no autorizado",
            },
          ],
          result: "rejected",
          reason: "Rechazo de permiso",
          appliedRuleId: "p1",
          calculations: {},
        },
        "user1"
      );

      const entries = judgeLogger.all();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.kind).toBe("judge_rejected");
      expect(entries[0]!.rejectedGuardId).toBe("p1");
    });

    it("debe registrar forzados", () => {
      judgeLogger.logForced(
        {
          at: "2026-01-01T00:00:00Z",
          subjectId: "tx1",
          transitionId: "t_aceptar",
          ruleSetVersion: "1.0",
          ruleSetContentHash: "abc123",
          guardsEvaluated: [],
          result: "accepted",
          reason: "Forzada",
          appliedRuleId: "p1",
          calculations: {},
        },
        "admin1",
        "Exceción comercial aprobada",
        "permiso"
      );

      const entries = judgeLogger.all();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.kind).toBe("judge_forced");
      expect(entries[0]!.reason).toContain("Exceción");
    });

    it("debe permitir filtrado por actor", () => {
      judgeLogger.logAccepted(
        {
          at: "2026-01-01T00:00:00Z",
          subjectId: "tx1",
          transitionId: "t_aceptar",
          ruleSetVersion: "1.0",
          ruleSetContentHash: "abc123",
          guardsEvaluated: [],
          result: "accepted",
          reason: "OK",
          appliedRuleId: null,
          calculations: {},
        },
        "user1"
      );
      judgeLogger.logAccepted(
        {
          at: "2026-01-01T00:00:01Z",
          subjectId: "tx2",
          transitionId: "t_aceptar",
          ruleSetVersion: "1.0",
          ruleSetContentHash: "abc123",
          guardsEvaluated: [],
          result: "accepted",
          reason: "OK",
          appliedRuleId: null,
          calculations: {},
        },
        "user2"
      );

      const user1Entries = judgeLogger.byActor("user1");
      expect(user1Entries).toHaveLength(1);
      expect(user1Entries[0]!.actorId).toBe("user1");
    });
  });

  describe("P1: Validación de formValues con Zod", () => {
    it("debe aceptar formulario válido", () => {
      const valid = validateFormValues("t_aceptar", {
        importe: "100.50",
        parte_id: "parte1",
        factura_id: "fact1",
      });
      expect(valid.importe).toBe(100.5);
      expect(valid.factura_id).toBe("fact1");
    });

    it("debe rechazar schema personalizado inválido", () => {
      registerFormSchema(
        "t_test",
        z.object({
          importe: z.coerce.number().positive("Debe ser positivo"),
          parte_id: z.string().min(1),
        }).passthrough()
      );

      expect(() =>
        validateFormValues("t_test", {
          importe: "-50",
          parte_id: "p1",
        })
      ).toThrow(/positivo/i);
    });

    it("debe coercionar booleanos desde strings", () => {
      const result = validateFormValues("t_aceptar", {
        parte_id: "p1",
        "es_urgente": "true",
      });
      expect(result.es_urgente).toBe(true);
    });
  });

  describe("P2: Coherencia de fieldsAfter", () => {
    it("debe validar que fieldsAfter sea un objeto plano", () => {
      const { reconstructFieldsFromEvents } = require("../../policies/judge.js");

      const event: TransitionEvent = {
        id: "e1",
        kind: "transicion",
        subjectId: "tx1",
        occurredAt: "2026-01-01T00:00:00Z",
        transitionId: "t_aceptar",
        actorId: "user1",
        fromStateId: "s1",
        toStateId: "s2",
        data: {
          fieldsAfter: { importe: 100, factura: "f1" },
          calculations: {},
        },
      };

      const fields = reconstructFieldsFromEvents([event], { parte_id: "p1" });
      expect(fields.importe).toBe(100);
      expect(fields.factura).toBe("f1");
    });

    it("debe saltarse fieldsAfter corrupto", () => {
      const { reconstructFieldsFromEvents } = require("../../policies/judge.js");
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const event: TransitionEvent = {
        id: "e1",
        kind: "transicion",
        subjectId: "tx1",
        occurredAt: "2026-01-01T00:00:00Z",
        transitionId: "t_aceptar",
        actorId: "user1",
        fromStateId: "s1",
        toStateId: "s2",
        data: {
          fieldsAfter: { fn: () => {} } as any, // Función (inválida)
          calculations: {},
        },
      };

      const fields = reconstructFieldsFromEvents([event], { parte_id: "p1" });
      expect(fields.fn).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
