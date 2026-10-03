/**
 * Interfaz base para todos los adaptadores de canales.
 */

import type { NotificacionParaEnviar } from "../types.js";

export interface ResultadoEnvio {
  ok: boolean;
  detalle: string;
}

export abstract class AdaptadorCanal {
  abstract canal: string;

  abstract validar(): ResultadoEnvio;

  abstract enviar(notificacion: NotificacionParaEnviar): Promise<ResultadoEnvio>;

  protected log(mensaje: string, nivel: "info" | "error" = "info"): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${this.canal} - ${nivel.toUpperCase()}: ${mensaje}`);
  }
}
