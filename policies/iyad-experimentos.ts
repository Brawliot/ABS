/**
 * Motor de Experimentos A/B (Fase 4B)
 * Gestión de experimentos, pruebas t-student, validación estadística
 */

import type {
  Experimento,
  ResultadoExperimento,
  PortfolioExperimentos,
  TipoExperimento,
} from "../elements/proyecto-iyd.js";

export class MotorExperimentos {
  /**
   * Crea un nuevo experimento A/B
   */
  crearExperimento(
    id: string,
    nombre: string,
    tipo: TipoExperimento,
    descripción: string,
    hipótesis: string,
    tamanioControl: number,
    tamanioTratamiento: number,
    confianza: number = 95,
  ): Experimento {
    return {
      id,
      nombre,
      tipo,
      descripción,
      hipótesis,
      grupoControl: {
        tamaño: tamanioControl,
        métrica: "",
        resultado: 0,
      },
      grupoTratamiento: {
        tamaño: tamanioTratamiento,
        métrica: "",
        resultado: 0,
      },
      confianza,
      nivelSignificancia: 0,
      fechaInicio: new Date(),
    };
  }

  /**
   * Registra resultados y calcula significancia estadística
   */
  registrarResultadoExperimento(
    experimento: Experimento,
    resultadoControl: number,
    resultadoTratamiento: number,
  ): ResultadoExperimento {
    const n1 = experimento.grupoControl.tamaño;
    const n2 = experimento.grupoTratamiento.tamaño;

    const media1 = resultadoControl;
    const media2 = resultadoTratamiento;

    // Asumir desviaciones estándar (en test real, se calcularían)
    // Para un test más realista, usar desviación menor para detectar cambios significantes
    const desv1 = Math.max(media1 * 0.1, 0.001); // 10% de variabilidad mínimo
    const desv2 = Math.max(media2 * 0.1, 0.001);

    // Calcular t-statistic
    const varianzaCombinada = ((n1 - 1) * desv1 ** 2 + (n2 - 1) * desv2 ** 2) / (n1 + n2 - 2);
    const errorEstandar = Math.sqrt(varianzaCombinada * (1 / n1 + 1 / n2)) || 0.0001;
    const tStatistic = (media2 - media1) / errorEstandar;

    // Grados de libertad
    const df = n1 + n2 - 2;

    // P-value (aproximado usando t-distribution)
    const pValue = this.calcularPValue(Math.abs(tStatistic), df);

    // Determinar ganador
    const esSignificante = pValue < 1 - experimento.confianza / 100;
    let ganador: "control" | "tratamiento" | "empate" = "empate";

    if (esSignificante) {
      ganador = media2 > media1 ? "tratamiento" : "control";
    }

    const diferencia = media2 - media1;
    const porcentajeChange = (diferencia / media1) * 100;

    // Tamaño de muestra requerido
    const tamanioMuestraRequerido = this.calcularTamañoMuestra(
      media1,
      desv1,
      media2,
      desv2,
      0.05,
      0.2,
    );

    return {
      experimentoId: experimento.id,
      diferencia,
      porcentajeChange,
      pValue,
      esSignificante,
      confianzaEstadística: (1 - pValue) * 100,
      ganador,
      tamaño_Muestra_Requerido: tamanioMuestraRequerido,
    };
  }

  /**
   * Calcula el tamaño de muestra para 95% de confianza
   */
  calcularTamañoMuestra(
    media1: number,
    desv1: number,
    media2: number,
    desv2: number,
    nivelSignificancia: number = 0.05,
    potencia: number = 0.8,
  ): number {
    // Fórmula: n = 2 * ((z_alpha + z_beta)^2 * (sigma1^2 + sigma2^2)) / (media2 - media1)^2

    const zAlpha = this.obtenerZCritico(nivelSignificancia / 2); // 0.025 para dos colas
    const zBeta = this.obtenerZCritico(1 - potencia); // 0.2 para 80% de potencia

    const diferencia = Math.abs(media2 - media1) || 1;
    const varianzaCombinada = (desv1 ** 2 + desv2 ** 2) / 2;

    const tamanio =
      (2 * (zAlpha + zBeta) ** 2 * varianzaCombinada) / diferencia ** 2;

    return Math.ceil(tamanio);
  }

  /**
   * Analiza portfolio de experimentos
   */
  analizarMultiplesExperimentos(
    experimentos: Experimento[],
    resultados: ResultadoExperimento[],
  ): PortfolioExperimentos {
    const experimentosCompletados = experimentos.filter((e) => e.fechaFinal);

    const experimentosConGanador = resultados.filter(
      (r) => r.ganador !== "empate",
    );
    const tasaÉxito =
      experimentosCompletados.length > 0
        ? (experimentosConGanador.length / experimentosCompletados.length) * 100
        : 0;

    // Learning rate: experimentos completados por semana
    const tiempoPromedio =
      experimentosCompletados.length > 0
        ? experimentosCompletados.reduce(
            (total, e) => {
              const duracion = (e.fechaFinal!.getTime() - e.fechaInicio.getTime()) / (1000 * 60 * 60 * 24);
              return total + duracion;
            },
            0,
          ) / experimentosCompletados.length
        : 0;

    const learningRate =
      tiempoPromedio > 0 ? 7 / tiempoPromedio : 0; // experimentos por semana

    // Impacto promedio
    const impactoPromedio =
      resultados.length > 0
        ? resultados.reduce((total, r) => total + Math.abs(r.porcentajeChange), 0) /
            resultados.length
        : 0;

    return {
      experimentos,
      tasaÉxito,
      learningRate,
      impactoPromedio,
    };
  }

  /**
   * Calcula p-value usando aproximación normal
   */
  private calcularPValue(tStatistic: number, df: number): number {
    // Aproximación: para df > 30, usar distribución normal
    // Para df < 30, usar t-distribution
    if (df > 30) {
      const z = tStatistic;
      // Función error complementaria (aproximada)
      const erfVal = this.erf(z / Math.sqrt(2));
      const erfc =
        1 -
        erfVal *
          (0.3275911 / (1 + 0.3275911 * Math.abs(z) / Math.sqrt(2)));
      return Math.max(0, Math.min(1, erfc));
    }

    // Para t-distribution, usar aproximación
    const A = df / (df + tStatistic ** 2);
    return 1 - 0.5 * (1 + Math.sign(tStatistic) * Math.sqrt(1 - A));
  }

  /**
   * Función de error (erf) - aproximación de Abramowitz y Stegun
   */
  private erf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 -
      (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));

    return sign * y;
  }

  /**
   * Obtiene valor z crítico
   */
  private obtenerZCritico(p: number): number {
    // Tablas aproximadas de z-crítico
    const tablas: Record<number, number> = {
      0.5: 0,
      0.25: 0.674,
      0.1: 1.282,
      0.05: 1.645,
      0.025: 1.96,
      0.01: 2.326,
      0.005: 2.576,
      0.001: 3.09,
    };

    // Buscar el valor más cercano
    let valorMasCercano = 0;
    let diferenciaMenor = Infinity;

    for (const [p_key, z_val] of Object.entries(tablas)) {
      const diff = Math.abs(parseFloat(p_key) - p);
      if (diff < diferenciaMenor) {
        diferenciaMenor = diff;
        valorMasCercano = z_val;
      }
    }

    return valorMasCercano || 1.96; // default: 95% confidence
  }
}
