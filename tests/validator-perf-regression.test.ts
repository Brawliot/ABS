/**
 * Pruebas de Regresión de Performance del Validador UiSpec (Fase 3)
 *
 * SLA Baselines (de benchmarks Fase 2):
 * - 100 vistas: ~4ms → SLA: <5ms (+25% headroom)
 * - 250 vistas: ~7ms → SLA: <10ms (+40% headroom)
 * - 500 vistas: ~9ms → SLA: <12ms (+35% headroom)
 * - 1000 vistas: ~15ms → SLA: <25ms (+70% headroom)
 *
 * Estas pruebas fallarán si la performance regresa significativamente.
 * Utiles para: CI/CD, benchmarks de release, detectar bottlenecks.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateUiSpec,
  buildConcesionariaGeneratorInput,
} from "../generator/index.js";
import {
  validateUiSpecReport,
  resetValidatorObservability,
  getValidatorMetrics,
  exportValidatorMetricsCsv,
} from "../presentation/index.js";
import type { GeneratorInput } from "../generator/index.js";
import { writeFileSync } from "fs";
import { resolve } from "path";

// ============================================================================
// SETUP Y UTILITIES
// ============================================================================

interface PerformanceBenchmark {
  viewCount: number;
  durationMs: number;
  timestamp: string;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
}

let benchmarks: PerformanceBenchmark[] = [];

function generateInputWithNViews(n: number): GeneratorInput {
  const baseInput = buildConcesionariaGeneratorInput("TEST-ORG-001");

  // El input tiene un número base de vistas; si necesitamos más,
  // ampliaremos el spec después de generarlo
  return baseInput;
}

function generateSpecWithNViews(n: number, input: GeneratorInput) {
  const spec = generateUiSpec(input);

  // Ampliar spec para tener ~n vistas
  const baseViewCount = spec.views.length;
  const viewsNeeded = Math.max(0, n - baseViewCount);

  const expandedViews = Array.from({ length: viewsNeeded }, (_, i) => ({
    id: `view-expanded-${baseViewCount + i}`,
    kind: "tablero" as const,
    actionIds: [],
    formId: undefined,
    lifecycleId: spec.views[0]?.lifecycleId || "default",
    stateId: spec.views[0]?.stateId || "default",
    presentation: {},
    tooltip: "",
  }));

  // Retornar spec modificado sin mutar el original
  return {
    ...spec,
    views: [...spec.views, ...expandedViews],
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("Validator Performance Regression (Fase 3)", () => {
  beforeEach(() => {
    resetValidatorObservability();
    benchmarks = [];
  });

  afterEach(() => {
    // Export metrics to CSV for analysis
    const csv = generateBenchmarkCsv();
    const reportPath = resolve("./presentation/_uispec-validator-perf.csv");
    writeFileSync(reportPath, csv);
    console.log(`\n📊 Benchmark report: ${reportPath}`);
  });

  // ========================================================================
  // SLA 1: 100 vistas → < 8ms (con telemetría overhead)
  // ========================================================================
  it("SLA 1: valida 100 vistas en < 8ms (baseline ~4ms + telemetría)", async () => {
    const input = generateInputWithNViews(100);
    const spec = generateSpecWithNViews(100, input);

    const startMs = performance.now();
    const report = validateUiSpecReport(spec, input);
    const durationMs = performance.now() - startMs;

    const metrics = getValidatorMetrics();

    benchmarks.push({
      viewCount: 100,
      durationMs,
      timestamp: new Date().toISOString(),
      cacheHits: metrics.cacheHits,
      cacheMisses: metrics.cacheMisses,
      cacheHitRate: metrics.cacheHitRate,
    });

    console.log(`
  ✓ 100 vistas: ${durationMs.toFixed(2)}ms
    - Issues encontrados: ${report.issues.length}
    - Línea de base: 4ms (sin telemetría)
    - SLA: < 8ms (con telemetría)
    - Uso: ${(durationMs / 8 * 100).toFixed(1)}% del presupuesto
    `);

    expect(durationMs).toBeLessThan(8.0);
  });

  // ========================================================================
  // SLA 2: 250 vistas → < 10ms
  // ========================================================================
  it("SLA 2: valida 250 vistas en < 10ms (baseline ~7ms)", async () => {
    const input = generateInputWithNViews(250);
    const spec = generateSpecWithNViews(250, input);

    const startMs = performance.now();
    const report = validateUiSpecReport(spec, input);
    const durationMs = performance.now() - startMs;

    const metrics = getValidatorMetrics();

    benchmarks.push({
      viewCount: 250,
      durationMs,
      timestamp: new Date().toISOString(),
      cacheHits: metrics.cacheHits,
      cacheMisses: metrics.cacheMisses,
      cacheHitRate: metrics.cacheHitRate,
    });

    console.log(`
  ✓ 250 vistas: ${durationMs.toFixed(2)}ms
    - Issues encontrados: ${report.issues.length}
    - Línea de base: 7ms
    - SLA: < 10ms
    - Uso: ${(durationMs / 10 * 100).toFixed(1)}% del presupuesto
    `);

    expect(durationMs).toBeLessThan(10.0);
  });

  // ========================================================================
  // SLA 3: 500 vistas → < 12ms
  // ========================================================================
  it("SLA 3: valida 500 vistas en < 12ms (baseline ~9ms)", async () => {
    const input = generateInputWithNViews(500);
    const spec = generateSpecWithNViews(500, input);

    const startMs = performance.now();
    const report = validateUiSpecReport(spec, input);
    const durationMs = performance.now() - startMs;

    const metrics = getValidatorMetrics();

    benchmarks.push({
      viewCount: 500,
      durationMs,
      timestamp: new Date().toISOString(),
      cacheHits: metrics.cacheHits,
      cacheMisses: metrics.cacheMisses,
      cacheHitRate: metrics.cacheHitRate,
    });

    console.log(`
  ✓ 500 vistas: ${durationMs.toFixed(2)}ms
    - Issues encontrados: ${report.issues.length}
    - Línea de base: 9ms
    - SLA: < 12ms
    - Uso: ${(durationMs / 12 * 100).toFixed(1)}% del presupuesto
    `);

    expect(durationMs).toBeLessThan(12.0);
  });

  // ========================================================================
  // SLA 4: 1000 vistas → < 25ms
  // ========================================================================
  it("SLA 4: valida 1000 vistas en < 25ms (baseline ~15ms)", async () => {
    const input = generateInputWithNViews(1000);
    const spec = generateSpecWithNViews(1000, input);

    const startMs = performance.now();
    const report = validateUiSpecReport(spec, input);
    const durationMs = performance.now() - startMs;

    const metrics = getValidatorMetrics();

    benchmarks.push({
      viewCount: 1000,
      durationMs,
      timestamp: new Date().toISOString(),
      cacheHits: metrics.cacheHits,
      cacheMisses: metrics.cacheMisses,
      cacheHitRate: metrics.cacheHitRate,
    });

    console.log(`
  ✓ 1000 vistas: ${durationMs.toFixed(2)}ms
    - Issues encontrados: ${report.issues.length}
    - Línea de base: 15ms
    - SLA: < 25ms
    - Uso: ${(durationMs / 25 * 100).toFixed(1)}% del presupuesto
    `);

    expect(durationMs).toBeLessThan(25.0);
  });

  // ========================================================================
  // BONUS: Cache Efficiency Test
  // ========================================================================
  it("BONUS: Cache funciona para repeated specs", () => {
    // Reset antes de este test
    resetValidatorObservability();

    const input = generateInputWithNViews(50);
    const spec = generateSpecWithNViews(50, input);

    // Primera validación: cache miss
    const t1 = performance.now();
    validateUiSpecReport(spec, input);
    const time1 = performance.now() - t1;

    // Segunda validación del MISMO spec: cache hit (debe ser más rápida)
    const t2 = performance.now();
    validateUiSpecReport(spec, input);
    const time2 = performance.now() - t2;

    const metrics = getValidatorMetrics();

    console.log(`
  ✓ Cache Efficiency
    - Total validaciones: ${metrics.validationsAttempted}
    - Cache hits: ${metrics.cacheHits}
    - Cache misses: ${metrics.cacheMisses}
    - Hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%
    - Tiempo miss: ${time1.toFixed(2)}ms
    - Tiempo hit: ${time2.toFixed(2)}ms
    - Speedup: ${(time1 / Math.max(time2, 0.001)).toFixed(1)}x
    `);

    // Simplemente verificar que cache hits > 0
    expect(metrics.cacheHits).toBeGreaterThan(0);
  });

  // ========================================================================
  // BONUS: Metrics Export
  // ========================================================================
  it("BONUS: metrics export works (JSON + CSV)", () => {
    const input = generateInputWithNViews(50);
    const spec = generateSpecWithNViews(50, input);

    validateUiSpecReport(spec, input);

    const metrics = getValidatorMetrics();

    // Verify JSON export
    const metricsJson = JSON.stringify(metrics);
    const parsedJson = JSON.parse(metricsJson);

    expect(parsedJson).toHaveProperty("validationsAttempted");
    expect(parsedJson).toHaveProperty("cacheHitRate");
    expect(parsedJson).toHaveProperty("avgValidationTimeMs");

    // Verify CSV export
    const csv = exportValidatorMetricsCsv();

    expect(csv).toMatch(/timestamp,metric_name,value/);
    expect(csv).toMatch(/validations_attempted/);

    console.log(`
  ✓ Metrics Export
    - JSON: ${metricsJson.length} bytes
    - CSV: ${csv.split("\n").length} rows
    `);
  });
});

// ============================================================================
// UTILITIES
// ============================================================================

function generateBenchmarkCsv(): string {
  const rows: string[] = [];
  rows.push("timestamp,view_count,duration_ms,cache_hits,cache_misses,cache_hit_rate");

  for (const b of benchmarks) {
    rows.push(
      `${b.timestamp},${b.viewCount},${b.durationMs.toFixed(2)},${b.cacheHits},${b.cacheMisses},${b.cacheHitRate.toFixed(4)}`,
    );
  }

  return rows.join("\n");
}
