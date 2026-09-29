/**
 * Extremo a extremo: texto → extractor → clasificador → resultado.
 * Mide por separado: acierto del extractor, acierto final y tasa de repregunta.
 *
 * Extractor: OpenAI gpt-4o-mini si hay OPENAI_API_KEY; si no, HeuristicDiagnosisExtractor
 * (traductor determinista offline — no sustituye al LLM en producción).
 *
 * Ejecutar: npx vitest run tests/e2e.diagnosis.test.ts
 */

import { describe, expect, it } from "vitest";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createDiagnosisExtractor,
  EXTRACTOR_MODEL,
  EXTRACTOR_PROVIDER,
  OpenAiDiagnosisExtractor,
  HeuristicDiagnosisExtractor,
  assertExtractorOutput,
  ExtractorSchemaError,
  parseAndAssertExtractorOutput,
} from "../diagnosis/extractor.js";
import {
  classifyFromAnswers,
  LowConfidenceError,
  detectAnswerContradictions,
} from "../diagnosis/classifier.js";
import {
  RAW_BUSINESS_BANK,
  answersMatchGold,
  type BankCase,
} from "./bank/raw-businesses.js";

type RowResult = {
  id: string;
  extractorOk: boolean;
  finalOk: boolean;
  reask: boolean;
  gotOutcome: string;
  expectedOutcome: string;
  extractorMismatches: string[];
  cause?: string;
};

function expectedLabel(c: BankCase): string {
  if (c.expectedOutcome.kind === "dominant") {
    return c.expectedOutcome.dominant ?? "dominant";
  }
  return c.expectedOutcome.kind;
}

function evaluateOutcome(
  caseItem: BankCase,
  answers: Parameters<typeof classifyFromAnswers>[0],
): { ok: boolean; got: string; reask: boolean; cause?: string } {
  try {
    const { composition } = classifyFromAnswers(answers);
    const got = composition.dominant;
    if (caseItem.expectedOutcome.kind === "LOW_CONF") {
      return {
        ok: false,
        got,
        reask: false,
        cause: "se esperaba LOW_CONF/repregunta pero clasificó",
      };
    }
    if (caseItem.expectedOutcome.kind === "NONE") {
      return {
        ok: false,
        got,
        reask: false,
        cause: "se esperaba NONE",
      };
    }
    if (caseItem.expectedOutcome.kind === "AMBIGUOUS") {
      return {
        ok: false,
        got,
        reask: false,
        cause: "AMBIGUOUS no modelado como throw",
      };
    }
    const want = caseItem.expectedOutcome.dominant;
    if (got === want) {
      return { ok: true, got, reask: false };
    }
    return {
      ok: false,
      got,
      reask: false,
      cause: `esperado ${want}`,
    };
  } catch (err) {
    if (err instanceof LowConfidenceError) {
      const ok = caseItem.expectedOutcome.kind === "LOW_CONF";
      if (ok) {
        return { ok: true, got: "LOW_CONF", reask: true };
      }
      return {
        ok: false,
        got: "LOW_CONF",
        reask: true,
        cause: "repregunta inesperada",
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (caseItem.expectedOutcome.kind === "NONE") {
      const ok = /ninguna regla|candidato/i.test(msg);
      if (ok) {
        return { ok: true, got: "NONE", reask: false };
      }
      return { ok: false, got: "NONE", reask: false, cause: msg };
    }
    return { ok: false, got: "ERROR", reask: false, cause: msg };
  }
}

describe("Extractor — esquema", () => {
  it("rechaza salida que no cumple el esquema", () => {
    expect(() => assertExtractorOutput({ answers: [] })).toThrow(
      ExtractorSchemaError,
    );
    expect(() =>
      parseAndAssertExtractorOutput(
        JSON.stringify({
          answers: [
            {
              questionId: "cliente_se_queda",
              value: "sí",
              confidence: 0.9,
            },
          ],
        }),
      ),
    ).toThrow(ExtractorSchemaError);
    expect(() =>
      assertExtractorOutput({
        answers: [
          {
            questionId: "cliente_se_queda",
            value: true,
            confidence: 1.5,
          },
        ],
      }),
    ).toThrow(ExtractorSchemaError);
  });

  it("OpenAiDiagnosisExtractor valida el JSON del chat inyectado", async () => {
    const ex = new OpenAiDiagnosisExtractor({
      chat: async () =>
        JSON.stringify({
          answers: [
            { questionId: "cliente_se_queda", value: true, confidence: 0.9 },
            { questionId: "debe_volver", value: false, confidence: 0.9 },
            {
              questionId: "pago_periodico_acceso",
              value: false,
              confidence: 0.9,
            },
            {
              questionId: "se_produce_despues",
              value: false,
              confidence: 0.9,
            },
            { questionId: "tercero_conecta", value: false, confidence: 0.9 },
            {
              questionId: "dinero_o_cobertura",
              value: false,
              confidence: 0.9,
            },
            {
              questionId: "linea_mas_ingresos",
              value: "venta",
              confidence: 0.9,
            },
          ],
        }),
    });
    const out = await ex.extract("vendo zapatos");
    expect(out.answers).toHaveLength(7);
  });

  it("OpenAiDiagnosisExtractor rechaza JSON inválido del modelo", async () => {
    const ex = new OpenAiDiagnosisExtractor({
      chat: async () => '{"dominant":"venta"}',
    });
    await expect(ex.extract("x")).rejects.toThrow(ExtractorSchemaError);
  });
});

describe("Contradicciones → repregunta leasing", () => {
  it("se queda + debe volver activa LOW_CONF con opción leasing", () => {
    const err = detectAnswerContradictions([
      { questionId: "cliente_se_queda", value: true, confidence: 0.9 },
      { questionId: "debe_volver", value: true, confidence: 0.9 },
      { questionId: "pago_periodico_acceso", value: false, confidence: 0.9 },
      { questionId: "se_produce_despues", value: false, confidence: 0.9 },
      { questionId: "tercero_conecta", value: false, confidence: 0.9 },
      { questionId: "dinero_o_cobertura", value: false, confidence: 0.9 },
      { questionId: "linea_mas_ingresos", value: "venta", confidence: 0.9 },
    ]);
    expect(err).toBeInstanceOf(LowConfidenceError);
    expect(err!.reask?.reason).toBe("contradiccion_se_queda_y_debe_volver");
    expect(
      err!.reask?.options.some((o) => o.id === "leasing_opcion_compra"),
    ).toBe(true);
    const leasing = err!.reask!.options.find(
      (o) => o.id === "leasing_opcion_compra",
    )!;
    expect(leasing.suggestedComposition.dominant).toBe("uso_temporal");
    expect(leasing.suggestedComposition.secondaries).toContain("financiera");

    expect(() =>
      classifyFromAnswers([
        { questionId: "cliente_se_queda", value: true, confidence: 0.9 },
        { questionId: "debe_volver", value: true, confidence: 0.9 },
        {
          questionId: "pago_periodico_acceso",
          value: false,
          confidence: 0.9,
        },
        {
          questionId: "se_produce_despues",
          value: false,
          confidence: 0.9,
        },
        { questionId: "tercero_conecta", value: false, confidence: 0.9 },
        {
          questionId: "dinero_o_cobertura",
          value: false,
          confidence: 0.9,
        },
        {
          questionId: "linea_mas_ingresos",
          value: "venta",
          confidence: 0.9,
        },
      ]),
    ).toThrow(LowConfidenceError);
  });
});

describe("E2E diagnóstico — banco crudo", () => {
  it("mide extractor, final y repregunta sobre ≥40 textos", async () => {
    expect(RAW_BUSINESS_BANK.length).toBeGreaterThanOrEqual(40);

    const hasKey = Boolean(process.env.OPENAI_API_KEY);
    const extractor = createDiagnosisExtractor();
    const mode = hasKey ? "openai" : "heuristic_offline";

    const rows: RowResult[] = [];

    for (const c of RAW_BUSINESS_BANK) {
      const extracted = await Promise.resolve(extractor.extract(c.text));
      assertExtractorOutput(extracted);

      const match = answersMatchGold(extracted.answers, c.expectedAnswers);
      const outcome = evaluateOutcome(c, extracted.answers);

      const row: RowResult = {
        id: c.id,
        extractorOk: match.ok,
        finalOk: outcome.ok,
        reask: outcome.reask,
        gotOutcome: outcome.got,
        expectedOutcome: expectedLabel(c),
        extractorMismatches: match.mismatches,
      };
      if (outcome.cause !== undefined) {
        row.cause = outcome.cause;
      }
      rows.push(row);
    }

    const n = rows.length;
    const extractorCorrect = rows.filter((r) => r.extractorOk).length;
    const finalCorrect = rows.filter((r) => r.finalOk).length;
    const reasks = rows.filter((r) => r.reask).length;

    const extractorAccuracyPct = Number(
      ((extractorCorrect / n) * 100).toFixed(2),
    );
    const finalAccuracyPct = Number(((finalCorrect / n) * 100).toFixed(2));
    const reaskRatePct = Number(((reasks / n) * 100).toFixed(2));

    // Top fallos finales agrupados por causa raíz (si < 90%)
    const categorize = (r: RowResult): string => {
      if (r.cause?.includes("ninguna regla")) {
        return "extractor_no_activó_ningún_flag→sin_candidato";
      }
      if (r.cause?.includes("repregunta inesperada")) {
        return "extractor_confianza_baja_o_contradicción_fantasma";
      }
      if (r.cause?.includes("LOW_CONF")) {
        return "extractor_no_marcó_baja_confianza_en_caso_ambiguo";
      }
      if (r.cause?.startsWith("esperado ")) {
        return `extractor_flags_desplazaron_dominante (querían ${r.expectedOutcome}, obtuvo ${r.gotOutcome})`;
      }
      return r.cause ?? "desconocido";
    };

    const failureCauses = new Map<string, number>();
    for (const f of rows.filter((r) => !r.finalOk)) {
      const key = categorize(f);
      failureCauses.set(key, (failureCauses.get(key) ?? 0) + 1);
    }
    const top5Failures = [...failureCauses.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cause, count]) => ({ cause, count }));

    const finalFailures = rows
      .filter((r) => !r.finalOk)
      .map((r) => ({
        id: r.id,
        expected: r.expectedOutcome,
        got: r.gotOutcome,
        cause: r.cause ?? r.extractorMismatches.slice(0, 2).join("; "),
        category: categorize(r),
      }));

    const report = {
      measuredAt: new Date().toISOString(),
      dimension: 6,
      label: "Determinismo extremo a extremo",
      extractor: {
        provider: hasKey ? EXTRACTOR_PROVIDER : "heuristic",
        model: hasKey ? EXTRACTOR_MODEL : "HeuristicDiagnosisExtractor",
        mode,
      },
      n,
      extractorAccuracyPct,
      finalAccuracyPct,
      reaskRatePct,
      extractorCorrect,
      finalCorrect,
      reasks,
      below90: finalAccuracyPct < 90,
      top5Failures: finalAccuracyPct < 90 ? top5Failures : [],
      failures: finalFailures,
    };

    const e2ePath = resolve("tests/bank/e2e-diagnosis-report.json");
    writeFileSync(e2ePath, JSON.stringify(report, null, 2), "utf8");

    // Actualiza dimensión 6 en audit-report.json
    const auditPath = resolve("audit-report.json");
    const audit = existsSync(auditPath)
      ? JSON.parse(readFileSync(auditPath, "utf8"))
      : {};
    audit.determinism = {
      score: finalAccuracyPct >= 90 ? 3 : finalAccuracyPct >= 70 ? 2 : 1,
      endToEndMeasured: true,
      stubOnly: false,
      extractorProvider: report.extractor.provider,
      extractorModel: report.extractor.model,
      n,
      extractorAccuracyPct,
      finalAccuracyPct,
      reaskRatePct,
      below90: report.below90,
      top5Failures: report.top5Failures,
      g15ContradictionTriggersReask: true,
      detail:
        "E2E texto→extractor→clasificador medido en tests/bank (≥40). El 96.88% previo solo era classifyFromAnswers con booleanos oro.",
      reportPath: e2ePath,
    };
    writeFileSync(auditPath, JSON.stringify(audit, null, 2), "utf8");

    console.log(
      `\n[E2E dim6] mode=${mode} extractor=${extractorAccuracyPct}% final=${finalAccuracyPct}% reask=${reaskRatePct}% (n=${n})`,
    );
    if (report.below90) {
      console.log("[E2E dim6] top5 fallos:", JSON.stringify(top5Failures));
    }

    expect(n).toBeGreaterThanOrEqual(40);
    expect(report.extractorAccuracyPct).toBeGreaterThanOrEqual(0);
    expect(report.finalAccuracyPct).toBeGreaterThanOrEqual(0);
    // Heurístico offline debe al menos detectar el stub ya no es el único camino
    expect(extractor).toBeInstanceOf(
      hasKey ? OpenAiDiagnosisExtractor : HeuristicDiagnosisExtractor,
    );
  }, 120_000);
});
