/**
 * Aceptar recomendación → interacción → Intérprete → solicitud para el Juez.
 * El Presentador no ejecuta la transición.
 */

import type { Insight } from "../contracts/insight.js";
import {
  identityFromChannel,
  interpret,
  type InterpretContext,
} from "../interpreter/index.js";
import type {
  ChannelIdentity,
  Interaction,
  InterpreterOutcome,
  TransitionRequest,
} from "../interpreter/types.js";
import type { PresentationChannel } from "../presentation/types.js";
import { PresenterError } from "./types.js";

/**
 * Construye la interacción de aceptación de una recomendación.
 */
export function recommendationAcceptanceInteraction(input: {
  readonly insight: Insight;
  readonly interactionId: string;
  readonly occurredAt: string;
  readonly channel: PresentationChannel;
  readonly clientRequestId?: string;
}): Interaction {
  const action = input.insight.suggestedAction;
  if (!action) {
    throw new PresenterError(
      `Insight ${input.insight.id} no tiene acción sugerida`,
    );
  }
  if (input.insight.type !== "recomendacion") {
    throw new PresenterError(
      `Solo recomendaciones aceptan acción (era ${input.insight.type})`,
    );
  }

  const formValues: Record<string, string> = {
    "evidence.kind": action.evidenceKind ?? "aceptacion",
    "evidence.reference":
      action.evidenceReference ?? `insight:${input.insight.id}`,
    insight_id: input.insight.id,
  };
  if (action.fields) {
    for (const [k, v] of Object.entries(action.fields)) {
      formValues[k] = String(v);
    }
  }

  return {
    id: input.interactionId,
    kind: "boton",
    channel: input.channel,
    occurredAt: input.occurredAt,
    subjectId: input.insight.subject.id,
    transitionId: action.transitionId,
    actionId: `insight.accept.${input.insight.id}`,
    formValues,
    ...(input.clientRequestId !== undefined
      ? { clientRequestId: input.clientRequestId }
      : {}),
  };
}

/**
 * Aceptar recomendación vía Intérprete → TransitionRequest (para el Juez).
 */
export function acceptRecommendation(input: {
  readonly insight: Insight;
  readonly identity: ChannelIdentity;
  readonly interactionId: string;
  readonly occurredAt: string;
  readonly channel: PresentationChannel;
  readonly allowedTransitionIds: readonly string[];
  readonly interpretContext?: Partial<InterpretContext>;
}): {
  readonly outcome: InterpreterOutcome;
  readonly request: TransitionRequest | null;
} {
  const interaction = recommendationAcceptanceInteraction({
    insight: input.insight,
    interactionId: input.interactionId,
    occurredAt: input.occurredAt,
    channel: input.channel,
  });

  const outcome = interpret(interaction, {
    identity: input.identity,
    allowedTransitionIds: input.allowedTransitionIds,
    ...input.interpretContext,
  });

  return {
    outcome,
    request: outcome.kind === "solicitud" ? outcome.request : null,
  };
}

export { identityFromChannel };
