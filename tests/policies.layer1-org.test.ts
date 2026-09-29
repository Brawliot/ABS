import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../archetypes/venta.js";
import { deriveState } from "../core/derivation.js";
import {
  catalogFromLifecycle,
  compilePolicies,
  selectEffectiveRules,
} from "../policies/compiler.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
  applyCalculations,
} from "../policies/judge.js";
import type { PolicyDocument } from "../policies/types.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "descuento_pct", "credito_disponible", "factura_id", "precio"],
);
const activationAt = "2026-04-01T00:00:00.000Z";

const roles = [
  { id: "vendedor", label: "Vendedor" },
  { id: "gerente", label: "Gerente" },
  { id: "director", label: "Director" },
];

const org3: NonNullable<PolicyDocument["organization"]> = {
  sedes: [{ id: "sede-norte", label: "Norte" }],
  equipos: [{ id: "eq-ventas", label: "Ventas", sedeId: "sede-norte" }],
  assignments: [
    {
      actorId: "u-vendedor",
      sedeId: "sede-norte",
      equipoId: "eq-ventas",
      roleId: "vendedor",
      reportsTo: "u-gerente",
    },
    {
      actorId: "u-gerente",
      sedeId: "sede-norte",
      equipoId: "eq-ventas",
      roleId: "gerente",
      reportsTo: "u-director",
    },
    {
      actorId: "u-director",
      sedeId: "sede-norte",
      equipoId: "eq-ventas",
      roleId: "director",
    },
  ],
};

function baseDoc(over: Partial<PolicyDocument> = {}): PolicyDocument {
  return {
    id: "acme-layer1",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles,
    organization: org3,
    ...over,
  };
}

describe("Capa 1 — organización, permisos, políticas, vinculación", () => {
  it("aprobación del superior directo con jerarquía de 3 niveles", () => {
    const ruleSet = compilePolicies(
      baseDoc({
        permissions: [
          {
            id: "perm-aceptar",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor", "gerente", "director"],
          },
        ],
        policies: [
          {
            id: "pol-sup-directo",
            kind: "politica",
            transitionId: "t_aceptar",
            approval: {
              when: { field: "importe", op: "gt", value: 5000 },
              requiredDirectSuperior: true,
            },
          },
        ],
      }),
      { catalog, activationAt },
    );

    expect(ruleSet.actorDirectory["u-vendedor"]?.reportsTo).toBe("u-gerente");
    expect(ruleSet.actorDirectory["u-gerente"]?.reportsTo).toBe("u-director");
    expect(ruleSet.actorDirectory["u-director"]?.reportsTo).toBeUndefined();

    const derived = deriveState(life, []);
    const base = {
      subjectId: "tx-sup",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_aceptar" as const,
        eventId: "e1",
        actorId: "u-vendedor",
        actorKind: "humano" as const,
        occurredAt: "2026-01-01T00:00:00.000Z",
        evidence: {
          kind: "aceptacion" as const,
          reference: "ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      actor: {
        id: "u-vendedor",
        kind: "humano" as const,
        roles: ["vendedor"],
      },
      subjectActorId: "u-vendedor",
      fields: { importe: 8000 },
      ruleSet,
    };

    expect(() =>
      attemptJudgedAdvance({
        ...base,
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
          evidencingActorId: "u-director",
        },
      }),
    ).toThrow(JudgeRejectionError);

    const ok = attemptJudgedAdvance({
      ...base,
      evidence: {
        kind: "aceptacion",
        reference: "ok",
        recordedAt: "2026-01-01T00:00:00.000Z",
        evidencingActorId: "u-gerente",
      },
    });
    expect(ok.trace.result).toBe("accepted");
  });

  it("subida de precio no altera una transacción ya creada (at_create)", () => {
    const docV1 = baseDoc({
      version: "1.0.0",
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
          id: "pol-precio",
          kind: "politica",
          transitionId: "t_aceptar",
          calculation: { field: "precio", op: "set", value: 100 },
        },
      ],
    });
    const creation = compilePolicies(docV1, {
      catalog,
      activationAt,
      compiledVersion: "compiled:1.0.0",
    });

    const docV2 = baseDoc({
      version: "2.0.0",
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
          id: "pol-precio",
          kind: "politica",
          transitionId: "t_aceptar",
          calculation: { field: "precio", op: "set", value: 150 },
        },
      ],
    });
    const live = compilePolicies(docV2, {
      catalog,
      activationAt: "2026-05-01T00:00:00.000Z",
      compiledVersion: "compiled:2.0.0",
    });

    const calcOnly = creation.rules.find((r) => r.kind === "calculation");
    expect(calcOnly?.binding.mode).toBe("at_create");

    const effective = selectEffectiveRules({
      ruleSet: live,
      creationRuleSet: creation,
    });
    const { calculations } = applyCalculations(
      effective,
      "t_aceptar",
      { importe: 1 },
    );
    expect(calculations.precio).toBe(100);

    const derived = deriveState(life, []);
    const result = attemptJudgedAdvance({
      subjectId: "tx-precio",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_aceptar",
        eventId: "e-precio",
        actorId: "u-vendedor",
        actorKind: "humano",
        occurredAt: "2026-06-01T00:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-06-01T00:00:00.000Z",
        },
      },
      actor: { id: "u-vendedor", kind: "humano", roles: ["vendedor"] },
      evidence: {
        kind: "aceptacion",
        reference: "ok",
        recordedAt: "2026-06-01T00:00:00.000Z",
      },
      fields: { importe: 500 },
      ruleSet: live,
      creationRuleSet: creation,
    });
    expect(result.calculations.precio).toBe(100);
    expect(result.fieldsAfter.precio).toBe(100);
  });

  it("retirar un permiso se aplica de inmediato (live)", () => {
    const withPerm = compilePolicies(
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
            id: "pol-precio",
            kind: "politica",
            transitionId: "t_aceptar",
            calculation: { field: "precio", op: "set", value: 100 },
          },
        ],
      }),
      { catalog, activationAt, compiledVersion: "with-perm" },
    );

    const withoutPerm = compilePolicies(
      baseDoc({
        version: "1.0.1",
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
            id: "pol-precio",
            kind: "politica",
            transitionId: "t_aceptar",
            calculation: { field: "precio", op: "set", value: 100 },
          },
        ],
      }),
      {
        catalog,
        activationAt: "2026-05-01T00:00:00.000Z",
        compiledVersion: "no-perm",
      },
    );

    const guard = withoutPerm.rules.find((r) => r.kind === "guard");
    expect(guard?.binding.mode).toBe("live");

    const derived = deriveState(life, []);
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-live",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_aceptar",
          eventId: "e-live",
          actorId: "u-vendedor",
          actorKind: "humano",
          occurredAt: "2026-06-01T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: "2026-06-01T00:00:00.000Z",
          },
        },
        actor: { id: "u-vendedor", kind: "humano", roles: ["vendedor"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-06-01T00:00:00.000Z",
        },
        fields: { importe: 100 },
        ruleSet: withoutPerm,
        creationRuleSet: withPerm,
      }),
    ).toThrow(/rol requerido/);
  });

  it("una restricción rechaza aunque el actor tenga todos los permisos", () => {
    const ruleSet = compilePolicies(
      baseDoc({
        permissions: [
          {
            id: "perm-aceptar",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor", "gerente", "director"],
          },
        ],
        policies: [
          {
            id: "pol-tope",
            kind: "politica",
            transitionId: "t_aceptar",
            restriction: { field: "importe", op: "gt", value: 50000 },
          },
        ],
      }),
      { catalog, activationAt },
    );

    const restr = ruleSet.rules.find((r) => r.kind === "condition");
    expect(restr).toMatchObject({
      isRestriction: true,
      priority: 150,
    });

    const derived = deriveState(life, []);
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-restr",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_aceptar",
          eventId: "e-restr",
          actorId: "u-director",
          actorKind: "humano",
          occurredAt: "2026-01-01T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        actor: {
          id: "u-director",
          kind: "humano",
          roles: ["vendedor", "gerente", "director"],
        },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        fields: { importe: 60000 },
        ruleSet,
      }),
    ).toThrow(/Restricción/);

    const ok = attemptJudgedAdvance({
      subjectId: "tx-restr-ok",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_aceptar",
        eventId: "e-restr-ok",
        actorId: "u-director",
        actorKind: "humano",
        occurredAt: "2026-01-01T00:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      actor: {
        id: "u-director",
        kind: "humano",
        roles: ["vendedor", "gerente", "director"],
      },
      evidence: {
        kind: "aceptacion",
        reference: "ok",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      fields: { importe: 1000 },
      ruleSet,
    });
    expect(ok.trace.result).toBe("accepted");
  });

  it("consultar y forzar compilan a visibility / force_grant", () => {
    const ruleSet = compilePolicies(
      baseDoc({
        permissions: [
          {
            id: "perm-ver",
            kind: "permiso",
            action: "consultar",
            allowedRoles: ["gerente"],
            visibility: { scope: "sede" },
          },
          {
            id: "perm-force",
            kind: "permiso",
            action: "forzar",
            transitionId: "t_aceptar",
            allowedRoles: ["director"],
          },
          {
            id: "perm-ejecutar",
            kind: "permiso",
            action: "ejecutar",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor"],
          },
        ],
      }),
      { catalog, activationAt },
    );

    expect(ruleSet.rules.some((r) => r.kind === "visibility")).toBe(true);
    expect(ruleSet.rules.some((r) => r.kind === "force_grant")).toBe(true);
    expect(
      ruleSet.rules.some((r) => r.kind === "guard" && r.action === "ejecutar"),
    ).toBe(true);
  });
});
