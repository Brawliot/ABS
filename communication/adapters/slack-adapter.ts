/**
 * Adaptador de Slack (Webhooks).
 * Config: SLACK_WEBHOOK_URL
 */

import type { NotificacionParaEnviar } from "../types.js";
import { AdaptadorCanal, type ResultadoEnvio } from "./base-adapter.js";

export class AdaptadorSlack extends AdaptadorCanal {
  canal = "slack";
  private webhookUrl: string;

  constructor() {
    super();
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL || "";
  }

  validar(): ResultadoEnvio {
    if (!this.webhookUrl) return { ok: false, detalle: "SLACK_WEBHOOK_URL no configurado" };
    return { ok: true, detalle: "Slack configurado correctamente" };
  }

  async enviar(notificacion: NotificacionParaEnviar): Promise<ResultadoEnvio> {
    try {
      const payload = this.generarPayload(notificacion);

      this.log(
        `Enviando mensaje Slack (plantilla: ${notificacion.plantilla})`
      );

      if (process.env.NODE_ENV === "test") {
        this.log(`[TEST] Mensaje Slack enviado`, "info");
        return { ok: true, detalle: "Slack enviado (test)" };
      }

      await this.enviarViaWebhook(payload);

      return { ok: true, detalle: "Mensaje Slack enviado correctamente" };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.log(`Error enviando Slack: ${mensaje}`, "error");
      return { ok: false, detalle: mensaje };
    }
  }

  private generarPayload(notif: NotificacionParaEnviar): Record<string, any> {
    const emojis: Record<string, string> = {
      "venta-confirmada": "✅",
      "pago-recibido": "💰",
      "factura-lista": "📄",
      "cierre-notificacion": "🏁",
    };

    const emoji = emojis[notif.plantilla] || "📢";

    return {
      text: `${emoji} ${notif.plantilla}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${notif.plantilla}*\n• Evento: ${notif.evento}\n• Destinatario: ${notif.destinatario}\n• Contacto: ${notif.contacto}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `\`\`\`${JSON.stringify(notif.datos, null, 2)}\`\`\``,
          },
        },
      ],
    };
  }

  private async enviarViaWebhook(payload: Record<string, any>): Promise<void> {
    const fetch = (await import("node-fetch")).default;

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook error: ${response.status}`);
    }
  }
}
