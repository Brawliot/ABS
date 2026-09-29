/**
 * Traducción determinista: botón / formulario → TransitionRequest.
 */

import type { ActionSpec } from "../presentation/types.js";
import type {
  ChannelIdentity,
  Interaction,
  TransitionRequest,
} from "./types.js";
import { InterpreterError } from "./types.js";

export function interpretStructured(input: {
  readonly interaction: Interaction;
  readonly identity: ChannelIdentity;
  readonly action?: ActionSpec;
  readonly requestId: string;
}): TransitionRequest {
  const { interaction, identity, action, requestId } = input;
  if (interaction.kind !== "boton" && interaction.kind !== "formulario") {
    throw new InterpreterError("interpretStructured exige botón o formulario");
  }

  const transitionId =
    interaction.transitionId ?? action?.transitionId;
  if (!transitionId) {
    throw new InterpreterError(
      "Interacción estructurada sin transitionId ni ActionSpec",
    );
  }

  const evidenceKind =
    (interaction.formValues?.["evidence.kind"] as
      | "aceptacion"
      | "sistema"
      | "fisica"
      | undefined) ??
    (action?.requiredEvidenceKind as
      | "aceptacion"
      | "sistema"
      | "fisica"
      | undefined) ??
    "aceptacion";

  const reference =
    interaction.formValues?.["evidence.reference"] ??
    interaction.attachments?.[0]?.id ??
    `ui:${interaction.id}`;

  const fields: Record<string, unknown> = {
    ...(interaction.formValues ?? {}),
  };
  delete fields["evidence.kind"];
  delete fields["evidence.reference"];
  delete fields["evidence.recordedAt"];

  return {
    id: requestId,
    subjectId: interaction.subjectId,
    transitionId,
    actorId: identity.actorId,
    actorKind: identity.actorKind,
    ...(identity.parteId !== undefined ? { parteId: identity.parteId } : {}),
    tenantId: identity.tenantId,
    occurredAt: interaction.occurredAt,
    evidence: {
      kind: evidenceKind,
      reference,
      recordedAt:
        interaction.formValues?.["evidence.recordedAt"] ??
        interaction.occurredAt,
      ...(action?.requiredEvidenceKind === "fisica"
        ? { referenceType: "captura" }
        : {}),
    },
    evidenceValidationStatus: "lista_para_juez",
    fields,
    confidence: 1,
    source: "estructurado",
    interactionId: interaction.id,
    intentLabel: action?.labelKey ?? transitionId,
  };
}
