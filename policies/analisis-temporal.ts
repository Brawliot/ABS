/**
 * Motor de Análisis Temporal: Análisis de series de tiempo,
 * detección de anomalías, comparaciones periódicas y forecasting.
 */

export interface PuntoSerie {
  readonly fecha: Date;
  readonly valor: number;
}

export interface Tendencia {
  readonly pendiente: number; // Cambio por período
  readonly direccion: "ascendente" | "descendente" | "plana";
  readonly fuerte: boolean; // R² > 0.7
}

export interface Anomalia {
  readonly fecha: Date;
  readonly valor: number;
  readonly desviaciónEstándar: number;
  readonly tipo: "pico" | "caída" | "cambio_tendencia";
}

export interface Proyección {
  readonly fecha: Date;
  readonly valorEsperado: number;
  readonly intervaloMin: number;
  readonly intervaloMax: number;
}

export class MotorAnálisisTemporal {
  analizarTendencia(serie: readonly PuntoSerie[]): Tendencia {
    if (serie.length < 2) {
      return {
        pendiente: 0,
        direccion: "plana",
        fuerte: false,
      };
    }

    // Regresión lineal simple
    const n = serie.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = serie.map(p => p.valor);

    const xMean = x.reduce((a, b) => a + b, 0) / n;
    const yMean = y.reduce((a, b) => a + b, 0) / n;

    let numerador = 0;
    let denominador = 0;

    for (let i = 0; i < n; i++) {
      numerador += ((x[i] ?? 0) - xMean) * ((y[i] ?? 0) - yMean);
      denominador += ((x[i] ?? 0) - xMean) ** 2;
    }

    const pendiente = denominador !== 0 ? numerador / denominador : 0;

    // Calcular R²
    const yPred = x.map(xi => yMean + pendiente * ((xi ?? 0) - xMean));
    const ssRes = y.reduce((sum, yi, i) => sum + ((yi ?? 0) - (yPred[i] ?? 0)) ** 2, 0);
    const ssTot = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);
    const r2 = ssTot !== 0 ? 1 - ssRes / ssTot : 0;

    return {
      pendiente,
      direccion:
        Math.abs(pendiente) < 0.01
          ? "plana"
          : pendiente > 0
          ? "ascendente"
          : "descendente",
      fuerte: r2 > 0.7,
    };
  }

  detectarAnomalías(serie: readonly PuntoSerie[]): Anomalia[] {
    if (serie.length < 2) return [];

    const valores = serie.map(p => p.valor);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const varianza =
      valores.reduce((sum, v) => sum + (v - media) ** 2, 0) / valores.length;
    const desviacionEstandar = Math.sqrt(varianza);

    const anomalias: Anomalia[] = [];
    const umbral = 2.5; // Z-score

    for (let i = 0; i < serie.length; i++) {
      const val = valores[i] ?? 0;
      const zScore = Math.abs((val - media) / (desviacionEstandar || 1));
      if (zScore > umbral) {
        anomalias.push({
          fecha: (serie[i]?.fecha) ?? new Date(),
          valor: val,
          desviaciónEstándar: zScore,
          tipo: val > media ? "pico" : "caída",
        });
      }
    }

    return anomalias;
  }

  compararPeríodos(
    periodoActual: readonly PuntoSerie[],
    periodoAnterior: readonly PuntoSerie[]
  ): {
    cambioPromedio: number;
    cambioMaximo: number;
    cambioMinimo: number;
    mejora: boolean;
  } {
    const actualPromedio =
      periodoActual.reduce((sum, p) => sum + p.valor, 0) / periodoActual.length;
    const anteriorPromedio =
      periodoAnterior.reduce((sum, p) => sum + p.valor, 0) /
      periodoAnterior.length;

    const cambioPromedio = actualPromedio - anteriorPromedio;
    const cambioMaximo = Math.max(
      ...periodoActual.map((p, i) =>
        i < periodoAnterior.length ? (p.valor ?? 0) - ((periodoAnterior[i]?.valor) ?? 0) : 0
      )
    );
    const cambioMinimo = Math.min(
      ...periodoActual.map((p, i) =>
        i < periodoAnterior.length ? (p.valor ?? 0) - ((periodoAnterior[i]?.valor) ?? 0) : 0
      )
    );

    return {
      cambioPromedio: Math.round(cambioPromedio * 100) / 100,
      cambioMaximo: Math.round(cambioMaximo * 100) / 100,
      cambioMinimo: Math.round(cambioMinimo * 100) / 100,
      mejora: cambioPromedio > 0,
    };
  }

  proyectarTendencia(
    serie: readonly PuntoSerie[],
    periodosAdelante: number = 5
  ): Proyección[] {
    const tendencia = this.analizarTendencia(serie);
    const valores = serie.map(p => p.valor);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const desv = Math.sqrt(
      valores.reduce((sum, v) => sum + (v - media) ** 2, 0) / valores.length
    );

    const ultimaFecha = (serie[serie.length - 1]?.fecha) ?? new Date();
    const ultimoValor = (serie[serie.length - 1]?.valor) ?? 0;

    const proyecciones: Proyección[] = [];

    for (let i = 1; i <= periodosAdelante; i++) {
      const nuevaFecha = new Date(ultimaFecha);
      nuevaFecha.setDate(nuevaFecha.getDate() + i);

      const valorEsperado =
        ultimoValor + tendencia.pendiente * i;

      proyecciones.push({
        fecha: nuevaFecha,
        valorEsperado: Math.round(valorEsperado * 100) / 100,
        intervaloMin: Math.round((valorEsperado - desv * 2) * 100) / 100,
        intervaloMax: Math.round((valorEsperado + desv * 2) * 100) / 100,
      });
    }

    return proyecciones;
  }
}
