/**
 * Judge Walk: Transacción completa Capa 0 + Capa 1
 *
 * Walk que demuestra el flujo completo:
 * venta → propuesta → aceptada → en_entrega → cerrada
 * con evaluación de reglas en cada paso
 */

import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../../archetypes/venta.js";
import { deriveState } from "../../core/derivation.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../../policies/compiler.js";
import {
  judgedAdvance,
  reconstructFieldsFromEvents,
  type PolicyEventData,
} from "../../policies/judge.js";
import type { PolicyDocument } from "../../policies/types.js";
import type { TransitionEvent } from "../../core/events.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  [
    "cliente_id",
    "importe",
    "descuento_pct",
    "factura_id",
    "precio",
    "fecha_entrega",
    "fecha_cierre",
    "fecha_creacion",
  ],
);
const activationAt = "2026-04-01T00:00:00.000Z";

function compile(doc: PolicyDocument) {
  return compilePolicies(doc, { catalog, activationAt });
}

function baseRolesDoc(
  over: Partial<PolicyDocument> = {},
): PolicyDocument {
  return {
    id: "test-judge-walk",
    version: "1.0.0",
    companyId: "test",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "gerente", label: "Gerente" },
      { id: "almacen", label: "Almacén" },
      { id: "contabilidad", label: "Contabilidad" },
      { id: "operador", label: "Operador Sistema" },
    ],
    ...over,
  };
}

describe("Judge Walk: Transacción completa Capa 0 + Capa 1", () => {
  it("walk: venta completa (propuesta → aceptada → en_entrega → cerrada)", () => {
    const ruleSet = compile(
      baseRolesDoc({
        permissions: [
          {
            id: "perm-aceptar",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor", "gerente"],
          },
          {
            id: "perm-iniciar-entrega",
            kind: "permiso",
            transitionId: "t_iniciar_entrega",
            allowedRoles: ["operador"],
          },
          {
            id: "perm-cerrar",
            kind: "permiso",
            transitionId: "t_cerrar",
            allowedRoles: ["operador"],
          },
        ],
        policies: [
          {
            id: "pol-precio",
            kind: "politica",
            transitionId: "t_aceptar",
            calculation: { field: "precio", op: "set", value: 12000 },
          },
        ],
        compliance: [
          {
            id: "comp-factura",
            kind: "cumplimiento",
            transitionId: "t_cerrar",
            requiredEvidence: { kind: "fisica", referenceType: "factura" },
          },
        ],
      }),
    );

    let derived = deriveState(life, []);
    let currentEvents: TransitionEvent[] = [];
    const now = "2026-10-02T10:00:00.000Z";

    // ═════════════════════════════════════════════════════
    // PASO 1: Aceptar venta
    // ═════════════════════════════════════════════════════
    const t_aceptar = life.transitions.find((t) => t.id === "t_aceptar")!;
    expect(t_aceptar).toBeDefined();

    const result1 = judgedAdvance({
      subjectId: "venta-1",
      lifecycle: life,
      derived,
      command: {
        transitionId: t_aceptar.id,
        occurredAt: now,
        eventId: "evt-aceptar",
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

    // Verificaciones PASO 1
    expect(result1.trace.result).toBe("accepted");
    expect(result1.event.kind).toBe("transicion");
    expect(result1.event.toStateId).toBe("aceptada");
    expect(result1.transition.id).toBe("t_aceptar");
    expect(result1.fieldsAfter.precio).toBe(12000); // Cálculo aplicado
    const data1 = result1.event.data as Partial<PolicyEventData>;
    expect(data1.calculations?.precio).toBe(12000);

    // Actualizar estado para siguiente paso
    currentEvents.push(result1.event);
    derived = deriveState(life, currentEvents);
    expect(derived.currentStateId).toBe("aceptada");

    // ═════════════════════════════════════════════════════
    // PASO 2: Iniciar entrega
    // ═════════════════════════════════════════════════════
    const now2 = "2026-10-02T15:00:00.000Z";
    const t_iniciar_entrega = life.transitions.find((t) => t.id === "t_iniciar_entrega")!;
    expect(t_iniciar_entrega).toBeDefined();

    const result2 = judgedAdvance({
      subjectId: "venta-1",
      lifecycle: life,
      derived,
      command: {
        transitionId: t_iniciar_entrega.id,
        occurredAt: now2,
        eventId: "evt-entrega",
        actorId: "sistema-1",
        actorKind: "sistema",
        evidence: {
          kind: "sistema",
          reference: "reserva-456",
          recordedAt: now2,
        },
      },
      actor: {
        id: "sistema-1",
        kind: "sistema",
        roles: ["operador"],
      },
      evidence: {
        kind: "sistema",
        reference: "reserva-456",
        recordedAt: now2,
      },
      fields: {
        ...result1.fieldsAfter,
        fecha_entrega: "2026-10-02",
      },
      ruleSet,
      now: now2,
    });

    // Verificaciones PASO 2
    expect(result2.trace.result).toBe("accepted");
    expect(result2.event.toStateId).toBe("en_entrega");
    expect(result2.transition.id).toBe("t_iniciar_entrega");

    // Actualizar estado
    currentEvents.push(result2.event);
    derived = deriveState(life, currentEvents);
    expect(derived.currentStateId).toBe("en_entrega");

    // ═════════════════════════════════════════════════════
    // PASO 3: Cerrar
    // ═════════════════════════════════════════════════════
    const now3 = "2026-10-03T09:00:00.000Z";
    const t_cerrar = life.transitions.find((t) => t.id === "t_cerrar")!;
    expect(t_cerrar).toBeDefined();

    const result3 = judgedAdvance({
      subjectId: "venta-1",
      lifecycle: life,
      derived,
      command: {
        transitionId: t_cerrar.id,
        occurredAt: now3,
        eventId: "evt-cerrar",
        actorId: "sistema-2",
        actorKind: "sistema",
        evidence: {
          kind: "fisica",
          reference: "factura:FAC-789",
          recordedAt: now3,
        },
      },
      actor: {
        id: "sistema-2",
        kind: "sistema",
        roles: ["operador"],
      },
      evidence: {
        kind: "fisica",
        reference: "factura:FAC-789",
        recordedAt: now3,
      },
      fields: {
        ...result2.fieldsAfter,
        fecha_cierre: "2026-10-03",
        factura_id: "FAC-789",
      },
      ruleSet,
      now: now3,
    });

    // Verificaciones PASO 3
    expect(result3.trace.result).toBe("accepted");
    expect(result3.event.toStateId).toBe("cerrada");
    expect(result3.transition.id).toBe("t_cerrar");

    // ═════════════════════════════════════════════════════
    // VERIFICACIÓN FINAL
    // ═════════════════════════════════════════════════════
    currentEvents.push(result3.event);
    const finalDerived = deriveState(life, currentEvents);

    expect(finalDerived.currentStateId).toBe("cerrada");
    expect(finalDerived.eventCount).toBe(3);
    expect(currentEvents).toHaveLength(3);

    // Verificar que los eventos están en orden
    expect(currentEvents[0]!.transitionId).toBe("t_aceptar");
    expect(currentEvents[1]!.transitionId).toBe("t_iniciar_entrega");
    expect(currentEvents[2]!.transitionId).toBe("t_cerrar");

    // Verificar que los campos fueron propagados correctamente (reconstruir desde eventos)
    const finalFields = reconstructFieldsFromEvents(currentEvents, {
      cliente_id: "cli-1",
      importe: 500,
    });
    expect(finalFields.cliente_id).toBe("cli-1");
    expect(finalFields.precio).toBe(12000);
    expect(finalFields.fecha_entrega).toBe("2026-10-02");
    expect(finalFields.fecha_cierre).toBe("2026-10-03");
    expect(finalFields.factura_id).toBe("FAC-789");

    // Verificar que todas las fases fueron evaluadas en cada paso
    for (const result of [result1, result2, result3]) {
      const phases = result.trace.guardsEvaluated.map((e) => e.phase);
      const hasNucleo = phases.includes("nucleo");
      expect(hasNucleo).toBe(true);
    }

    // Verificar que todas las transiciones fueron aceptadas
    expect(result1.trace.result).toBe("accepted");
    expect(result2.trace.result).toBe("accepted");
    expect(result3.trace.result).toBe("accepted");
  });

  it("walk: fuerzo permitido en permiso (gerente fuerza venta con rol limitado)", () => {
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
    const now = "2026-10-02T10:00:00.000Z";
    const t_aceptar = life.transitions.find((t) => t.id === "t_aceptar")!;

    // Gerente intenta aceptar (no tiene rol), pero está autorizado a forzar
    const result = judgedAdvance({
      subjectId: "venta-2",
      lifecycle: life,
      derived,
      command: {
        transitionId: t_aceptar.id,
        occurredAt: now,
        eventId: "evt-force",
        actorId: "gerente-1",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "aceptacion-456",
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
        reference: "aceptacion-456",
        recordedAt: now,
      },
      fields: {
        cliente_id: "cli-2",
        importe: 1000,
      },
      ruleSet,
      force: {
        reason: "Gerente necesita aceptar esta venta de forma excepcional",
        allowedForceRuleIds: ["guard:perm-aceptar"],
      },
      now,
    });

    // Verificaciones
    expect(result.trace.result).toBe("accepted");
    const data = result.event.data as Partial<PolicyEventData>;
    expect(data.deviation).toBeDefined();
    expect(data.deviation?.kind).toBe("forced_transition");
    expect(data.deviation?.skippedRuleId).toBe("guard:perm-aceptar");
    expect(data.deviation?.actorId).toBe("gerente-1");

    // Verificar que la regla fue saltada (skipped)
    const permEval = result.trace.guardsEvaluated.find(
      (e) => e.ruleId === "guard:perm-aceptar",
    );
    expect(permEval?.result).toBe("skipped");
    expect(permEval?.reason).toContain("excepcional");
  });

  it("walk: múltiples fases evaluadas sin errores en flujo normal", () => {
    const ruleSet = compile(
      baseRolesDoc({
        permissions: [
          {
            id: "perm-aceptar",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor", "gerente"],
          },
        ],
        policies: [
          {
            id: "pol-importe",
            kind: "politica",
            transitionId: "t_aceptar",
            condition: {
              field: "importe",
              op: "gt",
              value: 0,
            },
          },
        ],
      }),
    );

    const derived = deriveState(life, []);
    const now = "2026-10-02T10:00:00.000Z";
    const t_aceptar = life.transitions.find((t) => t.id === "t_aceptar")!;

    const result = judgedAdvance({
      subjectId: "venta-3",
      lifecycle: life,
      derived,
      command: {
        transitionId: t_aceptar.id,
        occurredAt: now,
        eventId: "evt-multi",
        actorId: "vendedor-1",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "aceptacion-789",
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
        reference: "aceptacion-789",
        recordedAt: now,
      },
      fields: {
        cliente_id: "cli-3",
        importe: 2000,
      },
      ruleSet,
      now,
    });

    // Verificar que se evaluaron múltiples fases
    const phases = new Set(result.trace.guardsEvaluated.map((e) => e.phase));
    expect(phases.has("permiso")).toBe(true);
    expect(phases.has("politica")).toBe(true);
    expect(phases.has("nucleo")).toBe(true);

    // Todos aceptados
    for (const evaluation of result.trace.guardsEvaluated) {
      expect(evaluation.result).toBe("accepted");
    }

    expect(result.trace.result).toBe("accepted");
    expect(result.event.toStateId).toBe("aceptada");
  });
});
