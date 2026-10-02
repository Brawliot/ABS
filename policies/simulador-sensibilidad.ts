/**
 * Motor de Análisis de Sensibilidad (Fase 4B)
 * Variación de variables y medición de impacto
 */

import type {
  AnálisisSensibilidad,
  Elasticidad,
  PuntoEquilibrio,
  GráficoTornadoSensibilidad,
} from "../elements/simulador.js";

export class MotorSensibilidad {
  /**
   * Analiza sensibilidad de una variable
   * Varía la variable y mide impacto en el resultado
   */
  analizarSensibilidad(
    variable: string,
    valorBase: number,
    funcionResultado: (valor: number) => number,
    rangoMinimo?: number,
    rangoMaximo?: number,
  ): AnálisisSensibilidad {
    const min = rangoMinimo || valorBase * 0.5;
    const max = rangoMaximo || valorBase * 1.5;
    const paso = (max - min) / 10; // 10 pasos

    const impactos: AnálisisSensibilidad["impactos"] = [];
    const resultadoBase = funcionResultado(valorBase);

    for (let i = 0; i <= 10; i++) {
      const valor = min + paso * i;
      const resultado = funcionResultado(valor);
      const impacto = resultado - resultadoBase;
      const porcentaje = ((valor - valorBase) / valorBase) * 100;

      impactos.push({
        valor,
        impactoEnResultado: impacto,
        porcentaje,
      });
    }

    return {
      variable,
      valorBase,
      rango: { minimo: min, maximo: max },
      impactos,
    };
  }

  /**
   * Encuentra el valor de una variable que alcanza un objetivo
   */
  encontrarPuntoEquilibrio(
    variable: string,
    valorBase: number,
    objetivo: number,
    funcionResultado: (valor: number) => number,
  ): PuntoEquilibrio {
    const resultadoActual = funcionResultado(valorBase);

    // Búsqueda binaria para encontrar el equilibrio
    let min = valorBase * 0.1;
    let max = valorBase * 10;

    for (let iter = 0; iter < 50; iter++) {
      const mid = (min + max) / 2;
      const resultado = funcionResultado(mid);

      if (Math.abs(resultado - objetivo) < 0.01 * objetivo) {
        const valorEquilibrio = mid;
        const margen =
          ((valorEquilibrio - valorBase) / valorBase) * 100;

        return {
          variable,
          valorEquilibrio,
          resultadoActual,
          margenDeSeguridad: margen,
        };
      }

      if (resultado < objetivo) {
        min = mid;
      } else {
        max = mid;
      }
    }

    // Si no converge, retorna mejor aproximación
    const valorFinal = (min + max) / 2;
    const margen = ((valorFinal - valorBase) / valorBase) * 100;

    return {
      variable,
      valorEquilibrio: valorFinal,
      resultadoActual,
      margenDeSeguridad: margen,
    };
  }

  /**
   * Calcula elasticidad: % cambio en resultado / % cambio en variable
   */
  analizarElasticidad(
    variable: string,
    valorBase: number,
    funcionResultado: (valor: number) => number,
  ): Elasticidad {
    const resultadoBase = funcionResultado(valorBase);

    // Cambio pequeño (1%)
    const cambioVariable = valorBase * 0.01;
    const nuevoValor = valorBase + cambioVariable;
    const nuevoResultado = funcionResultado(nuevoValor);

    const cambioResultado = nuevoResultado - resultadoBase;
    const porcentajeCambioVariable = (cambioVariable / valorBase) * 100;
    const porcentajeCambioResultado = (cambioResultado / resultadoBase) * 100;

    const elasticidad = porcentajeCambioResultado / porcentajeCambioVariable;
    const interpretacion =
      Math.abs(elasticidad) > 1
        ? "elástica"
        : Math.abs(elasticidad) < 1
          ? "inelástica"
          : "unitaria";

    return {
      variable,
      elasticidad,
      interpretacion,
    };
  }

  /**
   * Genera gráfico tornado: variables ordenadas por impacto
   */
  generarGráficoTornadoSensibilidad(
    variables: { nombre: string; funcion: (valor: number) => number; base: number }[],
  ): GráficoTornadoSensibilidad {
    const variables_tornado = variables
      .map((v) => {
        const resultadoBase = v.funcion(v.base);

        // Impacto positivo (+10%)
        const impactoPositivo = v.funcion(v.base * 1.1) - resultadoBase;

        // Impacto negativo (-10%)
        const impactoNegativo = resultadoBase - v.funcion(v.base * 0.9);

        return {
          nombre: v.nombre,
          impactoPositivo: Math.abs(impactoPositivo),
          impactoNegativo: Math.abs(impactoNegativo),
          rangoTotal: Math.abs(impactoPositivo) + Math.abs(impactoNegativo),
        };
      })
      .sort((a, b) => b.rangoTotal - a.rangoTotal);

    return {
      variables: variables_tornado,
    };
  }
}
