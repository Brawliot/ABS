/**
 * Capa 1 — Walks Operacionales (End-to-end)
 *
 * Walks completos que demuestran flujos reales evento a evento,
 * validando reglas de negocio de Capa 1 en contexto operacional.
 *
 * Estos NO son tests unitarios de guardas individuales, sino
 * flujos completos que demuestran cómo se orquestan transiciones
 * respecto de evidencia, campos y acuerdos de cumplimiento.
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
} from "../../policies/judge.js";
import { isTerminalState } from "../../core/lifecycle.js";
import type { PolicyDocument, CompiledRuleSet } from "../../policies/types.js";
import type { DomainEvent } from "../../core/events.js";

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
    id: "test-capa1-walks",
    version: "1.0.0",
    companyId: "test",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "gerente", label: "Gerente" },
      { id: "almacen", label: "Almacen" },
      { id: "contabilidad", label: "Contabilidad" },
      { id: "operador", label: "Operador Sistema" },
      { id: "cliente", label: "Cliente" },
    ],
    ...over,
  };
}

describe("Capa 1 — Walks Operacionales", () => {
  // ═══════════════════════════════════════════════════════════════
  // WALK 1: Factura → Evidencia → Cierre Exitoso
  // ═══════════════════════════════════════════════════════════════

  it("Walk 1: factura registrada → evidencia → cierre exitoso", () => {
    /**
     * Flujo operacional completo:
     * 1. Crear venta (estado inicial)
     * 2. Aceptar oferta (propuesta → aceptada)
     * 3. Iniciar entrega (aceptada → en_entrega)
     * 4. Cierre CON factura (en_entrega → cerrada)
     *
     * Validar que:
     * - Cada transición es aceptada
     * - Factura se convierte en evidencia formal
     * - Estado final es terminal
     */

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

    const ventaId = "venta-walk-1";
    const allEvents: DomainEvent[] = [];

    // PASO 1: Crear venta (estado inicial: propuesta)
    let derived = deriveState(ventaLife, []);
    expect(derived.currentStateId).toBe("propuesta");

    // PASO 2: Aceptar
    const t_aceptar = ventaLife.transitions.find((t) => t.id === "t_aceptar")!;
    const acceptResult = judgedAdvance({
      subjectId: ventaId,
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_aceptar.id,
        occurredAt: now,
        eventId: "evt-accept-walk1",
        actorId: "vendedor-1",
        actorKind: "humano",
        evidence: { kind: "aceptacion", reference: "acep-walk1", recordedAt: now },
      },
      actor: { id: "vendedor-1", kind: "humano", roles: ["vendedor"] },
      evidence: { kind: "aceptacion", reference: "acep-walk1", recordedAt: now },
      fields: { cliente_id: "cli-1", importe_eur: 1000 },
      ruleSet,
      now,
    });

    expect(acceptResult.trace.result).toBe("accepted");
    allEvents.push(acceptResult.event);
    derived = deriveState(ventaLife, allEvents);
    expect(derived.currentStateId).toBe("aceptada");

    // PASO 3: Iniciar entrega
    const t_entrega = ventaLife.transitions.find(
      (t) => t.id === "t_iniciar_entrega",
    )!;
    const entregaResult = judgedAdvance({
      subjectId: ventaId,
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_entrega.id,
        occurredAt: "2026-10-02T14:00:00.000Z",
        eventId: "evt-entrega-walk1",
        actorId: "sistema-1",
        actorKind: "sistema",
        evidence: { kind: "sistema", reference: "sys-entrega-1", recordedAt: now },
      },
      actor: { id: "sistema-1", kind: "sistema", roles: ["operador"] },
      evidence: { kind: "sistema", reference: "sys-entrega-1", recordedAt: now },
      fields: { ...acceptResult.fieldsAfter, fecha_entrega: "2026-10-02" },
      ruleSet,
      now: "2026-10-02T14:00:00.000Z",
    });

    expect(entregaResult.trace.result).toBe("accepted");
    allEvents.push(entregaResult.event);
    derived = deriveState(ventaLife, allEvents);
    expect(derived.currentStateId).toBe("en_entrega");

    // PASO 4: Cierre CON factura (documento → evidencia)
    const t_cerrar = ventaLife.transitions.find((t) => t.id === "t_cerrar")!;
    const closeResult = judgedAdvance({
      subjectId: ventaId,
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_cerrar.id,
        occurredAt: "2026-10-02T17:00:00.000Z",
        eventId: "evt-close-walk1",
        actorId: "contabilidad-1",
        actorKind: "humano",
        evidence: {
          kind: "fisica",
          reference: "factura:FAC-2026-10001",
          recordedAt: "2026-10-02T17:00:00.000Z",
        },
      },
      actor: { id: "contabilidad-1", kind: "humano", roles: ["contabilidad"] },
      evidence: {
        kind: "fisica",
        reference: "factura:FAC-2026-10001",
        recordedAt: "2026-10-02T17:00:00.000Z",
      },
      fields: {
        ...entregaResult.fieldsAfter,
        factura_id: "FAC-2026-10001",
        factura_monto: 1000,
      },
      ruleSet,
      now: "2026-10-02T17:00:00.000Z",
    });

    expect(closeResult.trace.result).toBe("accepted");
    expect(closeResult.event.toStateId).toBe("cerrada");
    expect(closeResult.event.evidence?.kind).toBe("fisica");
    expect(closeResult.event.evidence?.reference).toContain("FAC-2026-10001");

    allEvents.push(closeResult.event);
    const finalDerived = deriveState(ventaLife, allEvents);

    // Verificación final
    expect(finalDerived.currentStateId).toBe("cerrada");
    expect(isTerminalState(ventaLife, finalDerived.currentStateId)).toBe(true);

    // Validar eventos en orden
    expect(allEvents).toHaveLength(3);
    expect(allEvents[0]!.kind).toBe("transicion");
    expect((allEvents[0] as any).transitionId).toBe("t_aceptar");
    expect(allEvents[1]!.kind).toBe("transicion");
    expect((allEvents[1] as any).transitionId).toBe("t_iniciar_entrega");
    expect(allEvents[2]!.kind).toBe("transicion");
    expect((allEvents[2] as any).transitionId).toBe("t_cerrar");
  });

  // ═══════════════════════════════════════════════════════════════
  // WALK 2: Plazo Legal Bloquea Rechazo de Devolución
  // ═══════════════════════════════════════════════════════════════

  it("Walk 2: devolución dentro plazo legal → rechazo bloqueado", () => {
    /**
     * Flujo operacional:
     * 1. Crear devolución
     * 2. Intento de rechazo DENTRO de plazo (48h)
     * 3. Guardia de cumplimiento bloquea rechazo
     * 4. Verificar que no se ejecutó la transición
     */

    // Crear fecha de creación: hace 24 horas
    const createdAt = new Date(Date.parse(now));
    createdAt.setHours(createdAt.getHours() - 24);

    const ruleSet = compile(
      baseDoc({
        permissions: [
          {
            id: "perm-crear-devol",
            kind: "permiso",
            transitionId: "t_crear",
            allowedRoles: ["cliente"],
          },
          {
            id: "perm-rechazar-devol",
            kind: "permiso",
            transitionId: "t_rechazar",
            allowedRoles: ["vendedor"],
          },
        ],
        compliance: [
          {
            id: "comp-plazo-legal-rechazo",
            kind: "cumplimiento",
            transitionId: "t_rechazar",
            legalDeadline: {
              anchorField: "fecha_creacion",
              durationMs: 48 * 60 * 60 * 1000, // 48 horas
              description: "Plazo legal para rechazo de devolución",
            },
          },
        ],
      }),
    );

    const devolucionId = "devol-walk-2";
    const allEvents: DomainEvent[] = [];

    // Crear devolución
    let derived = deriveState(ventaLife, []);
    const t_crear = ventaLife.transitions.find((t) => t.id === "t_crear")!;

    const crearResult = judgedAdvance({
      subjectId: devolucionId,
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_crear.id,
        occurredAt: createdAt.toISOString(),
        eventId: "evt-crear-devol-walk2",
        actorId: "cliente-1",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "sol-devol-walk2",
          recordedAt: createdAt.toISOString(),
        },
      },
      actor: { id: "cliente-1", kind: "humano", roles: ["cliente"] },
      evidence: {
        kind: "aceptacion",
        reference: "sol-devol-walk2",
        recordedAt: createdAt.toISOString(),
      },
      fields: {
        cliente_id: "cli-1",
        importe_eur: 500,
        fecha_creacion: createdAt.toISOString(),
      },
      ruleSet,
      now: createdAt.toISOString(),
    });

    expect(crearResult.trace.result).toBe("accepted");
    allEvents.push(crearResult.event);
    derived = deriveState(ventaLife, allEvents);

    // Intento de RECHAZO DENTRO del plazo legal (4 horas después)
    const t_rechazar = ventaLife.transitions.find((t) => t.id === "t_rechazar")!;

    expect(() => {
      judgedAdvance({
        subjectId: devolucionId,
        lifecycle: ventaLife,
        derived,
        command: {
          transitionId: t_rechazar.id,
          occurredAt: now,
          eventId: "evt-rechazar-walk2",
          actorId: "vendedor-1",
          actorKind: "humano",
          evidence: {
            kind: "sistema",
            reference: "motivo-rechazo",
            recordedAt: now,
          },
        },
        actor: { id: "vendedor-1", kind: "humano", roles: ["vendedor"] },
        evidence: {
          kind: "sistema",
          reference: "motivo-rechazo",
          recordedAt: now,
        },
        fields: {
          ...crearResult.fieldsAfter,
          fecha_creacion: createdAt.toISOString(),
        },
        ruleSet,
        now,
      });
    }).toThrow(JudgeRejectionError);

    // No se añadió evento de rechazo
    expect(allEvents).toHaveLength(1);
    expect(derived.currentStateId).not.toBe("rechazada");
  });

  // ═══════════════════════════════════════════════════════════════
  // WALK 3: Flujo Completo de Presupuesto → Venta → Cierre
  // ═══════════════════════════════════════════════════════════════

  it("Walk 3: presupuesto → venta completa → cierre", () => {
    /**
     * Flujo operacional extendido:
     * 1. Presentar oferta (presupuesto)
     * 2. Cliente acepta (aceptada)
     * 3. Registrar entrega
     * 4. Cerrar con contabilidad
     *
     * Valida el flujo operacional completo de una venta.
     */

    const ruleSet = compile(
      baseDoc({
        permissions: [
          {
            id: "perm-aceptar",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor", "cliente"],
          },
          {
            id: "perm-entrega",
            kind: "permiso",
            transitionId: "t_iniciar_entrega",
            allowedRoles: ["operador", "almacen"],
          },
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

    const ventaId = "venta-walk-3";
    const allEvents: DomainEvent[] = [];

    // PASO 1: Estado inicial
    let derived = deriveState(ventaLife, []);
    expect(derived.currentStateId).toBe("propuesta");

    // PASO 2: Aceptar
    const t_aceptar = ventaLife.transitions.find((t) => t.id === "t_aceptar")!;
    const accept = judgedAdvance({
      subjectId: ventaId,
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_aceptar.id,
        occurredAt: now,
        eventId: "evt-1-walk3",
        actorId: "vendedor-1",
        actorKind: "humano",
        evidence: { kind: "aceptacion", reference: "acep-1", recordedAt: now },
      },
      actor: { id: "vendedor-1", kind: "humano", roles: ["vendedor"] },
      evidence: { kind: "aceptacion", reference: "acep-1", recordedAt: now },
      fields: { cliente_id: "cli-1", importe_eur: 2500, descuento_pct: 0 },
      ruleSet,
      now,
    });

    expect(accept.trace.result).toBe("accepted");
    allEvents.push(accept.event);
    derived = deriveState(ventaLife, allEvents);

    // PASO 3: Entrega
    const t_entrega = ventaLife.transitions.find(
      (t) => t.id === "t_iniciar_entrega",
    )!;
    const entrega = judgedAdvance({
      subjectId: ventaId,
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_entrega.id,
        occurredAt: "2026-10-03T10:00:00.000Z",
        eventId: "evt-2-walk3",
        actorId: "almacen-1",
        actorKind: "humano",
        evidence: { kind: "sistema", reference: "entrega-1", recordedAt: "2026-10-03T10:00:00.000Z" },
      },
      actor: { id: "almacen-1", kind: "humano", roles: ["almacen"] },
      evidence: { kind: "sistema", reference: "entrega-1", recordedAt: "2026-10-03T10:00:00.000Z" },
      fields: { ...accept.fieldsAfter, fecha_entrega: "2026-10-03" },
      ruleSet,
      now: "2026-10-03T10:00:00.000Z",
    });

    expect(entrega.trace.result).toBe("accepted");
    allEvents.push(entrega.event);
    derived = deriveState(ventaLife, allEvents);

    // PASO 4: Cierre
    const t_cerrar = ventaLife.transitions.find((t) => t.id === "t_cerrar")!;
    const cierre = judgedAdvance({
      subjectId: ventaId,
      lifecycle: ventaLife,
      derived,
      command: {
        transitionId: t_cerrar.id,
        occurredAt: "2026-10-04T15:00:00.000Z",
        eventId: "evt-3-walk3",
        actorId: "contabilidad-1",
        actorKind: "humano",
        evidence: {
          kind: "fisica",
          reference: "factura:FAC-2026-99999",
          recordedAt: "2026-10-04T15:00:00.000Z",
        },
      },
      actor: { id: "contabilidad-1", kind: "humano", roles: ["contabilidad"] },
      evidence: {
        kind: "fisica",
        reference: "factura:FAC-2026-99999",
        recordedAt: "2026-10-04T15:00:00.000Z",
      },
      fields: {
        ...entrega.fieldsAfter,
        factura_id: "FAC-2026-99999",
        factura_monto: 2500,
      },
      ruleSet,
      now: "2026-10-04T15:00:00.000Z",
    });

    expect(cierre.trace.result).toBe("accepted");
    expect(cierre.event.toStateId).toBe("cerrada");
    allEvents.push(cierre.event);

    // Verificación final
    const finalDerived = deriveState(ventaLife, allEvents);
    expect(finalDerived.currentStateId).toBe("cerrada");
    expect(isTerminalState(ventaLife, finalDerived.currentStateId)).toBe(true);
    expect(allEvents).toHaveLength(3);
  });
});
