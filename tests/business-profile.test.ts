/**
 * Contrato BusinessProfile v1.1: validación, materialización, pack migrado.
 */

import { describe, expect, it, vi } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BusinessProfileError,
  businessProfileToGeneratorInput,
  JsonFileBusinessProfileSource,
  loadBusinessProfile,
  loadGeneratorInput,
  materializeBusinessProfile,
  materializeBusinessProfileDetailed,
  readProfileJson,
  validateBusinessProfile,
} from "../contracts/business-profile/index.js";
import {
  buildConcesionariaGeneratorInput,
  buildConcesionariaGeneratorInputWithComposition,
  composeConcesionaria,
  CONCESIONARIA_COMPOSITION,
  CONCESIONARIA_PROFILE_PATH,
  CONCESIONARIA_SYSTEM_IDS,
  concesionariaPolicyDocument,
} from "../generator/packs/concesionaria.js";
import {
  generateUiSpec,
} from "../generator/generate.js";
import { functionalFingerprint } from "../generator/oracle.js";
import { financieraArchetype } from "../archetypes/financiera.js";
import { requireArchetype } from "../archetypes/catalog.js";
import { concesionariaCase } from "../spec/cases.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import type { PolicyDocument } from "../policies/types.js";
import type { GeneratorInput } from "../generator/types.js";
import { known, unknownField, notApplicable } from "../contracts/business-profile/field.js";

const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../contracts/business-profile/fixtures",
);

/** Réplica del pack histórico (antes del contrato) para golden structuralHash. */
function legacyConcesionariaGeneratorInput(
  generatedAt = "2026-06-01T00:00:00.000Z",
): GeneratorInput {
  const venta = requireArchetype("venta");
  const servicio = requireArchetype("servicio_proyecto");
  const financiera = financieraArchetype;
  const activationAt = "2026-04-01T00:00:00.000Z";
  const transitionIds = [
    ...venta.lifecycle.transitions.map((t) => t.id),
    ...servicio.lifecycle.transitions.map((t) => t.id),
    ...financiera.lifecycle.transitions.map((t) => t.id),
  ];
  const unique = [...new Set(transitionIds)];

  const doc: PolicyDocument = {
    id: "pol-concesionaria",
    version: "1.0.0",
    companyId: "concesionaria-demo",
    archetypeId: "venta",
    roles: [
      { id: "comercial", label: "Comercial" },
      { id: "gerente", label: "Gerente" },
      { id: "taller", label: "Jefe de taller" },
      { id: "finanzas", label: "Finanzas" },
      { id: "cliente", label: "Cliente" },
    ],
    calendar: {
      id: "cal-taller",
      weeklyHours: {
        1: [{ start: "08:00", end: "18:00" }],
        2: [{ start: "08:00", end: "18:00" }],
        3: [{ start: "08:00", end: "18:00" }],
        4: [{ start: "08:00", end: "18:00" }],
        5: [{ start: "08:00", end: "18:00" }],
      },
      seasons: [],
      shifts: [
        {
          id: "turno-taller",
          label: "Taller mañana",
          weekdays: [1, 2, 3, 4, 5],
          window: { start: "08:00", end: "14:00" },
          actorIds: ["u-taller"],
          recursoIds: ["box-1"],
        },
      ],
    },
    permissions: [
      {
        id: "perm-aceptar",
        kind: "permiso",
        transitionId: "t_aceptar",
        allowedRoles: ["comercial", "gerente"],
      },
      {
        id: "perm-cerrar",
        kind: "permiso",
        transitionId: "t_cerrar",
        allowedRoles: ["finanzas", "gerente"],
      },
      {
        id: "perm-taller-acordar",
        kind: "permiso",
        transitionId: "t_acordar",
        allowedRoles: ["taller", "gerente"],
      },
      {
        id: "perm-ver-cliente",
        kind: "permiso",
        action: "consultar",
        allowedRoles: ["cliente"],
        visibility: { scope: "propia" },
      },
      ...unique
        .filter((id) => !["t_aceptar", "t_cerrar", "t_acordar"].includes(id))
        .map((id) => ({
          id: `perm-${id}`,
          kind: "permiso" as const,
          transitionId: id,
          allowedRoles: ["gerente"] as const,
        })),
    ],
    compliance: [
      {
        id: "comp-factura",
        kind: "cumplimiento",
        transitionId: "t_cerrar",
        requiredEvidence: { kind: "fisica", referenceType: "factura" },
        dataRetention: {
          description: "Conservación fiscal de facturas 5 años",
        },
      },
    ],
  };

  const catalog = catalogFromLifecycle(
    [
      ...venta.lifecycle.transitions.map((t) => t.id),
      ...servicio.lifecycle.transitions.map((t) => t.id),
      ...financiera.lifecycle.transitions.map((t) => t.id),
    ],
    [
      ...venta.lifecycle.states.map((s) => s.id),
      ...servicio.lifecycle.states.map((s) => s.id),
      ...financiera.lifecycle.states.map((s) => s.id),
    ],
    ["importe", "factura_id", "parte_id", "compra_at"],
  );

  const ruleSet = compilePolicies(doc, {
    catalog,
    activationAt,
    compiledVersion: "compiled:concesionaria-1",
  });

  return {
    caseId: concesionariaCase.id,
    caseVersion: concesionariaCase.version,
    companyId: doc.companyId,
    generatedAt,
    lifecycles: [
      {
        id: "lc.venta",
        archetypeId: "venta",
        lifecycle: venta.lifecycle,
        label: "Venta vehículo",
      },
      {
        id: "lc.financiera",
        archetypeId: "financiera",
        lifecycle: financiera.lifecycle,
        label: "Financiación",
      },
      {
        id: "lc.taller",
        archetypeId: "servicio_proyecto",
        lifecycle: servicio.lifecycle,
        label: "taller",
      },
    ],
    ruleSet,
    roles: doc.roles,
    channels: ["backoffice", "taller"],
    resourceSubtypes: ["capacidad_temporal"],
    naturalezaBienes: ["propios_unitarios"],
    paymentMode: "financiado",
    hasPartes: true,
    hasMovimientos: true,
    hasFormalDocuments: true,
    hasFiscalCompliance: true,
    hasCalendar: true,
  };
}

describe("BusinessProfile v1.1 — contrato de entrada", () => {
  /**
   * DECISIÓN 2026-09-28: se retira la paridad structuralHash legacy↔migrado.
   * Motivo: la UI pasa a organizarse por processGroups/composition del compositor;
   * el hash estructural incluye paneles de bloqueo y ya no es el contrato de
   * equivalencia. Sustituido por fingerprint funcional + composición de referencia.
   */
  it("pack concesionaria: equivalencia funcional legacy↔migrado + composición del compositor", () => {
    const legacy = generateUiSpec(legacyConcesionariaGeneratorInput());
    const migrated = generateUiSpec(buildConcesionariaGeneratorInput());
    const composedSpec = generateUiSpec(
      buildConcesionariaGeneratorInputWithComposition(),
    );

    const fl = functionalFingerprint(legacy);
    const fm = functionalFingerprint(migrated);
    expect(fm.states).toEqual(fl.states);
    expect(fm.actions).toEqual(fl.actions);
    expect(fm.actionRoles).toEqual(fl.actionRoles);

    expect(migrated.modules.map((m) => m.id).sort()).toEqual(
      legacy.modules.map((m) => m.id).sort(),
    );
    expect(migrated.modules.some((m) => m.id === "mod.tpv")).toBe(false);
    expect(migrated.modules.some((m) => m.id === "mod.inventario")).toBe(false);

    // Composición de referencia (spec) ≡ salida del compositor
    expect(composeConcesionaria()).toEqual(CONCESIONARIA_COMPOSITION);
    const composedInput = buildConcesionariaGeneratorInputWithComposition();
    expect(composedInput.composition).toEqual(CONCESIONARIA_COMPOSITION);
    expect(
      composedSpec.processGroups?.some((g) => g.role === "secondary"),
    ).toBe(true);
    const fc = functionalFingerprint(composedSpec);
    expect(fc.states).toEqual(fm.states);
    expect(fc.actions).toEqual(fm.actions);
    expect(fc.actionRoles).toEqual(fm.actionRoles);
  });

  it("fuente JSON carga el perfil v1.1 sin ids técnicos", async () => {
    const source = new JsonFileBusinessProfileSource(CONCESIONARIA_PROFILE_PATH);
    const profile = await loadBusinessProfile(source);
    expect(profile.schemaVersion).toBe("1.1.0");
    expect(profile.identity.companyId).toBe("concesionaria-demo");
    expect(
      (profile.identity as { caseId?: string }).caseId,
    ).toBeUndefined();
    expect(profile.naturalezaBienes.status).toBe("known");
    const input = await loadGeneratorInput(source, {
      generatedAt: "2026-06-01T00:00:00.000Z",
      systemIds: CONCESIONARIA_SYSTEM_IDS,
    });
    expect(input.caseId).toBe("case-concesionaria");
    expect(input.naturalezaBienes).toEqual(["propios_unitarios"]);
  });

  it("calendario unknown + tiene citas → default L-V 9-18 con confirmación", () => {
    const raw = readProfileJson(CONCESIONARIA_PROFILE_PATH) as Record<
      string,
      unknown
    >;
    const profile = validateBusinessProfile({
      ...raw,
      calendar: unknownField(),
      location: known({ countryCode: "ES" }),
    });
    const result = materializeBusinessProfileDetailed(profile, {
      systemIds: CONCESIONARIA_SYSTEM_IDS,
    });
    expect(result.confirmations.some((c) => c.includes("L-V"))).toBe(true);
    expect(result.input.hasCalendar).toBe(true);
    expect(result.input.ruleSet.calendar?.weeklyHours[1]?.[0]?.start).toBe(
      "09:00",
    );
  });

  it("versión no soportada se rechaza", () => {
    const raw = readProfileJson(resolve(FIXTURES, "invalid-version.json"));
    try {
      validateBusinessProfile(raw);
      expect.fail("debía lanzar");
    } catch (e) {
      expect((e as BusinessProfileError).code).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("esquema inválido se rechaza", () => {
    const raw = readProfileJson(resolve(FIXTURES, "invalid-schema.json"));
    try {
      validateBusinessProfile(raw);
      expect.fail("debía lanzar");
    } catch (e) {
      expect((e as BusinessProfileError).code).toBe("SCHEMA");
    }
  });

  it("contradicción inventario sin Partes se rechaza", () => {
    const raw = readProfileJson(
      resolve(FIXTURES, "invalid-contradiction-stock.json"),
    );
    try {
      validateBusinessProfile(raw);
      expect.fail("debía lanzar");
    } catch (e) {
      expect((e as BusinessProfileError).code).toBe("CONTRADICTION");
    }
  });

  it("perfil incompleto (permissionFallback unknown) no materializa", () => {
    const raw = readProfileJson(resolve(FIXTURES, "invalid-incomplete.json"));
    const profile = validateBusinessProfile(raw);
    try {
      materializeBusinessProfile(profile);
      expect.fail("debía lanzar");
    } catch (e) {
      expect((e as BusinessProfileError).code).toBe("INCOMPLETE");
    }
  });

  it("entrada inválida nunca alcanza generateUiSpec", () => {
    const gen = vi.fn(generateUiSpec);
    const raw = readProfileJson(resolve(FIXTURES, "invalid-version.json"));
    expect(() => {
      const input = businessProfileToGeneratorInput(raw);
      gen(input);
    }).toThrow(BusinessProfileError);
    expect(gen).not.toHaveBeenCalled();
  });

  it("concesionariaPolicyDocument alineado con system ids", () => {
    const doc = concesionariaPolicyDocument();
    expect(doc.id).toBe(CONCESIONARIA_SYSTEM_IDS.documentId);
    const input = buildConcesionariaGeneratorInput();
    expect(input.ruleSet.sourceDocumentId).toBe("pol-concesionaria");
  });

  it("autoservicio añade rol cliente y visibilidad propia", () => {
    const raw = readProfileJson(CONCESIONARIA_PROFILE_PATH) as Record<
      string,
      unknown
    >;
    const profile = validateBusinessProfile({
      ...raw,
      channels: known(["autoservicio", "backoffice"]),
      roles: known([{ id: "comercial", label: "Comercial" }]),
      permissions: known([]),
      permissionFallback: known({ roleId: "comercial" }),
      calendar: notApplicable(),
      capabilities: {
        hasPartes: known(true),
        hasMovimientos: known(true),
        hasFormalDocuments: known(false),
        hasFiscalCompliance: known(false),
        hasCalendar: known(false),
      },
      resourceSubtypes: known([]),
      naturalezaBienes: known(["propios_unitarios"]),
      compliance: known([]),
    });
    const input = materializeBusinessProfile(profile, {
      systemIds: CONCESIONARIA_SYSTEM_IDS,
    });
    expect(input.roles.some((r) => r.id === "cliente")).toBe(true);
    expect(
      input.ruleSet.rules.some(
        (r) =>
          r.kind === "visibility" &&
          r.allowedRoles.includes("cliente") &&
          r.visibilityScope === "propia",
      ),
    ).toBe(true);
  });
});
