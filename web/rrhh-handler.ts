/**
 * HR Module - Business logic handler (Layer 2).
 * Orchestrates payroll, attendance, and employee management.
 */

import type {
  Empleado,
  Contrato,
  Nomina,
  RegistroAsistencia,
} from "../elements/index.js";
import { MotorNomina } from "../policies/nomina.js";
import { MotorAsistencia } from "../policies/asistencia.js";
import { SqliteNominaStore } from "../adapters/sqlite-nomina-store.js";
import { SqliteAsistenciaStore } from "../adapters/sqlite-asistencia-store.js";

export class RRHHHandler {
  private motorNomina: MotorNomina;
  private motorAsistencia: MotorAsistencia;
  private nominaStore: SqliteNominaStore;
  private asistenciaStore: SqliteAsistenciaStore;

  private empleados: Map<string, Empleado> = new Map();
  private contratos: Map<string, Contrato> = new Map();

  constructor(dbPath: string = ":memory:") {
    this.motorNomina = new MotorNomina();
    this.motorAsistencia = new MotorAsistencia();
    this.nominaStore = new SqliteNominaStore(dbPath);
    this.asistenciaStore = new SqliteAsistenciaStore(dbPath);
  }

  /**
   * Register new employee.
   */
  async crearEmpleado(empleado: Empleado): Promise<Empleado> {
    this.empleados.set(empleado.id, empleado);
    return empleado;
  }

  /**
   * Get employee by ID.
   */
  async obtenerEmpleado(empleadoId: string): Promise<Empleado | null> {
    return this.empleados.get(empleadoId) ?? null;
  }

  /**
   * Create contract for employee.
   */
  async crearContrato(contrato: Contrato): Promise<Contrato> {
    this.contratos.set(contrato.id, contrato);
    return contrato;
  }

  /**
   * Get active contract for employee.
   */
  async obtenerContratoActivo(empleadoId: string): Promise<Contrato | null> {
    for (const contrato of this.contratos.values()) {
      if (
        contrato.empleadoId === empleadoId &&
        (!contrato.fechaTermino || contrato.fechaTermino > new Date())
      ) {
        return contrato;
      }
    }
    return null;
  }

  /**
   * Record employee check-in.
   */
  async registrarEntradaEmpleado(
    empleadoId: string,
    horaEntrada: string,
  ): Promise<RegistroAsistencia> {
    const registro = this.motorAsistencia.registrarEntrada(
      empleadoId,
      new Date(),
      horaEntrada,
    );
    await this.asistenciaStore.guardarRegistro(registro);
    return registro;
  }

  /**
   * Record employee check-out.
   */
  async registrarSalidaEmpleado(
    empleadoId: string,
    horaSalida: string,
  ): Promise<RegistroAsistencia | null> {
    const registroHoy = await this.asistenciaStore.obtenerRegistrosPorEmpleado(
      empleadoId,
      new Date(new Date().setHours(0, 0, 0, 0)),
      new Date(new Date().setHours(23, 59, 59, 999)),
    );

    const registro = registroHoy.find(
      (r) => r.estado === "asistente" && !r.horaSalida,
    );
    if (!registro) return null;

    const actualizado = this.motorAsistencia.registrarSalida(
      registro,
      horaSalida as string,
    );
    await this.asistenciaStore.actualizarRegistro(actualizado);
    return actualizado;
  }

  /**
   * Record absence with optional reason.
   */
  async registrarFalta(
    empleadoId: string,
    fecha: Date,
    razon?: string,
  ): Promise<RegistroAsistencia> {
    const registro = this.motorAsistencia.registrarFalta(
      empleadoId,
      fecha,
      razon,
    );
    await this.asistenciaStore.guardarRegistro(registro);
    return registro;
  }

  /**
   * Generate payroll for a period.
   * Processes all active employees.
   */
  async generarNominaDelMes(periodo: string): Promise<Nomina[]> {
    const nominas: Nomina[] = [];

    // Get all active employees
    const empleadosActivos = Array.from(this.empleados.values()).filter(
      (e) => e.estadoContrato === "activo",
    );

    for (const empleado of empleadosActivos) {
      const contrato = await this.obtenerContratoActivo(empleado.id);
      if (!contrato) continue;

      // Parse period (e.g., "2026-10" -> year=2026, month=10)
      const parts = periodo.split("-");
      const yearStr = parts[0] ?? "2026";
      const monthStr = parts[1] ?? "10";
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      // Get start and end dates for the month
      const fechaInicio = new Date(year, month - 1, 1);
      const fechaTermino = new Date(year, month, 0);

      // Get attendance records for the period
      const registros = await this.asistenciaStore.obtenerRegistrosPorEmpleado(
        empleado.id,
        fechaInicio,
        fechaTermino,
      );

      // Calculate payroll
      const nomina = this.motorNomina.calcularNomina(
        empleado,
        contrato,
        registros,
        periodo,
      );

      // Save payroll (append-only)
      await this.nominaStore.guardarNomina(nomina);
      nominas.push(nomina);
    }

    return nominas;
  }

  /**
   * Get all payroll records for an employee.
   */
  async obtenerNominasEmpleado(
    empleadoId: string,
    periodo?: string,
  ): Promise<Nomina[]> {
    return this.nominaStore.obtenerNominasPorEmpleado(empleadoId, periodo);
  }

  /**
   * Get all payroll records for a period.
   */
  async obtenerNominasPeriodo(periodo: string): Promise<Nomina[]> {
    return this.nominaStore.obtenerNominasPorPeriodo(periodo);
  }

  /**
   * Generate monthly summary report.
   */
  async obtenerReporteMensual(
    periodo: string,
  ): Promise<{
    readonly nominasGeneradas: number;
    readonly sumaTotal: number;
    readonly promedioSalario: number;
  }> {
    const nominas = await this.nominaStore.obtenerNominasPorPeriodo(periodo);

    if (nominas.length === 0) {
      return {
        nominasGeneradas: 0,
        sumaTotal: 0,
        promedioSalario: 0,
      };
    }

    const sumaTotal = nominas.reduce((sum, n) => sum + n.salarioNeto, 0);

    return {
      nominasGeneradas: nominas.length,
      sumaTotal,
      promedioSalario: Math.round(sumaTotal / nominas.length),
    };
  }

  /**
   * Get attendance report for employee.
   */
  async obtenerReporteAsistencia(
    empleadoId: string,
    periodo: string,
  ): Promise<{
    readonly asistencias: number;
    readonly faltas: number;
    readonly licencias: number;
    readonly porcentajeAsistencia: number;
  }> {
    const parts = periodo.split("-");
    const yearStr = parts[0] ?? "2026";
    const monthStr = parts[1] ?? "10";
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const fechaInicio = new Date(year, month - 1, 1);
    const fechaTermino = new Date(year, month, 0);

    const registros = await this.asistenciaStore.obtenerRegistrosPorEmpleado(
      empleadoId,
      fechaInicio,
      fechaTermino,
    );

    return this.motorAsistencia.generarReporteAsistencia(registros, periodo);
  }

  close(): void {
    this.nominaStore.close();
    this.asistenciaStore.close();
  }
}
