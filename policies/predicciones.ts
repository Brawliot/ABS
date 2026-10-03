/**
 * Motor de Predicciones (Fase 3)
 * Tendencias, demanda, anomalías, forecasts
 */

export interface Tendencia {
  readonly periodos: string[];
  readonly valores: number[];
  readonly pendiente: number;
  readonly r_cuadrado: number;
  readonly proyecciones: number[];
  readonly confianza_pct: number;
}

export interface PrediccionDemanda {
  readonly semana: number;
  readonly demanda_predicha: number;
  readonly intervalo_confianza_min: number;
  readonly intervalo_confianza_max: number;
  readonly confianza_pct: number;
}

export interface Anomalia {
  readonly fecha: string;
  readonly valor: number;
  readonly valor_esperado: number;
  readonly desvio_std: number;
  readonly z_score: number;
  readonly es_anomalia: boolean;
}

export interface Forecast {
  readonly metrica: string;
  readonly horizonte_dias: number;
  readonly predicciones: Array<{
    readonly fecha: string;
    readonly valor: number;
    readonly intervalo_min: number;
    readonly intervalo_max: number;
  }>;
  readonly confianza_general_pct: number;
}

export class MotorPredicciones {
  /**
   * Proyecta tendencia usando regresión lineal simple
   */
  proyectarTendencia(datos: ReadonlyArray<number>, periodsAdelante: number): Tendencia {
    if (datos.length < 2) {
      throw new Error('Se requieren al menos 2 puntos de datos');
    }

    const n = datos.length;
    const x = Array.from({ length: n }, (_, i) => i + 1);
    const y = [...datos];

    // Calcular media
    const mediaX = x.reduce((a, b) => a + b, 0) / n;
    const mediaY = y.reduce((a, b) => a + b, 0) / n;

    // Calcular pendiente (b) e intercepto (a)
    let sumProductos = 0;
    let sumCuadradosX = 0;
    for (let i = 0; i < n; i++) {
      const xi = x[i] ?? 0;
      const yi = y[i] ?? 0;
      sumProductos += (xi - mediaX) * (yi - mediaY);
      sumCuadradosX += (xi - mediaX) * (xi - mediaX);
    }

    const pendiente = sumProductos / sumCuadradosX;
    const intercepto = mediaY - pendiente * mediaX;

    // Calcular R²
    let sumResidual = 0;
    let sumTotal = 0;
    for (let i = 0; i < n; i++) {
      const xi = x[i] ?? 0;
      const yi = y[i] ?? 0;
      const predicho = intercepto + pendiente * xi;
      sumResidual += (yi - predicho) ** 2;
      sumTotal += (yi - mediaY) ** 2;
    }
    const rCuadrado = sumTotal > 0 ? 1 - sumResidual / sumTotal : 0;

    // Proyectar hacia adelante
    const proyecciones: number[] = [];
    for (let i = n + 1; i <= n + periodsAdelante; i++) {
      proyecciones.push(intercepto + pendiente * i);
    }

    // Confianza basada en R²
    const confianzaPct = Math.max(0, Math.min(100, rCuadrado * 100));

    return {
      periodos: Array.from({ length: n }, (_, i) => `p${i + 1}`),
      valores: y,
      pendiente,
      r_cuadrado: rCuadrado,
      proyecciones,
      confianza_pct: confianzaPct,
    };
  }

  /**
   * Predice demanda para las próximas semanas
   */
  predecirDemanda(
    historicoSemanal: ReadonlyArray<number>,
    semanasAdelante: number = 4,
  ): PrediccionDemanda[] {
    const tendencia = this.proyectarTendencia(historicoSemanal, semanasAdelante);
    const predicciones: PrediccionDemanda[] = [];

    // Calcular desviación estándar del histórico
    const media = historicoSemanal.reduce((a, b) => a + b) / historicoSemanal.length;
    const varianza =
      historicoSemanal.reduce((sum, val) => sum + (val - media) ** 2, 0) /
      historicoSemanal.length;
    const desvio = Math.sqrt(varianza);

    for (let i = 0; i < semanasAdelante; i++) {
      const valor = tendencia.proyecciones[i] || 0;
      // Intervalo de confianza al 95% (±1.96 * desvio)
      const intervaloConfianza = 1.96 * desvio;

      predicciones.push({
        semana: historicoSemanal.length + i + 1,
        demanda_predicha: Math.max(0, Math.round(valor)),
        intervalo_confianza_min: Math.max(0, Math.round(valor - intervaloConfianza)),
        intervalo_confianza_max: Math.round(valor + intervaloConfianza),
        confianza_pct: Math.max(0, Math.min(100, tendencia.confianza_pct)),
      });
    }

    return predicciones;
  }

  /**
   * Detecta valores anómalos usando Z-score
   */
  detectarAnomalias(
    datos: ReadonlyArray<{ readonly fecha: string; readonly valor: number }>,
    umbralbZScore: number = 2.5,
  ): Anomalia[] {
    if (datos.length < 2) return [];

    const valores = datos.map((d) => d.valor);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const varianza = valores.reduce((sum, v) => sum + (v - media) ** 2, 0) / valores.length;
    const desvio = Math.sqrt(varianza);

    const anomalias: Anomalia[] = [];

    for (const punto of datos) {
      const zScore = desvio > 0 ? (punto.valor - media) / desvio : 0;
      const esAnomalia = Math.abs(zScore) > umbralbZScore;

      anomalias.push({
        fecha: punto.fecha,
        valor: punto.valor,
        valor_esperado: media,
        desvio_std: desvio,
        z_score: zScore,
        es_anomalia: esAnomalia,
      });
    }

    return anomalias;
  }

  /**
   * Genera forecast con intervalos de confianza
   */
  calcularForecast(
    metrica: string,
    historicoMensual: ReadonlyArray<number>,
    horizonteDias: number = 30,
  ): Forecast {
    const tendencia = this.proyectarTendencia(historicoMensual, Math.ceil(horizonteDias / 30));

    const predicciones: any[] = [];
    const diasPorProyeccion = horizonteDias / tendencia.proyecciones.length;

    for (let i = 0; i < tendencia.proyecciones.length; i++) {
      const valor = tendencia.proyecciones[i] || 0;
      const fecha = new Date();
      fecha.setDate(fecha.getDate() + i * diasPorProyeccion);

      // Intervalo de confianza: ±20% de la predicción
      const intervalo = valor * 0.2;

      predicciones.push({
        fecha: (fecha.toISOString().split('T')[0]) ?? "",
        valor: Math.max(0, Math.round(valor)),
        intervalo_min: Math.max(0, Math.round(valor - intervalo)),
        intervalo_max: Math.round(valor + intervalo),
      });
    }

    return {
      metrica,
      horizonte_dias: horizonteDias,
      predicciones: predicciones as any,
      confianza_general_pct: tendencia.confianza_pct,
    };
  }

  /**
   * Valida si una predicción es razonable
   */
  validarPrediccion(prediccion: number, rangoMin: number, rangoMax: number): boolean {
    return prediccion >= rangoMin && prediccion <= rangoMax;
  }
}
