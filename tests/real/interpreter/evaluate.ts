/**
 * Evaluación Intérprete: heurístico vs simulador/LLM.
 * Uso: npx tsx tests/real/interpreter/evaluate.ts
 *
 * - split=test únicamente para métricas reportadas
 * - origin=synthetic se marca en el informe
 * - Objetivo n_real ≥ 139 en test; si no, limitación explícita
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LlmClient } from "../../../llm/client.js";
import { LlmInterpreterExtractor } from "../../../interpreter/llm-extractor.js";
import { HeuristicInterpreterExtractor } from "../../../interpreter/text-extractor.js";
import { EvalSimulatorLlmAdapter } from "../../../interpreter/eval-simulator-adapter.js";
import { interpretAsync } from "../../../interpreter/interpret-async.js";
import type { ExtractContext } from "../../../interpreter/types.js";
import { writeSyntheticCorpus } from "./generate-synthetic.js";
import type { InterpreterCorpusCase, IntentType } from "./schema.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(ROOT, "../../../tmp/interpreter-eval");

export interface WilsonInterval {
  readonly low: number;
  readonly high: number;
  readonly n: number;
  readonly p: number;
}

/** Intervalo de Wilson IC95 % para proporción. */
export function wilson95(successes: number, n: number): WilsonInterval {
  if (n <= 0) return { low: 0, high: 0, n: 0, p: 0 };
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin =
    z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return {
    n,
    p,
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}

export type ErrorCause =
  | "transicion"
  | "entidad"
  | "importe"
  | "fecha"
  | "ambiguedad_no_detectada"
  | "falso_positivo_aclaracion"
  | "otro";

export interface CaseScore {
  readonly id: string;
  readonly intentType: IntentType;
  readonly correct: boolean;
  readonly clarification: boolean;
  readonly severe: boolean;
  readonly cause?: ErrorCause;
  readonly predictedTransition: string | null;
  readonly expectedTransition: string | null;
}

function loadJsonl(path: string): InterpreterCorpusCase[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as InterpreterCorpusCase);
}

function scoreExtract(
  c: InterpreterCorpusCase,
  predicted: {
    transitionId: string | null;
    intentLabel: string;
    ambiguous?: boolean;
    confirmationQuestion?: string;
    amounts?: readonly { amount: number }[];
  },
): CaseScore {
  const clarification = Boolean(
    predicted.confirmationQuestion ||
      predicted.ambiguous ||
      !predicted.transitionId,
  );
  const expectClarify =
    c.expected.ambiguous ||
    c.expected.mustAskClarification ||
    c.expected.transitionId === null;

  let correct = false;
  let severe = false;
  let cause: ErrorCause | undefined;

  if (expectClarify) {
    correct = clarification;
    if (!clarification && predicted.transitionId) {
      severe = true;
      cause = "ambiguedad_no_detectada";
    }
  } else {
    correct = predicted.transitionId === c.expected.transitionId;
    if (!correct) {
      if (clarification) cause = "falso_positivo_aclaracion";
      else cause = "transicion";
      // Actuar con transición distinta = error grave
      if (predicted.transitionId && predicted.transitionId !== c.expected.transitionId) {
        severe = true;
        cause = "transicion";
      }
    }
    if (
      correct &&
      c.expected.amountEquals &&
      c.expected.amountEquals.length > 0
    ) {
      const got = new Set((predicted.amounts ?? []).map((a) => a.amount));
      const amountsOk = c.expected.amountEquals.every((a) => got.has(a));
      if (!amountsOk) {
        correct = false;
        cause = "importe";
      }
    }
  }

  // Transición inexistente en allowed = siempre grave si se predijo
  if (
    predicted.transitionId &&
    !c.context.allowedTransitionIds.includes(predicted.transitionId)
  ) {
    severe = true;
    correct = false;
    cause = "transicion";
  }

  return {
    id: c.id,
    intentType: c.intentType,
    correct,
    clarification,
    severe,
    ...(cause !== undefined ? { cause } : {}),
    predictedTransition: predicted.transitionId,
    expectedTransition: c.expected.transitionId,
  };
}

async function runHeuristic(
  cases: readonly InterpreterCorpusCase[],
): Promise<CaseScore[]> {
  const ex = new HeuristicInterpreterExtractor();
  return cases.map((c) => {
    const ctx: ExtractContext = {
      subjectId: c.context.subjectId,
      allowedTransitionIds: c.context.allowedTransitionIds,
      hasAttachments: c.context.hasAttachments,
      ...(c.context.parteDirectory
        ? { parteDirectory: c.context.parteDirectory }
        : {}),
    };
    const p = ex.extract(c.message, ctx);
    return scoreExtract(c, p);
  });
}

async function runLlmPath(
  cases: readonly InterpreterCorpusCase[],
  mode: "eval_simulator" | "openai",
  options?: {
    readonly cassetteDir?: string;
    readonly cassetteMode?: "live" | "record" | "replay";
  },
): Promise<CaseScore[]> {
  let client: LlmClient;
  if (mode === "eval_simulator") {
    client = new LlmClient({ adapter: new EvalSimulatorLlmAdapter() });
  } else {
    const { createLlmClientFromEnv } = await import("../../../llm/client.js");
    client = createLlmClientFromEnv({
      ...(options?.cassetteDir ? { cassetteDir: options.cassetteDir } : {}),
      ...(options?.cassetteMode ? { mode: options.cassetteMode } : {}),
    });
  }
  const extractor = new LlmInterpreterExtractor({ client });

  const out: CaseScore[] = [];
  for (const c of cases) {
    const ctx: ExtractContext = {
      subjectId: c.context.subjectId,
      allowedTransitionIds: c.context.allowedTransitionIds,
      hasAttachments: c.context.hasAttachments,
      ...(c.context.parteDirectory
        ? { parteDirectory: c.context.parteDirectory }
        : {}),
    };
    const p = await extractor.extractAsync(c.message, ctx);
    out.push(scoreExtract(c, p));
  }
  return out;
}

function summarize(scores: readonly CaseScore[], label: string) {
  const n = scores.length;
  const ok = scores.filter((s) => s.correct).length;
  const clar = scores.filter((s) => s.clarification).length;
  const severe = scores.filter((s) => s.severe).length;
  const byType = new Map<string, CaseScore[]>();
  for (const s of scores) {
    const arr = byType.get(s.intentType) ?? [];
    arr.push(s);
    byType.set(s.intentType, arr);
  }
  const perType: Record<string, WilsonInterval & { correct: number }> = {};
  for (const [t, arr] of byType) {
    const c = arr.filter((x) => x.correct).length;
    perType[t] = { ...wilson95(c, arr.length), correct: c };
  }
  const causes: Record<string, number> = {};
  for (const s of scores) {
    if (s.cause) causes[s.cause] = (causes[s.cause] ?? 0) + 1;
  }
  return {
    label,
    n,
    accuracy: wilson95(ok, n),
    clarificationRate: wilson95(clar, n),
    severeErrorRate: wilson95(severe, n),
    perType,
    causes,
  };
}

export async function runEvaluation(): Promise<{
  readonly reportPath: string;
  readonly mdPath: string;
}> {
  writeSyntheticCorpus(ROOT);
  const syntheticPath = join(ROOT, "corpus.synthetic.test.jsonl");
  const realPath = join(ROOT, "corpus.real.test.jsonl");
  const syntheticCases = loadJsonl(syntheticPath);
  const realCases = loadJsonl(realPath).filter(
    (c) => c.split === "test" && c.origin === "real_anonymized",
  );
  // Métricas reportadas: reales si hay; si no, sintético (limitación).
  const cases = realCases.length > 0 ? realCases : syntheticCases;
  const realCount = realCases.length;
  const syntheticCount = syntheticCases.length;
  const testPath = realCases.length > 0 ? realPath : syntheticPath;

  const heuristicScores = await runHeuristic(cases);
  const simScores = await runLlmPath(cases, "eval_simulator");

  const wantOpenai =
    process.env.ABS_INTERPRETER_EVAL_PROVIDER === "openai" ||
    process.env.ABS_LLM_PROVIDER === "openai";
  const cassetteDir =
    process.env.ABS_LLM_CASSETTE_DIR ??
    join(ROOT, "../../../tmp/interpreter-cassettes");
  const cassetteMode = (process.env.ABS_LLM_MODE as
    | "live"
    | "record"
    | "replay"
    | undefined) ?? (wantOpenai ? "record" : "live");

  let openaiScores: CaseScore[] | null = null;
  let openaiError: string | null = null;
  if (wantOpenai) {
    try {
      if (!process.env.OPENAI_API_KEY && cassetteMode !== "replay") {
        throw new Error(
          "Falta OPENAI_API_KEY (necesario salvo ABS_LLM_MODE=replay con cassettes)",
        );
      }
      mkdirSync(cassetteDir, { recursive: true });
      openaiScores = await runLlmPath(cases, "openai", {
        cassetteDir,
        cassetteMode,
      });
    } catch (e) {
      openaiError = e instanceof Error ? e.message : String(e);
    }
  }

  // Guardrail: interpretAsync no deja pasar transición ilegal
  let illegalToJudge = 0;
  for (const c of cases.slice(0, 30)) {
    const extractor = new LlmInterpreterExtractor({
      client: new LlmClient({ adapter: new EvalSimulatorLlmAdapter() }),
    });
    const outcome = await interpretAsync(
      {
        id: `ev-${c.id}`,
        kind: "mensaje",
        channel: "backoffice",
        occurredAt: "2026-06-01T00:00:00.000Z",
        text: c.message,
        subjectId: c.context.subjectId,
      },
      {
        identity: {
          actorId: "eval",
          actorKind: "humano",
          roles: ["vendedor"],
          tenantId: "eval",
        },
        allowedTransitionIds: c.context.allowedTransitionIds,
        asyncTextExtractor: extractor,
        ...(c.context.parteDirectory
          ? { parteDirectory: c.context.parteDirectory }
          : {}),
      },
    );
    if (
      outcome.kind === "solicitud" &&
      !c.context.allowedTransitionIds.includes(outcome.request.transitionId)
    ) {
      illegalToJudge += 1;
    }
  }

  const heuristicSum = summarize(heuristicScores, "heuristic");
  const simSum = summarize(simScores, "eval_simulator");
  const openaiSum = openaiScores
    ? summarize(openaiScores, "openai")
    : null;

  const severeCases =
    openaiScores?.filter((s) => s.severe).map((s) => {
      const c = cases.find((x) => x.id === s.id);
      return {
        id: s.id,
        intentType: s.intentType,
        cause: s.cause,
        expectedTransition: s.expectedTransition,
        predictedTransition: s.predictedTransition,
        message: c?.message.slice(0, 120),
        analysis:
          s.cause === "ambiguedad_no_detectada"
            ? "Actuó con transición en caso que debía aclarar (confianza alta / ambiguous=false)."
            : s.cause === "transicion"
              ? "Eligió transición distinta a la esperada sin pedir aclaración."
              : s.cause ?? "error grave",
      };
    }) ?? [];

  const thresholdProposal =
    openaiSum &&
    openaiSum.severeErrorRate.p > heuristicSum.severeErrorRate.p
      ? {
          currentInterpreterThreshold: 0.7,
          proposed: 0.85,
          reason:
            "Errores graves LLM > heurístico: subir umbral del Intérprete para forzar ask_clarification con más frecuencia.",
        }
      : null;

  const report = {
    generatedAt: new Date().toISOString(),
    corpus: {
      path: testPath,
      n: cases.length,
      syntheticCount,
      realAnonymizedCount: realCount,
      targetRealN: 139,
      limitation:
        realCount < 139
          ? `Conjunto de prueba con ${realCount} casos reales anonimizados (< 139). Resultados actuales son sobre corpus SINTÉTICO (n=${syntheticCount}).`
          : null,
    },
    providers: {
      heuristic: "HeuristicInterpreterExtractor",
      llmPath:
        "LlmInterpreterExtractor + EvalSimulatorLlmAdapter (NO es OpenAI; proxy de evaluación)",
      openai: openaiSum
        ? `OpenAI vía LlmClient (mode=${cassetteMode}, cassettes=${cassetteDir})`
        : openaiError
          ? `error: ${openaiError}`
          : "no solicitado (ABS_LLM_PROVIDER/ABS_INTERPRETER_EVAL_PROVIDER≠openai)",
    },
    heuristic: heuristicSum,
    llmOrSimulator: simSum,
    openai: openaiSum,
    openaiSevereErrors: severeCases,
    thresholdProposal,
    guardrail: {
      sampled: Math.min(30, cases.length),
      illegalTransitionsReachingJudge: illegalToJudge,
    },
    userMustProvide:
      "Mensajes reales anonimizados en JSONL (origin=real_anonymized, split=test), n≥139, etiquetados según LABELING.md. No usar el split=dev para ajustar prompts del informe de prueba.",
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = join(REPORT_DIR, "interpreter-eval.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const md = renderMd(report as EvalReport);
  const mdPath = join(ROOT, "INTERPRETER-LLM-REPORT.md");
  writeFileSync(mdPath, md);
  writeFileSync(join(REPORT_DIR, "INTERPRETER-LLM-REPORT.md"), md);

  return { reportPath, mdPath };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

type EvalReport = {
  generatedAt: string;
  corpus: {
    n: number;
    syntheticCount: number;
    realAnonymizedCount: number;
    targetRealN: number;
    limitation: string | null;
  };
  providers: Record<string, string>;
  heuristic: ReturnType<typeof summarize>;
  llmOrSimulator: ReturnType<typeof summarize>;
  openai: ReturnType<typeof summarize> | null;
  openaiSevereErrors: readonly {
    id: string;
    intentType: string;
    cause?: string;
    expectedTransition: string | null;
    predictedTransition: string | null;
    message?: string;
    analysis: string;
  }[];
  thresholdProposal: {
    currentInterpreterThreshold: number;
    proposed: number;
    reason: string;
  } | null;
  guardrail: { sampled: number; illegalTransitionsReachingJudge: number };
  userMustProvide: string;
};

function row(label: string, s: ReturnType<typeof summarize>): string {
  return `| ${label} | ${pct(s.accuracy.p)} | [${pct(s.accuracy.low)}, ${pct(s.accuracy.high)}] | ${pct(s.clarificationRate.p)} | ${pct(s.severeErrorRate.p)} |`;
}

function renderMd(r: EvalReport): string {
  const lines: string[] = [
    "# Informe Intérprete + LLM",
    "",
    `Generado: ${r.generatedAt}`,
    "",
    "## Corpus",
    "",
    `- Casos en split=test: **${r.corpus.n}**`,
    `- Sintéticos: **${r.corpus.syntheticCount}** (marcados \`origin=synthetic\`)`,
    `- Reales anonimizados: **${r.corpus.realAnonymizedCount}** (objetivo ≥ ${r.corpus.targetRealN})`,
    r.corpus.limitation
      ? `- **Limitación:** ${r.corpus.limitation}`
      : "- Objetivo de casos reales alcanzado.",
    "",
    "## Proveedores medidos",
    "",
    `- Heurístico: ${r.providers.heuristic}`,
    `- Camino LLM: ${r.providers.llmPath}`,
    `- OpenAI: ${r.providers.openai}`,
    "",
    "## Tabla comparativa (corpus de prueba)",
    "",
    "| Camino | Precisión | IC95% | Aclaraciones | Errores graves |",
    "|--------|-----------|-------|--------------|----------------|",
    row("Heurístico", r.heuristic),
    row("Simulador eval", r.llmOrSimulator),
    r.openai
      ? row("OpenAI real", r.openai)
      : "| OpenAI real | — | — | — | no ejecutado |",
    "",
    "### Precisión por tipo (simulador)",
    "",
  ];

  for (const [t, w] of Object.entries(r.llmOrSimulator.perType)) {
    lines.push(
      `- **${t}**: ${pct(w.p)} IC95% [${pct(w.low)}, ${pct(w.high)}] (${w.correct}/${w.n})`,
    );
  }

  if (r.openai) {
    lines.push("", "### Precisión por tipo (OpenAI)", "");
    for (const [t, w] of Object.entries(r.openai.perType)) {
      lines.push(
        `- **${t}**: ${pct(w.p)} IC95% [${pct(w.low)}, ${pct(w.high)}] (${w.correct}/${w.n})`,
      );
    }
    lines.push("", "### Errores graves OpenAI (análisis)", "");
    if (r.openaiSevereErrors.length === 0) {
      lines.push("- Ninguno.");
    } else {
      for (const e of r.openaiSevereErrors) {
        lines.push(
          `- **${e.id}** (${e.intentType}, causa=${e.cause}): pred=${e.predictedTransition} esp=${e.expectedTransition}. ${e.analysis} Msg: «${e.message ?? ""}»`,
        );
      }
    }
    if (r.thresholdProposal) {
      lines.push(
        "",
        "### Propuesta de umbral",
        "",
        `- Actual: ${r.thresholdProposal.currentInterpreterThreshold}`,
        `- Propuesto: **${r.thresholdProposal.proposed}**`,
        `- Motivo: ${r.thresholdProposal.reason}`,
      );
    }
  }

  lines.push("", "### Análisis de errores (simulador)", "");
  const causes = Object.entries(r.llmOrSimulator.causes);
  if (causes.length === 0) {
    lines.push("- Sin errores clasificados.");
  } else {
    for (const [c, n] of causes.sort((a, b) => b[1] - a[1])) {
      lines.push(`- **${c}**: ${n}`);
    }
  }

  lines.push(
    "",
    "## Guardrail",
    "",
    `- Muestra interpretAsync: ${r.guardrail.sampled}`,
    `- Transiciones ilegales llegando a solicitud (Juez): **${r.guardrail.illegalTransitionsReachingJudge}** (debe ser 0)`,
    "",
    "## Qué debe aportar el usuario",
    "",
    r.userMustProvide,
    "",
    "Formato: ver `LABELING.md`. Colocar en `corpus.real.test.jsonl` con `origin=real_anonymized` y `split=test`.",
    "",
  );

  return lines.join("\n");
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/") ===
    process.argv[1].replace(/\\/g, "/");

if (isMain) {
  runEvaluation()
    .then((p) => {
      console.log(`[eval] report → ${p.reportPath}`);
      console.log(`[eval] md → ${p.mdPath}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
