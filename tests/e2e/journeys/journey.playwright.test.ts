/**
 * Escenarios E2E multirol — camino feliz completo vía UI (Playwright).
 * No modifica pruebas existentes. Fallo = flujo incompleto (sin rebajar criterios).
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { openBrowser, startProfileApp } from "../helpers.js";
import { ALL_ARCHETYPES, JOURNEY_SCENARIOS } from "./scenarios.js";
import { runJourney, type JourneyResult } from "./runner.js";

const REPORT_DIR = resolve("tmp/e2e-journeys");
mkdirSync(REPORT_DIR, { recursive: true });

const results: JourneyResult[] = [];
let browser: Browser;
const suiteStarted = Date.now();

beforeAll(async () => {
  browser = await openBrowser();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  const elapsedMs = Date.now() - suiteStarted;
  const byArchetype = Object.fromEntries(
    ALL_ARCHETYPES.map((a) => {
      const hits = results.filter(
        (r) =>
          r.dominantArchetype === a ||
          r.steps.some((s) => s.archetypeId === a && s.ok),
      );
      return [
        a,
        {
          scenarios: hits.map((h) => h.scenarioId),
          completed: hits.filter((h) => h.completed).length,
        },
      ];
    }),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    suiteElapsedMs: elapsedMs,
    scenarios: results,
    coverageByArchetype: byArchetype,
    incomplete: results
      .filter((r) => !r.completed)
      .map((r) => ({
        scenarioId: r.scenarioId,
        profileId: r.profileId,
        ...(r.failureCause !== undefined ? { cause: r.failureCause } : {}),
        traversed: r.traversedTransitions,
        missedCanonical: r.missedCanonical,
      })),
  };

  writeFileSync(
    join(REPORT_DIR, "journey-coverage.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  writeFileSync(
    resolve("web/JOURNEY-COVERAGE-REPORT.md"),
    buildMd(report),
    "utf8",
  );
});

function buildMd(report: {
  generatedAt: string;
  suiteElapsedMs: number;
  scenarios: JourneyResult[];
  coverageByArchetype: Record<
    string,
    { scenarios: string[]; completed: number }
  >;
  incomplete: {
    scenarioId: string;
    profileId: string;
    cause?: string;
    traversed: readonly string[];
    missedCanonical: readonly string[];
  }[];
}): string {
  const lines = [
    "# JOURNEY-COVERAGE-REPORT — caminos felices multirol (Playwright)",
    "",
    `**Generado:** ${report.generatedAt}`,
    `**Duración suite journeys:** ${report.suiteElapsedMs} ms (${(report.suiteElapsedMs / 1000).toFixed(1)} s)`,
    "",
    "## Por escenario",
    "",
    "| Escenario | Perfil | Dominante | Completo | Cierre | Replay | Portal | Transiciones |",
    "|-----------|--------|-----------|----------|--------|--------|--------|--------------|",
  ];
  for (const s of report.scenarios) {
    lines.push(
      `| ${s.scenarioId} | ${s.profileId} | ${s.dominantArchetype} | ${s.completed ? "sí" : "NO"} | ${s.closureOk ? "ok" : "—"} | ${s.replayOk ? "ok" : "—"} | ${s.portalOk ? "ok" : "—"} | ${s.traversedTransitions.join(" → ") || "—"} |`,
    );
  }
  lines.push("", "## Cobertura por arquetipo", "");
  for (const [arch, info] of Object.entries(report.coverageByArchetype)) {
    lines.push(
      `- **${arch}:** ${info.completed} completo(s) · escenarios: ${info.scenarios.join(", ") || "(ninguno)"}`,
    );
  }
  lines.push("", "## Flujos no completados", "");
  if (report.incomplete.length === 0) {
    lines.push("Ninguno.");
  } else {
    for (const i of report.incomplete) {
      lines.push(
        `- **${i.scenarioId}** (${i.profileId}): ${i.cause ?? "desconocido"}`,
      );
      lines.push(`  - Recorrido: ${i.traversed.join(" → ") || "(nada)"}`);
      lines.push(
        `  - Happy path canónico no tocado: ${i.missedCanonical.join(", ") || "—"}`,
      );
    }
  }
  lines.push("", "## Trazabilidad", "");
  lines.push(
    "Definiciones: `tests/e2e/journeys/scenarios.ts`. Ejecución UI-only: `tests/e2e/journeys/runner.ts`.",
  );
  lines.push("", "*Fin JOURNEY-COVERAGE-REPORT.*", "");
  return lines.join("\n");
}

describe.sequential("Playwright journeys — camino feliz multirol", () => {
  it.each(JOURNEY_SCENARIOS.map((s) => [s.id, s] as const))(
    "%s",
    async (_id, scenario) => {
      const dbDir = mkdtempSync(
        join(tmpdir(), `abs-journey-${scenario.profileId}-`),
      );
      const app = await startProfileApp(scenario.profileId, {
        dbPath: join(dbDir, "events.sqlite"),
      });
      const page = await browser.newPage();
      let result: JourneyResult;
      try {
        result = await runJourney(page, app, scenario);
        results.push(result);
      } finally {
        await page.close();
        await app.close();
      }

      // Criterio estricto: incompleto = fallo de prueba
      expect(
        result.completed,
        result.failureCause ?? "escenario incompleto",
      ).toBe(true);
    },
    300_000,
  );

  it("los 6 arquetipos aparecen en al menos un escenario completo", () => {
    // Se evalúa tras los it.each (mismo describe sequential): resultados ya llenos
    // Si corre en paralelo de orden, comprobamos al final del archivo via afterAll
    // Aquí validamos cobertura de definición (catálogo).
    const covered = new Set<string>();
    for (const s of JOURNEY_SCENARIOS) {
      covered.add(s.dominantArchetype);
      for (const st of s.steps) covered.add(st.archetypeId);
    }
    for (const a of ALL_ARCHETYPES) {
      expect(covered.has(a), `arquetipo ${a} ausente del catálogo`).toBe(true);
    }
  });
});
