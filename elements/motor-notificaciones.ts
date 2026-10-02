/**
 * MotorNotificaciones (Capa 0.3)
 * Define quién se entera de cada evento (transición).
 * Soporta múltiples canales: email, SMS, push, in_app, webhook.
 */

export type CanalNotificacion =
  | "email"
  | "sms"
  | "push"
  | "in_app"
  | "webhook";

interface ReceptorNotificacion {
  readonly actorId: string;
  readonly roles: string[];
  readonly canales: CanalNotificacion[];
}

interface ReglaNotificacion {
  readonly archetype: string;
  readonly transitionId: string;
  readonly receptores: ReceptorNotificacion[];
  readonly plantilla: string;
}

type ConfigType = {
  readonly notificacionesPorArchetype: Record<
    string,
    Record<string, ReglaNotificacion>
  >;
};

export interface Notificacion {
  readonly id: string;
  readonly actorId: string;
  readonly canal: CanalNotificacion;
  readonly asunto: string;
  readonly cuerpo: string;
  readonly url?: string;
}

export interface NotificacionesResult {
  readonly notificaciones: Notificacion[];
  readonly errores: string[];
}

export class MotorNotificaciones {
  private config: ConfigType;

  constructor() {
    this.config = this.construirConfiguracion();
  }

  private construirConfiguracion(): ConfigType {
    return {
      notificacionesPorArchetype: {
        venta: {
          t_aceptar: {
            archetype: "venta",
            transitionId: "t_aceptar",
            receptores: [
              {
                actorId: "sistema",
                roles: ["admin", "gerente"],
                canales: ["email" as const, "in_app" as const],
              },
              {
                actorId: "cliente",
                roles: ["cliente"],
                canales: ["email" as const, "sms" as const],
              },
            ],
            plantilla: "venta_aceptada",
          },
          t_facturar: {
            archetype: "venta",
            transitionId: "t_facturar",
            receptores: [
              {
                actorId: "finanzas",
                roles: ["contador", "finanzas"],
                canales: ["email" as const, "in_app" as const],
              },
              {
                actorId: "cliente",
                roles: ["cliente"],
                canales: ["email" as const],
              },
            ],
            plantilla: "venta_facturada",
          },
        },
        compra: {
          t_aceptar: {
            archetype: "compra",
            transitionId: "t_aceptar",
            receptores: [
              {
                actorId: "logistica",
                roles: ["logistica", "almacen"],
                canales: ["email" as const, "push" as const],
              },
            ],
            plantilla: "compra_aceptada",
          },
        },
        servicio: {
          t_iniciar: {
            archetype: "servicio",
            transitionId: "t_iniciar",
            receptores: [
              {
                actorId: "equipo",
                roles: ["tecnico", "supervisor"],
                canales: ["push" as const, "in_app" as const],
              },
            ],
            plantilla: "servicio_iniciado",
          },
        },
      },
    };
  }

  alTransicionar(
    tx: Record<string, unknown>,
    transitionId: string,
  ): NotificacionesResult {
    const archetype = (tx.arquetipo_id as string) ?? "desconocido";
    const notificaciones: Notificacion[] = [];
    const errores: string[] = [];

    console.log(
      `[MotorNotificaciones] Preparando notificaciones para ${archetype}.${transitionId}`,
    );

    const regla = this.config.notificacionesPorArchetype[archetype]?.[
      transitionId
    ];
    if (!regla) {
      console.log(
        `ℹ️ Sin notificaciones configuradas para ${archetype}.${transitionId}`,
      );
      return { notificaciones, errores };
    }

    for (const receptor of regla.receptores) {
      for (const canal of receptor.canales) {
        try {
          const notif = this.construirNotificacion(
            receptor,
            canal,
            regla.plantilla,
            tx,
          );
          notificaciones.push(notif);
          console.log(
            `📬 Notificación preparada: ${receptor.actorId} via ${canal}`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errores.push(`${receptor.actorId}/${canal}: ${msg}`);
          console.log(
            `⚠️ Error preparando notificación ${receptor.actorId}/${canal}: ${msg}`,
          );
        }
      }
    }

    return { notificaciones, errores };
  }

  private construirNotificacion(
    receptor: ReceptorNotificacion,
    canal: CanalNotificacion,
    plantilla: string,
    tx: Record<string, unknown>,
  ): Notificacion {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const archetype = (tx.arquetipo_id as string) ?? "desconocido";

    const asuntoPorPlantilla: Record<string, string> = {
      venta_aceptada: "Venta aceptada",
      venta_facturada: "Factura emitida",
      compra_aceptada: "Compra confirmada",
      servicio_iniciado: "Servicio iniciado",
    };

    const cuerpoPorPlantilla: Record<string, string> = {
      venta_aceptada: `Se aceptó la venta ${tx.id ?? "nueva"}. Total: $${tx.total ?? "0"}.`,
      venta_facturada: `Se generó factura para venta ${tx.id ?? "nueva"}.`,
      compra_aceptada: `Compra ${tx.id ?? "nueva"} confirmada. Preparar recepción.`,
      servicio_iniciado: `Servicio ${tx.id ?? "nuevo"} iniciado. Cronograma disponible.`,
    };

    return {
      id,
      actorId: receptor.actorId,
      canal,
      asunto: asuntoPorPlantilla[plantilla] ?? `Notificación: ${plantilla}`,
      cuerpo: cuerpoPorPlantilla[plantilla] ?? `Transacción actualizada: ${archetype}`,
      ...(canal === "in_app"
        ? { url: `/transacciones/${tx.id}` }
        : {}),
    };
  }

  async enviarNotificaciones(
    notificaciones: Notificacion[],
  ): Promise<void> {
    console.log(
      `[MotorNotificaciones] Enviando ${notificaciones.length} notificación(es)...`,
    );

    for (const notif of notificaciones) {
      try {
        await this.enviarPorCanal(notif);
        console.log(
          `✅ Enviado: ${notif.canal} a ${notif.actorId} (${notif.id})`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(
          `❌ Error enviando ${notif.canal}: ${msg}`,
        );
      }
    }
  }

  private async enviarPorCanal(notif: Notificacion): Promise<void> {
    // Simulación: en producción, conectaría con proveedores reales
    switch (notif.canal) {
      case "email":
        // await emailProvider.send(notif.actorId, notif.asunto, notif.cuerpo);
        console.log(`  [email] Enviando a ${notif.actorId}`);
        break;
      case "sms":
        // await smsProvider.send(notif.actorId, notif.cuerpo);
        console.log(`  [sms] Enviando a ${notif.actorId}`);
        break;
      case "push":
        // await pushProvider.send(notif.actorId, notif.asunto, notif.cuerpo);
        console.log(`  [push] Enviando a ${notif.actorId}`);
        break;
      case "in_app":
        // await inAppProvider.create(notif.actorId, notif.asunto, notif.cuerpo, notif.url);
        console.log(
          `  [in_app] Creando notificación para ${notif.actorId} → ${notif.url}`,
        );
        break;
      case "webhook":
        // await webhookProvider.trigger(notif.actorId, notif);
        console.log(`  [webhook] Disparando webhook para ${notif.actorId}`);
        break;
    }
  }

  registrarRegla(
    archetype: string,
    transitionId: string,
    receptores: ReceptorNotificacion[],
    plantilla: string,
  ) {
    if (!this.config.notificacionesPorArchetype[archetype]) {
      this.config.notificacionesPorArchetype[archetype] = {};
    }
    this.config.notificacionesPorArchetype[archetype][transitionId] = {
      archetype,
      transitionId,
      receptores,
      plantilla,
    };
    console.log(
      `ℹ️ Regla de notificación registrada: ${archetype}.${transitionId}`,
    );
  }

  obtenerConfiguracion() {
    return this.config;
  }
}
