import { randomUUID } from "crypto";
import type { MantenimientoActivo } from '../elements/activo-fijo.js';

export interface CostoMantenimiento {
  readonly porActivo: Map<string, number>;
  readonly total: number;
  readonly promedioPorMes: number;
}

export class MotorMantenimiento {
  private mantenimientos: Map<string, MantenimientoActivo[]> = new Map();

  registrarMantenimiento(
    activoId: string,
    tipo: "preventivo" | "correctivo",
    costo: number,
    descripción: string
  ): MantenimientoActivo {
    const mantenimiento: MantenimientoActivo = {
      id: randomUUID(),
      activoId,
      fecha: new Date(),
      tipo,
      costo,
      descripción,
    };

    const existentes = this.mantenimientos.get(activoId) || [];
    this.mantenimientos.set(activoId, [...existentes, mantenimiento]);

    return mantenimiento;
  }

  programarMantención(activoId: string, fechaPróxima: Date): void {
    const existentes = this.mantenimientos.get(activoId) || [];
    if (existentes.length > 0) {
      const último = existentes[existentes.length - 1];
      if (último) {
        (último as any).próximaMantenimiento = fechaPróxima;
      }
    }
  }

  obtenerHistorial(activoId: string): MantenimientoActivo[] {
    return this.mantenimientos.get(activoId) || [];
  }

  calcularCostosMantenimiento(
    desde: Date,
    hasta: Date
  ): CostoMantenimiento {
    const costos = new Map<string, number>();
    let totalGeneral = 0;

    this.mantenimientos.forEach((mantenimientos, activoId) => {
      const costosActivo = mantenimientos
        .filter((m) => m.fecha >= desde && m.fecha <= hasta)
        .reduce((sum, m) => sum + m.costo, 0);

      if (costosActivo > 0) {
        costos.set(activoId, costosActivo);
        totalGeneral += costosActivo;
      }
    });

    const diasTranscurridos = Math.max(
      1,
      Math.ceil((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24))
    );
    const meses = Math.max(1, Math.ceil(diasTranscurridos / 30));

    return {
      porActivo: costos,
      total: totalGeneral,
      promedioPorMes: totalGeneral / meses,
    };
  }
}
