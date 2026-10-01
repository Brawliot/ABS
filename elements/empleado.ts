/**
 * HR Module - Employee, Contracts, Attendance, and Payroll entities.
 */

export type ContratoTipo = "indefinido" | "plazo_fijo" | "temporada" | "practicante";
export type EstadoContrato = "activo" | "licencia" | "finiquitado";
export type EstadoAsistencia = "asistente" | "ausente" | "licencia";
export type EstadoNomina = "generada" | "pagada" | "anulada";

export interface Empleado {
  readonly id: string;
  readonly nombre: string;
  readonly rut?: string;
  readonly email: string;
  readonly telefono?: string;
  readonly puesto: string; // "operario", "supervisor", "gerente"
  readonly departamento: string; // "taller", "ventas", "admin"
  readonly estadoContrato: EstadoContrato;
  readonly fechaContratacion: Date;
  readonly salarioBase: number; // in cents
  readonly createdAt: Date;
}

export interface Contrato {
  readonly id: string;
  readonly empleadoId: string;
  readonly tipo: ContratoTipo;
  readonly fechaInicio: Date;
  readonly fechaTermino?: Date;
  readonly salarioBase: number;
  readonly beneficios: {
    readonly afp?: number; // % discount (e.g., 0.1 = 10%)
    readonly isapre?: number; // % discount
    readonly fonasa?: boolean;
    readonly seguroDeSeguro?: number; // % discount
  };
  readonly createdAt: Date;
}

export interface RegistroAsistencia {
  readonly id: string;
  readonly empleadoId: string;
  readonly fecha: Date;
  readonly horaEntrada: string; // "09:00"
  readonly horaSalida?: string; // "17:30"
  readonly observaciones?: string;
  readonly estado: EstadoAsistencia; // calculated
  readonly createdAt: Date;
}

export interface Nomina {
  readonly id: string;
  readonly empleadoId: string;
  readonly periodo: string; // "2026-10"
  readonly salarioBase: number;
  readonly horasTrabajadas: number;
  readonly descuentos: {
    readonly afp: number;
    readonly isapre: number;
    readonly impuestoRenta: number;
    readonly otros: number;
  };
  readonly bonificaciones: number;
  readonly salarioNeto: number;
  readonly estado: EstadoNomina;
  readonly fechaPago?: Date;
  readonly createdAt: Date;
}
