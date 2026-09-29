/**
 * Criterios Consultor MVP + banco de 30 preguntas.
 */

import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ventaArchetype } from "../archetypes/venta.js";
import {
  consult,
  UnansweredGapLog,
  type MetricFactRow,
} from "../consultant/index.js";
import type { FilterReader } from "../filter/types.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import type { PolicyDocument } from "../policies/types.js";
import { CONSULTANT_QUESTION_BANK } from "./bank/consultant-questions.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe"],
);
const activationAt = "2026-04-01T00:00:00.000Z";

function compileDoc() {
  const doc: PolicyDocument = {
    id: "consultor-pack",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "finanzas", label: "Finanzas" },
      { id: "gerente", label: "Gerente" },
    ],
    organization: {
      sedes: [
        { id: "sede-a", label: "Sede A" },
        { id: "sede-b", label: "Sede B" },
      ],
      equipos: [
        { id: "eq-a", label: "Eq A", sedeId: "sede-a" },
        { id: "eq-b", label: "Eq B", sedeId: "sede-b" },
      ],
      assignments: [
        {
          actorId: "u-vend-a",
          sedeId: "sede-a",
          equipoId: "eq-a",
          roleId: "vendedor",
        },
        {
          actorId: "u-vend-b",
          sedeId: "sede-b",
          equipoId: "eq-b",
          roleId: "vendedor",
        },
        {
          actorId: "u-fin",
          sedeId: "sede-a",
          equipoId: "eq-a",
          roleId: "finanzas",
        },
      ],
    },
    permissions: [
      {
        id: "vis-sede",
        kind: "permiso",
        action: "consultar",
        allowedRoles: ["vendedor", "finanzas", "gerente"],
        visibility: { scope: "sede" },
      },
    ],
  };
  return compilePolicies(doc, { catalog, activationAt });
}

function fact(
  over: Partial<MetricFactRow> & Pick<MetricFactRow, "id" | "sedeId" | "canal" | "month">,
): MetricFactRow {
  return {
    tenantId: "acme",
    equipoId: over.sedeId === "sede-b" ? "eq-b" : "eq-a",
    segmento: "retail",
    year: 2026,
    importe: 1000,
    unidades: 2,
    ingresos_previstos: 1200,
    conversion: 0.4,
    ticket_medio: 500,
    ...over,
  };
}

const FACTS: readonly MetricFactRow[] = [
  fact({
    id: "m1",
    sedeId: "sede-a",
    canal: "web",
    month: 3,
    importe: 5000,
    segmento: "retail",
  }),
  fact({
    id: "m2",
    sedeId: "sede-a",
    canal: "presencial",
    month: 3,
    importe: 3000,
    segmento: "empresa",
  }),
  fact({
    id: "m3",
    sedeId: "sede-b",
    canal: "web",
    month: 3,
    importe: 8000,
    segmento: "premium",
  }),
  fact({
    id: "m4",
    sedeId: "sede-b",
    canal: "presencial",
    month: 3,
    importe: 2000,
  }),
  fact({
    id: "m5",
    sedeId: "sede-a",
    canal: "web",
    month: 4,
    importe: 1000,
  }),
];

const readerVendA: FilterReader = {
  id: "u-vend-a",
  roles: ["vendedor"],
  tenantId: "acme",
};

describe("Consultor MVP", () => {
  const ruleSet = compileDoc();

  it('"¿Cuánto vendimos en marzo por canal?" produce la consulta correcta y muestra su cálculo', () => {
    const out = consult({
      question: "¿Cuánto vendimos en marzo por canal?",
      reader: readerVendA,
      ruleSet,
      facts: FACTS,
      defaultYear: 2026,
    });
    expect(out.kind).toBe("respuesta");
    if (out.kind !== "respuesta") return;
    expect(out.query.metricId).toBe("ventas_importe");
    expect(out.query.groupBy).toEqual(["canal"]);
    expect(out.query.period).toEqual({ year: 2026, month: 3 });
    expect(out.calculation.metricId).toBe("ventas_importe");
    expect(out.calculation.period.month).toBe(3);
    expect(out.calculation.groupBy).toContain("canal");
    // Solo sede-a (permiso sede): web 5000 + presencial 3000
    expect(out.total).toBe(8000);
    expect(out.buckets.some((b) => b.dimensions.canal === "web")).toBe(true);
  });

  it("un vendedor que pregunta por otra sede recibe solo lo que su permiso le permite", () => {
    const out = consult({
      question: "Ventas de marzo por sede",
      reader: readerVendA,
      ruleSet,
      facts: FACTS,
      defaultYear: 2026,
    });
    expect(out.kind).toBe("respuesta");
    if (out.kind !== "respuesta") return;
    // Filas sede-b denegadas por visibility sede
    expect(out.calculation.rowsAfterFilter).toBeLessThan(
      out.calculation.rowsConsidered,
    );
    const sedes = out.buckets.map((b) => b.dimensions.sede);
    expect(sedes.every((s) => s === "sede-a")).toBe(true);
    expect(out.total).toBe(8000);

    // Pregunta explícita por sede-b: filtro pide sede-b pero Filtro deniega filas
    const other = consult({
      question: "Ventas de marzo por canal en sede-b",
      reader: readerVendA,
      ruleSet,
      facts: FACTS,
      defaultYear: 2026,
    });
    expect(other.kind).toBe("respuesta");
    if (other.kind !== "respuesta") return;
    expect(other.query.filters.sedeId).toBe("sede-b");
    expect(other.total).toBe(0);
    expect(other.calculation.rowsAfterFilter).toBe(0);
  });

  it("una pregunta fuera del catálogo genera una aclaración, no una cifra inventada", () => {
    const gaps = new UnansweredGapLog();
    const out = consult({
      question: "¿Cuál es el stock de almacén?",
      reader: readerVendA,
      ruleSet,
      facts: FACTS,
      gapLog: gaps,
    });
    expect(out.kind).toBe("aclaracion");
    if (out.kind !== "aclaracion") return;
    expect(out.clarificationAsked).toBe(true);
    expect(out.reason).toBe("out_of_catalog");
    expect(gaps.size()).toBe(1);
    expect(gaps.all()[0]!.missingHint.length).toBeGreaterThan(3);
    // No hay total inventado
    expect("total" in out).toBe(false);
  });

  it("mide la precisión con 30 preguntas de prueba y reporta los fallos", () => {
    const failures: {
      id: string;
      question: string;
      detail: string;
    }[] = [];

    for (const g of CONSULTANT_QUESTION_BANK) {
      const out = consult({
        question: g.question,
        reader: readerVendA,
        ruleSet,
        facts: FACTS,
        defaultYear: 2026,
      });
      if (g.expect === "aclaracion") {
        if (out.kind !== "aclaracion") {
          failures.push({
            id: g.id,
            question: g.question,
            detail: `esperaba aclaracion, obtuvo ${out.kind}`,
          });
        } else if (g.reason && out.reason !== g.reason) {
          // ambiguous vs out_of_catalog: aceptar ambos si expect aclaracion
          if (
            !(
              (g.reason === "out_of_catalog" || g.reason === "ambiguous") &&
              (out.reason === "out_of_catalog" || out.reason === "ambiguous")
            )
          ) {
            failures.push({
              id: g.id,
              question: g.question,
              detail: `reason ${out.reason} ≠ ${g.reason}`,
            });
          }
        }
        continue;
      }
      if (out.kind !== "respuesta") {
        failures.push({
          id: g.id,
          question: g.question,
          detail: `esperaba respuesta, obtuvo ${out.kind}`,
        });
        continue;
      }
      if (out.query.metricId !== g.metricId) {
        failures.push({
          id: g.id,
          question: g.question,
          detail: `metric ${out.query.metricId} ≠ ${g.metricId}`,
        });
      }
      if (out.query.period.year !== g.period.year) {
        failures.push({
          id: g.id,
          question: g.question,
          detail: `year ${out.query.period.year} ≠ ${g.period.year}`,
        });
      }
      if (g.period.month !== undefined && out.query.period.month !== g.period.month) {
        failures.push({
          id: g.id,
          question: g.question,
          detail: `month ${out.query.period.month} ≠ ${g.period.month}`,
        });
      }
      const gb = [...out.query.groupBy].sort().join(",");
      const exp = [...g.groupBy].sort().join(",");
      if (gb !== exp) {
        failures.push({
          id: g.id,
          question: g.question,
          detail: `groupBy [${gb}] ≠ [${exp}]`,
        });
      }
      if (g.filters?.canal && out.query.filters.canal !== g.filters.canal) {
        failures.push({
          id: g.id,
          question: g.question,
          detail: `canal ${out.query.filters.canal} ≠ ${g.filters.canal}`,
        });
      }
      if (g.filters?.sedeId && out.query.filters.sedeId !== g.filters.sedeId) {
        failures.push({
          id: g.id,
          question: g.question,
          detail: `sede ${out.query.filters.sedeId} ≠ ${g.filters.sedeId}`,
        });
      }
      if (g.filters?.segmento && out.query.filters.segmento !== g.filters.segmento) {
        failures.push({
          id: g.id,
          question: g.question,
          detail: `segmento ${out.query.filters.segmento} ≠ ${g.filters.segmento}`,
        });
      }
      if (!out.calculation.metricId) {
        failures.push({
          id: g.id,
          question: g.question,
          detail: "sin calculation.metricId",
        });
      }
    }

    const n = CONSULTANT_QUESTION_BANK.length;
    const correct = n - failures.length;
    const accuracy = correct / n;
    const report = {
      measuredAt: new Date().toISOString(),
      n,
      correct,
      accuracy,
      accuracyPct: Number((accuracy * 100).toFixed(2)),
      failures,
    };
    const outPath = resolve(
      process.cwd(),
      "tests/bank/consultant-report.json",
    );
    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
    console.log(
      `\n[CONSULTANT] accuracy=${report.accuracyPct}% (${correct}/${n}) → ${outPath}`,
    );
    if (failures.length) {
      console.log("[CONSULTANT] fallos:", JSON.stringify(failures, null, 2));
    }
    expect(n).toBe(30);
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });
});
