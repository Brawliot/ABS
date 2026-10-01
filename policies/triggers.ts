/**
 * Motor de triggers: evaluación de condiciones y ejecución de acciones automáticas.
 */

export type TipoTrigger = "evento" | "tiempo" | "valor";
export type AccionTrigger =
  | "facturar"
  | "notificar"
  | "enviar"
  | "cobrar"
  | "exportar_reporte";

export interface Trigger {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoTrigger;
  readonly condicion: string; // ej: "estado = 'completado'"
  readonly accion: AccionTrigger;
  readonly activo: boolean;
  readonly createdAt: Date;
}

export interface TriggerEvento {
  readonly id: string;
  readonly triggerId: string;
  readonly expedienteId: string;
  readonly resultado: "exitoso" | "fallido";
  readonly mensaje: string | undefined;
  readonly timestamp: Date;
}

export class MotorTriggers {
  private triggers = new Map<string, Trigger>();
  private eventos = new Map<string, TriggerEvento[]>();
  private triggerContador = 0;
  private eventoContador = 0;

  crearTrigger(
    nombre: string,
    tipo: TipoTrigger,
    condicion: string,
    accion: AccionTrigger
  ): Trigger {
    const trigger: Trigger = {
      id: `trig-${++this.triggerContador}`,
      nombre,
      tipo,
      condicion,
      accion,
      activo: true,
      createdAt: new Date(),
    };

    this.triggers.set(trigger.id, trigger);
    return trigger;
  }

  evaluarTriggers(evento: any): AccionTrigger[] {
    const accionesAEjecutar: AccionTrigger[] = [];

    for (const trigger of Array.from(this.triggers.values())) {
      if (!trigger.activo) continue;

      if (this.evaluarCondicion(trigger.condicion, evento)) {
        accionesAEjecutar.push(trigger.accion);
      }
    }

    return accionesAEjecutar;
  }

  ejecutarAccion(
    accion: AccionTrigger,
    contexto: any
  ): { ok: boolean; resultado?: any } {
    try {
      switch (accion) {
        case "facturar":
          return { ok: true, resultado: { tipoAccion: "factura", id: contexto.id } };
        case "notificar":
          return { ok: true, resultado: { tipoAccion: "notificacion", sent: true } };
        case "enviar":
          return { ok: true, resultado: { tipoAccion: "envio", enviado: true } };
        case "cobrar":
          return { ok: true, resultado: { tipoAccion: "cobro", procesado: true } };
        case "exportar_reporte":
          return { ok: true, resultado: { tipoAccion: "reporte", generado: true } };
        default:
          return { ok: false, resultado: { error: "Acción desconocida" } };
      }
    } catch (error) {
      return { ok: false, resultado: { error: String(error) } };
    }
  }

  registrarEvento(
    triggerId: string,
    expedienteId: string,
    resultado: "exitoso" | "fallido",
    mensaje?: string
  ): TriggerEvento {
    const evento: TriggerEvento = {
      id: `evt-${++this.eventoContador}`,
      triggerId,
      expedienteId,
      resultado,
      mensaje,
      timestamp: new Date(),
    };

    const eventos = this.eventos.get(triggerId) || [];
    eventos.push(evento);
    this.eventos.set(triggerId, eventos);

    return evento;
  }

  listarTriggers(): Trigger[] {
    return Array.from(this.triggers.values());
  }

  listarEventosPorTrigger(triggerId: string): TriggerEvento[] {
    return this.eventos.get(triggerId) || [];
  }

  obtenerTrigger(triggerId: string): Trigger | undefined {
    return this.triggers.get(triggerId);
  }

  desactivarTrigger(triggerId: string): void {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      throw new Error(`Trigger ${triggerId} no existe`);
    }

    const desactivado: Trigger = {
      ...trigger,
      activo: false,
    };

    this.triggers.set(triggerId, desactivado);
  }

  private evaluarCondicion(condicion: string, evento: any): boolean {
    // Implementación simple: evalúa condiciones tipo "estado = 'completado'"
    try {
      // Extraer campo y valor esperado
      const match = condicion.match(/(\w+)\s*=\s*'([^']+)'/);
      if (!match || !match[1] || !match[2]) return false;

      const campo = match[1];
      const valorEsperado = match[2];
      const valorActual = this.obtenerValor(evento, campo);

      return valorActual === valorEsperado;
    } catch {
      return false;
    }
  }

  private obtenerValor(obj: any, ruta: string): any {
    const partes = ruta.split(".");
    let valor = obj;

    for (const parte of partes) {
      if (valor == null) return undefined;
      valor = valor[parte];
    }

    return valor;
  }
}
