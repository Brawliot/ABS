/**
 * Adaptador de WhatsApp (Meta Cloud API).
 * Config: META_BUSINESS_PHONE_ID, META_ACCESS_TOKEN
 */

import type { NotificacionParaEnviar } from "../types.js";
import { AdaptadorCanal, type ResultadoEnvio } from "./base-adapter.js";

export class AdaptadorWhatsApp extends AdaptadorCanal {
  canal = "whatsapp";
  private businessPhoneId: string;
  private accessToken: string;

  constructor() {
    super();
    this.businessPhoneId = process.env.META_BUSINESS_PHONE_ID || "";
    this.accessToken = process.env.META_ACCESS_TOKEN || "";
  }

  validar(): ResultadoEnvio {
    if (!this.businessPhoneId)
      return { ok: false, detalle: "META_BUSINESS_PHONE_ID no configurado" };
    if (!this.accessToken) return { ok: false, detalle: "META_ACCESS_TOKEN no configurado" };
    return { ok: true, detalle: "WhatsApp configurado correctamente" };
  }

  async enviar(notificacion: NotificacionParaEnviar): Promise<ResultadoEnvio> {
    try {
      const idPlantilla = this.mapearPlantilla(notificacion.plantilla);

      this.log(
        `Enviando WhatsApp a ${notificacion.contacto} (plantilla: ${notificacion.plantilla})`
      );

      if (process.env.NODE_ENV === "test") {
        this.log(`[TEST] WhatsApp enviado a ${notificacion.contacto}`, "info");
        return { ok: true, detalle: "WhatsApp enviado (test)" };
      }

      await this.enviarViaMetaAPI(notificacion.contacto, idPlantilla, notificacion.datos);

      return { ok: true, detalle: "WhatsApp enviado correctamente" };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.log(`Error enviando WhatsApp: ${mensaje}`, "error");
      return { ok: false, detalle: mensaje };
    }
  }

  private mapearPlantilla(plantilla: string): string {
    const mapeo: Record<string, string> = {
      "venta-confirmada": "venta_confirmada",
      "pago-recibido": "pago_recibido",
      "factura-lista": "factura_lista",
      "cierre-notificacion": "cierre_notificacion",
    };
    return mapeo[plantilla] || "notificacion_generica";
  }

  private async enviarViaMetaAPI(
    numeroCliente: string,
    idPlantilla: string,
    datos: Record<string, any>
  ): Promise<void> {
    let fetch_fn = globalThis.fetch;
    if (!fetch_fn) {
      try {
        // @ts-expect-error optional module
        fetch_fn = (await import("node-fetch")).default;
      } catch {
        this.log("node-fetch not installed. Skipping send.", undefined);
        return;
      }
    }

    const url = `https://graph.instagram.com/v18.0/${this.businessPhoneId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: numeroCliente.replace(/[^\d+]/g, ""),
      type: "template",
      template: {
        name: idPlantilla,
        language: {
          code: "es_ES",
        },
        body: {
          parameters: [
            {
              type: "text",
              text: JSON.stringify(datos),
            },
          ],
        },
      },
    };

    const response = await fetch_fn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Meta API error: ${JSON.stringify(error)}`);
    }
  }
}
