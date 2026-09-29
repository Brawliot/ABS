import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../archetypes/venta.js";
import {
  catalogFromLifecycle,
  compilePolicies,
  isEvidenceRequirement,
  ruleSetTouchesMachineStructure,
  validateCompiledRuleSet,
} from "../policies/compiler.js";
import {
  PolicyCompileError,
  type PolicyDocument,
} from "../policies/types.js";

const ventaCatalog = catalogFromLifecycle(
  ventaArchetype.lifecycle.transitions.map((t) => t.id),
  ventaArchetype.lifecycle.states.map((s) => s.id),
  [
    "importe",
    "descuento_pct",
    "credito_disponible",
    "factura_id",
    "precio",
  ],
);

const activationAt = "2026-04-01T00:00:00.000Z";

function baseDoc(over: Partial<PolicyDocument> = {}): PolicyDocument {
  return {
    id: "acme-venta",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "gerente", label: "Gerente" },
    ],
    ...over,
  };
}

describe("Compilador de políticas (MVP capa 1)", () => {
  it("pedidos > 10.000 € requieren aprobación del gerente → evidencia, sin estados nuevos", () => {
    const doc = baseDoc({
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
      ],
    });

    const compiled = compilePolicies(doc, {
      catalog: ventaCatalog,
      activationAt,
    });
    validateCompiledRuleSet(compiled, ventaCatalog);

    const evidence = compiled.rules.filter(isEvidenceRequirement);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      kind: "evidence_requirement",
      transitionId: "t_aceptar",
      evidenceKind: "aceptacion",
      requiredRole: "gerente",
      when: { field: "importe", op: "gt", value: 10000 },
    });

    expect(ruleSetTouchesMachineStructure(compiled)).toBe(false);
    expect(compiled.rules.some((r) => "from" in r || "to" in r)).toBe(false);
    expect(JSON.stringify(compiled)).not.toMatch(/"states"\s*:/);
    expect(JSON.stringify(compiled)).not.toMatch(/"transitions"\s*:/);
  });

  it("dos descuentos contradictorios para el mismo segmento se rechazan", () => {
    const doc = baseDoc({
      policies: [
        {
          id: "dto-a",
          kind: "politica",
          transitionId: "t_aceptar",
          segment: "retail",
          calculation: {
            field: "descuento_pct",
            op: "set",
            value: 10,
            segment: "retail",
          },
        },
        {
          id: "dto-b",
          kind: "politica",
          transitionId: "t_aceptar",
          segment: "retail",
          calculation: {
            field: "descuento_pct",
            op: "set",
            value: 20,
            segment: "retail",
          },
        },
      ],
    });

    expect(() =>
      compilePolicies(doc, { catalog: ventaCatalog, activationAt }),
    ).toThrow(PolicyCompileError);

    try {
      compilePolicies(doc, { catalog: ventaCatalog, activationAt });
    } catch (err) {
      expect(err).toBeInstanceOf(PolicyCompileError);
      expect((err as PolicyCompileError).code).toBe("CONTRADICTION");
      expect((err as Error).message).toMatch(/descuento/i);
    }
  });

  it("una política que referencia una transición inexistente se rechaza", () => {
    const doc = baseDoc({
      permissions: [
        {
          id: "perm-x",
          kind: "permiso",
          transitionId: "t_no_existe",
          allowedRoles: ["gerente"],
        },
      ],
    });

    expect(() =>
      compilePolicies(doc, { catalog: ventaCatalog, activationAt }),
    ).toThrow(/Transición inexistente/);

    try {
      compilePolicies(doc, { catalog: ventaCatalog, activationAt });
    } catch (err) {
      expect((err as PolicyCompileError).code).toBe("UNKNOWN_TRANSITION");
    }
  });

  it("una política que intenta crear un estado se rechaza", () => {
    const doc = {
      ...baseDoc({
        permissions: [
          {
            id: "perm-ok",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["gerente"],
          },
        ],
      }),
      states: [{ id: "pendiente_aprobacion_gerente", kind: "en_espera" }],
    } as PolicyDocument;

    expect(() =>
      compilePolicies(doc, { catalog: ventaCatalog, activationAt }),
    ).toThrow(/estados\/transiciones|crear estado/i);

    try {
      compilePolicies(doc, { catalog: ventaCatalog, activationAt });
    } catch (err) {
      expect((err as PolicyCompileError).code).toBe("FORBIDDEN_STRUCTURE");
    }

    const withCreate = {
      ...baseDoc({
        policies: [
          {
            id: "bad",
            kind: "politica",
            transitionId: "t_aceptar",
            condition: { field: "importe", op: "gt", value: 1 },
          },
        ],
      }),
      createState: { id: "aprobacion" },
    } as PolicyDocument;

    expect(() =>
      compilePolicies(withCreate, { catalog: ventaCatalog, activationAt }),
    ).toThrow(PolicyCompileError);
  });

  it("compilar dos veces la misma entrada produce una salida idéntica", () => {
    const doc = baseDoc({
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
          id: "pol-credito",
          kind: "politica",
          transitionId: "t_aceptar",
          condition: { field: "credito_disponible", op: "gte", value: 0 },
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
            description: "Factura obligatoria",
          },
        },
      ],
    });

    const a = compilePolicies(doc, { catalog: ventaCatalog, activationAt });
    const b = compilePolicies(doc, { catalog: ventaCatalog, activationAt });

    expect(a).toEqual(b);
    expect(a.contentHash).toBe(b.contentHash);
    validateCompiledRuleSet(a, ventaCatalog);

    // Prioridad: cumplimiento antes que permiso/política
    const priorities = a.rules.map((r) => r.priority);
    expect(priorities[0]).toBeGreaterThanOrEqual(priorities[priorities.length - 1]!);
    expect(a.rules.some((r) => r.sourceKind === "cumplimiento" && r.priority === 300)).toBe(
      true,
    );
  });
});
