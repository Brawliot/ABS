/**
 * Motor de beneficios: configuración, obtención, aplicación a nómina.
 */

import type { BeneficioEmpleado, TipoBeneficio } from "../elements/beneficios.js";

export interface Nomina {
  readonly id: string;
  readonly empleadoId: string;
  readonly periodo: Date;
  readonly salarioBruto: number;
  readonly descuentos: number;
  readonly salarioNeto: number;
  readonly detalleDescuentos: { [key: string]: number };
}

export class MotorBeneficios {
  private beneficios = new Map<string, BeneficioEmpleado[]>();

  configurarBeneficio(empleadoId: string, tipo: TipoBeneficio, valor: number): void {
    const beneficioExistente = this.obtenerBeneficios(empleadoId).find(
      (b) => b.tipo === tipo && b.activo
    );

    if (beneficioExistente) {
      throw new Error(`Beneficio ${tipo} ya está configurado para ${empleadoId}`);
    }

    const beneficio: BeneficioEmpleado = {
      empleadoId,
      tipo,
      valor,
      activo: true,
      desde: new Date(),
    };

    const beneficios = this.beneficios.get(empleadoId) || [];
    beneficios.push(beneficio);
    this.beneficios.set(empleadoId, beneficios);
  }

  obtenerBeneficios(empleadoId: string): BeneficioEmpleado[] {
    return this.beneficios.get(empleadoId) || [];
  }

  aplicarAlNomina(nomina: Nomina, beneficios: BeneficioEmpleado[]): Nomina {
    let descuentoTotal = 0;
    const detalleDescuentos: { [key: string]: number } = {};

    for (const beneficio of beneficios.filter((b) => b.activo)) {
      // Beneficios que descuentan
      if (
        beneficio.tipo === "afp" ||
        beneficio.tipo === "isapre" ||
        beneficio.tipo === "fonasa"
      ) {
        const descuento = (nomina.salarioBruto * beneficio.valor) / 100;
        descuentoTotal += descuento;
        detalleDescuentos[beneficio.tipo] = descuento;
      }

      // Seguros descuentan también
      if (beneficio.tipo === "seguros") {
        const descuento = beneficio.valor; // Monto fijo
        descuentoTotal += descuento;
        detalleDescuentos[beneficio.tipo] = descuento;
      }

      // Bonificación agrega al neto
      if (beneficio.tipo === "bonificacion") {
        detalleDescuentos[beneficio.tipo] = beneficio.valor;
      }
    }

    const salarioNeto = nomina.salarioBruto - descuentoTotal;

    return {
      id: nomina.id,
      empleadoId: nomina.empleadoId,
      periodo: nomina.periodo,
      salarioBruto: nomina.salarioBruto,
      descuentos: descuentoTotal,
      salarioNeto: Math.max(0, salarioNeto),
      detalleDescuentos,
    };
  }

  desactivarBeneficio(empleadoId: string, tipo: TipoBeneficio): void {
    const beneficios = this.obtenerBeneficios(empleadoId);
    const beneficio = beneficios.find((b) => b.tipo === tipo && b.activo);

    if (!beneficio) {
      throw new Error(`Beneficio ${tipo} no está activo para ${empleadoId}`);
    }

    const actualizado: BeneficioEmpleado = {
      ...beneficio,
      activo: false,
      hasta: new Date(),
    };

    const index = beneficios.indexOf(beneficio);
    beneficios[index] = actualizado;
    this.beneficios.set(empleadoId, beneficios);
  }
}
