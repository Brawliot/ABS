import type {
  ActivoFijo,
  MetodoDepreciación,
  ValorActivo,
  AsientoDepreciación,
} from "../elements/activo-fijo.js";

export class MotorDepreciación {
  calcularDepreciación(
    activo: ActivoFijo,
    método: MetodoDepreciación,
    fechaHasta: Date = new Date()
  ): {
    readonly valorActual: number;
    readonly depreciacionAcumulada: number;
    readonly depreciacionPeriodo: number;
  } {
    // Si no hay valores iniciales, retornar sin depreciación
    if (activo.valoresActuales.length === 0) {
      return {
        valorActual: activo.costoAdquisición,
        depreciacionAcumulada: 0,
        depreciacionPeriodo: 0,
      };
    }

    const mesesDesdeCompra = this.calcularMesesTranscurridos(
      activo.fechaCompra,
      fechaHasta
    );

    let depreciacionAcumulada = 0;
    let depreciacionPeriodo = 0;

    if (método === "lineal") {
      const depreciacionMensual = activo.costoAdquisición / (5 * 12);
      depreciacionAcumulada = depreciacionMensual * mesesDesdeCompra;
      depreciacionPeriodo = depreciacionMensual;
    } else if (método === "acelerada") {
      const sumaDígitos = (5 * 6) / 2;
      const anosTranscurridos = Math.floor(mesesDesdeCompra / 12);
      const anosRestantes = Math.max(0, 5 - anosTranscurridos);
      depreciacionAcumulada =
        ((5 * 6) / 2 - (anosRestantes * (anosRestantes + 1)) / 2) *
        (activo.costoAdquisición / sumaDígitos);
      depreciacionPeriodo = (activo.costoAdquisición / sumaDígitos) * Math.max(0, anosRestantes);
    } else if (método === "porcentaje_fijo") {
      const tasaMensual = 0.01;
      depreciacionAcumulada =
        activo.costoAdquisición *
        (1 - Math.pow(1 - tasaMensual, mesesDesdeCompra));
      depreciacionPeriodo =
        activo.costoAdquisición *
        (1 - Math.pow(1 - tasaMensual, mesesDesdeCompra));
    }

    const valorActual = Math.max(0, activo.costoAdquisición - depreciacionAcumulada);

    return {
      valorActual,
      depreciacionAcumulada,
      depreciacionPeriodo,
    };
  }

  generarAsientosDepreciación(
    activoId: string,
    período: string
  ): AsientoDepreciación[] {
    return [
      {
        id: `${activoId}-${período}`,
        activoId,
        período,
        monto: 0,
        createdAt: new Date(),
      },
    ];
  }

  obtenerValorActual(activo: ActivoFijo): number {
    const resultado = this.calcularDepreciación(activo, "lineal");
    return resultado.valorActual;
  }

  proyectarValorFuturo(activo: ActivoFijo, meses: number): number[] {
    const proyección: number[] = [];
    const método = activo.valoresActuales[0]?.método || "lineal";

    for (let i = 1; i <= meses; i++) {
      const fechaProyectada = new Date(activo.createdAt);
      fechaProyectada.setMonth(fechaProyectada.getMonth() + i);

      const cálculo = this.calcularDepreciación(activo, método, fechaProyectada);
      proyección.push(cálculo.valorActual);
    }

    return proyección;
  }

  private calcularMesesTranscurridos(desde: Date, hasta: Date): number {
    const meses =
      (hasta.getFullYear() - desde.getFullYear()) * 12 +
      (hasta.getMonth() - desde.getMonth());
    return Math.max(0, meses);
  }
}
