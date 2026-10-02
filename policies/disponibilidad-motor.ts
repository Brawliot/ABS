/**
 * Motor de Disponibilidad: Gestión de recursos, reservas,
 * detección de conflictos y sugerencias de horarios libres.
 */

export type TipoRecurso = "sala" | "persona" | "equipo" | "vehículo" | "otro";
export type EstadoReserva = "pendiente" | "confirmada" | "cancelada" | "completada";

export interface Recurso {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoRecurso;
  readonly descripcion: string;
  readonly capacidad?: number;
  readonly ubicación: string;
  readonly disponible: boolean;
}

export interface Reserva {
  readonly id: string;
  readonly recursoId: string;
  readonly clienteId: string;
  readonly titulo: string;
  readonly fechaInicio: Date;
  readonly fechaFin: Date;
  readonly estado: EstadoReserva;
  readonly descripcion?: string;
  readonly contacto: string;
  readonly createdAt: Date;
}

export interface Cancelación {
  readonly id: string;
  readonly reservaId: string;
  readonly razon: string;
  readonly fechaCancelación: Date;
  readonly reembolso: number; // en centavos
}

export class MotorDisponibilidad {
  private recursos = new Map<string, Recurso>();
  private reservas = new Map<string, Reserva>();
  private cancelaciones = new Map<string, Cancelación>();

  crearRecurso(
    nombre: string,
    tipo: TipoRecurso,
    descripcion: string,
    ubicación: string,
    capacidad?: number
  ): Recurso {
    const id = `recurso-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const recurso = {
      id,
      nombre,
      tipo,
      descripcion,
      capacidad,
      ubicación,
      disponible: true,
    } as Recurso;

    this.recursos.set(id, recurso);
    return recurso;
  }

  obtenerDisponibilidad(recursoId: string): {
    disponible: boolean;
    proximaReserva?: Date;
    porcentajeOcupado: number;
  } {
    const recurso = this.recursos.get(recursoId);
    if (!recurso) {
      return { disponible: false, porcentajeOcupado: 0 };
    }

    const reservasActivas = Array.from(this.reservas.values()).filter(
      r => r.recursoId === recursoId && r.estado === "confirmada"
    );

    const ahora = new Date();
    const proximaReserva = reservasActivas
      .filter(r => r.fechaInicio > ahora)
      .sort((a, b) => a.fechaInicio.getTime() - b.fechaInicio.getTime())[0];

    const totalHoy = 24 * 60 * 60 * 1000;
    const ocupadoHoy = reservasActivas
      .filter(r => {
        const mismodia =
          r.fechaInicio.toDateString() === ahora.toDateString();
        return mismodia;
      })
      .reduce((sum, r) => sum + (r.fechaFin.getTime() - r.fechaInicio.getTime()), 0);

    const porcentajeOcupado = Math.round((ocupadoHoy / totalHoy) * 100);

    return {
      disponible: recurso.disponible && !proximaReserva,
      proximaReserva: proximaReserva?.fechaInicio,
      porcentajeOcupado,
    } as any;
  }

  verificarConflicto(
    recursoId: string,
    fechaInicio: Date,
    fechaFin: Date
  ): boolean {
    const reservasExistentes = Array.from(this.reservas.values()).filter(
      r =>
        r.recursoId === recursoId &&
        r.estado === "confirmada"
    );

    for (const reserva of reservasExistentes) {
      // Hay conflicto si: nueva comienza antes que termina la existente Y nueva termina después que comienza la existente
      if (fechaInicio < reserva.fechaFin && fechaFin > reserva.fechaInicio) {
        return true;
      }
    }

    return false;
  }

  crearReserva(
    recursoId: string,
    clienteId: string,
    titulo: string,
    fechaInicio: Date,
    fechaFin: Date,
    contacto: string,
    descripcion?: string
  ): { exito: boolean; reserva?: Reserva; error?: string } {
    if (this.verificarConflicto(recursoId, fechaInicio, fechaFin)) {
      return {
        exito: false,
        error: "Ya existe una reserva en ese horario",
      };
    }

    const id = `reserva-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const reserva = {
      id,
      recursoId,
      clienteId,
      titulo,
      fechaInicio,
      fechaFin,
      estado: "confirmada",
      descripcion,
      contacto,
      createdAt: new Date(),
    } as Reserva;

    this.reservas.set(id, reserva);
    return { exito: true, reserva };
  }

  cancelarReserva(reservaId: string, razon: string, reembolso: number = 0): Cancelación | null {
    const reserva = this.reservas.get(reservaId);
    if (!reserva) return null;

    // Actualizar estado de reserva
    this.reservas.set(reservaId, {
      ...reserva,
      estado: "cancelada",
    });

    // Registrar cancelación (append-only)
    const cancelacion: Cancelación = {
      id: `cancelacion-${Date.now()}`,
      reservaId,
      razon,
      fechaCancelación: new Date(),
      reembolso,
    };

    this.cancelaciones.set(cancelacion.id, cancelacion);
    return cancelacion;
  }

  reprogramarReserva(
    reservaId: string,
    nuevaFechaInicio: Date,
    nuevaFechaFin: Date
  ): { exito: boolean; reserva?: Reserva; error?: string } {
    const reserva = this.reservas.get(reservaId);
    if (!reserva) {
      return { exito: false, error: "Reserva no encontrada" };
    }

    if (this.verificarConflicto(reserva.recursoId, nuevaFechaInicio, nuevaFechaFin)) {
      return {
        exito: false,
        error: "Hay conflicto con otra reserva en el nuevo horario",
      };
    }

    const reprogramada: Reserva = {
      ...reserva,
      fechaInicio: nuevaFechaInicio,
      fechaFin: nuevaFechaFin,
    };

    this.reservas.set(reservaId, reprogramada);
    return { exito: true, reserva: reprogramada };
  }

  obtenerOcupación(recursoId: string): number {
    const reservasDelRecurso = Array.from(this.reservas.values()).filter(
      r => r.recursoId === recursoId && r.estado === "confirmada"
    );

    const ahora = new Date();
    const semanasGresiana = 7 * 24 * 60 * 60 * 1000;
    const tiempoOcupado = reservasDelRecurso
      .filter(r => r.fechaFin > ahora && r.fechaInicio < new Date(ahora.getTime() + semanasGresiana))
      .reduce((sum, r) => sum + (r.fechaFin.getTime() - r.fechaInicio.getTime()), 0);

    return Math.round((tiempoOcupado / semanasGresiana) * 100);
  }

  sugerirSlotDisponible(
    recursoId: string,
    duracionMinutos: number = 60
  ): { inicio: Date; fin: Date } | null {
    const ahora = new Date();
    const recurso = this.recursos.get(recursoId);

    if (!recurso || !recurso.disponible) return null;

    // Buscar slot disponible en las próximas 2 semanas
    for (let i = 0; i < 14; i++) {
      const fecha = new Date(ahora);
      fecha.setDate(fecha.getDate() + i);
      fecha.setHours(9, 0, 0, 0); // Empezar desde las 9 AM

      for (let hora = 9; hora < 18; hora++) {
        const inicio = new Date(fecha);
        inicio.setHours(hora, 0, 0, 0);

        const fin = new Date(inicio);
        fin.setMinutes(fin.getMinutes() + duracionMinutos);

        if (!this.verificarConflicto(recursoId, inicio, fin)) {
          return { inicio, fin };
        }
      }
    }

    return null;
  }

  obtenerReservasRecurso(recursoId: string): Reserva[] {
    return Array.from(this.reservas.values()).filter(
      r => r.recursoId === recursoId
    );
  }

  obtenerTodasLasReservas(): Reserva[] {
    return Array.from(this.reservas.values());
  }

  obtenerCancelaciones(recursoId?: string): Cancelación[] {
    if (recursoId) {
      const reservasDelRecurso = new Set(
        Array.from(this.reservas.values())
          .filter(r => r.recursoId === recursoId)
          .map(r => r.id)
      );
      return Array.from(this.cancelaciones.values()).filter(c =>
        reservasDelRecurso.has(c.reservaId)
      );
    }
    return Array.from(this.cancelaciones.values());
  }
}
