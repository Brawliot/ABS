/**
 * Intérprete vía LLM (infra 8A).
 * Ante fallo del proveedor → HeuristicInterpreterExtractor.
 * Nunca propone transición fuera de allowedTransitionIds.
 */

import { LlmClient, type LlmClientOptions } from "../llm/client.js";
import { HeuristicLlmAdapter } from "../llm/heuristic-adapter.js";
import { minimizeText } from "../llm/privacy.js";
import type {
  AsyncInterpreterTextExtractor,
  ExtractContext,
  TextExtract,
} from "./types.js";
import {
  INTERPRETER_INTENT_JSON_SCHEMA,
  INTERPRETER_SYSTEM_PROMPT,
  InterpreterIntentSchema,
  type InterpreterIntentLlm,
} from "./intent-schema.js";
import { HeuristicInterpreterExtractor } from "./text-extractor.js";

function buildUserPayload(
  text: string,
  context: ExtractContext,
): string {
  // Minimizar solo el mensaje (emails/DNI); importes numéricos se conservan.
  // Directorio: ref + tokens (sin nombres completos en claro).
  const refs: Record<string, string> = {
    [context.subjectId]: `subject:${context.subjectId}`,
  };
  const msg = minimizeText(text, { refs, scrubNames: false });
  const parteDirectory = (context.parteDirectory ?? []).map((p) => ({
    ref: p.ref,
    tokens: p.label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  }));
  return JSON.stringify({
    message: msg.text,
    subjectRef: `subject:${context.subjectId}`,
    allowedTransitionIds: context.allowedTransitionIds,
    hasAttachments: context.hasAttachments,
    parteDirectory,
  });
}

function mapAmounts(
  amounts: InterpreterIntentLlm["amounts"],
): NonNullable<TextExtract["amounts"]> {
  return amounts.map((a) => ({
    amount: a.amount,
    ...(a.currency !== undefined ? { currency: a.currency } : {}),
    ...(a.label !== undefined ? { label: a.label } : {}),
  }));
}

function mapDates(
  dates: InterpreterIntentLlm["dates"],
): NonNullable<TextExtract["dates"]> {
  return dates.map((d) => ({
    raw: d.raw,
    ...(d.iso !== undefined ? { iso: d.iso } : {}),
    ...(d.role !== undefined ? { role: d.role } : {}),
  }));
}

function toTextExtract(
  intent: InterpreterIntentLlm,
  allowed: ReadonlySet<string>,
): TextExtract {
  let transitionId = intent.transitionId;
  let clarification = intent.clarificationQuestion;
  let ambiguous = intent.ambiguous;
  let confidence = intent.confidence;
  const amounts = mapAmounts(intent.amounts);
  const dates = mapDates(intent.dates);

  if (transitionId && !allowed.has(transitionId)) {
    clarification =
      clarification ??
      `La transición «${transitionId}» no está permitida ahora. ¿Cuál de las opciones disponibles quieres?`;
    transitionId = null;
    ambiguous = true;
    confidence = Math.min(confidence, 0.4);
  }

  if (ambiguous || !transitionId) {
    return {
      transitionId: null,
      intentLabel: intent.intentLabel || "ambiguo",
      confidence: Math.min(confidence, 0.69),
      evidenceKind: intent.evidenceKind,
      ...(intent.evidenceReferenceType !== undefined
        ? { evidenceReferenceType: intent.evidenceReferenceType }
        : {}),
      evidencePendingValidation: intent.evidencePendingValidation,
      fields: {
        ...intent.fields,
        parteRefs: intent.parteRefs,
        amounts,
        dates,
      },
      confirmationQuestion:
        clarification ??
        "Necesito un dato más para continuar. ¿Puedes concretar?",
      candidates: intent.candidates.filter((c) => allowed.has(c.transitionId)),
      ambiguous: true,
      parteRefs: intent.parteRefs,
      amounts,
      dates,
    };
  }

  return {
    transitionId,
    intentLabel: intent.intentLabel,
    confidence,
    evidenceKind: intent.evidenceKind,
    ...(intent.evidenceReferenceType !== undefined
      ? { evidenceReferenceType: intent.evidenceReferenceType }
      : {}),
    evidencePendingValidation: intent.evidencePendingValidation,
    fields: {
      ...intent.fields,
      parteRefs: intent.parteRefs,
      amounts,
      dates,
    },
    ...(clarification
      ? { confirmationQuestion: clarification }
      : {}),
    candidates: intent.candidates.filter((c) => allowed.has(c.transitionId)),
    ambiguous: false,
    parteRefs: intent.parteRefs,
    amounts,
    dates,
  };
}

function heuristicFallback(
  text: string,
  context: ExtractContext,
): TextExtract {
  return new HeuristicInterpreterExtractor().extract(text, context);
}

/**
 * Extractor LLM. Usa LlmClient (OpenAI / cassette / heurístico de infra).
 * failureMode=heuristic → cae al HeuristicInterpreterExtractor del dominio.
 */
export class LlmInterpreterExtractor implements AsyncInterpreterTextExtractor {
  private readonly client: LlmClient;

  constructor(options?: {
    readonly client?: LlmClient;
    readonly clientOptions?: LlmClientOptions;
  }) {
    this.client =
      options?.client ??
      new LlmClient(
        options?.clientOptions ?? {
          adapter: new HeuristicLlmAdapter(),
        },
      );
  }

  async extractAsync(
    text: string,
    context: ExtractContext,
  ): Promise<TextExtract> {
    const allowed = new Set(context.allowedTransitionIds);

    const outcome = await this.client.completeStructured({
      componentId: "interpreter",
      callKind: "interpreter.extract_intent",
      system: INTERPRETER_SYSTEM_PROMPT,
      userPayload: buildUserPayload(text, context),
      skipMinimize: true,
      schema: InterpreterIntentSchema,
      schemaName: "interpreter_intent",
      jsonSchema: INTERPRETER_INTENT_JSON_SCHEMA as unknown as Record<
        string,
        unknown
      >,
      failureMode: "heuristic",
      heuristic: () => {
        const h = heuristicFallback(text, context);
        return intentFromHeuristic(h);
      },
      confidenceThreshold: 0.7,
    });

    if (outcome.kind === "ok" || outcome.kind === "heuristic_fallback") {
      return toTextExtract(outcome.data, allowed);
    }

    if (outcome.kind === "ask_clarification") {
      if (outcome.data) {
        return toTextExtract(
          {
            ...outcome.data,
            ambiguous: true,
            transitionId: null,
            clarificationQuestion:
              outcome.data.clarificationQuestion ??
              outcome.reason ??
              "¿Puedes concretar la acción?",
          },
          allowed,
        );
      }
      return {
        transitionId: null,
        intentLabel: "aclaracion",
        confidence: 0.4,
        evidenceKind: "aceptacion",
        evidencePendingValidation: false,
        fields: {},
        confirmationQuestion: outcome.reason,
        ambiguous: true,
        candidates: [],
      };
    }

    // noop / error → heurístico de dominio (nunca inventar en silencio)
    return heuristicFallback(text, context);
  }
}

function intentFromHeuristic(h: TextExtract): InterpreterIntentLlm {
  return {
    confidence: h.confidence,
    transitionId: h.transitionId,
    intentLabel: h.intentLabel,
    evidenceKind: h.evidenceKind,
    ...(h.evidenceReferenceType !== undefined
      ? { evidenceReferenceType: h.evidenceReferenceType }
      : {}),
    evidencePendingValidation: h.evidencePendingValidation,
    ambiguous: Boolean(h.confirmationQuestion) || !h.transitionId,
    clarificationQuestion: h.confirmationQuestion ?? null,
    parteRefs: h.parteRefs ? [...h.parteRefs] : [],
    amounts: h.amounts
      ? h.amounts.map((a) => ({
          amount: a.amount,
          currency: a.currency ?? "EUR",
          ...(a.label !== undefined ? { label: a.label } : {}),
        }))
      : [],
    dates: h.dates
      ? h.dates.map((d) => ({
          raw: d.raw,
          ...(d.iso !== undefined ? { iso: d.iso } : {}),
          ...(d.role !== undefined ? { role: d.role } : {}),
        }))
      : [],
    fields: { ...h.fields },
    candidates: h.candidates
      ? h.candidates.map((c) => ({
          transitionId: c.transitionId,
          label: c.label,
          confidence: c.confidence,
        }))
      : [],
  };
}

/**
 * Responder heurístico de infra LLM alineado al schema del Intérprete
 * (para cassettes / CI sin OpenAI).
 */
export function interpreterHeuristicResponder(
  text: string,
  context: ExtractContext,
): string {
  return JSON.stringify(intentFromHeuristic(heuristicFallback(text, context)));
}
