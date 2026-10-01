/**
 * Motor de vacaciones: acumulación, solicitudes, aprobación, disponibilidad.
 */

export interface VacacionesDisponibles {
  readonly empleadoId: string;
  readonly año: number;
  readonly diasTotales: number;
  readonly diasUsados: number;
  readonly diasDisponibles: number;
}

export interface SolicitudVacaciones {
  readonly id: string;
  readonly empleadoId: string;
  readonly fechaInicio: Date;
  readonly fechaTermino: Date;
  readonly diasSolicitados: number;
  readonly estado: "pendiente" | "aprobada" | "rechazada";
  readonly aprobadoPor?: string;
  readonly createdAt: Date;
}

export class MotorVacaciones {
  private disponibles = new Map<string, VacacionesDisponibles>();
  private solicitudes = new Map<string, SolicitudVacaciones>();
  private solicitudesContador = 0;

  acumularDias(empleadoId: string, año: number, diasAnnuales: number = 15): void {
    const key = `${empleadoId}-${año}`;
    let record = this.disponibles.get(key);
    if (!record) {
      record = {
        empleadoId,
        año,
        diasTotales: diasAnnuales,
        diasUsados: 0,
        diasDisponibles: diasAnnuales,
      };
      this.disponibles.set(key, record);
    }
  }

  solicitarVacaciones(
    empleadoId: string,
    fechaInicio: Date,
    diasSolicitados: number
  ): SolicitudVacaciones {
    const año = fechaInicio.getFullYear();
    const key = `${empleadoId}-${año}`;
    const record = this.disponibles.get(key);

    if (!record) {
      throw new Error(`No hay acumulación de vacaciones para ${empleadoId} en ${año}`);
    }

    const disponibles = record.diasDisponibles;
    if (diasSolicitados > disponibles) {
      throw new Error(
        `Solicitud de ${diasSolicitados} días excede ${disponibles} disponibles`
      );
    }

    // Validar que no hay solicitudes solapadas
    const solapadas = Array.from(this.solicitudes.values()).filter(
      (s) =>
        s.empleadoId === empleadoId &&
        s.estado === "aprobada" &&
        this.solapan(s.fechaInicio, s.fechaTermino, fechaInicio, fechaInicio)
    );

    if (solapadas.length > 0) {
      throw new Error("La solicitud se solapa con vacaciones ya aprobadas");
    }

    const fechaTermino = new Date(fechaInicio);
    fechaTermino.setDate(fechaTermino.getDate() + diasSolicitados);

    const solicitud: SolicitudVacaciones = {
      id: `vac-${++this.solicitudesContador}`,
      empleadoId,
      fechaInicio,
      fechaTermino,
      diasSolicitados,
      estado: "pendiente",
      createdAt: new Date(),
    };

    this.solicitudes.set(solicitud.id, solicitud);
    return solicitud;
  }

  aprobarSolicitud(solicitudId: string, aprobadoPor: string): void {
    const solicitud = this.solicitudes.get(solicitudId);
    if (!solicitud) {
      throw new Error(`Solicitud ${solicitudId} no existe`);
    }

    if (solicitud.estado !== "pendiente") {
      throw new Error(`Solicitud ${solicitudId} ya está ${solicitud.estado}`);
    }

    const año = solicitud.fechaInicio.getFullYear();
    const key = `${solicitud.empleadoId}-${año}`;
    const record = this.disponibles.get(key);

    if (!record) {
      throw new Error(
        `No hay acumulación de vacaciones para ${solicitud.empleadoId} en ${año}`
      );
    }

    // Actualizar record
    const updated: VacacionesDisponibles = {
      ...record,
      diasUsados: record.diasUsados + solicitud.diasSolicitados,
      diasDisponibles: record.diasDisponibles - solicitud.diasSolicitados,
    };
    this.disponibles.set(key, updated);

    // Actualizar solicitud
    const solicitudAprobada: SolicitudVacaciones = {
      ...solicitud,
      estado: "aprobada",
      aprobadoPor,
    };
    this.solicitudes.set(solicitudId, solicitudAprobada);
  }

  obtenerDisponibles(empleadoId: string, año: number): VacacionesDisponibles {
    const key = `${empleadoId}-${año}`;
    const record = this.disponibles.get(key);
    if (!record) {
      throw new Error(
        `No hay acumulación de vacaciones para ${empleadoId} en ${año}`
      );
    }
    return record;
  }

  obtenerSolicitud(solicitudId: string): SolicitudVacaciones {
    const solicitud = this.solicitudes.get(solicitudId);
    if (!solicitud) {
      throw new Error(`Solicitud ${solicitudId} no existe`);
    }
    return solicitud;
  }

  private solapan(inicio1: Date, fin1: Date, inicio2: Date, fin2: Date): boolean {
    return inicio1 <= fin2 && inicio2 <= fin1;
  }
}
