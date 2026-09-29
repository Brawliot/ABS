import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../archetypes/venta.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
  evaluateWithEmbeddedRuleSet,
  explainJudgeRejection,
  reconstructFieldsFromEvents,
} from "../policies/judge.js";
import type { CompiledRuleSet, PolicyDocument } from "../policies/types.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "descuento_pct", "credito_disponible", "factura_id", "precio"],
);
const activationAt = "2026-04-01T00:00:00.000Z";

function compile(doc: PolicyDocument): CompiledRuleSet {
  return compilePolicies(doc, { catalog, activationAt });
}

function baseRolesDoc(
  over: Partial<PolicyDocument> = {},
): PolicyDocument {
  return {
    id: "acme-judge",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "gerente", label: "Gerente" },
      { id: "operaciones", label: "Operaciones" },
    ],
    ...over,
  };
}

const fullPack = compile(
  baseRolesDoc({
    permissions: [
      {
        id: "perm-aceptar",
        kind: "permiso",
        transitionId: "t_aceptar",
        allowedRoles: ["vendedor", "gerente"],
      },
      {
        id: "perm-cerrar",
        kind: "permiso",
        transitionId: "t_cerrar",
        allowedRoles: ["operaciones", "gerente"],
      },
    ],
    policies: [
      {
        id: "pol-aprobacion-alto-valor",
        kind: "politica",
        transitionId: "t_aceptar",
        approval: {
          when: { field: "importe", op: "gt", value: 10000 },
          requiredRole: "gerente",
        },
      },
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
        invariant: {
          id: "inv_factura",
          predicate: "field_present:factura_id",
          appliesInStates: ["en_entrega"],
          description: "Factura obligatoria antes del cierre",
        },
      },
    ],
  }),
);

describe("Juez — guardas de política en el pipeline", () => {
  it("un actor sin el rol requerido no puede ejecutar la transición", () => {
    const derived = deriveState(life, []);
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-1",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_aceptar",
          eventId: "e1",
          actorId: "u-ext",
          actorKind: "humano",
          occurredAt: "2026-01-01T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        actor: { id: "u-ext", kind: "humano", roles: ["becario"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        fields: { importe: 100 },
        ruleSet: fullPack,
      }),
    ).toThrow(JudgeRejectionError);

    try {
      attemptJudgedAdvance({
        subjectId: "tx-1",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_aceptar",
          eventId: "e1",
          actorId: "u-ext",
          actorKind: "humano",
          occurredAt: "2026-01-01T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        actor: { id: "u-ext", kind: "humano", roles: ["becario"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        fields: { importe: 100 },
        ruleSet: fullPack,
      });
    } catch (err) {
      const e = err as JudgeRejectionError;
      expect(e.trace.result).toBe("rejected");
      expect(e.trace.ruleSetVersion).toBe(fullPack.version);
      expect(explainJudgeRejection(e.trace)).toMatch(/rol|regla=/i);
      expect(e.trace.guardsEvaluated.some((g) => g.result === "rejected")).toBe(
        true,
      );
    }
  });

  it("pedido de 12.000 € no avanza sin aceptación del gerente; con ella, sí", () => {
    const derived = deriveState(life, []);
    const base = {
      subjectId: "tx-hi",
      lifecycle: life,
      derived,
      fields: { importe: 12000 },
      ruleSet: fullPack,
    } as const;

    expect(() =>
      attemptJudgedAdvance({
        ...base,
        command: {
          transitionId: "t_aceptar",
          eventId: "e-no",
          actorId: "v1",
          actorKind: "humano",
          occurredAt: "2026-01-01T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "cli",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        actor: { id: "v1", kind: "humano", roles: ["vendedor"] },
        evidence: {
          kind: "aceptacion",
          reference: "cli",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toThrow(/gerente/i);

    const ok = attemptJudgedAdvance({
      ...base,
      command: {
        transitionId: "t_aceptar",
        eventId: "e-yes",
        actorId: "g1",
        actorKind: "humano",
        occurredAt: "2026-01-01T00:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "gerente-ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      actor: { id: "g1", kind: "humano", roles: ["gerente"] },
      evidence: {
        kind: "aceptacion",
        reference: "gerente-ok",
        recordedAt: "2026-01-01T00:00:00.000Z",
        evidencingRoles: ["gerente"],
      },
    });
    expect(ok.trace.result).toBe("accepted");
    expect(ok.event.toStateId).toBe("aceptada");
  });

  it("no se puede cerrar sin la factura exigida por Cumplimiento", () => {
    const toEntrega: TransitionEvent[] = [
      {
        id: "a1",
        kind: "transicion",
        subjectId: "tx-f",
        occurredAt: "2026-01-01T00:00:00.000Z",
        actorId: "g",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "a",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        transitionId: "t_aceptar",
        fromStateId: "propuesta",
        toStateId: "aceptada",
      },
      {
        id: "a2",
        kind: "transicion",
        subjectId: "tx-f",
        occurredAt: "2026-01-01T01:00:00.000Z",
        actorId: "s",
        actorKind: "sistema",
        evidence: {
          kind: "sistema",
          reference: "res",
          recordedAt: "2026-01-01T01:00:00.000Z",
        },
        transitionId: "t_iniciar_entrega",
        fromStateId: "aceptada",
        toStateId: "en_entrega",
      },
    ];
    const derived = deriveState(life, toEntrega);
    expect(derived.currentStateId).toBe("en_entrega");

    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-f",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_cerrar",
          eventId: "c-bad",
          actorId: "op",
          actorKind: "sistema",
          occurredAt: "2026-01-02T00:00:00.000Z",
          evidence: {
            kind: "fisica",
            reference: "albaran:1",
            recordedAt: "2026-01-02T00:00:00.000Z",
          },
          world: {
            balance: 0,
            resourcesSettled: true,
            evidenceComplete: true,
          },
        },
        actor: { id: "op", kind: "sistema", roles: ["operaciones"] },
        evidence: {
          kind: "fisica",
          reference: "albaran:1",
          recordedAt: "2026-01-02T00:00:00.000Z",
          referenceType: "albaran",
        },
        fields: {},
        ruleSet: fullPack,
      }),
    ).toThrow(JudgeRejectionError);

    // Sin factura_id el invariante también bloquea aunque el kind sea factura
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-f",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_cerrar",
          eventId: "c-inv",
          actorId: "op",
          actorKind: "sistema",
          occurredAt: "2026-01-02T00:00:00.000Z",
          evidence: {
            kind: "fisica",
            reference: "factura:1",
            recordedAt: "2026-01-02T00:00:00.000Z",
          },
          world: {
            balance: 0,
            resourcesSettled: true,
            evidenceComplete: true,
          },
        },
        actor: { id: "op", kind: "sistema", roles: ["operaciones"] },
        evidence: {
          kind: "fisica",
          reference: "factura:1",
          recordedAt: "2026-01-02T00:00:00.000Z",
          referenceType: "factura",
        },
        fields: {},
        ruleSet: fullPack,
      }),
    ).toThrow(/factura/i);

    const closed = attemptJudgedAdvance({
      subjectId: "tx-f",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_cerrar",
        eventId: "c-ok",
        actorId: "op",
        actorKind: "sistema",
        occurredAt: "2026-01-02T00:00:00.000Z",
        evidence: {
          kind: "fisica",
          reference: "factura:99",
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
        world: {
          balance: 0,
          resourcesSettled: true,
          evidenceComplete: true,
        },
      },
      actor: { id: "op", kind: "sistema", roles: ["operaciones"] },
      evidence: {
        kind: "fisica",
        reference: "factura:99",
        recordedAt: "2026-01-02T00:00:00.000Z",
        referenceType: "factura",
      },
      fields: { factura_id: "F-99" },
      ruleSet: fullPack,
    });
    expect(closed.event.toStateId).toBe("cerrada");
  });

  it("el precio calculado queda en el evento y coincide al reproducir", () => {
    const derived = deriveState(life, []);
    const result = attemptJudgedAdvance({
      subjectId: "tx-p",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_aceptar",
        eventId: "e-precio",
        actorId: "g1",
        actorKind: "humano",
        occurredAt: "2026-01-01T00:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      actor: { id: "g1", kind: "humano", roles: ["gerente"] },
      evidence: {
        kind: "aceptacion",
        reference: "ok",
        recordedAt: "2026-01-01T00:00:00.000Z",
        evidencingRoles: ["gerente"],
      },
      fields: { importe: 12000, precio: 0 },
      ruleSet: fullPack,
    });

    expect(result.calculations.precio).toBe(12000);
    expect(result.event.data).toMatchObject({
      calculations: { precio: 12000 },
      ruleSetVersion: fullPack.version,
      ruleSetContentHash: fullPack.contentHash,
    });

    const replayed = reconstructFieldsFromEvents([result.event], {
      importe: 12000,
      precio: 0,
    });
    expect(replayed.precio).toBe(12000);
    expect(replayed.precio).toBe(result.calculations.precio);
  });

  it("cambiar el CompiledRuleSet no altera la evaluación de eventos pasados", () => {
    const derived = deriveState(life, []);
    const past = attemptJudgedAdvance({
      subjectId: "tx-hist",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_aceptar",
        eventId: "e-hist",
        actorId: "g1",
        actorKind: "humano",
        occurredAt: "2026-01-01T00:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      actor: { id: "g1", kind: "humano", roles: ["gerente"] },
      evidence: {
        kind: "aceptacion",
        reference: "ok",
        recordedAt: "2026-01-01T00:00:00.000Z",
        evidencingRoles: ["gerente"],
      },
      fields: { importe: 500 },
      ruleSet: fullPack,
    });

    const stricter = compile(
      baseRolesDoc({
        version: "2.0.0",
        permissions: [
          {
            id: "perm-aceptar",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["gerente"],
          },
        ],
        policies: [
          {
            id: "pol-bloquea-todo",
            kind: "politica",
            transitionId: "t_aceptar",
            condition: { field: "importe", op: "lt", value: 0 },
          },
        ],
      }),
    );

    // Re-evaluación histórica con el RuleSet embebido (el del pasado)
    const again = evaluateWithEmbeddedRuleSet({
      subjectId: "tx-hist",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_aceptar",
        eventId: "e-hist-2",
        actorId: "g1",
        actorKind: "humano",
        occurredAt: "2026-01-01T00:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      actor: { id: "g1", kind: "humano", roles: ["gerente"] },
      evidence: {
        kind: "aceptacion",
        reference: "ok",
        recordedAt: "2026-01-01T00:00:00.000Z",
        evidencingRoles: ["gerente"],
      },
      fields: { importe: 500 },
      historicalRuleSet: fullPack,
    });
    expect(again.trace.result).toBe("accepted");
    expect(again.trace.ruleSetContentHash).toBe(fullPack.contentHash);
    expect(again.trace.ruleSetContentHash).not.toBe(stricter.contentHash);

    // El RuleSet nuevo sí rechazaría la misma transición "hoy"
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-hist",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_aceptar",
          eventId: "e-new",
          actorId: "g1",
          actorKind: "humano",
          occurredAt: "2026-06-01T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: "2026-06-01T00:00:00.000Z",
          },
        },
        actor: { id: "g1", kind: "humano", roles: ["gerente"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-06-01T00:00:00.000Z",
        },
        fields: { importe: 500 },
        ruleSet: stricter,
      }),
    ).toThrow(JudgeRejectionError);

    expect(past.event.data?.ruleSetContentHash).toBe(fullPack.contentHash);
  });

  it("la traza explica cada rechazo con la regla y la versión aplicadas", () => {
    const derived = deriveState(life, []);
    try {
      attemptJudgedAdvance({
        subjectId: "tx-tr",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_aceptar",
          eventId: "e-tr",
          actorId: "v",
          actorKind: "humano",
          occurredAt: "2026-01-01T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "x",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        actor: { id: "v", kind: "humano", roles: ["vendedor"] },
        evidence: {
          kind: "aceptacion",
          reference: "x",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        fields: { importe: 12000 },
        ruleSet: fullPack,
      });
      expect.unreachable();
    } catch (err) {
      const e = err as JudgeRejectionError;
      expect(e.trace.ruleSetVersion).toBe(fullPack.version);
      expect(e.trace.ruleSetContentHash).toBe(fullPack.contentHash);
      expect(e.trace.appliedRuleId).toMatch(/evidence:/);
      const text = explainJudgeRejection(e.trace);
      expect(text).toContain(e.trace.appliedRuleId!);
      expect(text).toContain(fullPack.version);
      expect(e.trace.guardsEvaluated.length).toBeGreaterThan(0);
      expect(
        e.trace.guardsEvaluated.every((g) => g.ruleId && g.reason),
      ).toBe(true);
    }
  });
});
