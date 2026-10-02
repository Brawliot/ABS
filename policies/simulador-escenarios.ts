/**
 * Motor de Escenarios - Simulaciones Financieras (Fase 4B)
 */

import type {
  DatoPunto,
  Escenario,
  ComparativaEscenarios,
  EscenarioTipo,
} from "../elements/simulador.js";
import { MotorSimuladorModelos } from "./simulador-modelos.js";

export class MotorEscenarios {
  private motor: MotorSimuladorModelos;

  constructor() {
    this.motor = new MotorSimuladorModelos();
  }

  /**
   * Escenario Pesimista: -20% ingresos, +15% costos
   */
  escenarioPesimista(
    datoHistórico: DatoPunto[],
    datoCostos: DatoPunto[],
    periodosAdelante: number,
  ): Escenario {
    return this.simularEscenario(
      datoHistórico,
      datoCostos,
      -20,
      +15,
      "pesimista",
      periodosAdelante,
    );
  }

  /**
   * Escenario Realista: crecimiento histórico
   */
  escenarioRealista(
    datoHistórico: DatoPunto[],
    datoCostos: DatoPunto[],
    periodosAdelante: number,
  ): Escenario {
    return this.simularEscenario(
      datoHistórico,
      datoCostos,
      0,
      0,
      "realista",
      periodosAdelante,
    );
  }

  /**
   * Escenario Optimista: +30% ingresos, -10% costos
   */
  escenarioOptimista(
    datoHistórico: DatoPunto[],
    datoCostos: DatoPunto[],
    periodosAdelante: number,
  ): Escenario {
    return this.simularEscenario(
      datoHistórico,
      datoCostos,
      +30,
      -10,
      "optimista",
      periodosAdelante,
    );
  }

  /**
   * Simula un escenario aplicando variaciones a ingresos y costos
   */
  simularEscenario(
    datoIngresos: DatoPunto[],
    datoCostos: DatoPunto[],
    variacionIngresos: number,
    variacionCostos: number,
    tipo: EscenarioTipo,
    periodosAdelante: number,
  ): Escenario {
    // Proyectar ingresos
    const proyeccionIngresos = this.motor.proyectarLineal(
      datoIngresos,
      periodosAdelante,
    );

    // Proyectar costos
    const proyeccionCostos = this.motor.proyectarLineal(
      datoCostos,
      periodosAdelante,
    );

    // Aplicar variaciones
    const ingresosConVariación = proyeccionIngresos.predicciones.map((p) => ({
      ...p,
      valor: p.valor * (1 + variacionIngresos / 100),
    }));

    const costosConVariación = proyeccionCostos.predicciones.map((p) => ({
      ...p,
      valor: p.valor * (1 + variacionCostos / 100),
    }));

    // Calcular ganancias
    const ganancias = ingresosConVariación.map((ing, i) => ({
      fecha: ing.fecha,
      valor: ing.valor - (costosConVariación[i]?.valor ?? 0),
    }));

    const descripcion = this.generarDescripcionEscenario(
      tipo,
      variacionIngresos,
      variacionCostos,
    );

    return {
      tipo,
      variacionIngresos,
      variacionCostos,
      descripcion,
      proyeccion: proyeccionIngresos,
      resultadosProyectados: {
        ingresosProyectados: ingresosConVariación.map((p) => p.valor),
        costosProyectados: costosConVariación.map((p) => p.valor),
        gananciaProyectada: ganancias.map((p) => p.valor),
        periodos: ganancias.map((p) => p.fecha),
      },
    };
  }

  /**
   * Compara los tres escenarios: pesimista, realista, optimista
   */
  compararEscenarios(
    pesimista: Escenario,
    realista: Escenario,
    optimista: Escenario,
  ): ComparativaEscenarios {
    const calcularMetricas = (escenario: Escenario) => {
      const ingresos = escenario.resultadosProyectados.ingresosProyectados;
      const costos = escenario.resultadosProyectados.costosProyectados;
      const ganancias = escenario.resultadosProyectados.gananciaProyectada;

      const sumaIngresos = ingresos.reduce((a, b) => a + (b ?? 0), 0);
      const sumaCostos = costos.reduce((a, b) => a + (b ?? 0), 0);
      const sumaGanancias = ganancias.reduce((a, b) => a + (b ?? 0), 0);

      return {
        ingresosPromedio: sumaIngresos / (ingresos.length || 1),
        costosPromedio: sumaCostos / (costos.length || 1),
        gananciaPromedio: sumaGanancias / (ganancias.length || 1),
        gananciaTotal: sumaGanancias,
      };
    };

    const metPes = calcularMetricas(pesimista);
    const metReal = calcularMetricas(realista);
    const metOpt = calcularMetricas(optimista);

    return {
      pesimista,
      realista,
      optimista,
      tabla: [
        {
          metrica: "Ingresos Promedio",
          pesimista: metPes.ingresosPromedio,
          realista: metReal.ingresosPromedio,
          optimista: metOpt.ingresosPromedio,
        },
        {
          metrica: "Costos Promedio",
          pesimista: metPes.costosPromedio,
          realista: metReal.costosPromedio,
          optimista: metOpt.costosPromedio,
        },
        {
          metrica: "Ganancia Promedio",
          pesimista: metPes.gananciaPromedio,
          realista: metReal.gananciaPromedio,
          optimista: metOpt.gananciaPromedio,
        },
        {
          metrica: "Ganancia Total",
          pesimista: metPes.gananciaTotal,
          realista: metReal.gananciaTotal,
          optimista: metOpt.gananciaTotal,
        },
      ],
    };
  }

  private generarDescripcionEscenario(
    tipo: EscenarioTipo,
    variacionIngresos: number,
    variacionCostos: number,
  ): string {
    return `${tipo}: ingresos ${variacionIngresos > 0 ? "+" : ""}${variacionIngresos}%, costos ${variacionCostos > 0 ? "+" : ""}${variacionCostos}%`;
  }
}
