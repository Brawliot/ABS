/**
 * HR Module - Vacation management entities.
 */

export interface VacacionesDisponibles {
  readonly id: string;
  readonly empleadoId: string;
  readonly ano: number;
  readonly diasTotales: number;
  readonly diasUsados: number;
  readonly diasDisponibles: number; // calculated
  readonly createdAt: Date;
}

export interface SolicitudVacaciones {
  readonly id: string;
  readonly empleadoId: string;
  readonly fechaInicio: Date;
  readonly fechaTermino: Date;
  readonly diasSolicitados: number;
  readonly estado: "solicitada" | "aprobada" | "rechazada";
  readonly aprobadoPor?: string;
  readonly fechaAprobacion?: Date;
  readonly createdAt: Date;
}
