/**
 * Cola de notificaciones con reintentos automáticos.
 * Procesa pendientes cada minuto; reintenta hasta 3 veces con backoff de 5 min.
 */

import type { NotificacionParaEnviar } from "./types.js";
import type { AdaptadorCanal } from "./adapters/base-adapter.js";
import type { SqliteNotificacionesEnviosStore } from "../adapters/sqlite-notificaciones-envios-store.js";

export class ColaNotificaciones {
  private adaptadores: Map<string, AdaptadorCanal>;
  private procesando: boolean = false;
  private intervaloId?: NodeJS.Timeout;
  private maxReintentos: number = 3;

  constructor(
    private store: SqliteNotificacionesEnviosStore,
    adaptadoresLista: AdaptadorCanal[]
  ) {
    this.adaptadores = new Map(adaptadoresLista.map((a) => [a.canal, a]));
  }

  async encolarNotificacion(notif: NotificacionParaEnviar): Promise<void> {
    this.store.registrarPendiente(
      notif.id,
      notif.evento,
      notif.canal,
      notif.destinatario,
      notif.plantilla
    );
    this.log(`Notificación encolada: ${notif.id}`);
  }

  iniciarProcesamiento(intervaloSegundos: number = 60): void {
    if (this.intervaloId) {
      this.log("Procesamiento ya está activo", "warn");
      return;
    }

    this.intervaloId = setInterval(
      () => {
        this.procesarCola().catch((error) => {
          this.log(`Error procesando cola: ${error}`, "error");
        });
      },
      intervaloSegundos * 1000
    );

    this.log(`Procesamiento iniciado (intervalo: ${intervaloSegundos}s)`);
  }

  detenerProcesamiento(): void {
    if (this.intervaloId) {
      clearInterval(this.intervaloId);
      this.intervaloId = undefined;
      this.log("Procesamiento detenido");
    }
  }

  async procesarCola(): Promise<void> {
    if (this.procesando) return;
    this.procesando = true;

    try {
      const pendientes = this.store.obtenerPendientes(50);

      if (pendientes.length === 0) {
        this.procesando = false;
        return;
      }

      this.log(`Procesando ${pendientes.length} notificaciones pendientes`);

      for (const registro of pendientes) {
        const adaptador = this.adaptadores.get(registro.canal);

        if (!adaptador) {
          this.log(`Adaptador no encontrado: ${registro.canal}`, "error");
          this.store.registrarFallido(
            registro.id,
            `Adaptador no existe: ${registro.canal}`,
            false
          );
          continue;
        }

        const notif: NotificacionParaEnviar = {
          id: registro.id,
          ruleId: "",
          evento: registro.evento_id,
          canal: registro.canal,
          destinatario: registro.destinatario as any,
          plantilla: registro.plantilla,
          contacto: "",
          datos: {},
          createdAt: registro.timestamp,
        };

        try {
          const resultado = await adaptador.enviar(notif);

          if (resultado.ok) {
            this.store.registrarEnviado(registro.id);
            this.log(`✓ Enviado: ${registro.id}`);
          } else {
            const reintentar = registro.intentos < this.maxReintentos;
            this.store.registrarFallido(registro.id, resultado.detalle, reintentar);

            if (reintentar) {
              this.log(
                `⚠ Reintentando: ${registro.id} (intento ${registro.intentos + 1}/${this.maxReintentos})`
              );
            } else {
              this.log(
                `✗ Fallido definitivo: ${registro.id} - ${resultado.detalle}`,
                "error"
              );
            }
          }
        } catch (error) {
          const mensaje = error instanceof Error ? error.message : String(error);
          const reintentar = registro.intentos < this.maxReintentos;
          this.store.registrarFallido(registro.id, mensaje, reintentar);

          this.log(
            `✗ Error enviando ${registro.id}: ${mensaje}`,
            "error"
          );
        }
      }
    } finally {
      this.procesando = false;
    }
  }

  obtenerEstadísticas(): {
    pendientes: number;
    enviadas: number;
    fallidas: number;
    total: number;
  } {
    return {
      pendientes: this.store.contar("pendiente"),
      enviadas: this.store.contar("enviado"),
      fallidas: this.store.contar("fallido"),
      total: this.store.contar(),
    };
  }

  reintentarFallida(notifId: string): void {
    const stmt = this.store["db"]?.prepare(`
      UPDATE notificaciones_envios
      SET estado = 'pendiente', intentos = 0, proximo_intento = NULL
      WHERE id = ?
    `);
    stmt?.run(notifId);
    this.log(`Reintentando fallida: ${notifId}`);
  }

  private log(mensaje: string, nivel: "info" | "warn" | "error" = "info"): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] COLA - ${nivel.toUpperCase()}: ${mensaje}`);
  }
}
