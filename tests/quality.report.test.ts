/**
 * Informe de calidad Fase B — genera test-report.json.
 * No marca en verde niveles no construidos.
 */

import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adapterInventory } from "../adapters/index.js";
import {
  PERF_THRESHOLDS,
  PROPERTY_SEEDS_CI,
  PROPERTY_SEEDS_NIGHTLY,
  propertyNumRuns,
} from "../quality/config.js";

type LevelReport = {
  level: number;
  name: string;
  status: "executed" | "partial" | "not_built" | "blocked_adapter";
  notes: string;
  pilotBlocking?: boolean;
  productionBlocking?: boolean;
};

describe("Informe calidad Fase B", () => {
  it("escribe test-report.json con separación piloto vs producción", () => {
    const realCorpusPath = resolve("tests/real/diagnosis.jsonl");
    let realCases = 0;
    try {
      const raw = readFileSync(realCorpusPath, "utf8").trim();
      if (raw.startsWith("{")) {
        const j = JSON.parse(raw) as { cases?: unknown[] };
        realCases = Array.isArray(j.cases) ? j.cases.length : 0;
      } else if (raw.length > 0) {
        realCases = raw.split("\n").filter((l) => l.trim()).length;
      }
    } catch {
      realCases = 0;
    }

    const levels: LevelReport[] = [
      {
        level: 1,
        name: "Propiedades generativas",
        status: "executed",
        notes: `${propertyNumRuns()} seeds (CI=${PROPERTY_SEEDS_CI}, nightly=${PROPERTY_SEEDS_NIGHTLY})`,
      },
      {
        level: 2,
        name: "Integración puentes",
        status: "executed",
        notes: "Puentes 0-1, hechos, intérprete, filtro, UX, presentador, diseño, qa/sec",
      },
      {
        level: 3,
        name: "E2E NL→navegador→cierre",
        status: "not_built",
        notes: "Playwright scaffold; sin E2E concesionaria en navegador",
        pilotBlocking: true,
        productionBlocking: true,
      },
      {
        level: 4,
        name: "Operación 10 empresas × 90 días",
        status: "not_built",
        notes: "Arnés no construido",
        productionBlocking: true,
      },
      {
        level: 5,
        name: "Concurrencia e idempotencia",
        status: "partial",
        notes:
          "Ejecutado: carrera crédito in-process, idempotencia intérprete, SQLite dup id. Pendiente: stock multi-proceso",
        pilotBlocking: true,
      },
      {
        level: 6,
        name: "Fallos (LLM/integración/reinicio)",
        status: "not_built",
        notes: "Sin pérdida/duplicado bajo fallo — no construido",
        pilotBlocking: true,
        productionBlocking: true,
      },
      {
        level: 7,
        name: "Seguridad",
        status: "executed",
        notes: "Tenancy, filtro sede, forzado, SoD, concesionaria sin falsos críticos",
      },
      {
        level: 8,
        name: "Componentes IA (n≥139)",
        status: "blocked_adapter",
        notes: `Corpus real diagnosis cases=${realCases}. Bancos sintéticos = smoke (limitación). LLM real parcial (diagnóstico OpenAI opcional).`,
        productionBlocking: true,
      },
      {
        level: 9,
        name: "Rendimiento",
        status: "blocked_adapter",
        notes: `Umbrales fijados: p95 transición <${PERF_THRESHOLDS.transitionP95MsWithRealDb}ms (BD real); replay 100k <${PERF_THRESHOLDS.replay100kMs}ms; UiSpec mediana con LLM <${PERF_THRESHOLDS.uiSpecGenMedianMsWithLlm}ms; sin LLM <${PERF_THRESHOLDS.uiSpecGenMedianMsWithoutLlm}ms. Medición con BD real pendiente de harness.`,
        productionBlocking: true,
      },
    ];

    const adapters = adapterInventory();
    const pilotBlockers = levels.filter(
      (l) =>
        l.pilotBlocking &&
        (l.status === "not_built" ||
          l.status === "blocked_adapter" ||
          l.status === "partial"),
    );
    const productionBlockers = levels.filter(
      (l) =>
        l.productionBlocking &&
        (l.status === "not_built" ||
          l.status === "blocked_adapter" ||
          l.status === "partial"),
    );

    const readyForPilot = false; // explícito: hay bloqueantes no construidos
    const verdict = {
      readyForPilot,
      reason:
        "Faltan criterios bloqueantes de piloto: E2E concesionaria (navegador), fallos sin pérdida/duplicado, concurrencia completa con BD real, aislamiento multiempresa bajo carga",
      criteria: {
        zeroCriticalFailures: "unknown_not_fully_executed",
        invariantsAndReplay100: "partial_properties_only",
        noEventLossOnFailure: "not_built",
        aiComponentsAboveThresholdWithCiLowerBound: "blocked_no_real_corpus",
      },
    };

    const report = {
      generatedAt: new Date().toISOString(),
      phase: "B",
      propertySeeds: propertyNumRuns(),
      thresholds: PERF_THRESHOLDS,
      adapters,
      levels,
      pilotBlockingGaps: pilotBlockers.map((l) => ({
        level: l.level,
        name: l.name,
        status: l.status,
        notes: l.notes,
      })),
      productionBlockingGaps: productionBlockers.map((l) => ({
        level: l.level,
        name: l.name,
        status: l.status,
        notes: l.notes,
      })),
      limitations: [
        "/tests/real vacío o sin casos — bancos sintéticos solo smoke",
        "Niveles 3,4,6,8,9 no_construido o blocked_adapter — nunca en verde",
      ],
      priorityFixes: [
        "1. Completar SqliteEventStore en caminos de transición + medir p95",
        "2. Playwright E2E concesionaria (criterio piloto)",
        "3. Suite fallos sin pérdida/duplicado (criterio piloto)",
        "4. Aportar corpus /tests/real para extractor (nivel 8)",
        "5. Adaptador LLM real para Diseñador/Redactor/Consultor/Intérprete",
        "6. Arnés 10×90 días (producción)",
      ],
      verdict,
    };

    const outDir = resolve(".");
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outPath = resolve("test-report.json");
    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

    expect(report.verdict.readyForPilot).toBe(false);
    expect(report.levels.some((l) => l.status === "not_built")).toBe(true);
    expect(report.pilotBlockingGaps.length).toBeGreaterThan(0);
    console.log(
      `[QUALITY] readyForPilot=${readyForPilot} — report → ${outPath}`,
    );
    console.log(
      `[QUALITY] piloto bloqueantes: ${pilotBlockers.map((l) => l.level).join(",")}`,
    );
    console.log(
      `[QUALITY] producción bloqueantes: ${productionBlockers.map((l) => l.level).join(",")}`,
    );
  });
});
