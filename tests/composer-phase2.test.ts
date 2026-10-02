/**
 * Fase 2 del Compositor: DSL Extendido + Traceabilidad V2 + Validación
 * 18 tests completos: AND, OR, NOT, CONFIDENCE_MIN, FIELD_EQUALS
 * + Traceabilidad + GeneratorInput validation
 *
 * Ejecutar: npx vitest run tests/composer-phase2.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { BusinessProfile } from "../contracts/business-profile/types.js";
import {
  RuleBuilder,
  evaluateCondition,
  describeCondition,
  getConditionDepth,
  countOperands,
  type ComposerContext,
  type RuleCondition,
} from "../composer/dsl-extended.js";
import {
  Tracer,
  buildFieldSnapshot,
  type TraceEntryV2,
  type RuleDecision,
} from "../composer/trace-v2.js";
import {
  GeneratorInputValidator,
  validateGeneratorInputFast,
  getCriticalValidationErrors,
} from "../composer/generator-input-validator.js";
import type { GeneratorInput } from "../generator/types.js";

/**
 * Helpers para crear perfiles y contextos de prueba.
 */
function createMinimalProfile(overrides?: Partial<BusinessProfile>): BusinessProfile {
  return {
    companyId: "test-company",
    caseVersion: "1.0",
    caseId: "test-case",
    policyMeta: {
      dominantArchetypeId: "venta" as any,
      documentVersion: "1.0",
    },
    processes: {
      status: "known",
      value: [
        {
          id: "proc-1",
          archetypeId: "venta" as any,
          label: "Venta Principal",
        },
      ],
    },
    naturalezaBienes: {
      status: "known",
      value: "propios_por_cantidad" as any,
    },
    paymentMode: {
      status: "known",
      value: "inmediato" as any,
    },
    capabilities: {
      hasCalendar: { status: "unknown" as const },
    },
    ...overrides,
  } as BusinessProfile;
}

function createContext(profile: BusinessProfile): ComposerContext {
  return {
    profile,
    metadata: {
      evaluatedAt: new Date(),
    },
  };
}

function createMinimalGeneratorInput(overrides?: Partial<GeneratorInput>): GeneratorInput {
  const base: Partial<GeneratorInput> = {
    caseId: "test-case",
    caseVersion: "1.0",
    companyId: "test-company",
    generatedAt: new Date().toISOString(),
    lifecycles: [
      {
        id: "lc-venta",
        archetypeId: "venta" as any,
        lifecycle: {} as any, // Mock
        compositionRole: "dominant" as any,
      },
    ],
    ruleSet: {} as any, // Mock
    roles: [],
    channels: [],
    resourceSubtypes: [],
    naturalezaBienes: ["propios_por_cantidad" as any] as readonly any[],
    paymentMode: "inmediato" as any,
    hasPartes: false,
    hasMovimientos: false,
    hasFormalDocuments: false,
    hasFiscalCompliance: false,
    hasCalendar: false,
  };

  return {
    ...base,
    ...overrides,
  } as GeneratorInput;
}

describe("Fase 2 Compositor: DSL Extendido", () => {
  // ========== 1. DSL AND ==========
  it("1. DSL AND: dos condiciones true → evaluación correcta", () => {
    const profile = createMinimalProfile({
      paymentMode: { status: "known" as const, value: "inmediato" as any },
      naturalezaBienes: { status: "known" as const, value: ["propios_por_cantidad" as any] },
    } as any);
    const ctx = createContext(profile);

    const cond = RuleBuilder.AND(
      RuleBuilder.fieldEquals("paymentMode.value", "inmediato"),
      RuleBuilder.fieldEquals("naturalezaBienes.value.0", "propios_por_cantidad"),
    );

    const result = evaluateCondition(cond, ctx);
    expect(result).toBe(true);
  });

  // ========== 2. DSL OR ==========
  it("2. DSL OR: una de dos true → evaluación correcta", () => {
    const profile = createMinimalProfile({
      paymentMode: { status: "known", value: "financiado" },
    });
    const ctx = createContext(profile);

    const cond = RuleBuilder.OR(
      RuleBuilder.fieldEquals("paymentMode.value", "inmediato"),
      RuleBuilder.fieldEquals("paymentMode.value", "financiado"),
    );

    const result = evaluateCondition(cond, ctx);
    expect(result).toBe(true);
  });

  // ========== 3. DSL NOT ==========
  it("3. DSL NOT: condición negada → evaluación correcta", () => {
    const profile = createMinimalProfile({
      paymentMode: { status: "known", value: "inmediato" },
    });
    const ctx = createContext(profile);

    const cond = RuleBuilder.NOT(
      RuleBuilder.fieldEquals("paymentMode.value", "financiado"),
    );

    const result = evaluateCondition(cond, ctx);
    expect(result).toBe(true);
  });

  // ========== 4. DSL CONFIDENCE_MIN ==========
  it("4. DSL CONFIDENCE_MIN: campo con confidence > threshold → APPLY", () => {
    const profile = createMinimalProfile({
      paymentMode: { status: "known", value: "inmediato", confidence: 0.95 },
    });
    const ctx = createContext(profile);

    const cond = RuleBuilder.confidenceMin("paymentMode", 0.7);
    const result = evaluateCondition(cond, ctx);
    expect(result).toBe(true);
  });

  // ========== 5. DSL FIELD_EQUALS ==========
  it("5. DSL FIELD_EQUALS: comparación de valor → funciona", () => {
    const profile = createMinimalProfile({
      paymentMode: { status: "known", value: "diferido" },
    });
    const ctx = createContext(profile);

    const cond = RuleBuilder.fieldEquals("paymentMode.value", "diferido");
    const result = evaluateCondition(cond, ctx);
    expect(result).toBe(true);
  });

  // ========== 6. DSL Combinado ==========
  it("6. DSL Combinado: AND(OR(...), CONFIDENCE_MIN(...)) → lógica compleja", () => {
    const profile = createMinimalProfile({
      paymentMode: { status: "known" as const, value: "financiado" as any, confidence: 0.85 },
      naturalezaBienes: { status: "known" as const, value: ["propios_por_cantidad" as any] },
    } as any);
    const ctx = createContext(profile);

    const cond = RuleBuilder.AND(
      RuleBuilder.OR(
        RuleBuilder.fieldEquals("paymentMode.value", "financiado"),
        RuleBuilder.fieldEquals("paymentMode.value", "mixto"),
      ),
      RuleBuilder.confidenceMin("paymentMode", 0.7),
    );

    const result = evaluateCondition(cond, ctx);
    expect(result).toBe(true);
  });

  // ========== 7. describeCondition ==========
  it("7. describeCondition: AND con dos condiciones → descripción legible", () => {
    const cond = RuleBuilder.AND(
      RuleBuilder.fieldEquals("paymentMode.value", "inmediato"),
      RuleBuilder.fieldEquals("naturalezaBienes.value", "propios_por_cantidad"),
    );

    const desc = describeCondition(cond);
    expect(desc).toContain("Y");
    expect(desc).toContain("paymentMode");
    expect(desc).toContain("naturalezaBienes");
  });

  // ========== 8. getConditionDepth ==========
  it("8. getConditionDepth: condición anidada → profundidad correcta", () => {
    const cond = RuleBuilder.AND(
      RuleBuilder.OR(
        RuleBuilder.fieldEquals("a", "1"),
        RuleBuilder.fieldEquals("b", "2"),
      ),
      RuleBuilder.NOT(RuleBuilder.fieldEquals("c", "3")),
    );

    const depth = getConditionDepth(cond);
    expect(depth).toBe(3);
  });

  // ========== 9. countOperands ==========
  it("9. countOperands: árbol de condiciones → conteo correcto", () => {
    const cond = RuleBuilder.AND(
      RuleBuilder.fieldEquals("a", "1"),
      RuleBuilder.fieldEquals("b", "2"),
      RuleBuilder.fieldEquals("c", "3"),
    );

    const count = countOperands(cond);
    expect(count).toBe(4); // 1 AND + 3 fieldEquals
  });
});

describe("Fase 2 Compositor: Traceabilidad V2", () => {
  let tracer: Tracer;

  beforeEach(() => {
    tracer = new Tracer();
  });

  // ========== 10. Trace básico ==========
  it("10. Trace básico: regla registrada en trace", () => {
    const entry: TraceEntryV2 = {
      timestamp: new Date(),
      ruleId: "R_TEST_001",
      rulePriority: 10,
      ruleDescription: "Test rule",
      affectedFields: [],
      decision: "APPLY",
      reason: "Condición evaluó true",
      actionsApplied: [{ type: "add_secondary" } as any],
      warnings: [],
      metadata: {},
    };

    tracer.record(entry);
    const trace = tracer.getTrace();
    expect(trace).toHaveLength(1);
    expect(trace[0]!.ruleId).toBe("R_TEST_001");
  });

  // ========== 11. Trace con snapshot ==========
  it("11. Trace con snapshot: contextBefore/After correctos", () => {
    const snapshot = buildFieldSnapshot(
      "cobros.aPlazos",
      { status: "unknown" },
      { status: "known", value: true },
      0.1,
      0.9,
    );

    const entry: TraceEntryV2 = {
      timestamp: new Date(),
      ruleId: "R_APLAZOS",
      rulePriority: 5,
      ruleDescription: "Aplazos normalizado",
      affectedFields: [snapshot],
      decision: "APPLY",
      reason: "Normalización",
      actionsApplied: [],
      warnings: [],
      metadata: {},
    };

    tracer.record(entry);
    const trace = tracer.getTrace();
    expect(trace[0]!.affectedFields[0]!.fieldPath).toBe("cobros.aPlazos");
    expect(trace[0]!.affectedFields[0]!.confidenceBefore).toBe(0.1);
    expect(trace[0]!.affectedFields[0]!.confidenceAfter).toBe(0.9);
  });

  // ========== 12. auditTrail ==========
  it("12. Audit trail: formato legible y completo", () => {
    tracer.record({
      timestamp: new Date(),
      ruleId: "R_001",
      rulePriority: 1,
      ruleDescription: "Primera regla",
      affectedFields: [],
      decision: "APPLY",
      reason: "Razón de aplicación",
      actionsApplied: [],
      warnings: [],
      metadata: { evaluationTimeMs: 2.5 },
    });

    tracer.record({
      timestamp: new Date(),
      ruleId: "R_002",
      rulePriority: 2,
      ruleDescription: "Segunda regla",
      affectedFields: [],
      decision: "SKIP",
      reason: "No era aplicable",
      actionsApplied: [],
      warnings: [],
      metadata: {},
    });

    const trail = tracer.auditTrail();
    expect(trail).toContain("AUDIT TRAIL");
    expect(trail).toContain("R_001");
    expect(trail).toContain("R_002");
    expect(trail).toContain("APPLY");
    expect(trail).toContain("SKIP");
  });

  // ========== 13. Trace JSON exportable ==========
  it("13. Trace JSON: exportable y parseble", () => {
    tracer.record({
      timestamp: new Date(),
      ruleId: "R_JSON",
      rulePriority: 1,
      ruleDescription: "JSON rule",
      affectedFields: [],
      decision: "APPLY",
      reason: "Test reason",
      actionsApplied: [],
      warnings: ["warning 1"],
      metadata: { test: "value" },
    });

    const json = tracer.toJSON();
    expect(json).toContain("R_JSON");
    expect(json).toContain("APPLY");
    expect(json).toContain("warning 1");

    // Verificar que es JSON válido
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("2.0");
    expect(parsed.entries).toHaveLength(1);
  });

  // ========== 14. Trace stats ==========
  it("14. Trace stats: estadísticas correctas", () => {
    tracer.record({
      timestamp: new Date(),
      ruleId: "R_A",
      rulePriority: 1,
      ruleDescription: "A",
      affectedFields: [],
      decision: "APPLY",
      reason: "A",
      actionsApplied: [],
      warnings: [],
      metadata: { evaluationTimeMs: 5 },
    });

    tracer.record({
      timestamp: new Date(),
      ruleId: "R_B",
      rulePriority: 2,
      ruleDescription: "B",
      affectedFields: [],
      decision: "SKIP",
      reason: "B",
      actionsApplied: [],
      warnings: [],
      metadata: { evaluationTimeMs: 3 },
    });

    const stats = tracer.stats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.applied).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.totalTimeMs).toBe(8);
  });

  // ========== 15. Trace determinismo ==========
  it("15. Trace determinismo: hash consistente", () => {
    tracer.record({
      timestamp: new Date(),
      ruleId: "R_DET",
      rulePriority: 1,
      ruleDescription: "Deterministic",
      affectedFields: [
        buildFieldSnapshot("field1", "before", "after", 0.5, 0.8),
      ],
      decision: "APPLY",
      reason: "Same reason",
      actionsApplied: [],
      warnings: [],
      metadata: {},
    });

    const hash1 = tracer.hash();

    const tracer2 = new Tracer();
    tracer2.record({
      timestamp: new Date(),
      ruleId: "R_DET",
      rulePriority: 1,
      ruleDescription: "Deterministic",
      affectedFields: [
        buildFieldSnapshot("field1", "before", "after", 0.5, 0.8),
      ],
      decision: "APPLY",
      reason: "Same reason",
      actionsApplied: [],
      warnings: [],
      metadata: {},
    });

    const hash2 = tracer2.hash();
    expect(hash1).toBe(hash2);
  });

  // ========== 16. Trace summary ==========
  it("16. Trace summary: reporte resumido generado", () => {
    tracer.record({
      timestamp: new Date(),
      ruleId: "R_S1",
      rulePriority: 1,
      ruleDescription: "Summary test",
      affectedFields: [],
      decision: "APPLY",
      reason: "Applied",
      actionsApplied: [],
      warnings: [],
      metadata: { evaluationTimeMs: 10 },
    });

    const summary = tracer.summary();
    expect(summary).toContain("SUMMARY");
    expect(summary).toContain("APPLY");
    expect(summary).toContain("1");
  });
});

describe("Fase 2 Compositor: GeneratorInput Validator", () => {
  const validator = new GeneratorInputValidator();

  // ========== 17. GeneratorInput válido ==========
  it("17. GeneratorInput válido: cero errores", () => {
    const input = createMinimalGeneratorInput({
      lifecycles: [
        {
          id: "lc-venta",
          archetypeId: "venta",
          lifecycle: {} as any,
          compositionRole: "dominant",
        },
        {
          id: "lc-financiera",
          archetypeId: "financiera",
          lifecycle: {} as any,
          compositionRole: "secondary",
        },
      ],
    });

    const validation = validator.validate(input);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  // ========== 18. GeneratorInput inválido ==========
  it("18. GeneratorInput inválido: detecta errores", () => {
    const input = createMinimalGeneratorInput({
      lifecycles: [], // Sin lifecycles
    });

    const validation = validator.validate(input);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);

    const missingError = validation.errors.find((e) => e.type === "missing_lifecycle");
    expect(missingError).toBeDefined();
    expect(missingError?.fix).toContain("al menos un lifecycle");
  });

  // ========== Bonus: validateGeneratorInputFast ==========
  it("Bonus 1: validateGeneratorInputFast: check rápido", () => {
    const validInput = createMinimalGeneratorInput();
    expect(validateGeneratorInputFast(validInput)).toBe(true);

    const invalidInput = createMinimalGeneratorInput({ lifecycles: [] });
    expect(validateGeneratorInputFast(invalidInput)).toBe(false);
  });

  // ========== Bonus: getCriticalValidationErrors ==========
  it("Bonus 2: getCriticalValidationErrors: solo críticos", () => {
    const input = createMinimalGeneratorInput({ lifecycles: [] });
    const criticalErrors = getCriticalValidationErrors(input);
    expect(criticalErrors.length).toBeGreaterThan(0);
    expect(criticalErrors.every((e) => e.severity === "critical")).toBe(true);
  });

  // ========== Bonus: Validación report ==========
  it("Bonus 3: GeneratorInputValidator.report: texto legible", () => {
    const input = createMinimalGeneratorInput();
    const validation = validator.validate(input);
    const report = GeneratorInputValidator.report(validation);
    expect(report).toContain("VALIDACIÓN");
    expect(report).toContain("VÁLIDO");
    expect(report).toContain("COBERTURA");
  });

  // ========== Bonus: JSON export ==========
  it("Bonus 4: GeneratorInputValidator.toJSON: exporta correctamente", () => {
    const input = createMinimalGeneratorInput();
    const validation = validator.validate(input);
    const json = GeneratorInputValidator.toJSON(validation);
    const parsed = JSON.parse(json);
    expect(parsed.isValid).toBe(true);
    expect(parsed.coverage).toBeDefined();
  });
});

describe("Fase 2 Compositor: Integración End-to-End", () => {
  // ========== E2E: Composición + Traceabilidad + Validación ==========
  it("E2E 1: Flujo completo de composición", () => {
    const tracer = new Tracer();
    const validator = new GeneratorInputValidator();

    // 1. Crear perfil y contexto
    const profile = createMinimalProfile({
      paymentMode: { status: "known", value: "financiado" },
    });
    const ctx = createContext(profile);

    // 2. Evaluar condición
    const condition = RuleBuilder.AND(
      RuleBuilder.fieldEquals("paymentMode.value", "financiado"),
      RuleBuilder.confidenceMin("paymentMode", 0.5),
    );

    const conditionResult = evaluateCondition(condition, ctx);
    expect(conditionResult).toBe(true);

    // 3. Registrar en trace
    tracer.record({
      timestamp: new Date(),
      ruleId: "R_FINANCIERA",
      rulePriority: 50,
      ruleDescription: "Aplicar financiera si paymentMode=financiado",
      condition,
      conditionResult,
      affectedFields: [
        buildFieldSnapshot(
          "composition.secondaries",
          [],
          [{ archetypeId: "financiera" }],
        ),
      ],
      decision: "APPLY",
      reason: "Condición evaluó true, financiera aplicada",
      actionsApplied: [{ type: "add_secondary" } as any],
      warnings: [],
      metadata: { evaluationTimeMs: 1.2 },
    });

    // 4. Validar GeneratorInput
    const input = createMinimalGeneratorInput({
      paymentMode: "financiado",
      lifecycles: [
        {
          id: "lc-venta",
          archetypeId: "venta",
          lifecycle: {} as any,
          compositionRole: "dominant",
        },
        {
          id: "lc-financiera",
          archetypeId: "financiera",
          lifecycle: {} as any,
          compositionRole: "secondary",
        },
      ],
    });

    const validation = validator.validate(input);

    // 5. Verificar resultados
    expect(tracer.getTrace()).toHaveLength(1);
    expect(validation.isValid).toBe(true);
    expect(validation.coverage.percentage).toBe(100);

    const stats = tracer.stats();
    expect(stats.applied).toBe(1);
    expect(stats.totalEntries).toBe(1);
  });

  // ========== E2E: Múltiples reglas con conflictos ==========
  it("E2E 2: Múltiples reglas, detección de conflictos", () => {
    const tracer = new Tracer();

    // Regla 1: Aplicar financiera
    tracer.record({
      timestamp: new Date(),
      ruleId: "R_APPLY_FINANCIERA",
      rulePriority: 50,
      ruleDescription: "Aplicar financiera",
      affectedFields: [],
      decision: "APPLY",
      reason: "PaymentMode=financiado",
      actionsApplied: [{ type: "add_secondary" } as any],
      warnings: [],
      metadata: {},
    });

    // Regla 2: Prohibir financiera (conflicto)
    tracer.record({
      timestamp: new Date(),
      ruleId: "R_FORBID_FINANCIERA",
      rulePriority: 55,
      ruleDescription: "Prohibir financiera",
      affectedFields: [],
      decision: "CONFLICT",
      reason: "Financiera prohibida por política de riesgo",
      actionsApplied: [],
      warnings: ["Conflicto: R_APPLY_FINANCIERA y R_FORBID_FINANCIERA"],
      metadata: {},
    });

    const trace = tracer.getTrace();
    const stats = tracer.stats();

    expect(stats.applied).toBe(1);
    expect(stats.conflicts).toBe(1);
    const warnings = Array.from(trace[1]!.warnings);
    expect(warnings.some((w) => w.includes("Conflicto"))).toBe(true);
  });

  // ========== E2E: Performance con muchas reglas ==========
  it("E2E 3: Performance con 100+ reglas", () => {
    const tracer = new Tracer();
    const startTime = Date.now();

    for (let i = 0; i < 100; i++) {
      tracer.record({
        timestamp: new Date(),
        ruleId: `R_PERF_${i}`,
        rulePriority: i,
        ruleDescription: `Performance rule ${i}`,
        affectedFields: [],
        decision: i % 10 === 0 ? "CONFLICT" : "APPLY",
        reason: `Rule ${i}`,
        actionsApplied: [],
        warnings: [],
        metadata: { evaluationTimeMs: 0.5 },
      });
    }

    const elapsed = Date.now() - startTime;
    expect(tracer.getTrace()).toHaveLength(100);
    expect(elapsed).toBeLessThan(1000); // Menos de 1s para 100 reglas

    const stats = tracer.stats();
    expect(stats.totalEntries).toBe(100);
  });
});
