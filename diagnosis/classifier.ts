/**
 * Clasificador por reglas: respuestas → dominante + secundarios.
 * Nunca llama a un LLM.
 */

import type { ArchetypeId, ComposedArchetypeSpec } from "../archetypes/types.js";
import {
  CONFIDENCE_THRESHOLD,
  DIAGNOSIS_QUESTIONS,
  type AuditEntry,
  type ExtractedAnswer,
  type DiagnosisQuestionId,
} from "./questions.js";

export interface ReaskOption {
  readonly id: string;
  readonly label: string;
  /** Composición sugerida si el usuario confirma esta lectura. */
  readonly suggestedComposition: {
    readonly dominant: ArchetypeId;
    readonly secondaries: readonly ArchetypeId[];
  };
}

export class LowConfidenceError extends Error {
  constructor(
    readonly questionIds: readonly DiagnosisQuestionId[],
    readonly reask?: {
      readonly reason: string;
      readonly options: readonly ReaskOption[];
    },
  ) {
    const hint = reask ? ` [${reask.reason}]` : "";
    super(
      `Confianza bajo umbral ${CONFIDENCE_THRESHOLD}; repregunta obligatoria: ${questionIds.join(", ")}${hint}`,
    );
    this.name = "LowConfidenceError";
  }
}

export interface NearestArchetype {
  readonly archetypeId: ArchetypeId;
  readonly score: number;
  readonly matchedRules: readonly string[];
}

/**
 * Sin candidato fuerte: no lanza un error opaco; aporta los 2 arquetipos
 * más cercanos y las preguntas que los distinguirían.
 */
export class NoArchetypeMatchError extends Error {
  constructor(
    readonly nearest: readonly NearestArchetype[],
    readonly distinguishingQuestions: readonly {
      readonly questionId: DiagnosisQuestionId;
      readonly prompt: string;
    }[],
  ) {
    const names = nearest.map((n) => n.archetypeId).join(", ");
    super(
      `Clasificador: ninguna regla produjo candidato; más cercanos: ${names}`,
    );
    this.name = "NoArchetypeMatchError";
  }
}

export interface ClassificationResult {
  readonly composition: ComposedArchetypeSpec;
  readonly audit: readonly AuditEntry[];
}

/**
 * Contradicciones estructurales entre respuestas → LOW_CONF + repregunta.
 * "Se queda" + "debe volver" = leasing con opción de compra (uso_temporal + financiera).
 */
export function detectAnswerContradictions(
  answers: readonly ExtractedAnswer[],
): LowConfidenceError | null {
  const map = new Map(answers.map((a) => [a.questionId, a]));
  const seQueda = map.get("cliente_se_queda");
  const vuelve = map.get("debe_volver");

  if (
    seQueda &&
    vuelve &&
    seQueda.value === true &&
    vuelve.value === true
  ) {
    return new LowConfidenceError(["cliente_se_queda", "debe_volver"], {
      reason: "contradiccion_se_queda_y_debe_volver",
      options: [
        {
          id: "leasing_opcion_compra",
          label:
            "Leasing / renting con opción de compra (uso temporal + financiera)",
          suggestedComposition: {
            dominant: "uso_temporal",
            secondaries: ["financiera"],
          },
        },
        {
          id: "venta_con_devolucion",
          label: "Venta con derecho de devolución (venta dominante)",
          suggestedComposition: {
            dominant: "venta",
            secondaries: [],
          },
        },
        {
          id: "alquiler_puro",
          label: "Alquiler puro sin opción a quedárselo (uso temporal)",
          suggestedComposition: {
            dominant: "uso_temporal",
            secondaries: [],
          },
        },
      ],
    });
  }

  return null;
}

export function classifyFromAnswers(
  answers: readonly ExtractedAnswer[],
  now: string = new Date().toISOString(),
): ClassificationResult {
  const low = answers
    .filter((a) => a.confidence < CONFIDENCE_THRESHOLD)
    .map((a) => a.questionId);
  if (low.length > 0) {
    throw new LowConfidenceError(low);
  }

  const contradiction = detectAnswerContradictions(answers);
  if (contradiction) {
    throw contradiction;
  }

  const map = new Map(answers.map((a) => [a.questionId, a]));
  const bool = (id: DiagnosisQuestionId): boolean => {
    const a = map.get(id);
    if (!a || typeof a.value !== "boolean") {
      throw new Error(`Respuesta booleana ausente: ${id}`);
    }
    return a.value;
  };

  const candidates: ArchetypeId[] = [];
  const audit: AuditEntry[] = [];

  if (bool("cliente_se_queda") && !bool("debe_volver")) {
    candidates.push("venta");
    audit.push({
      at: now,
      decision: "candidate",
      detail: { archetype: "venta", rule: "se_queda_y_no_vuelve" },
    });
  }
  if (bool("debe_volver")) {
    candidates.push("uso_temporal");
    audit.push({
      at: now,
      decision: "candidate",
      detail: { archetype: "uso_temporal", rule: "debe_volver" },
    });
  }
  if (bool("pago_periodico_acceso")) {
    candidates.push("suscripcion");
    audit.push({
      at: now,
      decision: "candidate",
      detail: { archetype: "suscripcion", rule: "pago_periodico" },
    });
  }
  if (bool("se_produce_despues")) {
    candidates.push("servicio_proyecto");
    audit.push({
      at: now,
      decision: "candidate",
      detail: { archetype: "servicio_proyecto", rule: "produce_despues" },
    });
  }
  if (bool("tercero_conecta")) {
    candidates.push("intermediacion");
    audit.push({
      at: now,
      decision: "candidate",
      detail: { archetype: "intermediacion", rule: "tercero_conecta" },
    });
  }
  if (bool("dinero_o_cobertura")) {
    candidates.push("financiera");
    audit.push({
      at: now,
      decision: "candidate",
      detail: { archetype: "financiera", rule: "dinero_cobertura" },
    });
  }

  if (candidates.length === 0) {
    const nearest = rankNearestArchetypes(answers).slice(0, 2);
    const distinguishingQuestions = questionsThatDistinguish(nearest);
    throw new NoArchetypeMatchError(nearest, distinguishingQuestions);
  }

  const lineAnswer = map.get("linea_mas_ingresos");
  let dominant: ArchetypeId = candidates[0]!;
  if (lineAnswer && typeof lineAnswer.value === "string") {
    const line = lineAnswer.value as ArchetypeId;
    if (candidates.includes(line)) {
      dominant = line;
    } else if ((candidates as string[]).includes(lineAnswer.value)) {
      dominant = lineAnswer.value as ArchetypeId;
    } else {
      audit.push({
        at: now,
        decision: "line_ignored",
        detail: { line: lineAnswer.value, reason: "no_en_candidatos" },
      });
    }
  }

  audit.push({
    at: now,
    decision: "dominant",
    detail: { archetype: dominant, candidates },
  });

  const secondaries = buildDefaultSecondaries(dominant, candidates, now, audit);

  return {
    composition: { dominant, secondaries },
    audit,
  };
}

/**
 * Heurística estructural de bindings por defecto según el dominante.
 */
function buildDefaultSecondaries(
  dominant: ArchetypeId,
  candidates: readonly ArchetypeId[],
  now: string,
  audit: AuditEntry[],
): ComposedArchetypeSpec["secondaries"] {
  const secondaries = candidates
    .filter((c) => c !== dominant)
    .map((c) => {
      const binding = resolveBinding(dominant, c);
      audit.push({
        at: now,
        decision: "secondary",
        detail: { ...binding },
      });
      return binding;
    });

  return secondaries;
}

function resolveBinding(
  dominant: ArchetypeId,
  secondary: ArchetypeId,
): ComposedArchetypeSpec["secondaries"][number] {
  if (dominant === "venta" && secondary === "financiera") {
    return {
      secondaryArchetypeId: "financiera",
      bornInDominantState: "aceptada",
      bloquea: "en_entrega",
    };
  }
  if (dominant === "venta" && secondary === "servicio_proyecto") {
    return {
      secondaryArchetypeId: "servicio_proyecto",
      bornInDominantState: "cerrada",
      bloquea: "en_entrega",
    };
  }
  if (dominant === "uso_temporal" && secondary === "financiera") {
    return {
      secondaryArchetypeId: "financiera",
      bornInDominantState: "reservada",
      bloquea: "en_uso",
    };
  }

  const fallback = fallbackStates(dominant);
  return {
    secondaryArchetypeId: secondary,
    bornInDominantState: fallback.born,
    bloquea: fallback.block,
  };
}

function fallbackStates(dominant: ArchetypeId): {
  born: string;
  block: string;
} {
  switch (dominant) {
    case "venta":
      return { born: "aceptada", block: "en_entrega" };
    case "servicio_proyecto":
      return { born: "acordado", block: "en_ejecucion" };
    case "suscripcion":
      return { born: "activa", block: "en_renovacion" };
    case "uso_temporal":
      return { born: "reservada", block: "en_uso" };
    case "intermediacion":
      return { born: "emparejada", block: "en_curso" };
    case "financiera":
      return { born: "aprobada", block: "desembolsada" };
    default: {
      const _e: never = dominant;
      return _e;
    }
  }
}

/**
 * Distancia a perfiles ideales cuando ninguna regla dispara.
 * score = número de señales parciales alineadas (mayor = más cercano).
 */
function rankNearestArchetypes(
  answers: readonly ExtractedAnswer[],
): NearestArchetype[] {
  const map = new Map(answers.map((a) => [a.questionId, a]));
  const soft = (id: DiagnosisQuestionId): boolean | null => {
    const a = map.get(id);
    if (!a || typeof a.value !== "boolean") return null;
    return a.value;
  };

  const profiles: {
    id: ArchetypeId;
    signals: { q: DiagnosisQuestionId; want: boolean; rule: string }[];
  }[] = [
    {
      id: "venta",
      signals: [
        { q: "cliente_se_queda", want: true, rule: "se_queda" },
        { q: "debe_volver", want: false, rule: "no_vuelve" },
      ],
    },
    {
      id: "uso_temporal",
      signals: [{ q: "debe_volver", want: true, rule: "debe_volver" }],
    },
    {
      id: "suscripcion",
      signals: [
        { q: "pago_periodico_acceso", want: true, rule: "pago_periodico" },
      ],
    },
    {
      id: "servicio_proyecto",
      signals: [
        { q: "se_produce_despues", want: true, rule: "produce_despues" },
      ],
    },
    {
      id: "intermediacion",
      signals: [{ q: "tercero_conecta", want: true, rule: "tercero_conecta" }],
    },
    {
      id: "financiera",
      signals: [
        { q: "dinero_o_cobertura", want: true, rule: "dinero_cobertura" },
      ],
    },
  ];

  const ranked: NearestArchetype[] = profiles.map((p) => {
    const matched: string[] = [];
    let score = 0;
    for (const s of p.signals) {
      const v = soft(s.q);
      if (v === s.want) {
        score += 2;
        matched.push(s.rule);
      } else if (v === null) {
        score += 0;
      } else {
        score -= 1;
      }
    }
    // Empuje suave por línea de ingresos si coincide
    const line = map.get("linea_mas_ingresos");
    if (line && line.value === p.id) {
      score += 1;
      matched.push("linea_ingresos");
    }
    return { archetypeId: p.id, score, matchedRules: matched };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

function questionsThatDistinguish(
  nearest: readonly NearestArchetype[],
): { questionId: DiagnosisQuestionId; prompt: string }[] {
  const focus = new Set<DiagnosisQuestionId>();
  const pair = nearest.slice(0, 2).map((n) => n.archetypeId);
  if (pair.includes("venta") || pair.includes("uso_temporal")) {
    focus.add("cliente_se_queda");
    focus.add("debe_volver");
  }
  if (pair.includes("suscripcion")) focus.add("pago_periodico_acceso");
  if (pair.includes("servicio_proyecto")) focus.add("se_produce_despues");
  if (pair.includes("intermediacion")) focus.add("tercero_conecta");
  if (pair.includes("financiera")) focus.add("dinero_o_cobertura");
  focus.add("cliente_se_queda");
  focus.add("tercero_conecta");

  return DIAGNOSIS_QUESTIONS.filter((q) => focus.has(q.id))
    .slice(0, 4)
    .map((q) => ({ questionId: q.id, prompt: q.prompt }));
}
