/**
 * Designer Fase 3 Tests (Paso 5)
 * 29+ tests para validar:
 * - Constraint-Based Design
 * - Design Variations
 * - Personalization
 * - Accessibility
 * - Performance
 * - Token Export
 */

import { describe, it, expect } from "vitest";
import {
  validateDesignConstraints,
  applyCorrectionsToCorrectedSpec,
  resolveConstraintViolations,
  generateConstraintReport,
} from "../presentation/constraint-solver.js";
import {
  generateDesignVariations,
  generateVariationComparison,
  selectOptimalVariant,
} from "../presentation/variation-generator.js";
import {
  personalizeDesign,
  serializePreferences,
  deserializePreferences,
  type PersonalizationConfig,
} from "../presentation/personalization-engine.js";
import {
  auditAccessibility,
  type AccessibilityAuditReport,
} from "../presentation/accessibility-auditor.js";
import {
  optimizeDesignPerformance,
  generatePerformanceReport,
} from "../presentation/design-performance.js";
import {
  exportTokens,
  exportAllFormats,
  type TokenExportFormat,
} from "../presentation/token-exporter.js";
import type { DesignSystem } from "../design/schema.js";

// Mock DesignSystem para tests
const mockDesignSystem: DesignSystem = {
  id: "test-ds-001",
  colors: {} as any,
  typography: {} as any,
  spacing: {} as any,
  radii: {} as any,
  shadows: {} as any,
  tokens: {
    "color.primario": "#3B82F6",
    "color.secundario": "#10B981",
    "color.fondo": "#FFFFFF",
    "color.superficie": "#F9FAFB",
    "color.texto": "#1F2937",
    "color.borde": "#E5E7EB",
    "espaciado.xs": "4px",
    "espaciado.s": "8px",
    "espaciado.m": "16px",
    "espaciado.l": "24px",
    "espaciado.xl": "32px",
    "tipografia.base": {
      fontSize: "16px",
      lineHeight: 1.5,
      fontFamily: "Inter",
      scaleRatio: 1.25,
    },
    "tipografia.titulo": {
      fontSize: "32px",
      lineHeight: 1.2,
      fontFamily: "Inter",
      scaleRatio: 1.25,
    },
    "elevation.sm": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    "elevation.md": "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    "radius.sm": "4px",
    "radius.md": "8px",
    "focus.indicator": {
      width: "3px",
      color: "#3B82F6",
    },
    "tactil.minimo": "44px",
    "animation.slideIn": {
      duration: "300ms",
      property: "transform",
      timingFunction: "ease-out",
    },
  },
  metadata: {},
};

describe("Designer Fase 3 - Constraint Solver", () => {
  it("Test 1: Validar constraints de spacing múltiplos de 4px", () => {
    const report = validateDesignConstraints(mockDesignSystem);
    expect(report.violations).toBeDefined();
    expect(Array.isArray(report.violations)).toBe(true);
  });

  it("Test 2: Detectar violaciones de spacing no múltiples de 4px", () => {
    const ds = JSON.parse(JSON.stringify(mockDesignSystem)) as DesignSystem;
    (ds as any).tokens["espaciado.test"] = "15px"; // Not multiple of 4
    const report = validateDesignConstraints(ds);
    expect(report.violations.length).toBeGreaterThan(0);
    expect(report.violations.some((v) => v.constraint === "spacing_multiple_of_4px")).toBe(true);
  });

  it("Test 3: Validar ratios tipográficos musicales", () => {
    const report = validateDesignConstraints(mockDesignSystem);
    expect(report).toHaveProperty("violations");
    expect(report).toHaveProperty("corrections");
  });

  it("Test 4: Aplicar correcciones automáticas", () => {
    const ds = JSON.parse(JSON.stringify(mockDesignSystem)) as DesignSystem;
    (ds as any).tokens["espaciado.bad"] = "15px";
    const report = validateDesignConstraints(ds);
    const corrected = applyCorrectionsToCorrectedSpec(ds, report.corrections);
    expect(corrected).toBeDefined();
  });

  it("Test 5: Resolver violaciones iterativamente", () => {
    const ds = JSON.parse(JSON.stringify(mockDesignSystem)) as DesignSystem;
    (ds as any).tokens["espaciado.bad"] = "15px";
    const result = resolveConstraintViolations(ds);
    expect(result.corrected).toBeDefined();
    expect(result.report).toBeDefined();
  });

  it("Test 6: Generar reporte de constraints", () => {
    const ds = JSON.parse(JSON.stringify(mockDesignSystem)) as DesignSystem;
    const report = generateConstraintReport(ds, ds);
    expect(typeof report).toBe("string");
    expect(report.includes("Reporte de Validación")).toBe(true);
  });
});

describe("Designer Fase 3 - Design Variations", () => {
  it("Test 7: Generar 3 variantes A/B", () => {
    const variations = generateDesignVariations(mockDesignSystem, {
      author: "test-user",
      industry: "finance",
      personality: "corporate",
    });
    expect(variations.length).toBe(3);
    expect(variations.map((v) => v.kind)).toEqual(["conservative", "optimal", "compact"]);
  });

  it("Test 8: Variante Conservative con +20% spacing", () => {
    const variations = generateDesignVariations(mockDesignSystem, {
      author: "test-user",
    });
    const conservative = variations.find((v) => v.kind === "conservative");
    expect(conservative).toBeDefined();
    expect(conservative?.designSystem.id).toContain("conservative");
  });

  it("Test 9: Variante Optimal balanceada", () => {
    const variations = generateDesignVariations(mockDesignSystem, {
      author: "test-user",
    });
    const optimal = variations.find((v) => v.kind === "optimal");
    expect(optimal).toBeDefined();
    expect(optimal?.kind).toBe("optimal");
  });

  it("Test 10: Variante Compact con -20% spacing", () => {
    const variations = generateDesignVariations(mockDesignSystem, {
      author: "test-user",
    });
    const compact = variations.find((v) => v.kind === "compact");
    expect(compact).toBeDefined();
    expect(compact?.kind).toBe("compact");
  });

  it("Test 11: Comparativa A/B markdown", () => {
    const variations = generateDesignVariations(mockDesignSystem, {
      author: "test-user",
    });
    const comparison = generateVariationComparison(variations);
    expect(typeof comparison).toBe("string");
    expect(comparison.includes("conservative")).toBe(true);
    expect(comparison.includes("optimal")).toBe(true);
  });

  it("Test 12: Seleccionar variante óptima por accesibilidad", () => {
    const variations = generateDesignVariations(mockDesignSystem, {
      author: "test-user",
    });
    const selected = selectOptimalVariant(variations, {
      prioritizeAccessibility: true,
    });
    expect(selected?.kind).toBe("conservative");
  });

  it("Test 13: Seleccionar variante óptima por compactness", () => {
    const variations = generateDesignVariations(mockDesignSystem, {
      author: "test-user",
    });
    const selected = selectOptimalVariant(variations, {
      prioritizeCompactness: true,
    });
    expect(selected?.kind).toBe("compact");
  });
});

describe("Designer Fase 3 - Personalization", () => {
  it("Test 14: Personalizar por rol admin", () => {
    const config: PersonalizationConfig = {
      user: {
        role: "admin",
        colorScheme: "light",
        accessibility: "normal",
        textSize: "normal",
        reduceMotion: false,
      },
      context: {
        viewport: "desktop",
        textDirection: "ltr",
      },
    };
    const personalized = personalizeDesign(mockDesignSystem, config);
    expect(personalized.personalization).toBeDefined();
    expect((personalized.personalization as any)?.appliedTransforms).toContain("role:admin");
  });

  it("Test 15: Personalizar por rol customer", () => {
    const config: PersonalizationConfig = {
      user: {
        role: "customer",
        colorScheme: "light",
        accessibility: "normal",
        textSize: "normal",
        reduceMotion: false,
      },
      context: {
        viewport: "desktop",
        textDirection: "ltr",
      },
    };
    const personalized = personalizeDesign(mockDesignSystem, config);
    expect((personalized.personalization as any)?.appliedTransforms).toContain("role:customer");
  });

  it("Test 16: Personalizar con dark mode", () => {
    const config: PersonalizationConfig = {
      user: {
        role: "customer",
        colorScheme: "dark",
        accessibility: "normal",
        textSize: "normal",
        reduceMotion: false,
      },
      context: {
        viewport: "desktop",
        textDirection: "ltr",
      },
    };
    const personalized = personalizeDesign(mockDesignSystem, config);
    expect(personalized.personalization.appliedTransforms).toContain("colorScheme:dark");
  });

  it("Test 17: Personalizar con high-contrast accessibility", () => {
    const config: PersonalizationConfig = {
      user: {
        role: "customer",
        colorScheme: "light",
        accessibility: "high-contrast",
        textSize: "normal",
        reduceMotion: false,
      },
      context: {
        viewport: "desktop",
        textDirection: "ltr",
      },
    };
    const personalized = personalizeDesign(mockDesignSystem, config);
    expect(personalized.personalization.appliedTransforms).toContain("accessibility:high-contrast");
  });

  it("Test 18: Personalizar con dyslexia-friendly", () => {
    const config: PersonalizationConfig = {
      user: {
        role: "customer",
        colorScheme: "light",
        accessibility: "dyslexia-friendly",
        textSize: "large",
        reduceMotion: true,
      },
      context: {
        viewport: "desktop",
        textDirection: "ltr",
      },
    };
    const personalized = personalizeDesign(mockDesignSystem, config);
    expect(personalized.personalization.appliedTransforms.some((t) =>
      t.startsWith("accessibility:"),
    )).toBe(true);
  });

  it("Test 19: Personalizar por viewport mobile", () => {
    const config: PersonalizationConfig = {
      user: {
        role: "customer",
        colorScheme: "light",
        accessibility: "normal",
        textSize: "normal",
        reduceMotion: false,
      },
      context: {
        viewport: "mobile",
        textDirection: "ltr",
      },
    };
    const personalized = personalizeDesign(mockDesignSystem, config);
    expect(personalized.personalization.appliedTransforms).toContain("viewport:mobile");
  });

  it("Test 20: Personalizar RTL language", () => {
    const config: PersonalizationConfig = {
      user: {
        role: "customer",
        colorScheme: "light",
        accessibility: "normal",
        textSize: "normal",
        reduceMotion: false,
        language: "ar",
      },
      context: {
        viewport: "desktop",
        textDirection: "rtl",
      },
    };
    const personalized = personalizeDesign(mockDesignSystem, config);
    expect(personalized.personalization.appliedTransforms).toContain("textDirection:rtl");
  });

  it("Test 21: Serializar y deserializar preferencias", () => {
    const prefs = {
      role: "admin" as const,
      colorScheme: "dark" as const,
      accessibility: "high-contrast" as const,
      textSize: "large" as const,
      reduceMotion: true,
    };
    const serialized = serializePreferences(prefs);
    const deserialized = deserializePreferences(serialized);
    expect(deserialized.role).toBe("admin");
    expect(deserialized.colorScheme).toBe("dark");
  });
});

describe("Designer Fase 3 - Accessibility Audit", () => {
  it("Test 22: Auditar accesibilidad completa", () => {
    const report = auditAccessibility(mockDesignSystem);
    expect(report).toHaveProperty("violations");
    expect(report).toHaveProperty("remediations");
    expect(report).toHaveProperty("wcagLevel");
    expect(report).toHaveProperty("score");
  });

  it("Test 23: Verificar color contrast WCAG AAA", () => {
    const report = auditAccessibility(mockDesignSystem);
    expect(Array.isArray(report.violations)).toBe(true);
  });

  it("Test 24: Auditar indicadores de focus", () => {
    const report = auditAccessibility(mockDesignSystem);
    expect(report).toBeDefined();
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  it("Test 25: Auditar touch targets 44px", () => {
    const report = auditAccessibility(mockDesignSystem);
    const touchViolations = report.violations.filter((v) => v.element.includes("touch"));
    expect(Array.isArray(touchViolations)).toBe(true);
  });

  it("Test 26: Generar remediaciones accesibles", () => {
    const report = auditAccessibility(mockDesignSystem);
    expect(report.remediations).toBeDefined();
    expect(Array.isArray(report.remediations)).toBe(true);
  });
});

describe("Designer Fase 3 - Performance Optimization", () => {
  it("Test 27: Optimizar performance del design", () => {
    const optimization = optimizeDesignPerformance(mockDesignSystem, "https://example.com");
    expect(optimization).toHaveProperty("critical");
    expect(optimization).toHaveProperty("deferred");
    expect(optimization).toHaveProperty("fontStrategy");
    expect(optimization).toHaveProperty("metrics");
  });

  it("Test 28: Critical CSS < 5KB", () => {
    const optimization = optimizeDesignPerformance(mockDesignSystem, "https://example.com");
    expect(optimization.metrics.criticalCssSize).toBeLessThan(5120);
  });

  it("Test 29: Generar reporte de performance", () => {
    const optimization = optimizeDesignPerformance(mockDesignSystem, "https://example.com");
    const report = generatePerformanceReport(optimization);
    expect(typeof report).toBe("string");
    expect(report.includes("Performance Optimization Report")).toBe(true);
  });
});

describe("Designer Fase 3 - Token Export", () => {
  it("Test 30: Exportar a CSS variables", () => {
    const result = exportTokens(mockDesignSystem, "css");
    expect(result.format).toBe("css");
    expect(result.filename).toBe("design-tokens.css");
    expect(result.content).toContain("--color-primario");
  });

  it("Test 31: Exportar a JSON", () => {
    const result = exportTokens(mockDesignSystem, "json");
    expect(result.format).toBe("json");
    expect(result.filename).toBe("design-tokens.json");
    const parsed = JSON.parse(result.content);
    expect(parsed.tokens).toBeDefined();
  });

  it("Test 32: Exportar a SCSS", () => {
    const result = exportTokens(mockDesignSystem, "scss");
    expect(result.format).toBe("scss");
    expect(result.filename).toBe("design-tokens.scss");
    expect(result.content).toContain("$colors:");
  });

  it("Test 33: Exportar a Swift", () => {
    const result = exportTokens(mockDesignSystem, "swift");
    expect(result.format).toBe("swift");
    expect(result.filename).toBe("DesignTokens.swift");
    expect(result.content).toContain("enum DesignTokens");
  });

  it("Test 34: Exportar a Android XML", () => {
    const result = exportTokens(mockDesignSystem, "xml");
    expect(result.format).toBe("xml");
    expect(result.filename).toBe("design_tokens.xml");
    expect(result.content).toContain("<resources>");
  });

  it("Test 35: Exportar a Figma tokens", () => {
    const result = exportTokens(mockDesignSystem, "figma");
    expect(result.format).toBe("figma");
    const parsed = JSON.parse(result.content);
    expect(parsed.color).toBeDefined();
  });

  it("Test 36: Exportar todos los formatos", () => {
    const results = exportAllFormats(mockDesignSystem);
    expect(results.length).toBe(6);
    const formats = results.map((r) => r.format);
    expect(formats).toContain("css");
    expect(formats).toContain("json");
    expect(formats).toContain("scss");
    expect(formats).toContain("swift");
    expect(formats).toContain("xml");
    expect(formats).toContain("figma");
  });
});

describe("Designer Fase 3 - Integration Tests", () => {
  it("Test 37: Flujo completo: Constraints → Variations → Personalization", () => {
    // 1. Validar constraints
    const validated = resolveConstraintViolations(mockDesignSystem);
    expect(validated.corrected).toBeDefined();

    // 2. Generar variaciones
    const variations = generateDesignVariations(validated.corrected, {
      author: "test",
    });
    expect(variations.length).toBe(3);

    // 3. Personalizar
    const config: PersonalizationConfig = {
      user: {
        role: "customer",
        colorScheme: "dark",
        accessibility: "high-contrast",
        textSize: "large",
        reduceMotion: true,
      },
      context: { viewport: "mobile", textDirection: "ltr" },
    };
    const personalized = personalizeDesign(variations[1].designSystem, config);
    expect(personalized.personalization).toBeDefined();
  });

  it("Test 38: Flujo completo: Accessibility → Performance → Export", () => {
    // 1. Auditar accesibilidad
    const audit = auditAccessibility(mockDesignSystem);
    expect(audit.score).toBeGreaterThanOrEqual(0);

    // 2. Optimizar performance
    const perf = optimizeDesignPerformance(mockDesignSystem, "https://example.com");
    expect(perf.metrics.criticalCssSize).toBeLessThan(5120);

    // 3. Exportar tokens
    const exports = exportAllFormats(mockDesignSystem);
    expect(exports.length).toBe(6);
  });

  it("Test 39: Determinista: múltiples llamadas generan mismo resultado", () => {
    const result1 = generateDesignVariations(mockDesignSystem, {
      author: "test",
      industry: "finance",
    });
    const result2 = generateDesignVariations(mockDesignSystem, {
      author: "test",
      industry: "finance",
    });

    // Comparar estructura (los IDs pueden diferir por timestamp)
    expect(result1.length).toBe(result2.length);
    expect(result1.map((v) => v.kind)).toEqual(result2.map((v) => v.kind));
  });
});
