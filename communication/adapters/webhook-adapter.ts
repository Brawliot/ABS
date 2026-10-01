/**
 * Adaptador de Webhooks salientes (HTTP POST a terceros).
 */

import type { NotificacionParaEnviar } from "../types.js";
import { AdaptadorCanal, type ResultadoEnvio } from "./base-adapter.js";

export class AdaptadorWebhook extends AdaptadorCanal {
  canal = "webhook";

  validar(): ResultadoEnvio {
    return { ok: true, detalle: "Webhooks configurado" };
  }

  async enviar(notificacion: NotificacionParaEnviar): Promise<ResultadoEnvio> {
    try {
      const url = notificacion.contacto;

      if (!url.startsWith("http")) {
        return {
          ok: false,
          detalle: "URL inválida para webhook",
        };
      }

      this.log(`Llamando webhook: ${url}`);

      if (process.env.NODE_ENV === "test") {
        this.log(`[TEST] Webhook llamado: ${url}`, "info");
        return { ok: true, detalle: "Webhook enviado (test)" };
      }

      await this.llamarWebhook(url, notificacion);

      return { ok: true, detalle: "Webhook enviado correctamente" };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.log(`Error llamando webhook: ${mensaje}`, "error");
      return { ok: false, detalle: mensaje };
    }
  }

  private async llamarWebhook(
    url: string,
    notificacion: NotificacionParaEnviar
  ): Promise<void> {
    const fetch = (await import("node-fetch")).default;

    const payload = {
      id: notificacion.id,
      evento: notificacion.evento,
      plantilla: notificacion.plantilla,
      destinatario: notificacion.destinatario,
      datos: notificacion.datos,
      timestamp: notificacion.createdAt,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`Webhook retornó ${response.status}: ${response.statusText}`);
    }
  }
}
