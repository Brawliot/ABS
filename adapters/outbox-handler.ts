/**
 * Handler para procesar eventos del Outbox (efectos externos).
 * Mapea tipos de outbox a acciones concretas (correo, webhooks, etc.)
 */

import type { OutboxRow } from "./outbox.js";

export interface OutboxHandler {
  readonly handle: (row: OutboxRow) => Promise<void>;
}

/**
 * Crear un handler que sepa procesar diferentes tipos de outbox.
 * - "enviar_email": envía correo
 * - "webhook": llama endpoint externo
 * - "notificacion": notificación interna (logs, etc.)
 */
export function createOutboxHandler(options: {
  readonly sendEmail?: (payload: unknown) => Promise<void>;
  readonly callWebhook?: (payload: unknown) => Promise<void>;
  readonly logNotification?: (payload: unknown) => Promise<void>;
}): OutboxHandler {
  return {
    async handle(row: OutboxRow): Promise<void> {
      const { kind, payload } = row;

      if (kind === "enviar_email" && options.sendEmail) {
        await options.sendEmail(payload);
      } else if (kind === "webhook" && options.callWebhook) {
        await options.callWebhook(payload);
      } else if (kind === "notificacion" && options.logNotification) {
        await options.logNotification(payload);
      } else {
        // Tipo desconocido: loguear y marcar como publicado igual
        console.warn(
          `[OutboxHandler] Tipo desconocido: ${kind}; ignorando. Payload:`,
          JSON.stringify(payload).slice(0, 200)
        );
      }
    },
  };
}

/**
 * Handler por defecto: solo loguea (para dev/testing)
 */
export function createNoOpOutboxHandler(): OutboxHandler {
  return {
    async handle(row: OutboxRow): Promise<void> {
      console.log(
        `[OutboxHandler] Outbox ${row.id} (${row.kind}):`,
        JSON.stringify(row.payload).slice(0, 200)
      );
    },
  };
}
