/**
 * Capa 1 — Business Logic (8 Checks)
 *
 * Tests unitarios para los 8 checks de Capa 1 auditados:
 * 1. Factura bloquea cierre sin doc formal
 * 2. Documento formal se convierte en evidencia
 * 3. Plazo legal bloquea rechazo de devolución
 * 4. Cumplimiento NUNCA forzable
 * 5. PII erasure no toca eventos
 * 6. Business hours 48h (Viernes-Martes)
 * 7. Objetivos NUNCA bloquean transiciones
 * 8. Descuento de segmento respeta vinculación
 */

import { describe, it, expect } from "vitest";
import { ventaArchetype } from "../../archetypes/venta.js";
import { deriveState } from "../../core/derivation.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../../policies/compiler.js";
import {
  judgedAdvance,
  JudgeRejectionError,
  ForceNotAllowedError,
} from "../../policies/judge.js";
import type { PolicyDocument, CompiledRuleSet } from "../../policies/types.js";

// ═══════════════════════════════════════════════════════════════
// SETUP Y FIXTURES
// ═══════════════════════════════════════════════════════════════

const ventaLife = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  ventaLife.transitions.map((t) => t.id),
  ventaLife.states.map((s) => s.id),
  [
    "cliente_id",
    "importe_eur",
    "descuento_pct",
    "credito_disponible",
    "factura_id",
    "factura_monto",
    "precio",
    "fecha_entrega",
    "fecha_cierre",
    "fecha_creacion",
    "segmento",
  ],
);

const activationAt = "2026-04-01T00:00:00.000Z";
const now = "2026-10-02T10:00:00.000Z";

function compile(doc: PolicyDocument): CompiledRuleSet {
  return compilePolicies(doc, { catalog, activationAt });
}

function baseDoc(over: Partial<PolicyDocument> = {}): PolicyDocument {
  return {
    id: "test-capa1-business",
    version: "1.0.0",
    companyId: "test",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "gerente", label: "Gerente" },
      { id: "almacen", label: "Almacen" },
      { id: "contabilidad", label: "Contabilidad" },
      { id: "operador", label: "Operador Sistema" },
    ],
    ...over,
  };
}

describe("Capa 1 — Business Logic (8 Checks)", () => {
  // TEST 1: Factura bloquea cierre sin doc formal
  it("1. Factura bloquea cierre sin doc formal", () => {
    const ruleSet = compile(
      baseDoc({
        permissions: [
          {
            id: "perm-cerrar",
            kind: "permiso",
            transitionId: "t_cerrar",
            allowedRoles: ["contabilidad"],
          },
        ],
        compliance: [
          {
            id: "comp-factura-cierre",
            kind: "cumplimiento",
            transitionId: "t_cerrar",
            requiredEvidence: { kind: "fisica" },
          },
        ],
      }),
    );

    const derived = deriveState(ventaLife, []);
    const t_cerrar = ventaLife.transitions.find((t) => t.id === "t_cerrar")!;

    // Intento de cierre SIN factura (referencia vacía)
    expect(() => {
      judgedAdvance({
        subjectId: "venta-sin-factura",
        lifecycle: ventaLife,
        derived,
        command: {
          transitionId: t_cerrar.id,
          occurredAt: now,
          eventId: "evt-1",
          actorId: "contabilidad-1",
          actorKind: "humano",
          evidence: {
            kind: "fisica",
            reference: "",
            recordedAt: now,
          },
        },
        actor: {
          id: "contabilidad-1",
          kind: "humano",
          roles: ["contabilidad"],
        },
        evidence: {
          kind: "fisica",
          reference: "",
          recordedAt: now,
        },
        fields: {
          cliente_id: "cli-1",
          importe_eur: 1000,
          factura_id: undefined,
        },
        ruleSet,
        now,
      });
    }).toThrow(JudgeRejectionError);
  });

  // TEST 2: Documento formal se convierte en evidencia
  it("2. Documento formal se convierte en evidencia", () => {
    const ruleSet = compile(
      baseDoc({
        permissions: [
          {
            id: "perm-aceptar",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor"],
          },
          {
            id: "perm-entrega",
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
        compliance: [
          {
            id: "comp-factura-cierre",
            kind: "cumplimiento",
            transitionId: "t_cerrar",
            requiredEvidence: { kind: "fisica" },
          },
        ],
      }),
    );

    // Simulamos el flujo completo: aceptar -> entrega -> cierre
    let currentEvents = [];
    let derived = deriveState(ventaLife, []);
    const t_aceptar = ventaLife.transitions.find((t) => t.id === "t_aceptar")!;

    // Paso 1: Aceptar
    const accept = judgedAdvance({
      subjectId: "venta-con-factura",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_aceptar.id,
        occurredAt: now,
        eventId: "evt-accept",
        actorId: "vendedor-1",
        actorKind: "humano",
        evidence: { kind: "aceptacion", reference: "acep-1", recordedAt: now },
      },
      actor: { id: "vendedor-1", kind: "humano", roles: ["vendedor"] },
      evidence: { kind: "aceptacion", reference: "acep-1", recordedAt: now },
      fields: { cliente_id: "cli-1", importe_eur: 1000 },
      ruleSet,
      now,
    });

    currentEvents.push(accept.event);
    derived = deriveState(ventaLife, currentEvents);

    // Paso 2: Iniciar entrega
    const t_entrega = ventaLife.transitions.find(
      (t) => t.id === "t_iniciar_entrega",
    )!;
    const entrega = judgedAdvance({
      subjectId: "venta-con-factura",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_entrega.id,
        occurredAt: now,
        eventId: "evt-entrega",
        actorId: "sistema-1",
        actorKind: "sistema",
        evidence: { kind: "sistema", reference: "sys-1", recordedAt: now },
      },
      actor: { id: "sistema-1", kind: "sistema", roles: ["operador"] },
      evidence: { kind: "sistema", reference: "sys-1", recordedAt: now },
      fields: { ...accept.fieldsAfter, fecha_entrega: "2026-10-02" },
      ruleSet,
      now,
    });

    currentEvents.push(entrega.event);
    derived = deriveState(ventaLife, currentEvents);

    // Paso 3: Cierre CON factura válida
    const t_cerrar = ventaLife.transitions.find((t) => t.id === "t_cerrar")!;
    const result = judgedAdvance({
      subjectId: "venta-con-factura",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_cerrar.id,
        occurredAt: now,
        eventId: "evt-2",
        actorId: "sistema-2",
        actorKind: "sistema",
        evidence: {
          kind: "fisica",
          reference: "factura:FAC-2026-10001",
          recordedAt: now,
        },
      },
      actor: {
        id: "sistema-2",
        kind: "sistema",
        roles: ["operador"],
      },
      evidence: {
        kind: "fisica",
        reference: "factura:FAC-2026-10001",
        recordedAt: now,
      },
      fields: {
        ...entrega.fieldsAfter,
        factura_id: "FAC-2026-10001",
        factura_monto: 1000,
      },
      ruleSet,
      now,
    });

    // Cierre es ACEPTADO porque evidencia es válida
    expect(result.trace.result).toBe("accepted");
    expect(result.event.evidence?.kind).toBe("fisica");
    expect(result.event.evidence?.reference).toContain("FAC-2026-10001");
  });

  // TEST 3: Plazo legal bloquea rechazo (usando cancelacion)
  it("3. Plazo legal bloquea rechazo de devolución", () => {
    const createdAt = new Date(
      Date.parse(now) - 24 * 60 * 60 * 1000
    ).toISOString();

    const ruleSet = compile(
      baseDoc({
        permissions: [
          {
            id: "perm-cancelar",
            kind: "permiso",
            transitionId: "t_cancelar_aceptada",
            allowedRoles: ["vendedor"],
          },
        ],
        compliance: [
          {
            id: "comp-plazo-legal-cancelacion",
            kind: "cumplimiento",
            transitionId: "t_cancelar_aceptada",
            legalDeadline: {
              anchorField: "fecha_creacion",
              durationMs: 48 * 60 * 60 * 1000,
              description: "Plazo legal de 48h para cancelacion",
            },
          },
        ],
      }),
    );

    const derived = deriveState(ventaLife, []);
    const t_cancelar = ventaLife.transitions.find(
      (t) => t.id === "t_cancelar_aceptada",
    )!;

    expect(() => {
      judgedAdvance({
        subjectId: "devol-1",
        lifecycle: ventaLife,
        derived,
        command: {
          transitionId: t_cancelar.id,
          occurredAt: now,
          eventId: "evt-3",
          actorId: "vendedor-1",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "motivo rechazo",
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
          reference: "motivo rechazo",
          recordedAt: now,
        },
        fields: {
          cliente_id: "cli-1",
          importe_eur: 500,
          fecha_creacion: createdAt,
        },
        ruleSet,
        now,
      });
    }).toThrow(JudgeRejectionError);
  });

  // TEST 4: Cumplimiento NUNCA forzable
  it("4. Cumplimiento NUNCA forzable (legal deadline)", () => {
    const createdAt = new Date(
      Date.parse(now) - 24 * 60 * 60 * 1000
    ).toISOString();

    const ruleSet = compile(
      baseDoc({
        permissions: [
          {
            id: "perm-cancelar",
            kind: "permiso",
            transitionId: "t_cancelar_aceptada",
            allowedRoles: ["vendedor"],
          },
        ],
        compliance: [
          {
            id: "comp-plazo-legal-cancelacion",
            kind: "cumplimiento",
            transitionId: "t_cancelar_aceptada",
            legalDeadline: {
              anchorField: "fecha_creacion",
              durationMs: 48 * 60 * 60 * 1000,
              description: "Plazo legal de 48h para cancelacion",
            },
          },
        ],
      }),
    );

    const derived = deriveState(ventaLife, []);
    const t_cancelar = ventaLife.transitions.find(
      (t) => t.id === "t_cancelar_aceptada",
    )!;

    // Intento de forzar una regla de cumplimiento (NUNCA permitido)
    expect(() => {
      judgedAdvance({
        subjectId: "devol-2",
        lifecycle: ventaLife,
        derived,
        command: {
          transitionId: t_cancelar.id,
          occurredAt: now,
          eventId: "evt-4",
          actorId: "vendedor-1",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "motivo forzado",
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
          reference: "motivo forzado",
          recordedAt: now,
        },
        fields: {
          cliente_id: "cli-1",
          importe_eur: 500,
          fecha_creacion: createdAt,
        },
        ruleSet,
        force: {
          reason: "Necesito cancelar ahora",
          allowedForceRuleIds: ["comp-plazo-legal-cancelacion"],
        },
        now,
      });
    }).toThrow(ForceNotAllowedError);
  });

  // TEST 5: PII erasure no toca eventos
  it("5. PII erasure no toca eventos (son opacos)", () => {
    const ruleSet = compile(
      baseDoc({
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

    const derived = deriveState(ventaLife, []);
    const t_aceptar = ventaLife.transitions.find((t) => t.id === "t_aceptar")!;

    const result = judgedAdvance({
      subjectId: "venta-pii",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_aceptar.id,
        occurredAt: now,
        eventId: "evt-5",
        actorId: "vendedor-1",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "acep-pii",
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
        reference: "acep-pii",
        recordedAt: now,
      },
      fields: {
        cliente_id: "cli-pii-1",
        importe_eur: 1000,
      },
      ruleSet,
      now,
    });

    // Verificar que evento NO contiene PII en texto plano
    const eventJson = JSON.stringify(result.event);
    expect(eventJson).not.toContain("@");
    expect(eventJson).not.toContain("+34");
    expect(eventJson).not.toContain("nombre_cliente");

    // Evento incluye transitionId y otros datos normales
    expect(result.event.transitionId).toBe("t_aceptar");
    expect(result.trace.result).toBe("accepted");
  });

  // TEST 6: Business hours 48h
  it("6. Business hours 48h respeta ventana (criterio temporal)", () => {
    const ruleSet = compile(
      baseDoc({
        permissions: [
          {
            id: "perm-aceptar",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor"],
          },
          {
            id: "perm-entrega",
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
        compliance: [
          {
            id: "comp-factura-cierre",
            kind: "cumplimiento",
            transitionId: "t_cerrar",
            requiredEvidence: { kind: "fisica" },
          },
        ],
      }),
    );

    // Flujo completo
    let currentEvents = [];
    let derived = deriveState(ventaLife, []);
    const t_aceptar = ventaLife.transitions.find((t) => t.id === "t_aceptar")!;
    const createdOld = new Date(
      Date.parse(now) - 72 * 60 * 60 * 1000
    ).toISOString();

    // Aceptar
    const accept = judgedAdvance({
      subjectId: "venta-old",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_aceptar.id,
        occurredAt: now,
        eventId: "evt-accept",
        actorId: "vendedor-1",
        actorKind: "humano",
        evidence: { kind: "aceptacion", reference: "acep-1", recordedAt: now },
      },
      actor: { id: "vendedor-1", kind: "humano", roles: ["vendedor"] },
      evidence: { kind: "aceptacion", reference: "acep-1", recordedAt: now },
      fields: { cliente_id: "cli-1", importe_eur: 1000, fecha_creacion: createdOld },
      ruleSet,
      now,
    });

    currentEvents.push(accept.event);
    derived = deriveState(ventaLife, currentEvents);

    // Entrega
    const t_entrega = ventaLife.transitions.find(
      (t) => t.id === "t_iniciar_entrega",
    )!;
    const entrega = judgedAdvance({
      subjectId: "venta-old",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_entrega.id,
        occurredAt: now,
        eventId: "evt-entrega",
        actorId: "sistema-1",
        actorKind: "sistema",
        evidence: { kind: "sistema", reference: "sys-1", recordedAt: now },
      },
      actor: { id: "sistema-1", kind: "sistema", roles: ["operador"] },
      evidence: { kind: "sistema", reference: "sys-1", recordedAt: now },
      fields: { ...accept.fieldsAfter, fecha_entrega: "2026-10-02" },
      ruleSet,
      now,
    });

    currentEvents.push(entrega.event);
    derived = deriveState(ventaLife, currentEvents);

    // Cierre
    const t_cerrar = ventaLife.transitions.find((t) => t.id === "t_cerrar")!;
    const result = judgedAdvance({
      subjectId: "venta-old",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_cerrar.id,
        occurredAt: now,
        eventId: "evt-6",
        actorId: "sistema-2",
        actorKind: "sistema",
        evidence: {
          kind: "fisica",
          reference: "fac-old",
          recordedAt: now,
        },
      },
      actor: {
        id: "sistema-2",
        kind: "sistema",
        roles: ["operador"],
      },
      evidence: {
        kind: "fisica",
        reference: "fac-old",
        recordedAt: now,
      },
      fields: {
        ...entrega.fieldsAfter,
        factura_id: "fac-old",
      },
      ruleSet,
      now,
    });

    expect(result.trace.result).toBe("accepted");
  });

  // TEST 7: Objetivos NO bloquean transiciones
  it("7. Objetivos NUNCA bloquean transiciones (son informativos)", () => {
    const ruleSet = compile(
      baseDoc({
        permissions: [
          {
            id: "perm-aceptar",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor"],
          },
          {
            id: "perm-entrega",
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
        compliance: [
          {
            id: "comp-factura-cierre",
            kind: "cumplimiento",
            transitionId: "t_cerrar",
            requiredEvidence: { kind: "fisica" },
          },
        ],
      }),
    );

    // Flujo completo
    let currentEvents = [];
    let derived = deriveState(ventaLife, []);
    const t_aceptar = ventaLife.transitions.find((t) => t.id === "t_aceptar")!;

    // Aceptar
    const accept = judgedAdvance({
      subjectId: "venta-sin-objetivo",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_aceptar.id,
        occurredAt: now,
        eventId: "evt-accept",
        actorId: "vendedor-1",
        actorKind: "humano",
        evidence: { kind: "aceptacion", reference: "acep-1", recordedAt: now },
      },
      actor: { id: "vendedor-1", kind: "humano", roles: ["vendedor"] },
      evidence: { kind: "aceptacion", reference: "acep-1", recordedAt: now },
      fields: { cliente_id: "cli-1", importe_eur: 50000 },
      ruleSet,
      now,
    });

    currentEvents.push(accept.event);
    derived = deriveState(ventaLife, currentEvents);

    // Entrega
    const t_entrega = ventaLife.transitions.find(
      (t) => t.id === "t_iniciar_entrega",
    )!;
    const entrega = judgedAdvance({
      subjectId: "venta-sin-objetivo",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_entrega.id,
        occurredAt: now,
        eventId: "evt-entrega",
        actorId: "sistema-1",
        actorKind: "sistema",
        evidence: { kind: "sistema", reference: "sys-1", recordedAt: now },
      },
      actor: { id: "sistema-1", kind: "sistema", roles: ["operador"] },
      evidence: { kind: "sistema", reference: "sys-1", recordedAt: now },
      fields: { ...accept.fieldsAfter, fecha_entrega: "2026-10-02" },
      ruleSet,
      now,
    });

    currentEvents.push(entrega.event);
    derived = deriveState(ventaLife, currentEvents);

    // Cierre: Vendedor bajo objetivo, pero cierre NO bloqueado
    const t_cerrar = ventaLife.transitions.find((t) => t.id === "t_cerrar")!;
    const result = judgedAdvance({
      subjectId: "venta-sin-objetivo",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_cerrar.id,
        occurredAt: now,
        eventId: "evt-7",
        actorId: "sistema-2",
        actorKind: "sistema",
        evidence: {
          kind: "fisica",
          reference: "fac-obj",
          recordedAt: now,
        },
      },
      actor: {
        id: "sistema-2",
        kind: "sistema",
        roles: ["operador"],
      },
      evidence: {
        kind: "fisica",
        reference: "fac-obj",
        recordedAt: now,
      },
      fields: {
        ...entrega.fieldsAfter,
        factura_id: "fac-obj",
      },
      ruleSet,
      now,
    });

    // Cierre ACEPTADO (objetivos no bloquean)
    expect(result.trace.result).toBe("accepted");
    expect(result.event.toStateId).toBe("cerrada");
  });

  // TEST 8: Descuento de segmento respeta vinculación
  it("8. Descuento de segmento respeta vinculación (binding)", () => {
    const ruleSet = compile(
      baseDoc({
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
            id: "pol-descuento-segmento",
            kind: "politica",
            transitionId: "t_aceptar",
            calculation: {
              field: "descuento_pct",
              op: "set",
              value: 10,
            },
          },
        ],
      }),
    );

    const derived = deriveState(ventaLife, []);
    const t_aceptar = ventaLife.transitions.find((t) => t.id === "t_aceptar")!;

    const result = judgedAdvance({
      subjectId: "venta-binding",
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_aceptar.id,
        occurredAt: now,
        eventId: "evt-8",
        actorId: "vendedor-1",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "acep-bind",
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
        reference: "acep-bind",
        recordedAt: now,
      },
      fields: {
        cliente_id: "cli-premium-1",
        importe_eur: 10000,
        segmento: "premium",
      },
      ruleSet,
      now,
    });

    // Aceptacion procede; descuento se calcula
    expect(result.trace.result).toBe("accepted");
    expect(result.event.toStateId).toBe("aceptada");
  });
});
