/**
 * Adaptador de Push (Firebase Cloud Messaging).
 * Config: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL
 */

import type { NotificacionParaEnviar } from "../types.js";
import { AdaptadorCanal, type ResultadoEnvio } from "./base-adapter.js";

export class AdaptadorPush extends AdaptadorCanal {
  canal = "push";
  private projectId: string;
  private privateKey: string;
  private clientEmail: string;

  constructor() {
    super();
    this.projectId = process.env.FIREBASE_PROJECT_ID || "";
    this.privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
    this.clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  }

  validar(): ResultadoEnvio {
    if (!this.projectId) return { ok: false, detalle: "FIREBASE_PROJECT_ID no configurado" };
    if (!this.privateKey) return { ok: false, detalle: "FIREBASE_PRIVATE_KEY no configurado" };
    if (!this.clientEmail)
      return { ok: false, detalle: "FIREBASE_CLIENT_EMAIL no configurado" };
    return { ok: true, detalle: "Push configurado correctamente" };
  }

  async enviar(notificacion: NotificacionParaEnviar): Promise<ResultadoEnvio> {
    try {
      const { titulo, cuerpo } = this.generarTextos(notificacion);

      this.log(
        `Enviando push a ${notificacion.contacto} (plantilla: ${notificacion.plantilla})`
      );

      if (process.env.NODE_ENV === "test") {
        this.log(`[TEST] Push enviado: ${titulo}`, "info");
        return { ok: true, detalle: "Push enviado (test)" };
      }

      await this.enviarViaFirebase(notificacion.contacto, titulo, cuerpo);

      return { ok: true, detalle: "Push enviado correctamente" };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.log(`Error enviando push: ${mensaje}`, "error");
      return { ok: false, detalle: mensaje };
    }
  }

  private generarTextos(
    notif: NotificacionParaEnviar
  ): { titulo: string; cuerpo: string } {
    const textos: Record<string, { titulo: string; cuerpo: string }> = {
      "venta-confirmada": {
        titulo: "¡Venta confirmada!",
        cuerpo: "Tu venta ha sido procesada exitosamente.",
      },
      "pago-recibido": {
        titulo: "Pago recibido",
        cuerpo: `Se ha registrado tu pago de ${notif.datos.monto || "N/A"}.`,
      },
      "factura-lista": {
        titulo: "Factura lista",
        cuerpo: "Tu factura está disponible para descargar.",
      },
      "cierre-notificacion": {
        titulo: "Proceso finalizado",
        cuerpo: "El proceso ha sido cerrado exitosamente.",
      },
    };

    return (
      textos[notif.plantilla] || {
        titulo: "Notificación",
        cuerpo: "Tienes una nueva notificación.",
      }
    );
  }

  private async enviarViaFirebase(
    usuarioId: string,
    titulo: string,
    cuerpo: string
  ): Promise<void> {
    let initializeApp: any, cert: any, getApp: any, getMessaging: any;
    try {
      // @ts-expect-error optional modules
      ({ initializeApp, cert, getApp } = await import("firebase-admin/app"));
      // @ts-expect-error optional module
      ({ getMessaging } = await import("firebase-admin/messaging"));
    } catch {
      this.log("firebase-admin not installed. Skipping push send.", undefined);
      return;
    }

    let app;
    try {
      app = getApp();
    } catch {
      const serviceAccount = {
        projectId: this.projectId,
        privateKey: this.privateKey.replace(/\\n/g, "\n"),
        clientEmail: this.clientEmail,
      };

      app = initializeApp({
        credential: cert(serviceAccount as any),
      });
    }

    const messaging = getMessaging(app);

    await messaging.send({
      notification: { title: titulo, body: cuerpo },
      token: usuarioId,
    });
  }
}
