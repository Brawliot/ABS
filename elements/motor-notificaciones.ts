/**
 * Motor de Notificaciones (Capa 0.3)
 *
 * Coordina automáticamente quién se entera de cada evento importante.
 * Define reglas de "qué notificar a quién y cuándo".
 *
 * Ejemplo: Cuando se acepta una venta:
 * - Cliente recibe: "Tu pedido ha sido aceptado"
 * - Finanzas recibe: "Factura generada: #FAC-2026-001"
 * - Taller recibe: "Orden de trabajo creada"
 */

import type { Transacción } from "../core/transacción.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

export type TipoNotificación = "cliente" | "finanzas" | "taller" | "logística" | "interno" | "proveedor";
export type CanalNotificación = "email" | "sms" | "push" | "in_app" | "webhook";

export interface Notificación {
  readonly id: string;
  readonly tipo: TipoNotificación;
  readonly canal: CanalNotificación;
  readonly destinatario: string; // Email, teléfono, usuario ID, etc.
  readonly asunto: string;
  readonly contenido: string;
  readonly referencia: string; // La transacción que la dispara
  readonly enviada: boolean;
  readonly fechaEnvío?: Date;
  readonly intentos: number;
}

export interface ReglaDeNotificación {
  /** ID único de la regla */
  readonly id: string;
  /** Quién recibe la notificación */
  readonly tipo: TipoNotificación;
  /** Por qué canal */
  readonly canal: CanalNotificación;
  /** Cómo obtener el destinatario */
  readonly obtenerDestinatario: (tx: Transacción) => string | undefined;
  /** El asunto del mensaje */
  readonly asunto: (tx: Transacción) => string;
  /** El contenido */
  readonly contenido: (tx: Transacción) => string;
  /** Si está habilitada */
  readonly habilitada: boolean;
}

export interface ConfiguracionNotificaciones {
  readonly reglasPorArchetype: {
    readonly [archetypeId: string]: {
      readonly [transitionId: string]: ReglaDeNotificación[];
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR NOTIFICACIONES
// ═══════════════════════════════════════════════════════════════════════════════

export class MotorNotificaciones {
  private config: ConfiguracionNotificaciones;
  private notificacionesRegistradas: Notificación[] = [];

  constructor() {
    this.config = this.construirConfiguracion();
  }

  /**
   * Construye las reglas de notificación para cada transición.
   */
  private construirConfiguracion(): ConfiguracionNotificaciones {
    return {
      reglasPorArchetype: {
        // ═══════════════════════════════════════════════════════════════════════
        // VENTA
        // ═══════════════════════════════════════════════════════════════════════
        venta: {
          // Propuesta → Aceptada: Notificar a cliente y equipo
          "t_aceptar": [
            {
              id: "venta-acepta-notifica-cliente",
              tipo: "cliente",
              canal: "email",
              obtenerDestinatario: (tx) => (tx.datos as any).cliente_email,
              asunto: (tx) => `Pedido #${tx.id.slice(0, 8)} - Confirmado`,
              contenido: (tx) => {
                const total = (tx.datos as any).total || 0;
                return `Tu pedido por €${(total / 100).toFixed(2)} ha sido aceptado y está siendo procesado.`;
              },
              habilitada: true,
            },
            {
              id: "venta-acepta-notifica-finanzas",
              tipo: "finanzas",
              canal: "in_app",
              obtenerDestinatario: () => "role:finanzas",
              asunto: () => "Nueva factura generada",
              contenido: (tx) => {
                const total = (tx.datos as any).total || 0;
                return `Factura generada por €${(total / 100).toFixed(2)} para venta ${tx.id}`;
              },
              habilitada: true,
            },
            {
              id: "venta-acepta-notifica-taller",
              tipo: "taller",
              canal: "in_app",
              obtenerDestinatario: () => "role:taller",
              asunto: () => "Orden de trabajo creada",
              contenido: (tx) => `Nueva orden de trabajo disponible para venta ${tx.id}`,
              habilitada: true,
            },
          ],

          // Aceptada → En Entrega: Notificar logística y cliente
          "t_iniciar_entrega": [
            {
              id: "venta-entrega-notifica-cliente",
              tipo: "cliente",
              canal: "email",
              obtenerDestinatario: (tx) => (tx.datos as any).cliente_email,
              asunto: () => "Tu pedido está en camino",
              contenido: (tx) => `Tu pedido #${tx.id.slice(0, 8)} ha salido en entrega.`,
              habilitada: true,
            },
            {
              id: "venta-entrega-notifica-logistica",
              tipo: "logística",
              canal: "in_app",
              obtenerDestinatario: () => "role:logistica",
              asunto: () => "Pedido listo para entregar",
              contenido: (tx) => `Pedido ${tx.id} preparado y listo para entrega.`,
              habilitada: true,
            },
          ],

          // En Entrega → Cerrada: Confirmación de entrega
          "t_cerrar": [
            {
              id: "venta-cierra-notifica-cliente",
              tipo: "cliente",
              canal: "email",
              obtenerDestinatario: (tx) => (tx.datos as any).cliente_email,
              asunto: () => "Pedido entregado - Gracias por tu compra",
              contenido: (tx) => `Tu pedido #${tx.id.slice(0, 8)} ha sido entregado exitosamente.`,
              habilitada: true,
            },
          ],
        },

        // ═══════════════════════════════════════════════════════════════════════
        // COMPRA
        // ═══════════════════════════════════════════════════════════════════════
        compra: {
          // Requisición → OC Emitida
          "t_emitir_oc": [
            {
              id: "compra-oc-notifica-proveedor",
              tipo: "proveedor",
              canal: "email",
              obtenerDestinatario: (tx) => (tx.datos as any).proveedor_email,
              asunto: (tx) => `Orden de compra #${tx.id.slice(0, 8)}`,
              contenido: (tx) => `Se ha emitido una nueva orden de compra. Por favor, confirmar recepción.`,
              habilitada: true,
            },
          ],

          // Recibida: Notificar a finanzas
          "t_recibir": [
            {
              id: "compra-recibe-notifica-finanzas",
              tipo: "finanzas",
              canal: "in_app",
              obtenerDestinatario: () => "role:finanzas",
              asunto: () => "Compra recibida - Pendiente de factura",
              contenido: (tx) => `Compra ${tx.id} recibida. Aguardando factura del proveedor.`,
              habilitada: true,
            },
          ],
        },

        // ═══════════════════════════════════════════════════════════════════════
        // SERVICIO
        // ═══════════════════════════════════════════════════════════════════════
        servicio: {
          // Orden → Ejecutar
          "t_ejecutar": [
            {
              id: "servicio-ejecuta-notifica-cliente",
              tipo: "cliente",
              canal: "email",
              obtenerDestinatario: (tx) => (tx.datos as any).cliente_email,
              asunto: () => "Tu servicio ha comenzado",
              contenido: (tx) => `Tu solicitud de servicio ${tx.id} ha sido asignada y comenzará pronto.`,
              habilitada: true,
            },
            {
              id: "servicio-ejecuta-notifica-interno",
              tipo: "interno",
              canal: "in_app",
              obtenerDestinatario: () => "role:taller",
              asunto: () => "Nuevo servicio asignado",
              contenido: (tx) => `Nuevo servicio ${tx.id} asignado para ejecución.`,
              habilitada: true,
            },
          ],

          // Completado: Factura lista
          "t_completar": [
            {
              id: "servicio-completa-notifica-cliente",
              tipo: "cliente",
              canal: "email",
              obtenerDestinatario: (tx) => (tx.datos as any).cliente_email,
              asunto: () => "Tu servicio está completo",
              contenido: (tx) => `Tu servicio ${tx.id} ha sido completado. Factura disponible.`,
              habilitada: true,
            },
          ],
        },
      },
    };
  }

  /**
   * Ejecuta las notificaciones aplicables para una transición.
   * Se llama después de que la transición ocurra.
   */
  async alTransicionar(
    tx: Transacción,
    transitionId: string,
  ): Promise<{ ok: boolean; notificaciones: Notificación[] }> {
    console.log(`[MotorNotificaciones] Procesando notificaciones para: ${tx.archetypeId}.${transitionId}`);

    const notificaciones: Notificación[] = [];

    // Obtener reglas aplicables
    const reglasArchetype = this.config.reglasPorArchetype[tx.archetypeId];
    if (!reglasArchetype) {
      console.log(`[MotorNotificaciones] ℹ️ No hay reglas para ${tx.archetypeId}`);
      return { ok: true, notificaciones };
    }

    const reglas = reglasArchetype[transitionId] || [];
    if (reglas.length === 0) {
      console.log(`[MotorNotificaciones] ℹ️ Sin notificaciones para ${transitionId}`);
      return { ok: true, notificaciones };
    }

    // Ejecutar cada regla
    for (const regla of reglas) {
      if (!regla.habilitada) {
        console.log(`[MotorNotificaciones] ⊘ Regla deshabilitada: ${regla.id}`);
        continue;
      }

      try {
        const destinatario = regla.obtenerDestinatario(tx);
        if (!destinatario) {
          console.warn(`[MotorNotificaciones] ⚠️ No se pudo obtener destinatario para ${regla.id}`);
          continue;
        }

        const notif: Notificación = {
          id: `notif-${Date.now()}-${Math.random()}`,
          tipo: regla.tipo,
          canal: regla.canal,
          destinatario,
          asunto: regla.asunto(tx),
          contenido: regla.contenido(tx),
          referencia: tx.id,
          enviada: false,
          intentos: 0,
        };

        notificaciones.push(notif);
        this.notificacionesRegistradas.push(notif);

        console.log(`[MotorNotificaciones] 📧 Notificación encolada: ${regla.id} → ${destinatario}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[MotorNotificaciones] ❌ Error en regla ${regla.id}: ${msg}`);
      }
    }

    console.log(`[MotorNotificaciones] ✅ ${notificaciones.length} notificación(es) encolada(s)`);
    return { ok: true, notificaciones };
  }

  /**
   * Registra una nueva regla de notificación en tiempo de ejecución.
   */
  registrarRegla(
    archetypeId: string,
    transitionId: string,
    regla: ReglaDeNotificación,
  ): void {
    if (!this.config.reglasPorArchetype[archetypeId]) {
      this.config.reglasPorArchetype[archetypeId] = {};
    }
    if (!this.config.reglasPorArchetype[archetypeId][transitionId]) {
      this.config.reglasPorArchetype[archetypeId][transitionId] = [];
    }
    this.config.reglasPorArchetype[archetypeId][transitionId].push(regla);
    console.log(`[MotorNotificaciones] ✅ Regla registrada: ${regla.id}`);
  }

  /**
   * Obtiene el historial de notificaciones.
   */
  obtenerNotificaciones(): Notificación[] {
    return this.notificacionesRegistradas;
  }

  /**
   * Simula el envío de notificaciones (en producción, integraría con email, SMS, etc.)
   */
  async enviarNotificaciones(notificaciones: Notificación[]): Promise<void> {
    for (const notif of notificaciones) {
      try {
        console.log(`[MotorNotificaciones] 📤 Enviando ${notif.canal} a ${notif.destinatario}: ${notif.asunto}`);
        // Aquí iría la lógica real de envío (email, SMS, push, etc.)
        // Por ahora es un placeholder
        notif.enviada = true;
        notif.fechaEnvío = new Date();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[MotorNotificaciones] ❌ Error enviando: ${msg}`);
        notif.intentos++;
      }
    }
  }

  /**
   * Obtiene la configuración actual.
   */
  obtenerConfiguracion(): ConfiguracionNotificaciones {
    return this.config;
  }
}
