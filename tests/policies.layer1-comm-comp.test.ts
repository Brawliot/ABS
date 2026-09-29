import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../archetypes/venta.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import {
  FACTURA_TEMPLATE,
  CommunicationTrace,
  sendCommunication,
} from "../policies/comunicacion.js";
import {
  ParteIdentityStore,
  assertNoPiiInEventData,
  ParteIdentityError,
} from "../policies/identity.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import {
  ForceNotAllowedError,
  JudgeRejectionError,
  attemptJudgedAdvance,
} from "../policies/judge.js";
import type { PolicyDocument } from "../policies/types.js";

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
    "parte_id",
    "compra_at",
  ],
);
const activationAt = "2026-04-01T00:00:00.000Z";
const DAY = 24 * 60 * 60 * 1000;

function baseDoc(over: Partial<PolicyDocument> = {}): PolicyDocument {
  return {
    id: "pack-comm-comp",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles: [
      { id: "operaciones", label: "Operaciones" },
      { id: "gerente", label: "Gerente" },
      { id: "vendedor", label: "Vendedor" },
    ],
    ...over,
  };
}

describe("Capa 1 — comunicación + cumplimiento", () => {
  it("venta no cierra sin factura exigida generada como documento formal", () => {
    const ruleSet = compilePolicies(
      baseDoc({
        permissions: [
          {
            id: "perm-cerrar",
            kind: "permiso",
            transitionId: "t_cerrar",
            allowedRoles: ["operaciones", "gerente"],
          },
        ],
        compliance: [
          {
            id: "comp-factura",
            kind: "cumplimiento",
            transitionId: "t_cerrar",
            requiredEvidence: { kind: "fisica", referenceType: "factura" },
            invariant: {
              id: "inv_factura",
              predicate: "field_present:factura_id",
              appliesInStates: ["en_entrega"],
              description: "Factura obligatoria antes del cierre",
            },
          },
        ],
      }),
      { catalog, activationAt },
    );

    // Estado en_entrega (aceptar + reservar)
    const eAceptar: TransitionEvent = {
      id: "e-a",
      kind: "transicion",
      subjectId: "tx-v",
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: "u1",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "ok",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      transitionId: "t_aceptar",
      fromStateId: "propuesta",
      toStateId: "aceptada",
    };
    const eReserva: TransitionEvent = {
      id: "e-r",
      kind: "transicion",
      subjectId: "tx-v",
      occurredAt: "2026-01-02T00:00:00.000Z",
      actorId: "sys",
      actorKind: "sistema",
      evidence: {
        kind: "sistema",
        reference: "reserva",
        recordedAt: "2026-01-02T00:00:00.000Z",
      },
      transitionId: "t_iniciar_entrega",
      fromStateId: "aceptada",
      toStateId: "en_entrega",
    };
    const derived = deriveState(life, [eAceptar, eReserva]);
    expect(derived.currentStateId).toBe("en_entrega");

    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-v",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_cerrar",
          eventId: "e-close-bad",
          actorId: "op",
          actorKind: "sistema",
          occurredAt: "2026-01-03T00:00:00.000Z",
          evidence: {
            kind: "fisica",
            reference: "albaran:1",
            recordedAt: "2026-01-03T00:00:00.000Z",
          },
        },
        actor: { id: "op", kind: "sistema", roles: ["operaciones"] },
        evidence: {
          kind: "fisica",
          reference: "albaran:1",
          recordedAt: "2026-01-03T00:00:00.000Z",
          referenceType: "albaran",
        },
        fields: { importe: 100 },
        ruleSet,
      }),
    ).toThrow(JudgeRejectionError);

    const trace = new CommunicationTrace();
    const trigger = eReserva;
    const factura = sendCommunication(
      {
        template: FACTURA_TEMPLATE,
        triggerEvent: trigger,
        variables: {
          doc_numero: "F-001",
          parte_ref: "parte:cliente-1",
          importe: "100",
        },
        occurredAt: "2026-01-03T01:00:00.000Z",
        actorId: "op",
        documentId: "doc-f001",
      },
      trace,
    );
    expect(factura.affectsState).toBe(false);
    expect(factura.evidence?.referenceType).toBe("factura");
    expect(trace.bySubject("tx-v")).toHaveLength(1);

    const closed = attemptJudgedAdvance({
      subjectId: "tx-v",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_cerrar",
        eventId: "e-close-ok",
        actorId: "op",
        actorKind: "sistema",
        occurredAt: "2026-01-03T02:00:00.000Z",
        evidence: {
          kind: "fisica",
          reference: factura.evidence!.reference,
          recordedAt: "2026-01-03T02:00:00.000Z",
        },
      },
      actor: { id: "op", kind: "sistema", roles: ["operaciones"] },
      evidence: {
        kind: "fisica",
        reference: factura.evidence!.reference,
        recordedAt: "2026-01-03T02:00:00.000Z",
        referenceType: "factura",
      },
      fields: { importe: 100, factura_id: "doc-f001" },
      ruleSet,
    });
    expect(closed.trace.result).toBe("accepted");
    expect(closed.event.toStateId).toBe("cerrada");
  });

  it("devolución dentro de 14 días no puede rechazarse (ni forzarse)", () => {
    const ruleSet = compilePolicies(
      baseDoc({
        permissions: [
          {
            id: "perm-cancel",
            kind: "permiso",
            transitionId: "t_cancelar_aceptada",
            allowedRoles: ["gerente", "vendedor", "operaciones"],
          },
          {
            id: "perm-force",
            kind: "permiso",
            action: "forzar",
            transitionId: "t_cancelar_aceptada",
            allowedRoles: ["gerente"],
          },
        ],
        compliance: [
          {
            id: "comp-desistimiento",
            kind: "cumplimiento",
            transitionId: "t_cancelar_aceptada",
            legalDeadline: {
              anchorField: "compra_at",
              durationMs: 14 * DAY,
              description:
                "Desistimiento 14 días: no se puede rechazar la devolución",
            },
          },
        ],
      }),
      { catalog, activationAt },
    );

    const eAceptar: TransitionEvent = {
      id: "e-a2",
      kind: "transicion",
      subjectId: "tx-dev",
      occurredAt: "2026-06-01T00:00:00.000Z",
      actorId: "u1",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "ok",
        recordedAt: "2026-06-01T00:00:00.000Z",
      },
      transitionId: "t_aceptar",
      fromStateId: "propuesta",
      toStateId: "aceptada",
    };
    const derived = deriveState(life, [eAceptar]);
    const compraAt = "2026-06-01T00:00:00.000Z";
    const day5 = "2026-06-06T00:00:00.000Z";

    const rejectAttempt = () =>
      attemptJudgedAdvance({
        subjectId: "tx-dev",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_cancelar_aceptada",
          eventId: "e-rej",
          actorId: "g1",
          actorKind: "humano",
          occurredAt: day5,
          evidence: {
            kind: "aceptacion",
            reference: "rechazo",
            recordedAt: day5,
          },
        },
        actor: {
          id: "g1",
          kind: "humano",
          roles: ["gerente", "vendedor", "operaciones"],
        },
        evidence: {
          kind: "aceptacion",
          reference: "rechazo",
          recordedAt: day5,
        },
        fields: { compra_at: compraAt },
        ruleSet,
        now: day5,
      });

    expect(rejectAttempt).toThrow(JudgeRejectionError);
    expect(rejectAttempt).toThrow(/Plazo legal abierto/);

    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-dev",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_cancelar_aceptada",
          eventId: "e-force",
          actorId: "g1",
          actorKind: "humano",
          occurredAt: day5,
          evidence: {
            kind: "aceptacion",
            reference: "rechazo",
            recordedAt: day5,
          },
        },
        actor: { id: "g1", kind: "humano", roles: ["gerente"] },
        evidence: {
          kind: "aceptacion",
          reference: "rechazo",
          recordedAt: day5,
        },
        fields: { compra_at: compraAt },
        ruleSet,
        now: day5,
        force: {
          reason: "cliente molesto",
          allowedForceRuleIds: ["legal:comp-desistimiento"],
        },
      }),
    ).toThrow(ForceNotAllowedError);

    // Tras 14 días sí se puede rechazar
    const day15 = "2026-06-16T00:00:00.000Z";
    const ok = attemptJudgedAdvance({
      subjectId: "tx-dev",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_cancelar_aceptada",
        eventId: "e-ok",
        actorId: "g1",
        actorKind: "humano",
        occurredAt: day15,
        evidence: {
          kind: "aceptacion",
          reference: "rechazo",
          recordedAt: day15,
        },
      },
      actor: { id: "g1", kind: "humano", roles: ["gerente"] },
      evidence: {
        kind: "aceptacion",
        reference: "rechazo",
        recordedAt: day15,
      },
      fields: { compra_at: compraAt },
      ruleSet,
      now: day15,
    });
    expect(ok.trace.result).toBe("accepted");
  });

  it("borrar PII de una Parte deja eventos intactos y sin datos identificables", () => {
    const store = new ParteIdentityStore();
    const tenant = "acme";
    store.put(
      tenant,
      "parte-1",
      {
        displayName: "Ana Pérez",
        email: "ana@example.com",
        taxId: "12345678Z",
        address: "Calle Falsa 1",
      },
      "2026-01-01T00:00:00.000Z",
    );

    const eventData = {
      calculations: { precio: 100 },
      fieldsAfter: { parte_id: "parte-1", importe: 100 },
      facts: { parteId: "parte-1" },
    };
    expect(() => assertNoPiiInEventData(eventData)).not.toThrow();
    expect(() =>
      assertNoPiiInEventData({ email: "ana@example.com" }),
    ).toThrow(ParteIdentityError);

    const events: TransitionEvent[] = [
      {
        id: "e1",
        kind: "transicion",
        subjectId: "tx-1",
        occurredAt: "2026-01-02T00:00:00.000Z",
        actorId: "u1",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
        transitionId: "t_aceptar",
        fromStateId: "propuesta",
        toStateId: "aceptada",
        data: eventData,
      },
    ];
    const before = JSON.stringify(events);

    store.erase(tenant, "parte-1", "2026-03-01T00:00:00.000Z");
    const after = JSON.stringify(events);
    expect(after).toBe(before);
    expect(store.eventsRemainIntact()).toBe(true);

    const resolved = store.resolve(tenant, "parte-1");
    expect(resolved.erased).toBe(true);
    expect(resolved.personal.displayName).toBe("[borrado]");
    expect(JSON.stringify(resolved)).not.toMatch(/Ana|example\.com|12345678/);

    // Reproducción del historial intacta
    const derived = deriveState(life, events);
    expect(derived.currentStateId).toBe("aceptada");
  });
});
