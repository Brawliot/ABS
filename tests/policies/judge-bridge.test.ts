/**
 * Tests del puente Judge: Capa 0 (máquinas de estado) ↔ Capa 1 (reglas de negocio)
 *
 * 6 escenarios críticos:
 * A) Happy path: cumplimiento ✅ → permiso ✅ → política ✅ → núcleo ✅
 * B) Cumplimiento rechaza: plazo legal vencido (no se puede forzar)
 * C) Permiso rechaza pero se fuerza
 * D) Política rechaza pero se fuerza
 * E) Núcleo rechaza (transición inválida, no se puede forzar)
 * F) Fuerzo no autorizado
 */

import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../../archetypes/venta.js";
import { deriveState } from "../../core/derivation.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../../policies/compiler.js";
import {
  JudgeRejectionError,
  ForceNotAllowedError,
  judgedAdvance,
  type PolicyEventData,
} from "../../policies/judge.js";
import type { CompiledRuleSet, PolicyDocument } from "../../policies/types.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  [
    "importe",
    "descuento_pct",
    "credito_disponible",
    "factura_id",
    "precio",
    "fecha_entrega",
    "fecha_cierre",
    "fecha_creacion", // Para prueba de plazo legal
  ],
);
const activationAt = "2026-04-01T00:00:00.000Z";
const now = "2026-10-02T10:00:00.000Z";

function compile(doc: PolicyDocument): CompiledRuleSet {
  return compilePolicies(doc, { catalog, activationAt });
}

function baseRolesDoc(
  over: Partial<PolicyDocument> = {},
): PolicyDocument {
  return {
    id: "test-judge-bridge",
    version: "1.0.0",
    companyId: "test",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "gerente", label: "Gerente" },
      { id: "almacen", label: "Almacén" },
      { id: "contabilidad", label: "Contabilidad" },
    ],
    ...over,
  };
}

describe("Judge Bridge: Capa 0 ↔ Capa 1", () => {
  describe("A) Happy path: cumplimiento ✅ → permiso ✅ → política ✅ → núcleo ✅", () => {
    it("venta se acepta: permiso OK, no hay políticas restrictivas, núcleo OK", () => {
      const ruleSet = compile(
        baseRolesDoc({
          permissions: [
            {
              id: "perm-aceptar",
              kind: "permiso",
              transitionId: "t_aceptar",
              allowedRoles: ["vendedor"],
            },
          ],
        }),
      );

      const derived = deriveState(life, []);
      const t_aceptar = life.transitions.find((t) => t.id === "t_aceptar")!;

      const result = judgedAdvance({
        subjectId: "venta-1",
        lifecycle: life,
        derived,
        command: {
          transitionId: t_aceptar.id,
          occurredAt: now,
          eventId: "evt-1",
          actorId: "vendedor-1",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "aceptacion-123",
            recordedAt: now,
          },
        },
        actor: {
          id: "vendedor-1",
          kind: "humano",
          roles: ["vendedor"],
        },
        evidence: {
          kind: "aceptacion",
          reference: "aceptacion-123",
          recordedAt: now,
        },
        fields: {
          cliente_id: "cli-1",
          importe: 500,
        },
        ruleSet,
        now,
      });

      expect(result.trace.result).toBe("accepted");
      expect(result.transition.id).toBe("t_aceptar");
      expect(result.event.kind).toBe("transicion");
      expect(result.event.toStateId).toBe("aceptada");
      expect(result.trace.guardsEvaluated.length).toBeGreaterThan(0);
      // Verificar que hay evaluación del núcleo
      const nucleoEval = result.trace.guardsEvaluated.find((e) => e.phase === "nucleo");
      expect(nucleoEval).toBeDefined();
      expect(nucleoEval?.result).toBe("accepted");
    });
  });

  describe("B) Cumplimiento rechaza: plazo legal vencido (nunca forzable)", () => {
    it("plazo legal expirado rechaza, fuerzo es ignorado", () => {
      const ruleSet = compile(
        baseRolesDoc({
          compliance: [
            {
              id: "comp-plazo",
              kind: "cumplimiento",
              transitionId: "t_aceptar",
              legalDeadline: {
                anchorField: "fecha_creacion",
                durationMs: 30 * 24 * 60 * 60 * 1000, // 30 días en ms
                description: "Plazo legal de 30 días desde la creación",
              },
            },
          ],
          permissions: [
            {
              id: "perm-aceptar",
              kind: "permiso",
              transitionId: "t_aceptar",
              allowedRoles: ["vendedor"],
            },
          ],
        }),
      );

      const derived = deriveState(life, []);
      const t_aceptar = life.transitions.find((t) => t.id === "t_aceptar")!;
      // Fecha 1 día atrás (plazo abierto = fecha + 30 días > ahora)
      const abierto = new Date(Date.parse(now) - 1 * 24 * 60 * 60 * 1000).toISOString();

      expect(() => {
        judgedAdvance({
          subjectId: "venta-1",
          lifecycle: life,
          derived,
          command: {
            transitionId: t_aceptar.id,
            occurredAt: now,
            eventId: "evt-1",
            actorId: "vendedor-1",
            actorKind: "humano",
            evidence: {
              kind: "aceptacion",
              reference: "aceptacion-123",
              recordedAt: now,
            },
          },
          actor: {
            id: "vendedor-1",
            kind: "humano",
            roles: ["vendedor"],
          },
          evidence: {
            kind: "aceptacion",
            reference: "aceptacion-123",
            recordedAt: now,
          },
          fields: {
            cliente_id: "cli-1",
            importe: 500,
            fecha_creacion: abierto,
          },
          ruleSet,
          force: {
            reason: "Autorización especial",
            allowedForceRuleIds: ["legal_deadline:comp-plazo"], // Incluye la ID compilada
          },
          now,
        });
      }).toThrow(); // Cumplimiento nunca se puede forzar, lanza error
    });
  });

  describe("C) Permiso rechaza pero se fuerza", () => {
    it("actor sin rol + fuerzo autorizado → ForcedDeviation", () => {
      const ruleSet = compile(
        baseRolesDoc({
          permissions: [
            {
              id: "perm-aceptar",
              kind: "permiso",
              transitionId: "t_aceptar",
              allowedRoles: ["vendedor"],
            },
          ],
        }),
      );

      const derived = deriveState(life, []);
      const t_aceptar = life.transitions.find((t) => t.id === "t_aceptar")!;

      // Actor con rol "gerente", pero "perm-aceptar" exige "vendedor"
      const result = judgedAdvance({
        subjectId: "venta-1",
        lifecycle: life,
        derived,
        command: {
          transitionId: t_aceptar.id,
          occurredAt: now,
          eventId: "evt-1",
          actorId: "gerente-1",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "aceptacion-123",
            recordedAt: now,
          },
        },
        actor: {
          id: "gerente-1",
          kind: "humano",
          roles: ["gerente"],
        },
        evidence: {
          kind: "aceptacion",
          reference: "aceptacion-123",
          recordedAt: now,
        },
        fields: {
          cliente_id: "cli-1",
          importe: 500,
        },
        ruleSet,
        force: {
          reason: "Gerente autorizó",
          allowedForceRuleIds: ["guard:perm-aceptar"], // Prefijo de regla compilada
        },
        now,
      });

      expect(result.trace.result).toBe("accepted");
      const data = result.event.data as Partial<PolicyEventData>;
      expect(data.deviation).toBeDefined();
      expect(data.deviation?.kind).toBe("forced_transition");
      expect(data.deviation?.skippedRuleId).toBe("guard:perm-aceptar");
      expect(data.deviation?.skippedPhase).toBe("permiso");
      const skipRecord = result.trace.guardsEvaluated.find(
        (e) => e.ruleId === "guard:perm-aceptar",
      );
      expect(skipRecord?.result).toBe("skipped");
    });
  });

  describe("D) Política rechaza pero se fuerza", () => {
    it("condición fallida + fuerzo autorizado → ForcedDeviation", () => {
      const ruleSet = compile(
        baseRolesDoc({
          permissions: [
            {
              id: "perm-aceptar",
              kind: "permiso",
              transitionId: "t_aceptar",
              allowedRoles: ["vendedor"],
            },
          ],
          policies: [
            {
              id: "pol-min-importe",
              kind: "politica",
              transitionId: "t_aceptar",
              condition: {
                field: "importe",
                op: "gte",
                value: 1000,
              },
            },
          ],
        }),
      );

      const derived = deriveState(life, []);
      const t_aceptar = life.transitions.find((t) => t.id === "t_aceptar")!;

      // Importe = 500 (fallará pol-min-importe que exige >= 1000)
      const result = judgedAdvance({
        subjectId: "venta-1",
        lifecycle: life,
        derived,
        command: {
          transitionId: t_aceptar.id,
          occurredAt: now,
          eventId: "evt-1",
          actorId: "vendedor-1",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "aceptacion-123",
            recordedAt: now,
          },
        },
        actor: {
          id: "vendedor-1",
          kind: "humano",
          roles: ["vendedor"],
        },
        evidence: {
          kind: "aceptacion",
          reference: "aceptacion-123",
          recordedAt: now,
        },
        fields: {
          cliente_id: "cli-1",
          importe: 500,
        },
        ruleSet,
        force: {
          reason: "Excepción permitida",
          allowedForceRuleIds: ["cond:pol-min-importe"], // Prefijo de regla compilada
        },
        now,
      });

      expect(result.trace.result).toBe("accepted");
      const data = result.event.data as Partial<PolicyEventData>;
      expect(data.deviation).toBeDefined();
      expect(data.deviation?.skippedRuleId).toBe("cond:pol-min-importe");
      expect(data.deviation?.skippedPhase).toBe("politica");
    });
  });

  describe("E) Núcleo rechaza (transición inválida, no se puede forzar)", () => {
    it("transición no válida en máquina → error sin fuerzo", () => {
      const ruleSet = compile(
        baseRolesDoc({
          permissions: [
            {
              id: "perm-aceptar",
              kind: "permiso",
              transitionId: "t_aceptar",
              allowedRoles: ["vendedor"],
            },
          ],
        }),
      );
      const derived = deriveState(life, []);

      // Intentar transición que NO existe desde estado "propuesta"
      expect(() => {
        judgedAdvance({
          subjectId: "venta-1",
          lifecycle: life,
          derived,
          command: {
            transitionId: "t_inexistente",
            occurredAt: now,
            eventId: "evt-1",
            actorId: "vendedor-1",
            actorKind: "humano",
            evidence: {
              kind: "aceptacion",
              reference: "aceptacion-123",
              recordedAt: now,
            },
          },
          actor: {
            id: "vendedor-1",
            kind: "humano",
            roles: ["vendedor"],
          },
          evidence: {
            kind: "aceptacion",
            reference: "aceptacion-123",
            recordedAt: now,
          },
          fields: {
            cliente_id: "cli-1",
            importe: 500,
          },
          ruleSet,
          force: {
            reason: "Autorización total",
            allowedForceRuleIds: ["*"],
          },
          now,
        });
      }).toThrow();
    });
  });

  describe("F) Fuerzo no autorizado", () => {
    it("force sin allowedForceRuleIds apropiado → rechaza", () => {
      const ruleSet = compile(
        baseRolesDoc({
          permissions: [
            {
              id: "perm-aceptar",
              kind: "permiso",
              transitionId: "t_aceptar",
              allowedRoles: ["vendedor"],
            },
          ],
        }),
      );

      const derived = deriveState(life, []);
      const t_aceptar = life.transitions.find((t) => t.id === "t_aceptar")!;

      // Actor "gerente" no tiene rol requerido, intenta forzado sin autorización
      expect(() => {
        judgedAdvance({
          subjectId: "venta-1",
          lifecycle: life,
          derived,
          command: {
            transitionId: t_aceptar.id,
            occurredAt: now,
            eventId: "evt-1",
            actorId: "gerente-1",
            actorKind: "humano",
            evidence: {
              kind: "aceptacion",
              reference: "aceptacion-123",
              recordedAt: now,
            },
          },
          actor: {
            id: "gerente-1",
            kind: "humano",
            roles: ["gerente"],
          },
          evidence: {
            kind: "aceptacion",
            reference: "aceptacion-123",
            recordedAt: now,
          },
          fields: {
            cliente_id: "cli-1",
            importe: 500,
          },
          ruleSet,
          force: {
            reason: "Sin autorización",
            allowedForceRuleIds: [], // Vacío = sin autorización
          },
          now,
        });
      }).toThrow(ForceNotAllowedError);
    });

    it("force con regla NO incluida en allowedForceRuleIds → rechaza", () => {
      const ruleSet = compile(
        baseRolesDoc({
          permissions: [
            {
              id: "perm-aceptar",
              kind: "permiso",
              transitionId: "t_aceptar",
              allowedRoles: ["vendedor"],
            },
          ],
        }),
      );

      const derived = deriveState(life, []);
      const t_aceptar = life.transitions.find((t) => t.id === "t_aceptar")!;

      expect(() => {
        judgedAdvance({
          subjectId: "venta-1",
          lifecycle: life,
          derived,
          command: {
            transitionId: t_aceptar.id,
            occurredAt: now,
            eventId: "evt-1",
            actorId: "gerente-1",
            actorKind: "humano",
            evidence: {
              kind: "aceptacion",
              reference: "aceptacion-123",
              recordedAt: now,
            },
          },
          actor: {
            id: "gerente-1",
            kind: "humano",
            roles: ["gerente"],
          },
          evidence: {
            kind: "aceptacion",
            reference: "aceptacion-123",
            recordedAt: now,
          },
          fields: {
            cliente_id: "cli-1",
            importe: 500,
          },
          ruleSet,
          force: {
            reason: "Regla diferente",
            allowedForceRuleIds: ["otra-regla"], // No incluye "guard:perm-aceptar"
          },
          now,
        });
      }).toThrow(ForceNotAllowedError);
    });
  });
});
