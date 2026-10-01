/**
 * HR Module - Payroll calculation engine with Chilean tax law compliance.
 */

import type {
  Empleado,
  Contrato,
  Nomina,
  RegistroAsistencia,
} from "../elements/index.js";

function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export class MotorNomina {
  /**
   * Calculate complete payroll for an employee in a given period.
   */
  calcularNomina(
    empleado: Empleado,
    contrato: Contrato,
    registros: RegistroAsistencia[],
    periodo: string, // "2026-10"
  ): Nomina {
    // 1. Count worked hours
    const horasTrabajadas = this.calcularHoras(registros);

    // 2. Calculate accrued salary
    const salarioDevengado = this.calcularSalarioDevengado(
      contrato.salarioBase,
      horasTrabajadas,
    );

    // 3. Calculate legal deductions (Chile)
    const descuentos = this.calcularDescuentos(
      salarioDevengado,
      contrato.beneficios,
    );

    // 4. Bonifications (if any)
    const bonificaciones = 0; // TODO: milestone bonus logic

    // 5. Net salary
    const salarioNeto =
      salarioDevengado - descuentos.total + bonificaciones;

    return {
      id: generateId(),
      empleadoId: empleado.id,
      periodo,
      salarioBase: contrato.salarioBase,
      horasTrabajadas,
      descuentos: {
        afp: descuentos.afp,
        isapre: descuentos.isapre,
        impuestoRenta: descuentos.impuestoRenta,
        otros: descuentos.otros,
      },
      bonificaciones,
      salarioNeto: Math.max(0, salarioNeto),
      estado: "generada",
      createdAt: new Date(),
    };
  }

  /**
   * Calculate total worked hours from attendance records.
   * Sums (horaSalida - horaEntrada) for each day with both times.
   */
  private calcularHoras(registros: RegistroAsistencia[]): number {
    let total = 0;
    for (const reg of registros) {
      if (reg.horaSalida && reg.horaEntrada !== "--:--") {
        const [entradaHora, entradaMin] = reg.horaEntrada.split(":").map(Number);
        const [salidaHora, salidaMin] = reg.horaSalida.split(":").map(Number);
        const entrada = entradaHora + entradaMin / 60;
        const salida = salidaHora + salidaMin / 60;
        const horas = Math.max(0, salida - entrada);
        total += horas;
      }
    }
    return Math.round(total * 100) / 100; // Round to 2 decimals
  }

  /**
   * Calculate accrued salary based on hours worked.
   * Formula: (salarioBase / 30 dias / 8 horas) * horasTrabajadas
   */
  private calcularSalarioDevengado(
    salarioBase: number,
    horas: number,
  ): number {
    const valorHora = salarioBase / 30 / 8;
    return Math.round(valorHora * horas);
  }

  /**
   * Calculate Chilean legal deductions (2026 rates).
   */
  private calcularDescuentos(
    salario: number,
    beneficios: Contrato["beneficios"],
  ): {
    afp: number;
    isapre: number;
    impuestoRenta: number;
    otros: number;
    total: number;
  } {
    const afp = Math.round(salario * (beneficios.afp || 0.1)); // 10% default
    const isapre = beneficios.isapre
      ? Math.round(salario * beneficios.isapre)
      : 0;
    const impuestoRenta = this.calcularImpuestoRenta(salario);
    const otros = 0;

    return {
      afp,
      isapre,
      impuestoRenta,
      otros,
      total: afp + isapre + impuestoRenta + otros,
    };
  }

  /**
   * Calculate income tax according to 2026 Chilean tax brackets.
   * Simplified rates for MVP.
   */
  private calcularImpuestoRenta(salario: number): number {
    // 2026 UTA-based brackets (simplified)
    if (salario <= 1526800) return 0; // No tax
    if (salario <= 3053600)
      return Math.round((salario - 1526800) * 0.04); // 4%
    if (salario <= 6107200)
      return Math.round((salario - 3053600) * 0.08 + 61072); // 8%
    return Math.round((salario - 6107200) * 0.13 + 305360); // 13%
  }
}
