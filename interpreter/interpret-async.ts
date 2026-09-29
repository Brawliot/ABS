/**
 * interpretAsync — camino de mensajes con extractor LLM (o cualquier async).
 * Misma semántica que interpret(): nunca llama al Juez.
 */

import { createHash } from "node:crypto";
import type { ActionSpec } from "../presentation/types.js";
import { IdempotencyLedger, idempotencyKey } from "./idempotency.js";
import { interpretStructured } from "./structured.js";
import { CONFIDENCE_THRESHOLD } from "./text-extractor.js";
import type {
  AsyncInterpreterTextExtractor,
  ChannelIdentity,
  ExtractContext,
  Interaction,
  InterpreterOutcome,
  InterpreterTextExtractor,
  TransitionRequest,
} from "./types.js";
import { InterpreterError } from "./types.js";
import { HeuristicInterpreterExtractor } from "./text-extractor.js";

export interface InterpretAsyncContext {
  readonly identity: ChannelIdentity;
  readonly allowedTransitionIds: readonly string[];
  readonly actionsById?: Readonly<Record<string, ActionSpec>>;
  readonly textExtractor?: InterpreterTextExtractor;
  readonly asyncTextExtractor?: AsyncInterpreterTextExtractor;
  readonly ledger?: IdempotencyLedger;
  readonly parteDirectory?: ExtractContext["parteDirectory"];
}

function newRequestId(interaction: Interaction, key: string): string {
  return `req:${createHash("sha256").update(`${key}:${interaction.id}`).digest("hex").slice(0, 24)}`;
}

/**
 * Igual que `interpret`, pero await del extractor async (LLM).
 * Botón/formulario siguen síncronos.
 */
export async function interpretAsync(
  interaction: Interaction,
  ctx: InterpretAsyncContext,
): Promise<InterpreterOutcome> {
  const ledger = ctx.ledger ?? new IdempotencyLedger();
  const key = idempotencyKey(interaction, ctx.identity.actorId);

  if (ledger.has(key)) {
    return {
      kind: "solicitud",
      request: ledger.get(key)!,
      idempotentReplay: true,
    };
  }

  if (interaction.kind === "boton" || interaction.kind === "formulario") {
    const action =
      interaction.actionId && ctx.actionsById
        ? ctx.actionsById[interaction.actionId]
        : undefined;
    const { request, replay } = ledger.claim(key, () =>
      interpretStructured({
        interaction,
        identity: ctx.identity,
        ...(action !== undefined ? { action } : {}),
        requestId: newRequestId(interaction, key),
      }),
    );
    return { kind: "solicitud", request, idempotentReplay: replay };
  }

  if (interaction.kind === "mensaje") {
    return interpretMessageAsync(interaction, ctx, ledger, key);
  }

  throw new InterpreterError(`Tipo de interacción no soportado`);
}

async function interpretMessageAsync(
  interaction: Interaction,
  ctx: InterpretAsyncContext,
  ledger: IdempotencyLedger,
  key: string,
): Promise<InterpreterOutcome> {
  const text = interaction.text?.trim() ?? "";
  if (!text) {
    return {
      kind: "confirmacion",
      question: "Mensaje vacío. ¿Qué transición quieres solicitar?",
      confidence: 0,
      candidates: [],
      interactionId: interaction.id,
    };
  }

  const extractCtx: ExtractContext = {
    subjectId: interaction.subjectId,
    allowedTransitionIds: ctx.allowedTransitionIds,
    hasAttachments: (interaction.attachments?.length ?? 0) > 0,
    ...(ctx.parteDirectory !== undefined
      ? { parteDirectory: ctx.parteDirectory }
      : {}),
  };

  const extracted = ctx.asyncTextExtractor
    ? await ctx.asyncTextExtractor.extractAsync(text, extractCtx)
    : (ctx.textExtractor ?? new HeuristicInterpreterExtractor()).extract(
        text,
        extractCtx,
      );

  // Defensa: transición inexistente nunca llega a solicitud
  if (
    extracted.transitionId &&
    !ctx.allowedTransitionIds.includes(extracted.transitionId)
  ) {
    return {
      kind: "confirmacion",
      question: `La transición candidata "${extracted.transitionId}" no está permitida ahora. ¿Qué prefieres?`,
      confidence: extracted.confidence * 0.5,
      candidates: [],
      interactionId: interaction.id,
    };
  }

  const needsConfirm =
    extracted.ambiguous === true ||
    extracted.confidence < CONFIDENCE_THRESHOLD ||
    !extracted.transitionId ||
    Boolean(extracted.confirmationQuestion);

  if (needsConfirm) {
    if (extracted.confidence < 0.3 && !extracted.confirmationQuestion) {
      return {
        kind: "derivacion_humana",
        reason: "Confianza demasiado baja; derivar a humano",
        confidence: extracted.confidence,
        interactionId: interaction.id,
      };
    }
    return {
      kind: "confirmacion",
      question:
        extracted.confirmationQuestion ??
        "¿Confirmas la acción antes de continuar?",
      confidence: extracted.confidence,
      candidates: extracted.candidates ?? [],
      interactionId: interaction.id,
    };
  }

  const transitionId = extracted.transitionId!;
  const attachmentRef = interaction.attachments?.[0]?.id;
  const reference =
    attachmentRef !== undefined
      ? `captura:${attachmentRef}`
      : `msg:${interaction.id}`;

  const { request, replay } = ledger.claim(key, () => {
    const req: TransitionRequest = {
      id: newRequestId(interaction, key),
      subjectId: interaction.subjectId,
      transitionId,
      actorId: ctx.identity.actorId,
      actorKind: ctx.identity.actorKind,
      ...(ctx.identity.parteId !== undefined
        ? { parteId: ctx.identity.parteId }
        : {}),
      tenantId: ctx.identity.tenantId,
      occurredAt: interaction.occurredAt,
      evidence: {
        kind: extracted.evidenceKind,
        reference,
        recordedAt: interaction.occurredAt,
        ...(extracted.evidenceReferenceType !== undefined
          ? { referenceType: extracted.evidenceReferenceType }
          : {}),
      },
      evidenceValidationStatus: extracted.evidencePendingValidation
        ? "pendiente_validacion"
        : "lista_para_juez",
      fields: { ...extracted.fields },
      confidence: extracted.confidence,
      source: "texto",
      interactionId: interaction.id,
      intentLabel: extracted.intentLabel,
    };
    return req;
  });

  return { kind: "solicitud", request, idempotentReplay: replay };
}
