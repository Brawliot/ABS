/**
 * Adaptador de Email (SMTP).
 * Config: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */

import type { NotificacionParaEnviar } from "../types.js";
import { AdaptadorCanal, type ResultadoEnvio } from "./base-adapter.js";

export class AdaptadorEmail extends AdaptadorCanal {
  canal = "email";
  private host: string;
  private port: number;
  private user: string;
  private pass: string;

  constructor() {
    super();
    this.host = process.env.SMTP_HOST || "localhost";
    this.port = parseInt(process.env.SMTP_PORT || "587", 10);
    this.user = process.env.SMTP_USER || "";
    this.pass = process.env.SMTP_PASS || "";
  }

  validar(): ResultadoEnvio {
    if (!this.host) return { ok: false, detalle: "SMTP_HOST no configurado" };
    if (!this.port) return { ok: false, detalle: "SMTP_PORT no configurado" };
    if (!this.user) return { ok: false, detalle: "SMTP_USER no configurado" };
    if (!this.pass) return { ok: false, detalle: "SMTP_PASS no configurado" };
    return { ok: true, detalle: "Email configurado correctamente" };
  }

  async enviar(notificacion: NotificacionParaEnviar): Promise<ResultadoEnvio> {
    try {
      const asunto = this.generarAsunto(notificacion);
      const html = this.generarHtml(notificacion);

      this.log(
        `Enviando email a ${notificacion.contacto} (plantilla: ${notificacion.plantilla})`
      );

      if (process.env.NODE_ENV === "test") {
        this.log(`[TEST] Email enviado a ${notificacion.contacto}`, "info");
        return { ok: true, detalle: "Email enviado (test)" };
      }

      await this.enviarViaSMTP(notificacion.contacto, asunto, html);

      return { ok: true, detalle: "Email enviado correctamente" };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.log(`Error enviando email: ${mensaje}`, "error");
      return { ok: false, detalle: mensaje };
    }
  }

  private generarAsunto(notif: NotificacionParaEnviar): string {
    const asuntos: Record<string, string> = {
      "venta-confirmada": "Venta confirmada",
      "pago-recibido": "Pago recibido",
      "factura-lista": "Tu factura está lista",
      "cierre-notificacion": "Notificación de cierre",
    };
    return asuntos[notif.plantilla] || "Notificación";
  }

  private generarHtml(notif: NotificacionParaEnviar): string {
    const templates: Record<string, (datos: any) => string> = {
      "venta-confirmada": (datos) =>
        `<p>Tu venta ha sido confirmada.</p><p>Detalles: ${JSON.stringify(datos)}</p>`,
      "pago-recibido": (datos) =>
        `<p>Tu pago ha sido recibido.</p><p>Monto: ${datos.monto || "N/A"}</p>`,
      "factura-lista": (datos) =>
        `<p>Tu factura está lista para descargar.</p><p>Referencia: ${datos.referencia || "N/A"}</p>`,
      "cierre-notificacion": (datos) =>
        `<p>El proceso ha sido cerrado.</p><p>Estado: ${datos.estado || "N/A"}</p>`,
    };

    const defaultTemplate = (datos: any) =>
      `<p>Notificación</p><p>${JSON.stringify(datos)}</p>`;
    const template = templates[notif.plantilla] || defaultTemplate;

    return template(notif.datos);
  }

  private async enviarViaSMTP(
    destinatario: string,
    asunto: string,
    html: string
  ): Promise<void> {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: this.host,
      port: this.port,
      secure: this.port === 465,
      auth: {
        user: this.user,
        pass: this.pass,
      },
    });

    await transporter.sendMail({
      from: this.user,
      to: destinatario,
      subject: asunto,
      html,
    });
  }
}
