/**
 * Motor de Validación de Simulaciones (Fase 4B)
 * Retroalimentación y mejora de modelos
 */

import type {
  DatoPunto,
  GuardadoSimulación,
  ValidacionSimulación,
  AccuracyPorModelo,
  ModeloProyeccion,
  RecomendaciónModelo,
} from "../elements/simulador.js";

export class MotorValidaciónSimulador {
  /**
   * Guarda una simulación para validación posterior
   */
  guardarSimulación(
    id: string,
    modelo: ModeloProyeccion,
    datoHistórico: DatoPunto[],
    proyección: any,
    r2: number,
    tendencia: string,
  ): GuardadoSimulación {
    return {
      id,
      fecha: new Date(),
      modelo,
      datoHistórico,
      proyección,
      r2,
      tendencia: tendencia as any,
    };
  }

  /**
   * Valida una simulación comparando predicciones vs realidad
   */
  validarSimulación(
    simulacionId: string,
    predicciones: DatoPunto[],
    datosReales: DatoPunto[],
  ): ValidacionSimulación {
    if (predicciones.length !== datosReales.length) {
      throw new Error("Predicciones y datos reales deben tener la misma longitud");
    }

    // Calcular RMSE (Root Mean Square Error)
    const errores = predicciones.map((p, i) => {
      const real = datosReales[i];
      return p.valor - (real?.valor ?? 0);
    });
    const rmse = Math.sqrt(
      errores.reduce((a, e) => a + e * e, 0) / (errores.length || 1),
    );

    // Calcular % de predicciones correctas (dentro de 10% del valor real)
    const correctas = datosReales.filter((real, i) => {
      const pred = predicciones[i];
      if (!pred || !real || real.valor === 0) return false;
      const error = Math.abs(pred.valor - real.valor) / real.valor;
      return error <= 0.1; // 10% de tolerancia
    });
    const acierto = (correctas.length / (datosReales.length || 1)) * 100;

    // Análisis de desviación
    const desviacionPromedio =
      errores.reduce((a, e) => a + Math.abs(e), 0) / (errores.length || 1);
    const sumaDatos = datosReales.reduce((a, d) => a + (d?.valor ?? 0), 0);
    const promedioDatos = sumaDatos / (datosReales.length || 1);
    const desviacionPorcentaje =
      promedioDatos !== 0 ? (desviacionPromedio / promedioDatos) * 100 : 0;

    let desviacionAnalisis = "";
    if (desviacionPorcentaje < 5) {
      desviacionAnalisis = "Excelente: muy preciso";
    } else if (desviacionPorcentaje < 15) {
      desviacionAnalisis = "Bueno: dentro de margen aceptable";
    } else if (desviacionPorcentaje < 30) {
      desviacionAnalisis = "Moderado: requiere mejora";
    } else {
      desviacionAnalisis = "Pobre: requiere revisión del modelo";
    }

    return {
      simulacionId,
      datosReales,
      predicciones,
      error: rmse,
      acierto,
      desviacionAnalisis,
    };
  }

  /**
   * Obtiene accuracy de cada modelo basado en histórico
   */
  obtenerAccuracyPorModelo(
    validaciones: ValidacionSimulación[],
  ): AccuracyPorModelo[] {
    const porModelo: Record<string, ValidacionSimulación[]> = {};

    validaciones.forEach((v) => {
      const modelo = "lineal"; // Por simplicidad, asumimos modelo
      if (!porModelo[modelo]) porModelo[modelo] = [];
      porModelo[modelo].push(v);
    });

    return Object.entries(porModelo).map(([modelo, validaciones_modelo]) => {
      const accuracyPromedio =
        validaciones_modelo.reduce((a, v) => a + v.acierto, 0) /
        validaciones_modelo.length;

      return {
        modelo: modelo as ModeloProyeccion,
        accuracy: accuracyPromedio,
        conteo: validaciones_modelo.length,
        ultimaUsada: new Date(),
      };
    });
  }

  /**
   * Recomienda el mejor modelo basado en datos históricos
   */
  recomendarModelo(
    accuracyPorModelo: AccuracyPorModelo[],
  ): RecomendaciónModelo {
    if (accuracyPorModelo.length === 0) {
      return {
        modeloRecomendado: "lineal",
        accuracy: 0,
        justificación: "No hay datos históricos",
        datosInsuficientes: true,
      };
    }

    const mejor = accuracyPorModelo.reduce((a, b) =>
      a.accuracy > b.accuracy ? a : b,
    );

    return {
      modeloRecomendado: mejor.modelo,
      accuracy: mejor.accuracy,
      justificación: `Modelo ${mejor.modelo} con ${mejor.accuracy.toFixed(1)}% de acierto basado en ${mejor.conteo} validaciones`,
      datosInsuficientes: mejor.conteo < 5,
    };
  }

  /**
   * Analiza por qué una proyección falló
   */
  analizarDesviación(
    simulacion: ValidacionSimulación,
  ): {
    tipoError: "sistematico" | "aleatorio" | "cambio_estructura";
    severidad: "baja" | "media" | "alta";
    recomendaciones: string[];
  } {
    const errores = simulacion.predicciones.map((p, i) => {
      const real = simulacion.datosReales[i];
      return (p?.valor ?? 0) - (real?.valor ?? 0);
    });

    // Detectar tendencia de error
    const erroresAcumulados = errores.map((_, i) =>
      errores.slice(0, i + 1).reduce((a, b) => a + b, 0),
    );

    const ultimoError = erroresAcumulados[erroresAcumulados.length - 1] ?? 0;
    const pendientaerrores = ultimoError / (erroresAcumulados.length || 1);
    const essistamatico = Math.abs(pendientaerrores) > 0.5;

    let tipoError: "sistematico" | "aleatorio" | "cambio_estructura" =
      "aleatorio";
    if (essistamatico) {
      tipoError = "sistematico";
    } else {
      const sumaDatos = simulacion.datosReales.reduce((a, d) => a + (d?.valor ?? 0), 0);
      const promedioDatos = sumaDatos / (simulacion.datosReales.length || 1);
      const umbral = promedioDatos * 0.3;
      if (simulacion.error > umbral) {
        tipoError = "cambio_estructura";
      }
    }

    const severidad = simulacion.acierto > 80 ? "baja" : simulacion.acierto > 60 ? "media" : "alta";

    const recomendaciones = [];
    if (tipoError === "sistematico") {
      recomendaciones.push("Ajustar parámetros del modelo (sesgo)");
      recomendaciones.push("Incluir variables adicionales");
    }
    if (tipoError === "cambio_estructura") {
      recomendaciones.push("Detectado cambio en estructura de datos");
      recomendaciones.push("Considerar modelo estacional o polinómico");
      recomendaciones.push("Revisar eventos externos o anomalías");
    }
    if (severidad === "alta") {
      recomendaciones.push("Descartar modelo actual");
      recomendaciones.push("Probar modelo exponencial o estacional");
    }

    return {
      tipoError,
      severidad,
      recomendaciones,
    };
  }
}
