/**
 * Composer-prep v1.2 — contrato, plantillas y extensiones de núcleo.
 * No modifica pruebas existentes.
 */

import { describe, expect, it } from "vitest";
import {
  BUSINESS_PROFILE_SCHEMA_VERSION,
  BUSINESS_PROFILE_SCHEMA_VERSION_V11,
  BusinessProfileError,
  UNKNOWN_FIELD_POLICY,
  known,
  unknownField,
  notApplicable,
  validateBusinessProfile,
  materializeBusinessProfile,
  materializeBusinessProfileDetailed,
} from "../contracts/business-profile/index.js";
import {
  compilePolicyTemplate,
  compilePolicyTemplates,
  catalogFieldsForTemplates,
  POLICY_TEMPLATE_IDS,
} from "../contracts/policy-templates/index.js";
import {
  resolveExchangeParties,
  assertExchangeConsistent,
  isPurchaseFromSupplier,
} from "../elements/exchange-direction.js";
import {
  canReserveCapacity,
  assertCanReserveCapacity,
  plazasLibres,
  windowsOverlap,
} from "../facts/plazas.js";
import {
  hitosToCommitments,
  validateHitosOnDominant,
  hitosPhaseGraph,
  validateHitosList,
  HitosError,
} from "../archetypes/milestones.js";
import {
  assertRetentionSettledBeforeClosure,
  retentionBlocksClosure,
  settleRetention,
  RetentionSettlementError,
} from "../elements/retention-settlement.js";
import { validateComposition } from "../archetypes/composition.js";
import { readProfileJson } from "../contracts/business-profile/sources/json-file.js";
import { resolve } from "node:path";

const FIXTURES = resolve(
  process.cwd(),
  "contracts/business-profile/fixtures",
);
const CONCESIONARIA = resolve(FIXTURES, "concesionaria.profile.json");

function baseProfileV12(overrides: Record<string, unknown> = {}) {
  const raw = readProfileJson(CONCESIONARIA) as Record<string, unknown>;
  return {
    ...raw,
    schemaVersion: BUSINESS_PROFILE_SCHEMA_VERSION,
    ...overrides,
  };
}

describe("BusinessProfile v1.2 — contrato", () => {
  it("soporta schemaVersion 1.1.0 y 1.2.0", () => {
    expect(BUSINESS_PROFILE_SCHEMA_VERSION).toBe("1.2.0");
    expect(BUSINESS_PROFILE_SCHEMA_VERSION_V11).toBe("1.1.0");
    const v11 = validateBusinessProfile(readProfileJson(CONCESIONARIA));
    expect(v11.schemaVersion).toBe("1.1.0");
    const v12 = validateBusinessProfile(baseProfileV12());
    expect(v12.schemaVersion).toBe("1.2.0");
  });

  it("naturalezaBienes unknown ⇒ ask (INCOMPLETE)", () => {
    expect(UNKNOWN_FIELD_POLICY.naturalezaBienes).toBe("ask");
    const profile = validateBusinessProfile(
      baseProfileV12({ naturalezaBienes: unknownField() }),
    );
    expect(() => materializeBusinessProfile(profile)).toThrow(
      BusinessProfileError,
    );
    try {
      materializeBusinessProfile(profile);
    } catch (e) {
      expect((e as BusinessProfileError).code).toBe("INCOMPLETE");
    }
  });

  it("naturalezaBienes not_applicable materializa a []", () => {
    const profile = validateBusinessProfile(
      baseProfileV12({ naturalezaBienes: notApplicable() }),
    );
    const input = materializeBusinessProfile(profile);
    expect(input.naturalezaBienes).toEqual([]);
  });

  it("cobros tipados + exchangeDirection validan", () => {
    const profile = validateBusinessProfile(
      baseProfileV12({
        processes: known([
          {
            id: "compra_prov",
            archetypeId: "venta",
            label: "Compra proveedor",
            exchangeDirection: "empresa_compra",
          },
          {
            id: "venta_cliente",
            archetypeId: "venta",
            label: "Venta",
            exchangeDirection: "empresa_vende",
          },
        ]),
        cobros: {
          aCredito: known({
            kind: "cuenta_parte",
            limitePorDefectoEur: 1500,
            bloqueoImpagoDias: 45,
          }),
          aPlazos: known(false),
          fianzas: known(false),
          cuotasRecurrentes: known(false),
          pagosPorHitos: known(false),
        },
        capacityMode: known("plazas"),
        portalCliente: known({ autoservicio: false }),
      }),
    );
    expect(profile.cobros?.aCredito.status).toBe("known");
    expect(profile.capacityMode?.status).toBe("known");
  });

  it("cobros.aPlazos unknown ⇒ ask", () => {
    const profile = validateBusinessProfile(
      baseProfileV12({
        cobros: {
          aCredito: known(false),
          aPlazos: unknownField(),
          fianzas: known(false),
          cuotasRecurrentes: known(false),
          pagosPorHitos: known(false),
        },
      }),
    );
    expect(() => materializeBusinessProfile(profile)).toThrow(
      BusinessProfileError,
    );
  });

  it("portalCliente.autoservicio=true sin canal autoservicio ⇒ CONTRADICTION", () => {
    const profile = validateBusinessProfile(
      baseProfileV12({
        portalCliente: known({ autoservicio: true }),
      }),
    );
    try {
      materializeBusinessProfile(profile);
      expect.fail("debía lanzar");
    } catch (e) {
      expect((e as BusinessProfileError).code).toBe("CONTRADICTION");
    }
  });
});

describe("Plantillas de política tpl.*", () => {
  it("catálogo mínimo completo", () => {
    expect(POLICY_TEMPLATE_IDS).toEqual([
      "tpl.descuento_maximo_sin_aprobacion",
      "tpl.importe_requiere_aprobacion",
      "tpl.limite_credito_por_cliente",
      "tpl.bloqueo_por_impago",
      "tpl.plazo_devolucion",
      "tpl.aviso_plazo",
    ]);
  });

  it("compilación determinista (mismo input ⇒ mismo output)", () => {
    const inv = {
      id: "p-desc",
      plantilla: "tpl.descuento_maximo_sin_aprobacion" as const,
      parametros: { porcentaje: 10 },
      transitionId: "t_aceptar",
    };
    const a = compilePolicyTemplate(inv);
    const b = compilePolicyTemplate(inv);
    expect(a).toEqual(b);
    expect(a.policies[0]?.restriction).toEqual({
      field: "descuento_pct",
      op: "gt",
      value: 10,
    });
  });

  it("lote ordenado por id es estable", () => {
    const batch = [
      {
        id: "b",
        plantilla: "tpl.aviso_plazo" as const,
        parametros: { dias_antes: 5 },
      },
      {
        id: "a",
        plantilla: "tpl.plazo_devolucion" as const,
        parametros: { dias: 14 },
      },
    ];
    const c1 = compilePolicyTemplates(batch);
    const c2 = compilePolicyTemplates([...batch].reverse());
    expect(c1).toEqual(c2);
    expect(c1.compliance.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("materializa plantillas en PolicyDocument / RuleSet", () => {
    const templates = [
      {
        id: "tpl1",
        plantilla: "tpl.descuento_maximo_sin_aprobacion" as const,
        parametros: { porcentaje: 10 },
        transitionId: "t_aceptar",
      },
      {
        id: "tpl2",
        plantilla: "tpl.limite_credito_por_cliente" as const,
        parametros: { por_defecto_eur: 1500 },
        transitionId: "t_aceptar",
      },
    ];
    const raw = baseProfileV12({
      catalogFields: known(["importe", "parte_id", "descuento_pct"]),
      policyTemplates: known(templates),
    });
    const profile = validateBusinessProfile(raw);
    const result = materializeBusinessProfileDetailed(profile);
    const policyIds = result.input.ruleSet.rules
      .map((r) => ("sourcePolicyId" in r ? r.sourcePolicyId : undefined))
      .filter(Boolean);
    expect(policyIds).toContain("tpl1");
    expect(policyIds).toContain("tpl2");
    expect(catalogFieldsForTemplates(templates)).toContain("descuento_pct");
  });
});

describe("Extensión — dirección de intercambio", () => {
  it("empresa_compra tipifica proveedor como vendedor", () => {
    const p = resolveExchangeParties({
      direction: "empresa_compra",
      empresaParteId: "emp",
      contraparteParteId: "prov",
    });
    assertExchangeConsistent(p);
    expect(isPurchaseFromSupplier(p.direction)).toBe(true);
    expect(p.vendedorSubtype).toBe("proveedor");
    expect(p.compradorParteId).toBe("emp");
  });

  it("empresa_vende tipifica cliente como comprador", () => {
    const p = resolveExchangeParties({
      direction: "empresa_vende",
      empresaParteId: "emp",
      contraparteParteId: "cli",
    });
    assertExchangeConsistent(p);
    expect(p.compradorSubtype).toBe("cliente");
  });
});

describe("Extensión — plazas vs cita", () => {
  it("cita_individual exige solicitado=1", () => {
    expect(
      canReserveCapacity("cita_individual", {
        recursoId: "r1",
        plazasTotales: 5,
        comprometidas: 0,
        solicitado: 2,
      }),
    ).toBe(false);
    expect(
      canReserveCapacity("cita_individual", {
        recursoId: "r1",
        plazasTotales: 5,
        comprometidas: 0,
        solicitado: 1,
      }),
    ).toBe(true);
  });

  it("plazas permite N ≤ libres", () => {
    expect(plazasLibres({ plazasTotales: 10, comprometidas: 7 })).toBe(3);
    assertCanReserveCapacity("plazas", {
      recursoId: "sala",
      plazasTotales: 10,
      comprometidas: 7,
      solicitado: 3,
    });
    expect(
      canReserveCapacity("plazas", {
        recursoId: "sala",
        plazasTotales: 10,
        comprometidas: 7,
        solicitado: 4,
      }),
    ).toBe(false);
  });

  it("windowsOverlap detecta solape", () => {
    expect(
      windowsOverlap(
        { start: "2026-01-01T10:00:00Z", end: "2026-01-01T11:00:00Z" },
        { start: "2026-01-01T10:30:00Z", end: "2026-01-01T12:00:00Z" },
      ),
    ).toBe(true);
  });
});

describe("Extensión — hitos de pago", () => {
  const hitos = [
    {
      id: "h1",
      fase: "inicio",
      pct: 30,
      bornInDominantState: "acordado",
      bloquea: "en_ejecucion",
    },
    {
      id: "h2",
      fase: "mitad",
      pct: 40,
      bornInDominantState: "en_ejecucion",
      bloquea: "en_espera",
    },
    {
      id: "h3",
      fase: "fin",
      pct: 30,
      bornInDominantState: "en_espera",
      bloquea: "cerrada",
    },
  ];

  it("genera compromisos pagar y composición válida", () => {
    validateHitosList(hitos);
    const commits = hitosToCommitments(hitos);
    expect(commits).toHaveLength(3);
    expect(commits.every((c) => c.subtype === "pagar")).toBe(true);
    const v = validateHitosOnDominant("servicio_proyecto", hitos);
    expect(v.ok).toBe(true);
    const graph = hitosPhaseGraph(hitos);
    expect(graph.get("acordado")?.has("en_ejecucion")).toBe(true);
  });

  it("pct ≠ 100 rechaza", () => {
    expect(() =>
      validateHitosList([
        {
          id: "x",
          fase: "a",
          pct: 50,
          bornInDominantState: "acordado",
          bloquea: "en_ejecucion",
        },
      ]),
    ).toThrow(HitosError);
  });
});

describe("Extensión — liquidación de fianza", () => {
  const closedOk = {
    currentStateId: "cerrada",
    fulfilledCommitmentIds: new Set<string>(["c"]),
    pendingCommitmentIds: new Set<string>(),
    fieldValues: {},
    balance: 0,
    resourcesSettled: true,
    evidenceComplete: true,
    openRetentionAmount: 0,
  };

  it("cierre con retención abierta se rechaza", () => {
    expect(retentionBlocksClosure(100)).toBe(true);
    expect(() =>
      assertRetentionSettledBeforeClosure({
        ...closedOk,
        openRetentionAmount: 100,
      }),
    ).toThrow(RetentionSettlementError);
  });

  it("tras liquidar, cierre OK", () => {
    const settled = settleRetention({
      openRetentionAmount: 100,
      balance: 100,
      mode: "reembolsar",
    });
    expect(settled.openRetentionAmount).toBe(0);
    assertRetentionSettledBeforeClosure({
      ...closedOk,
      balance: settled.balance,
      openRetentionAmount: settled.openRetentionAmount,
    });
  });

  it("composición con secundaria financiera (fianza) sigue válida", () => {
    const r = validateComposition({
      dominant: "uso_temporal",
      secondaries: [
        {
          secondaryArchetypeId: "financiera",
          bornInDominantState: "reservada",
          bloquea: "en_uso",
        },
      ],
    });
    expect(r.ok).toBe(true);
  });
});
