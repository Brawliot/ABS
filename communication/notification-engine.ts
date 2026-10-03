/**
 * Motor de reglas de notificación.
 * Procesa eventos de negocio y busca reglas que coincidan.
 */

import type { NotificationRule, Destinatario, NotificacionParaEnviar } from "./types.js";
import type { SqliteNotificationRulesStore } from "../adapters/sqlite-notification-rules-store.js";

export interface EventoDatos {
  subjectId: string;
  negocioId: string;
  evento: string;
  estado?: string;
  datos?: Record<string, any>;
}

export interface ReglasCoincidentes {
  notificaciones: NotificacionParaEnviar[];
}

export class MotorNotificaciones {
  constructor(private rulesStore: SqliteNotificationRulesStore) {}

  procesarEvento(eventoDatos: EventoDatos): ReglasCoincidentes {
    const reglas = this.rulesStore.cargarReglasDe(eventoDatos.negocioId);
    const notificaciones: NotificacionParaEnviar[] = [];

    for (const regla of reglas) {
      if (this.coincideEvento(regla, eventoDatos)) {
        if (!regla.condicion || this.evaluarCondicion(regla.condicion, eventoDatos)) {
          for (const canal of regla.canales) {
            const contactos = this.obtenerContactos(
              eventoDatos,
              regla.destinatario
            );

            for (const contacto of contactos) {
              const notif: NotificacionParaEnviar = {
                id: `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                ruleId: regla.id,
                evento: eventoDatos.evento,
                canal,
                destinatario: regla.destinatario,
                plantilla: regla.plantilla,
                contacto,
                datos: eventoDatos.datos || {},
                createdAt: new Date().toISOString(),
              };
              notificaciones.push(notif);
            }
          }
        }
      }
    }

    return { notificaciones };
  }

  private coincideEvento(
    regla: NotificationRule,
    eventoDatos: EventoDatos
  ): boolean {
    return regla.evento === eventoDatos.evento;
  }

  private evaluarCondicion(
    condicion: string,
    eventoDatos: EventoDatos
  ): boolean {
    try {
      const { estado, datos } = eventoDatos;
      return new Function("estado", "datos", `return ${condicion}`)(estado, datos);
    } catch {
      return false;
    }
  }

  private obtenerContactos(
    eventoDatos: EventoDatos,
    destinatario: Destinatario
  ): string[] {
    if (destinatario === "cliente") {
      return eventoDatos.datos?.clienteContacto ? [eventoDatos.datos.clienteContacto] : [];
    } else if (destinatario === "empresario") {
      return eventoDatos.datos?.empresarioContacto ? [eventoDatos.datos.empresarioContacto] : [];
    } else {
      return [
        ...(eventoDatos.datos?.clienteContacto ? [eventoDatos.datos.clienteContacto] : []),
        ...(eventoDatos.datos?.empresarioContacto ? [eventoDatos.datos.empresarioContacto] : []),
      ];
    }
  }
}
