/**
 * Orquestación del Intérprete: interacción → Outcome (solicitud | confirmación | humana).
 * Nunca llama al Juez.
 */

import { createHash } from "node:crypto";
import type { ActionSpec } from "../presentation/types.js";
import { IdempotencyLedger, idempotencyKey } from "./idempotency.js";
import { interpretStructured } from "./structured.js";
import {
  HeuristicInterpreterExtractor,
  CONFIDENCE_THRESHOLD,
} from "./text-extractor.js";
import type {
  ChannelIdentity,
  Interaction,
  InterpreterOutcome,
  InterpreterTextExtractor,
  TransitionRequest,
} from "./types.js";
import { InterpreterError } from "./types.js";

export interface InterpretContext {
  readonly identity: ChannelIdentity;
  readonly allowedTransitionIds: readonly string[];
  readonly actionsById?: Readonly<Record<string, ActionSpec>>;
  readonly textExtractor?: InterpreterTextExtractor;
  readonly ledger?: IdempotencyLedger;
}

function newRequestId(interaction: Interaction, key: string): string {
  return `req:${createHash("sha256").update(`${key}:${interaction.id}`).digest("hex").slice(0, 24)}`;
}

/**
 * Interpreta una interacción. Puro respecto al Juez (no ejecuta).
 * Idempotente vía ledger.
 */
export function interpret(
  interaction: Interaction,
  ctx: InterpretContext,
): InterpreterOutcome {
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
    return interpretMessage(interaction, ctx, ledger, key);
  }

  throw new InterpreterError(`Tipo de interacción no soportado`);
}

function interpretMessage(
  interaction: Interaction,
  ctx: InterpretContext,
  ledger: IdempotencyLedger,
  key: string,
): InterpreterOutcome {
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

  const extractor =
    ctx.textExtractor ?? new HeuristicInterpreterExtractor();
  const extracted = extractor.extract(text, {
    subjectId: interaction.subjectId,
    allowedTransitionIds: ctx.allowedTransitionIds,
    hasAttachments: (interaction.attachments?.length ?? 0) > 0,
  });

  const needsConfirm =
    extracted.confidence < CONFIDENCE_THRESHOLD ||
    !extracted.transitionId ||
    Boolean(extracted.confirmationQuestion);

  if (needsConfirm) {
    if (extracted.confidence < 0.3) {
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

  // confidence >= umbral, transición clara, sin pregunta pendiente
  const transitionId = extracted.transitionId!;
  if (!ctx.allowedTransitionIds.includes(transitionId)) {
    return {
      kind: "confirmacion",
      question: `La transición candidata "${transitionId}" no está permitida ahora. ¿Qué prefieres?`,
      confidence: extracted.confidence * 0.5,
      candidates: [],
      interactionId: interaction.id,
    };
  }

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

/**
 * Identidad desde canal: autoservicio → Parte; backoffice → Actor humano.
 */
export function identityFromChannel(input: {
  readonly channel: Interaction["channel"];
  readonly sessionActorId: string;
  readonly sessionParteId?: string;
  readonly tenantId: string;
  readonly roles?: readonly string[];
}): ChannelIdentity {
  if (input.channel === "autoservicio") {
    if (!input.sessionParteId) {
      throw new InterpreterError(
        "Canal autoservicio exige sessionParteId (Parte)",
      );
    }
    return {
      actorId: input.sessionActorId,
      actorKind: "humano",
      roles: input.roles ?? ["cliente"],
      parteId: input.sessionParteId,
      tenantId: input.tenantId,
    };
  }
  return {
    actorId: input.sessionActorId,
    actorKind: "humano",
    roles: input.roles ?? ["vendedor"],
    ...(input.sessionParteId !== undefined
      ? { parteId: input.sessionParteId }
      : {}),
    tenantId: input.tenantId,
  };
}

export { IdempotencyLedger, idempotencyKey };
