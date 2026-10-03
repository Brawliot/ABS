/**
 * Adaptador de Llamadas (Telnyx).
 * Config: TELNYX_API_KEY, TELNYX_CONNECTION_ID
 *
 * NOTA: Placeholder. Implementación completa cuando Telnyx esté disponible.
 */

import type { NotificacionParaEnviar } from "../types.js";
import { AdaptadorCanal, type ResultadoEnvio } from "./base-adapter.js";

export class AdaptadorTelnyx extends AdaptadorCanal {
  canal = "llamada";
  private apiKey: string;
  private connectionId: string;

  constructor() {
    super();
    this.apiKey = process.env.TELNYX_API_KEY || "";
    this.connectionId = process.env.TELNYX_CONNECTION_ID || "";
  }

  validar(): ResultadoEnvio {
    if (!this.apiKey) return { ok: false, detalle: "TELNYX_API_KEY no configurado" };
    if (!this.connectionId) return { ok: false, detalle: "TELNYX_CONNECTION_ID no configurado" };
    return { ok: true, detalle: "Llamadas (Telnyx) configurado" };
  }

  async enviar(notificacion: NotificacionParaEnviar): Promise<ResultadoEnvio> {
    try {
      this.log(
        `[PLACEHOLDER] Iniciando llamada a ${notificacion.contacto} (plantilla: ${notificacion.plantilla})`
      );

      return {
        ok: true,
        detalle: "Llamada encolada (Telnyx - implementación futura)",
      };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.log(`Error iniciando llamada: ${mensaje}`, "error");
      return { ok: false, detalle: mensaje };
    }
  }
}
