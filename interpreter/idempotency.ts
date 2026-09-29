/**
 * Idempotencia: doble clic / mensaje duplicado → una sola solicitud.
 */

import { createHash } from "node:crypto";
import type { Interaction, TransitionRequest } from "./types.js";

export function idempotencyKey(
  interaction: Interaction,
  identityActorId: string,
): string {
  if (interaction.clientRequestId) {
    return `client:${interaction.clientRequestId}`;
  }
  const payload = [
    interaction.channel,
    identityActorId,
    interaction.subjectId,
    interaction.kind,
    interaction.actionId ?? "",
    interaction.transitionId ?? "",
    interaction.text?.trim().toLowerCase() ?? "",
    JSON.stringify(interaction.formValues ?? {}),
    (interaction.attachments ?? []).map((a) => a.id).sort().join(","),
  ].join("|");
  return `hash:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}

export class IdempotencyLedger {
  private readonly byKey = new Map<string, TransitionRequest>();

  /**
   * Devuelve la solicitud existente o registra la nueva.
   * `build` solo se invoca si la clave es nueva.
   */
  claim(
    key: string,
    build: () => TransitionRequest,
  ): { readonly request: TransitionRequest; readonly replay: boolean } {
    const existing = this.byKey.get(key);
    if (existing) return { request: existing, replay: true };
    const request = build();
    this.byKey.set(key, request);
    return { request, replay: false };
  }

  has(key: string): boolean {
    return this.byKey.has(key);
  }

  get(key: string): TransitionRequest | undefined {
    return this.byKey.get(key);
  }

  size(): number {
    return this.byKey.size;
  }
}
