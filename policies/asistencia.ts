/**
 * HR Module - Attendance tracking and reporting.
 */

import type { RegistroAsistencia } from "../elements/index.js";

function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export class MotorAsistencia {
  /**
   * Record employee check-in.
   */
  registrarEntrada(
    empleadoId: string,
    fecha: Date,
    horaEntrada: string,
  ): RegistroAsistencia {
    return {
      id: generateId(),
      empleadoId,
      fecha,
      horaEntrada,
      estado: "asistente",
      createdAt: new Date(),
    };
  }

  /**
   * Record employee check-out time.
   */
  registrarSalida(
    registro: RegistroAsistencia,
    horaSalida: string,
  ): RegistroAsistencia {
    return {
      ...registro,
      horaSalida,
    };
  }

  /**
   * Record absence with optional reason.
   */
  registrarFalta(
    empleadoId: string,
    fecha: Date,
    razon?: string,
  ): RegistroAsistencia {
    return {
      id: generateId(),
      empleadoId,
      fecha,
      horaEntrada: "--:--",
      estado: "ausente",
      observaciones: razon,
      createdAt: new Date(),
    };
  }

  /**
   * Record employee on leave.
   */
  registrarLicencia(
    empleadoId: string,
    fecha: Date,
    razon?: string,
  ): RegistroAsistencia {
    return {
      id: generateId(),
      empleadoId,
      fecha,
      horaEntrada: "--:--",
      estado: "licencia",
      observaciones: razon,
      createdAt: new Date(),
    };
  }

  /**
   * Generate attendance report for a period.
   */
  generarReporteAsistencia(
    registros: RegistroAsistencia[],
    periodo: string,
  ): {
    readonly asistencias: number;
    readonly faltas: number;
    readonly licencias: number;
    readonly porcentajeAsistencia: number;
  } {
    const asistencias = registros.filter(
      (r) => r.estado === "asistente",
    ).length;
    const faltas = registros.filter((r) => r.estado === "ausente").length;
    const licencias = registros.filter(
      (r) => r.estado === "licencia",
    ).length;
    const total = asistencias + faltas + licencias;

    return {
      asistencias,
      faltas,
      licencias,
      porcentajeAsistencia: total > 0 ? (asistencias / total) * 100 : 0,
    };
  }
}
