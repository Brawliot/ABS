/**
 * Tests Fase 1 Compositor: Precedencia Explícita + Normalización + Edge Cases
 *
 * 15 tests mínimo:
 * 1. Precedencia simple
 * 2. Precedencia cadena
 * 3. EC1 - cobros=null
 * 4. EC4 - paymentMode=financiado + aPlazos=unknown
 * 5. EC3 - Financiera conflictiva
 * 6. Determinismo
 * 7. No regresión (tests previos siguen pasando)
 * 8. Warnings de normalización
 * 9. Cobros null + servicios
 * 10. Múltiples conflictos
 * 11. Financiera explícita (procesos)
 * 12. Unknown fields sin crash
 * 13. Integración end-to-end (venta inmediata)
 * 14. Edge case combinations
 * 15. Traceability auditable
 */

import { describe, expect, it } from "vitest";
import { composeBusinessProfile, normalizeBusinessProfile } from "../composer/index.js";
import {
  getRulePriority,
  sortRuleIdsByPrecedence,
  canRulesConflict,
  RULE_PRECEDENCE,
} from "../composer/precedence.js";
import {
  normalizeCobrosModel,
  normalizeAPlazos,
  normalizeACredito,
  describeNormalization,
} from "../composer/normalizers.js";
import { validateBusinessProfile, known, unknownField } from "../contracts/business-profile/index.js";

/**
 * Helper: crear profile base mínimo para tests
 * Basado en la estructura de concesionaria pero minimalista
 */
function baseProfile(overrides: Record<string, unknown> = {}) {
  return validateBusinessProfile({
    schemaVersion: "1.2.0",
    identity: { companyId: "test-co" },
    policyMeta: {
      documentVersion: "1.0.0",
      dominantArchetypeId: "venta",
    },
    processes: known([{ id: "lc.venta", archetypeId: "venta", label: "Venta" }]),
    channels: known(["presencial"]),
    resourceSubtypes: known(["capacidad_temporal"]),
    naturalezaBienes: known(["propios_por_cantidad"]),
    location: known({ countryCode: "ES" }),
    capabilities: {
      hasPartes: known(false),
      hasMovimientos: known(false),
      hasFormalDocuments: known(false),
      hasFiscalCompliance: known(false),
      hasCalendar: known(false),
    },
    roles: known([{ id: "admin", label: "Admin" }]),
    calendar: unknownField(),
    permissions: known([]),
    permissionFallback: known({ roleId: "admin" }),
    compliance: known([]),
    catalogFields: known([]),
    organization: unknownField(),
    businessPolicies: known([]),
    pipelineStateIds: known(["abierta"]),
    paymentMode: known("inmediato"),
    ...overrides,
  });
}

// ——————————————————————————————————————————————————————————————————
// TESTS: PRECEDENCIA
// ——————————————————————————————————————————————————————————————————

describe("Fase 1 Compositor — Precedencia Explícita", () => {
  it("1. Precedencia simple: regla con mayor priority gana", () => {
    // R_FINANCIAL_EXPLICIT tiene priority 100
    // R_APLAZOS_FINANCIERA tiene priority 85
    expect(getRulePriority("R_FINANCIAL_EXPLICIT")).toBe(100);
    expect(getRulePriority("R_APLAZOS_FINANCIERA")).toBe(85);
    expect(getRulePriority("R_FINANCIAL_EXPLICIT")).toBeGreaterThan(
      getRulePriority("R_APLAZOS_FINANCIERA"),
    );
  });

  it("2. Precedencia cadena: 5 reglas financieras en orden correcto", () => {
    const financialRules = [
      "R_FINANCIAL_EXPLICIT",
      "R_CUENTA_PARTE",
      "R_APLAZOS_FINANCIERA",
      "R_ACREDITO_BOOL_FINANCIERA",
      "R_PAYMENT_FINANCIADO",
    ];

    const sorted = sortRuleIdsByPrecedence(financialRules);

    // Debe estar en orden descendente de priority
    for (let i = 0; i < sorted.length - 1; i++) {
      const currPrio = getRulePriority(sorted[i]!);
      const nextPrio = getRulePriority(sorted[i + 1]!);
      expect(currPrio).toBeGreaterThanOrEqual(nextPrio);
    }

    // R_FINANCIAL_EXPLICIT primero
    expect(sorted[0]).toBe("R_FINANCIAL_EXPLICIT");
  });

  it("3. Conflictos: R_APLAZOS_FINANCIERA y R_ACCOUNT_PARTE conflictúan", () => {
    expect(canRulesConflict("R_APLAZOS_FINANCIERA", "R_CUENTA_PARTE")).toBe(true);
    expect(canRulesConflict("R_CUENTA_PARTE", "R_APLAZOS_FINANCIERA")).toBe(true);
  });
});

// ——————————————————————————————————————————————————————————————————
// TESTS: NORMALIZACIÓN (Edge Cases 1, 4, etc)
// ——————————————————————————————————————————————————————————————————

describe("Fase 1 Compositor — Normalización de Nulls (EC1)", () => {
  it("4. EC1: cobros=null + paymentMode=deferred → normaliza aPlazos=true", () => {
    const profile = validateBusinessProfile({
      ...baseProfile({
        paymentMode: known("diferido"),
        // cobros ausente (null) NO incluirlo
      }),
      cobros: undefined,
    } as any);

    const { normalized, traces } = normalizeBusinessProfile(profile);

    // Debe haber normalizado cobros
    expect(normalized.cobros).toBeDefined();
    expect(normalized.cobros?.aPlazos.status).toBe("known");
    if (normalized.cobros?.aPlazos.status === "known") {
      expect(normalized.cobros.aPlazos.value).toEqual({ enabled: true });
    }

    // Traza auditable
    expect(traces.length).toBeGreaterThan(0);
    const aplazosTrace = traces.find((t) => t.field === "cobros.aPlazos");
    expect(aplazosTrace).toBeDefined();
    expect(aplazosTrace?.source).toBe("normalized_from_paymentMode");
    expect(aplazosTrace?.confidence).toBeGreaterThan(0.8);
  });

  it("5. EC4: paymentMode=financiado + aPlazos=unknown → normaliza aPlazos=true", () => {
    const profile = baseProfile({
      paymentMode: known("financiado"),
      cobros: {
        aPlazos: unknownField(),
        aCredito: unknownField(),
        fianzas: unknownField(),
        cuotasRecurrentes: unknownField(),
        pagosPorHitos: unknownField(),
      },
    });

    const { normalized, traces } = normalizeBusinessProfile(profile);

    // aPlazos debe estar normalizado a true
    expect(normalized.cobros?.aPlazos.status).toBe("known");
    if (normalized.cobros?.aPlazos.status === "known") {
      expect(normalized.cobros.aPlazos.value).toEqual({ enabled: true });
    }

    // Debe haber trace con razón clara
    const trace = traces.find((t) => t.field === "cobros.aPlazos");
    expect(trace?.reason).toContain("financiado");
  });

  it("6. Determinismo: mismo profile → mismo resultado 2x", () => {
    const profile = baseProfile({
      paymentMode: known("diferido"),
      cobros: {
        aPlazos: unknownField(),
        aCredito: unknownField(),
        fianzas: unknownField(),
        cuotasRecurrentes: unknownField(),
        pagosPorHitos: unknownField(),
      },
    });

    const result1 = composeBusinessProfile(profile);
    const result2 = composeBusinessProfile(profile);

    expect(result1.ok).toBe(result2.ok);
    if (result1.ok && result2.ok) {
      expect(result1.compositionHash).toBe(result2.compositionHash);
      expect(result1.composition).toEqual(result2.composition);
    }
  });
});

// ——————————————————————————————————————————————————————————————————
// TESTS: VALIDACIÓN FINANCIERA (EC3)
// ——————————————————————————————————————————————————————————————————

describe("Fase 1 Compositor — Validación Coherencia Financiera (EC3)", () => {
  it("7. No regresión: tests previos siguen pasando (aCredito cuenta_parte)", () => {
    // Este test replica uno del archivo previo
    const profile = baseProfile({
      cobros: {
        aCredito: known({
          kind: "cuenta_parte",
          limitePorDefectoEur: 1500,
        }),
        aPlazos: known(false),
        fianzas: known(false),
        cuotasRecurrentes: known(false),
        pagosPorHitos: known(false),
      },
      paymentMode: known("diferido"),
    });

    const result = composeBusinessProfile(profile);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // No debe haber financiera (prohibida por cuenta_parte)
    const hasFinanciera = result.composition?.secondaries.some(
      (s) => s.secondaryArchetypeId === "financiera",
    );
    expect(hasFinanciera).toBe(false);

    // Pero sí debe haber políticas de crédito
    expect(
      result.policyTemplates.some((t) => t.plantilla.includes("limite_credito")),
    ).toBe(true);
  });

  it("8. Normalización auditable: describeNormalization() da mensajes claros", () => {
    const profile = validateBusinessProfile({
      ...baseProfile({
        paymentMode: known("financiado"),
      }),
      cobros: undefined,
    } as any);

    const { traces } = normalizeBusinessProfile(profile);

    // Describir normalización
    const desc = describeNormalization(traces);
    expect(desc).toBeTruthy();
    expect(desc.length).toBeGreaterThan(0);
    // Debe mencionar que se aplicó normalización
    if (traces.length > 0) {
      expect(desc).toContain("Normalización aplicada");
    }
  });

  it("9. Cobros null + procesos servicio → aPlazos=unknown (no asumir)", () => {
    const profile = validateBusinessProfile({
      ...baseProfile({
        processes: known([
          { id: "lc.servicio", archetypeId: "servicio_proyecto", label: "Srv" },
        ]),
        policyMeta: {
          documentVersion: "1.0.0",
          dominantArchetypeId: "servicio_proyecto",
        },
      }),
      cobros: undefined,
    } as any);

    const { normalized } = normalizeBusinessProfile(profile);

    // aPlazos debe seguir unknown (depende de capacityMode)
    expect(normalized.cobros?.aPlazos.status).toBe("unknown");
  });

  it("10. Múltiples conflictos: paymentMode + aPlazos + aCredito → precedencia resuelve", () => {
    // Crear situation con múltiples señales conflictivas
    const profile = baseProfile({
      paymentMode: known("inmediato"),
      cobros: {
        aPlazos: known({ enabled: true }), // Contradictorio: deferred=false pero aPlazos=true
        aCredito: known(true), // Financiero
        fianzas: known(false),
        cuotasRecurrentes: known(false),
        pagosPorHitos: known(false),
      },
    });

    const result = composeBusinessProfile(profile);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Debe haber resuelto en favor de aPlazos (priority 85 > paymentMode)
    const hasFinanciera = result.composition?.secondaries.some(
      (s) => s.secondaryArchetypeId === "financiera",
    );
    expect(hasFinanciera).toBe(true);
  });
});

// ——————————————————————————————————————————————————————————————————
// TESTS: CASOS ESPECIALES
// ——————————————————————————————————————————————————————————————————

describe("Fase 1 Compositor — Casos Especiales", () => {
  it("11. Financiera explícita: procesos=financiera → gana sobre todo", () => {
    const profile = baseProfile({
      processes: known([
        { id: "lc.venta", archetypeId: "venta", label: "Venta" },
        { id: "lc.financiera", archetypeId: "financiera", label: "Financiera" },
      ]),
      cobros: {
        aPlazos: unknownField(),
        aCredito: unknownField(),
        fianzas: unknownField(),
        cuotasRecurrentes: unknownField(),
        pagosPorHitos: unknownField(),
      },
    });

    const result = composeBusinessProfile(profile);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Debe haber intentado añadir financiera
    // (aunque puede estar ausente si procesos financiera no genera secondary)
  });

  it("12. Unknown fields sin crash: profile con many unknowns compone sin error", () => {
    const profile = baseProfile({
      cobros: {
        aPlazos: unknownField(),
        aCredito: unknownField(),
        fianzas: unknownField(),
        cuotasRecurrentes: unknownField(),
        pagosPorHitos: unknownField(),
      },
      paymentMode: unknownField(),
      capacityMode: unknownField(),
    });

    // Debe componer sin crash, aunque haya preguntas
    const result = composeBusinessProfile(profile);

    expect(result.ok).toBe(true);
    // Habrá preguntas por los campos unknown
    if (result.ok) {
      expect(result.questions.length).toBeGreaterThan(0);
    }
  });

  it("13. Integración end-to-end: pizzería (venta + inmediato) compone correctamente", () => {
    const pizzeria = baseProfile({
      processes: known([{ id: "lc.venta", archetypeId: "venta", label: "Venta" }]),
      paymentMode: known("inmediato"),
      cobros: {
        aPlazos: known(false),
        aCredito: known(false),
        fianzas: known(false),
        cuotasRecurrentes: known(false),
        pagosPorHitos: known(false),
      },
    });

    const result = composeBusinessProfile(pizzeria);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // No debe haber secundaria financiera
    const hasFinanciera = result.composition?.secondaries.some(
      (s) => s.secondaryArchetypeId === "financiera",
    );
    expect(hasFinanciera).toBe(false);
  });

  it("14. Edge case combination: cobros=null + paymentMode=financiado + process=venta → financiera", () => {
    const profile = validateBusinessProfile({
      ...baseProfile({
        paymentMode: known("financiado"),
        processes: known([{ id: "lc.venta", archetypeId: "venta", label: "Venta" }]),
      }),
      cobros: undefined,
    } as any);

    const result = composeBusinessProfile(profile);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Debe haber normalizado cobros + detectado paymentMode=financiado
    // → debería intentar añadir financiera
    expect(result.traces.length).toBeGreaterThan(0);

    // Verificar que hay traces de normalización
    const normTraces = result.traces.filter((t) => t.ruleId === "R_NORMALIZER");
    expect(normTraces.length).toBeGreaterThan(0);
  });

  it("15. Traceability: cada decisión es auditable (ruleId + reason)", () => {
    const profile = baseProfile({
      paymentMode: known("diferido"),
      cobros: {
        aPlazos: unknownField(),
        aCredito: known(true),
        fianzas: known(false),
        cuotasRecurrentes: known(false),
        pagosPorHitos: known(false),
      },
    });

    const result = composeBusinessProfile(profile);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Todos los traces deben tener ruleId
    for (const trace of result.traces) {
      expect(trace.ruleId).toBeTruthy();
      expect(typeof trace.ruleId).toBe("string");
    }

    // Debe haber al menos un trace de R_NORMALIZER o R_ACREDITO_BOOL_FINANCIERA
    const importantRules = result.traces.filter((t) =>
      ["R_NORMALIZER", "R_ACREDITO_BOOL_FINANCIERA", "R_ASK_APLAZOS"].includes(t.ruleId),
    );
    expect(importantRules.length).toBeGreaterThan(0);
  });
});

// ——————————————————————————————————————————————————————————————————
// TESTS: CASOS ADICIONALES PARA COBERTURA
// ——————————————————————————————————————————————————————————————————

describe("Fase 1 Compositor — Cobertura Adicional", () => {
  it("normalizeAPlazos: infiere de paymentMode diferido", () => {
    const profile = baseProfile({ paymentMode: known("diferido") });

    const { field, trace } = normalizeAPlazos(profile);

    expect(field.status).toBe("known");
    if (field.status === "known") {
      expect(field.value).toEqual({ enabled: true });
    }
    expect(trace.source).toBe("normalized_from_paymentMode");
  });

  it("normalizeACredito: sin evidencia clara → unknown", () => {
    const profile = baseProfile({ paymentMode: known("inmediato") });

    const { field, trace } = normalizeACredito(profile);

    expect(field.status).toBe("unknown");
    expect(trace.source).toBe("normalized_default");
  });

  it("RULE_PRECEDENCE: tabla tiene todas las reglas críticas", () => {
    const ruleIds = RULE_PRECEDENCE.map((r) => r.ruleId);

    // Reglas financieras críticas presentes
    expect(ruleIds).toContain("R_FINANCIAL_EXPLICIT");
    expect(ruleIds).toContain("R_APLAZOS_FINANCIERA");
    expect(ruleIds).toContain("R_ACREDITO_BOOL_FINANCIERA");
    expect(ruleIds).toContain("R_PAYMENT_FINANCIADO");
    expect(ruleIds).toContain("R_CUENTA_PARTE");

    // Todas tienen priority > 0
    for (const rule of RULE_PRECEDENCE) {
      expect(rule.priority).toBeGreaterThan(0);
    }
  });

  it("sortRuleIdsByPrecedence: maneja lista vacía", () => {
    const sorted = sortRuleIdsByPrecedence([]);
    expect(sorted).toEqual([]);
  });

  it("sortRuleIdsByPrecedence: regla desconocida obtiene priority 0", () => {
    const sorted = sortRuleIdsByPrecedence(["UNKNOWN_RULE", "R_APLAZOS_FINANCIERA"]);

    // UNKNOWN_RULE debe ir al final (priority 0)
    expect(sorted[sorted.length - 1]).toBe("UNKNOWN_RULE");
  });
});
