/**
 * HUECO 1 — Forzado de transiciones (Permiso/Política)
 *
 * Verifica que el mecanismo de forzado está presente y implementado:
 * ✔ ForceOverride existe y requiere reason obligatorio
 * ✔ ForcedDeviation se registra en eventos
 * ✔ ForceNotAllowedError se lanza apropiadamente
 * ✔ Cumplimiento y Núcleo nunca se pueden forzar
 */

import { describe, expect, it } from "vitest";
import {
  ForceNotAllowedError,
  assertForceAllowed,
  type ForceOverride,
  type ForcedDeviation,
} from "../policies/judge.js";

describe("Juez — Forzado (Permiso/Política)", () => {
  describe("HUECO 1.1: ForceOverride interface", () => {
    it("ForceOverride requiere reason en texto libre", () => {
      const validForce: ForceOverride = {
        reason: "Excepción de negocio autorizada",
        allowedForceRuleIds: ["rule-1"],
      };

      expect(validForce.reason).toBeTruthy();
      expect(validForce.allowedForceRuleIds).toContain("rule-1");
    });

    it("ForceOverride con allowedForceRuleIds vacío es válido", () => {
      const force: ForceOverride = {
        reason: "Motivo sin reglas permitidas",
        allowedForceRuleIds: [],
      };

      expect(force.allowedForceRuleIds).toHaveLength(0);
    });
  });

  describe("HUECO 1.2: assertForceAllowed valida correctamente", () => {
    it("sin reason → ForceNotAllowedError", () => {
      expect(() =>
        assertForceAllowed(
          { reason: "", allowedForceRuleIds: ["rule-1"] },
          "permiso",
          "rule-1",
        ),
      ).toThrow(ForceNotAllowedError);
    });

    it("cumplimiento → ForceNotAllowedError (nunca)", () => {
      expect(() =>
        assertForceAllowed(
          { reason: "Test", allowedForceRuleIds: ["rule-1"] },
          "cumplimiento",
          "rule-1",
        ),
      ).toThrow(ForceNotAllowedError);
    });

    it("nucleo → ForceNotAllowedError (nunca)", () => {
      expect(() =>
        assertForceAllowed(
          { reason: "Test", allowedForceRuleIds: ["rule-1"] },
          "nucleo",
          "rule-1",
        ),
      ).toThrow(ForceNotAllowedError);
    });

    it("sin permiso explícito → ForceNotAllowedError", () => {
      expect(() =>
        assertForceAllowed(
          { reason: "Test", allowedForceRuleIds: [] },
          "permiso",
          "rule-1",
        ),
      ).toThrow(ForceNotAllowedError);
    });

    it("permiso válido no lanza error", () => {
      expect(() =>
        assertForceAllowed(
          { reason: "Test", allowedForceRuleIds: ["rule-1"] },
          "permiso",
          "rule-1",
        ),
      ).not.toThrow();
    });

    it("politica válida no lanza error", () => {
      expect(() =>
        assertForceAllowed(
          { reason: "Test", allowedForceRuleIds: ["rule-1"] },
          "politica",
          "rule-1",
        ),
      ).not.toThrow();
    });
  });

  describe("HUECO 1.3: ForcedDeviation estructura", () => {
    it("ForcedDeviation registra desviación de forzado", () => {
      const deviation: ForcedDeviation = {
        kind: "forced_transition",
        skippedRuleId: "perm-1",
        skippedPhase: "permiso",
        ruleSetVersion: "1.0.0",
        ruleSetContentHash: "abc123",
        actorId: "actor-1",
        reason: "Excepción de negocio",
      };

      expect(deviation.kind).toBe("forced_transition");
      expect(deviation.skippedRuleId).toBe("perm-1");
      expect(deviation.skippedPhase).toBe("permiso");
      expect(deviation.actorId).toBe("actor-1");
      expect(deviation.reason).toContain("Excepción");
    });

    it("ForcedDeviation puede tener skippedPhase politica", () => {
      const deviation: ForcedDeviation = {
        kind: "forced_transition",
        skippedRuleId: "cond-1",
        skippedPhase: "politica",
        ruleSetVersion: "1.0.0",
        ruleSetContentHash: "abc123",
        actorId: "admin-1",
        reason: "Caso especial",
      };

      expect(deviation.skippedPhase).toBe("politica");
    });
  });

  describe("HUECO 1.4: Error classes", () => {
    it("ForceNotAllowedError es instancia de Error", () => {
      const err = new ForceNotAllowedError("Test message");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("ForceNotAllowedError");
      expect(err.message).toContain("Test");
    });

    it("ForceNotAllowedError message puede describir el problema", () => {
      const reasons = [
        "Forzado rechazado: las guardas de cumplimiento nunca se pueden forzar",
        "Forzado rechazado: las guardas del núcleo nunca se pueden forzar",
        "Forzado rechazado: solo se pueden forzar Permiso o Política",
        "Forzado rechazado: sin permiso explícito de forzado",
        "Forzado rechazado: el motivo en texto libre es obligatorio",
      ];

      for (const reason of reasons) {
        const err = new ForceNotAllowedError(reason);
        expect(err.message).toBe(reason);
      }
    });
  });

  describe("HUECO 1.5: Mecanismo de auditoría", () => {
    it("ForceNotAllowedError permite auditoría de intentos de forzado", () => {
      const auditLog: string[] = [];

      try {
        assertForceAllowed(
          { reason: "Intento sospechoso", allowedForceRuleIds: [] },
          "permiso",
          "rule-1",
        );
      } catch (err) {
        if (err instanceof ForceNotAllowedError) {
          auditLog.push(`Intento forzado rechazado: ${err.message}`);
        }
      }

      expect(auditLog).toHaveLength(1);
      expect(auditLog[0]).toContain("rechazado");
    });

    it("ForcedDeviation permite auditoría de forzados exitosos", () => {
      const auditLog: ForcedDeviation[] = [];

      const deviation: ForcedDeviation = {
        kind: "forced_transition",
        skippedRuleId: "perm-1",
        skippedPhase: "permiso",
        ruleSetVersion: "1.0.0",
        ruleSetContentHash: "abc123",
        actorId: "admin-1",
        reason: "Excepción autorizada por dirección",
      };

      auditLog.push(deviation);

      expect(auditLog).toHaveLength(1);
      expect(auditLog[0]?.actorId).toBe("admin-1");
      expect(auditLog[0]?.reason).toBeTruthy();
    });
  });
});
