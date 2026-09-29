/**
 * UI derivada de procesos: oráculo, equivalencia funcional concesionaria, DUDAs.
 */

import { describe, expect, it } from "vitest";
import {
  buildConcesionariaGeneratorInput,
  buildConcesionariaGeneratorInputWithComposition,
  CONCESIONARIA_COMPOSITION,
} from "../generator/packs/concesionaria.js";
import {
  generateUiSpec,
  structuralHash,
} from "../generator/generate.js";
import {
  functionalFingerprint,
  runProcessUiOracle,
} from "../generator/oracle.js";
import { deduceModules } from "../generator/rules/index.js";
import { validateComposition } from "../archetypes/composition.js";
import { assertTransactionClosure } from "../elements/closure.js";
import { requireArchetype } from "../archetypes/catalog.js";
import type { ComposedArchetypeSpec } from "../archetypes/types.js";
import type { GeneratorInput } from "../generator/types.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";

describe("UI derivada de procesos", () => {
  it("organiza por processGroups, no exige mod.* para pantallas", () => {
    const input = buildConcesionariaGeneratorInputWithComposition();
    const spec = generateUiSpec(input);
    expect(spec.processGroups?.length).toBeGreaterThanOrEqual(3);
    expect(
      spec.processGroups!.some((g) => g.role === "dominant"),
    ).toBe(true);
    expect(
      spec.processGroups!.some((g) => g.role === "secondary"),
    ).toBe(true);

    // Pantallas de estado existen aunque ignoremos modules
    const stateViews = spec.views.filter((v) => v.kind === "tablero");
    expect(stateViews.length).toBeGreaterThan(0);
    for (const v of stateViews) {
      expect(v.lifecycleId).toBeTruthy();
    }

    // mod.* son etiquetas opcionales (pueden existir) pero no son la organización primaria
    const moduleIds = new Set(spec.modules.map((m) => m.id));
    for (const g of spec.processGroups!) {
      if (g.lifecycleId === "__portal__") continue;
      expect(g.id.startsWith("proceso.")).toBe(true);
      expect(moduleIds.has(g.id)).toBe(false);
    }
  });

  it("deriva paneles tipados de señales (agenda, crédito, bloqueo, portal)", () => {
    const input = buildConcesionariaGeneratorInputWithComposition();
    const spec = generateUiSpec(input);
    const kinds = new Set(spec.views.map((v) => v.kind));
    expect(kinds.has("panel_agenda")).toBe(true);
    expect(kinds.has("panel_credito")).toBe(true);
    expect(kinds.has("panel_bloqueo")).toBe(true);
    expect(kinds.has("portal_filtro")).toBe(true);
    const block = spec.views.find((v) => v.kind === "panel_bloqueo")!;
    expect(block.presentation?.bloquea).toBeTruthy();
    expect(block.presentation?.reason).toMatch(/impide/);
  });

  it("mod.* sigue siendo etiqueta opcional alineada con deduceModules", () => {
    const input = buildConcesionariaGeneratorInput();
    const spec = generateUiSpec(input);
    expect(spec.modules.map((m) => m.id).sort()).toEqual(
      deduceModules(input)
        .map((m) => m.moduleId)
        .sort(),
    );
  });
});

describe("equivalencia funcional concesionaria", () => {
  it("base vs con composición: mismos estados, acciones y roles de acción", () => {
    const base = generateUiSpec(buildConcesionariaGeneratorInput());
    const composed = generateUiSpec(
      buildConcesionariaGeneratorInputWithComposition(),
    );
    const fb = functionalFingerprint(base);
    const fc = functionalFingerprint(composed);
    expect(fc.states).toEqual(fb.states);
    expect(fc.actions).toEqual(fb.actions);
    expect(fc.actionRoles).toEqual(fb.actionRoles);

    // structuralHash SÍ cambia: processGroups con roles composition + paneles bloqueo
    expect(structuralHash(composed)).not.toBe(structuralHash(base));
  });

  it("documenta delta de structuralHash (organización + paneles)", () => {
    const base = generateUiSpec(buildConcesionariaGeneratorInput());
    const composed = generateUiSpec(
      buildConcesionariaGeneratorInputWithComposition(),
    );
    const basePanels = base.views.filter((v) => v.kind !== "tablero").map((v) => v.id);
    const composedPanels = composed.views
      .filter((v) => v.kind !== "tablero")
      .map((v) => v.id);
    const added = composedPanels.filter((id) => !basePanels.includes(id));
    expect(added.some((id) => id.includes("bloqueo"))).toBe(true);
    expect(
      composed.processGroups!.some(
        (g) => g.bloqueaStateId === "en_entrega",
      ),
    ).toBe(true);
  });
});

describe("oráculo process-ui", () => {
  it("pasa en concesionaria con composición", () => {
    const report = runProcessUiOracle(
      buildConcesionariaGeneratorInputWithComposition(),
    );
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.stats.blockIndicators).toBeGreaterThanOrEqual(2);
  });

  it("pasa en concesionaria sin composición (sin exigir bloqueos)", () => {
    const report = runProcessUiOracle(buildConcesionariaGeneratorInput());
    expect(report.ok).toBe(true);
  });
});

describe("DUDAs composición (informe §6)", () => {
  it("DUDA1: fianza/retención abierta no cierra uso_temporal sin liquidar saldo", () => {
    // Hipótesis: cierre con retención abierta (saldo ≠ 0) falla inv_cierre_saldo.
    expect(() =>
      assertTransactionClosure({
        currentStateId: "cerrada",
        fulfilledCommitmentIds: new Set(["c"]),
        pendingCommitmentIds: new Set(),
        fieldValues: {},
        balance: 150, // fianza retenida no liquidada
        resourcesSettled: true,
        evidenceComplete: true,
      }),
    ).toThrow(/saldo/i);

    expect(() =>
      assertTransactionClosure({
        currentStateId: "cerrada",
        fulfilledCommitmentIds: new Set(["c"]),
        pendingCommitmentIds: new Set(),
        fieldValues: {},
        balance: 0,
        resourcesSettled: true,
        evidenceComplete: true,
      }),
    ).not.toThrow();
  });

  it("DUDA2: venta usable como compra a proveedor solo con ajuste semántico", () => {
    const venta = requireArchetype("venta");
    const sellerCentric = venta.lifecycle.states.some(
      (s) =>
        /entrega|propuesta|aceptada/i.test(s.id) ||
        /entrega|propuesta/i.test(s.label ?? ""),
    );
    expect(sellerCentric).toBe(true);
    // Estructuralmente no hay dirección comprador/vendedor en el lifecycle:
    // Partes son ids libres; el sesgo es de lenguaje de estados/compromisos.
    const hasProveedorDirection = venta.lifecycle.transitions.some((t) =>
      /proveedor|compra/i.test(t.id),
    );
    expect(hasProveedorDirection).toBe(false);
  });

  it("DUDA3: varios bloquea al mismo estado destino es válido", () => {
    const multi: ComposedArchetypeSpec = {
      dominant: "venta",
      secondaries: [
        {
          secondaryArchetypeId: "financiera",
          bornInDominantState: "aceptada",
          bloquea: "en_entrega",
        },
        {
          secondaryArchetypeId: "servicio_proyecto",
          bornInDominantState: "cerrada",
          bloquea: "en_entrega",
        },
      ],
    };
    expect(validateComposition(multi)).toEqual({ ok: true });
    expect(validateComposition(CONCESIONARIA_COMPOSITION)).toEqual({
      ok: true,
    });
  });
});

describe("composition en GeneratorInput vía materialize", () => {
  it("perfil con composition known llega al GeneratorInput", async () => {
    const { validateBusinessProfile } = await import(
      "../contracts/business-profile/validate.js"
    );
    const { materializeBusinessProfile } = await import(
      "../contracts/business-profile/materialize.js"
    );
    const { readProfileJson } = await import(
      "../contracts/business-profile/sources/json-file.js"
    );
    const { CONCESIONARIA_PROFILE_PATH, CONCESIONARIA_SYSTEM_IDS } =
      await import("../generator/packs/concesionaria.js");

    const raw = readProfileJson(CONCESIONARIA_PROFILE_PATH) as Record<
      string,
      unknown
    >;
    const withComp = {
      ...raw,
      composition: {
        status: "known",
        value: CONCESIONARIA_COMPOSITION,
        confidence: 1,
      },
    };
    const profile = validateBusinessProfile(withComp);
    const input: import("../generator/types.js").GeneratorInput =
      materializeBusinessProfile(profile, {
        systemIds: CONCESIONARIA_SYSTEM_IDS,
      });
    expect(input.composition).toEqual(CONCESIONARIA_COMPOSITION);
    expect(
      input.lifecycles.find((l) => l.archetypeId === "venta")?.compositionRole,
    ).toBe("dominant");
    expect(
      input.lifecycles.find((l) => l.archetypeId === "financiera")
        ?.compositionRole,
    ).toBe("secondary");
  });
});

function minimalInputForArchetype(
  archetypeId: import("../generator/types.js").GeneratorInput["lifecycles"][0]["archetypeId"],
  caseId: string,
): import("../generator/types.js").GeneratorInput {
  const arch = requireArchetype(archetypeId as never);
  const roles = [
    { id: "gerente", label: "Gerente" },
    { id: "cliente", label: "Cliente" },
  ];
  const transitionIds = arch.lifecycle.transitions.map((t) => t.id);
  const stateIds = arch.lifecycle.states.map((s) => s.id);
  const permissions: import("../policies/types.js").PermissionPolicy[] =
    transitionIds.map((tid) => ({
      id: `perm-${tid}`,
      kind: "permiso",
      transitionId: tid,
      allowedRoles: ["gerente"],
    }));
  permissions.push({
    id: "perm-ver",
    kind: "permiso",
    action: "consultar",
    allowedRoles: ["cliente"],
    visibility: { scope: "propia" },
  });
  const doc = {
    id: `pol-${caseId}`,
    version: "1.0.0",
    companyId: "demo",
    archetypeId: archetypeId as never,
    roles,
    permissions,
  };
  const catalog = catalogFromLifecycle(transitionIds, stateIds, ["importe"]);
  const ruleSet = compilePolicies(doc, {
    catalog,
    activationAt: "2026-01-01T00:00:00.000Z",
    compiledVersion: `compiled:${caseId}`,
  });
  return {
    caseId,
    caseVersion: "1.0.0",
    companyId: "demo",
    generatedAt: "2026-06-01T00:00:00.000Z",
    lifecycles: [
      {
        id: `lc.${archetypeId}`,
        archetypeId,
        lifecycle: arch.lifecycle,
        compositionRole: "standalone",
      },
    ],
    ruleSet,
    roles,
    channels: ["backoffice"],
    resourceSubtypes: [],
    naturalezaBienes: [],
    paymentMode: "inmediato",
    hasPartes: true,
    hasMovimientos: true,
    hasFormalDocuments: true,
    hasFiscalCompliance: true,
    hasCalendar: false,
  };
}

describe("oráculo en arquetipos sueltos", () => {
  for (const id of [
    "venta",
    "servicio_proyecto",
    "suscripcion",
    "uso_temporal",
    "intermediacion",
    "financiera",
  ] as const) {
    it(`oráculo ok en ${id}`, () => {
      let input = minimalInputForArchetype(id, `case-${id}`);
      if (id === "uso_temporal" || id === "intermediacion") {
        input = {
          ...input,
          resourceSubtypes: ["capacidad_temporal"],
          hasCalendar: true,
        };
      }
      const report = runProcessUiOracle(input);
      expect(report.ok, JSON.stringify(report.findings)).toBe(true);
    });
  }
});
