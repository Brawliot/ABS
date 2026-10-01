/**
 * Adaptador de SMS (Twilio).
 * Config: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 */

import type { NotificacionParaEnviar } from "../types.js";
import { AdaptadorCanal, type ResultadoEnvio } from "./base-adapter.js";

export class AdaptadorSMS extends AdaptadorCanal {
  canal = "sms";
  private accountSid: string;
  private authToken: string;
  private phoneNumber: string;

  constructor() {
    super();
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || "";
    this.authToken = process.env.TWILIO_AUTH_TOKEN || "";
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER || "";
  }

  validar(): ResultadoEnvio {
    if (!this.accountSid) return { ok: false, detalle: "TWILIO_ACCOUNT_SID no configurado" };
    if (!this.authToken) return { ok: false, detalle: "TWILIO_AUTH_TOKEN no configurado" };
    if (!this.phoneNumber) return { ok: false, detalle: "TWILIO_PHONE_NUMBER no configurado" };
    return { ok: true, detalle: "SMS configurado correctamente" };
  }

  async enviar(notificacion: NotificacionParaEnviar): Promise<ResultadoEnvio> {
    try {
      const mensaje = this.generarMensaje(notificacion);

      this.log(
        `Enviando SMS a ${notificacion.contacto} (plantilla: ${notificacion.plantilla})`
      );

      if (process.env.NODE_ENV === "test") {
        this.log(`[TEST] SMS enviado a ${notificacion.contacto}: ${mensaje}`, "info");
        return { ok: true, detalle: "SMS enviado (test)" };
      }

      await this.enviarViaTwilio(notificacion.contacto, mensaje);

      return { ok: true, detalle: "SMS enviado correctamente" };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.log(`Error enviando SMS: ${mensaje}`, "error");
      return { ok: false, detalle: mensaje };
    }
  }

  private generarMensaje(notif: NotificacionParaEnviar): string {
    const plantillas: Record<string, (datos: any) => string> = {
      "venta-confirmada": (datos) => "Tu venta ha sido confirmada. ¡Gracias!",
      "pago-recibido": (datos) => `Pago recibido por ${datos.monto || "N/A"}. Gracias.`,
      "factura-lista": (datos) => "Tu factura está lista. Accede a tu cuenta para verla.",
      "cierre-notificacion": (datos) => "Tu proceso ha sido cerrado exitosamente.",
    };

    const template = plantillas[notif.plantilla] || (() => "Tienes una notificación");

    return template(notif.datos);
  }

  private async enviarViaTwilio(telefono: string, mensaje: string): Promise<void> {
    let twilio: any;
    try {
      // @ts-expect-error optional module
      twilio = (await import("twilio")).default;
    } catch {
      this.log("twilio not installed. Skipping SMS send.", undefined);
      return;
    }
    const client = twilio(this.accountSid, this.authToken);

    await client.messages.create({
      body: mensaje,
      from: this.phoneNumber,
      to: telefono,
    });
  }
}
