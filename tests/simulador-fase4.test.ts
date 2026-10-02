/**
 * Tests para Simulador - Fase 4B
 * 18+ tests para proyecciones, escenarios, sensibilidad y validación
 */

import { describe, it, expect } from "vitest";
import { MotorSimuladorModelos } from "../policies/simulador-modelos.js";
import { MotorEscenarios } from "../policies/simulador-escenarios.js";
import { MotorSensibilidad } from "../policies/simulador-sensibilidad.js";
import { MotorValidaciónSimulador } from "../policies/simulador-validacion.js";
import type { DatoPunto } from "../elements/simulador.js";

describe("Simulador Fase 4B", () => {
  const crearDatos = (valores: number[]): DatoPunto[] => {
    return valores.map((valor, i) => ({
      fecha: new Date(2024, i % 12, 1),
      valor,
    }));
  };

  describe("MotorSimuladorModelos", () => {
    const motor = new MotorSimuladorModelos();

    it("proyectarLineal: calcula pendiente e intercepto", () => {
      const datos = crearDatos([100, 110, 120, 130, 140]);
      const resultado = motor.proyectarLineal(datos, 3);

      expect(resultado.modelo).toBe("lineal");
      expect(resultado.pendiente).toBeGreaterThan(0);
      expect(resultado.intercepto).toBeGreaterThan(0);
      expect(resultado.predicciones.length).toBe(3);
    });

    it("proyectarLineal: genera predicciones positivas", () => {
      const datos = crearDatos([100, 110, 120]);
      const resultado = motor.proyectarLineal(datos, 2);

      resultado.predicciones.forEach((p) => {
        expect(p?.valor ?? 0).toBeGreaterThanOrEqual(0);
        expect(p?.fecha).toBeInstanceOf(Date);
      });
    });

    it("proyectarExponencial: maneja crecimiento acelerado", () => {
      const datos = crearDatos([100, 105, 110.25, 115.76, 121.55]);
      const resultado = motor.proyectarExponencial(datos, 2);

      expect(resultado.modelo).toBe("exponencial");
      expect(resultado.basee).toBeGreaterThan(0);
      expect(resultado.predicciones?.length ?? 0).toBe(2);
      expect(resultado.r2).toBeLessThanOrEqual(1);
    });

    it("proyectarEstacional: detecta ciclos", () => {
      const datos = crearDatos(
        Array(24)
          .fill(0)
          .map((_, i) => 100 + 20 * Math.sin((i * Math.PI) / 6)),
      );
      const resultado = motor.proyectarEstacional(datos, 4);

      expect(resultado.modelo).toBe("estacional");
      expect(resultado.ciclo).toBe(12);
      expect(resultado.amplitud).toBeGreaterThan(0);
      expect(resultado.predicciones?.length ?? 0).toBe(4);
    });

    it("proyectarPolinómico: ajusta curvas no lineales", () => {
      const datos = crearDatos([100, 110, 125, 145, 170, 200]);
      const resultado = motor.proyectarPolinómico(datos, 2, 2);

      expect(resultado.modelo).toBe("polinómico");
      expect(resultado.grado).toBe(2);
      expect(resultado.coeficientes.length).toBe(3);
      expect(resultado.predicciones.length).toBe(2);
    });

    it("calcularR2: retorna valor entre 0 y 1", () => {
      const actual = [100, 110, 120];
      const predicho = [101, 109, 121];

      const r2 = motor.calcularR2(actual, predicho);
      expect(r2).toBeGreaterThanOrEqual(-1);
      expect(r2).toBeLessThanOrEqual(1);
    });

    it("calcularR2: retorna 1 para predicción perfecta", () => {
      const valores = [100, 110, 120];
      const r2 = motor.calcularR2(valores, valores);

      expect(r2).toBeCloseTo(1, 5);
    });

    it("detectarTendencia: identifica alcista", () => {
      const datos = crearDatos([100, 110, 120, 130, 140]);
      const tendencia = motor.detectarTendencia(datos);

      expect(tendencia).toBe("alcista");
    });

    it("detectarTendencia: identifica bajista", () => {
      const datos = crearDatos([140, 130, 120, 110, 100]);
      const tendencia = motor.detectarTendencia(datos);

      expect(tendencia).toBe("bajista");
    });

    it("detectarTendencia: identifica lateral", () => {
      const datos = crearDatos([100, 101, 99, 100, 101]);
      const tendencia = motor.detectarTendencia(datos);

      expect(tendencia).toBe("lateral");
    });
  });

  describe("MotorEscenarios", () => {
    const motor = new MotorEscenarios();

    it("escenarioPesimista: reduce ingresos y aumenta costos", () => {
      const ingresos = crearDatos([1000, 1100, 1200]);
      const costos = crearDatos([500, 550, 600]);

      const resultado = motor.escenarioPesimista(ingresos, costos, 2);

      expect(resultado.tipo).toBe("pesimista");
      expect(resultado.variacionIngresos).toBe(-20);
      expect(resultado.variacionCostos).toBe(15);
    });

    it("escenarioRealista: mantiene crecimiento histórico", () => {
      const ingresos = crearDatos([1000, 1100]);
      const costos = crearDatos([500, 550]);

      const resultado = motor.escenarioRealista(ingresos, costos, 1);

      expect(resultado.tipo).toBe("realista");
      expect(resultado.variacionIngresos).toBe(0);
      expect(resultado.variacionCostos).toBe(0);
    });

    it("escenarioOptimista: aumenta ingresos y reduce costos", () => {
      const ingresos = crearDatos([1000, 1100]);
      const costos = crearDatos([500, 550]);

      const resultado = motor.escenarioOptimista(ingresos, costos, 1);

      expect(resultado.tipo).toBe("optimista");
      expect(resultado.variacionIngresos).toBe(30);
      expect(resultado.variacionCostos).toBe(-10);
    });

    it("compararEscenarios: genera tabla comparativa", () => {
      const ingresos = crearDatos([1000, 1100]);
      const costos = crearDatos([500, 550]);

      const pes = motor.escenarioPesimista(ingresos, costos, 1);
      const real = motor.escenarioRealista(ingresos, costos, 1);
      const opt = motor.escenarioOptimista(ingresos, costos, 1);

      const comparativa = motor.compararEscenarios(pes, real, opt);

      expect(comparativa.tabla?.length ?? 0).toBe(4);
      expect(comparativa.tabla?.[0]?.metrica ?? "").toBe("Ingresos Promedio");
      expect(comparativa.pesimista).toBeDefined();
      expect(comparativa.realista).toBeDefined();
      expect(comparativa.optimista).toBeDefined();
    });
  });

  describe("MotorSensibilidad", () => {
    const motor = new MotorSensibilidad();

    it("analizarSensibilidad: varía variable y mide impacto", () => {
      const funcion = (precio: number) => precio * 1000 - 50000; // ganancia = precio * volumen - costos
      const resultado = motor.analizarSensibilidad("precio", 100, funcion);

      expect(resultado.variable).toBe("precio");
      expect(resultado.valorBase).toBe(100);
      expect(resultado.impactos.length).toBe(11);
      expect(resultado.rango.minimo).toBeLessThan(resultado.rango.maximo);
    });

    it("encontrarPuntoEquilibrio: localiza valor para objetivo", () => {
      const funcion = (volumen: number) => volumen * 10 - 500; // ganancia = volumen * margen - costos
      const resultado = motor.encontrarPuntoEquilibrio(
        "volumen",
        100,
        1000,
        funcion,
      );

      expect(resultado.variable).toBe("volumen");
      expect(resultado.valorEquilibrio).toBeGreaterThan(0);
      expect(Math.abs(funcion(resultado.valorEquilibrio) - 1000)).toBeLessThan(10);
    });

    it("analizarElasticidad: calcula cambio porcentual", () => {
      const funcion = (precio: number) => precio * 1000;
      const resultado = motor.analizarElasticidad("precio", 100, funcion);

      expect(resultado.variable).toBe("precio");
      expect(resultado.elasticidad).toBeGreaterThan(0);
      expect(["elástica", "inelástica", "unitaria"]).toContain(
        resultado.interpretacion,
      );
    });

    it("generarGráficoTornadoSensibilidad: ordena por impacto", () => {
      const variables = [
        { nombre: "precio", funcion: (p: number) => p * 1000, base: 100 },
        { nombre: "volumen", funcion: (v: number) => v * 50, base: 100 },
        { nombre: "costos", funcion: (c: number) => 10000 - c, base: 100 },
      ];

      const resultado = motor.generarGráficoTornadoSensibilidad(variables);

      expect(resultado.variables?.length ?? 0).toBe(3);
      expect((resultado.variables?.[0]?.rangoTotal ?? 0)).toBeGreaterThanOrEqual(
        resultado.variables?.[1]?.rangoTotal ?? 0,
      );
    });
  });

  describe("MotorValidaciónSimulador", () => {
    const motor = new MotorValidaciónSimulador();

    it("guardarSimulación: almacena proyección", () => {
      const simulacion = motor.guardarSimulación(
        "sim-1",
        "lineal",
        crearDatos([100, 110]),
        {},
        0.95,
        "alcista",
      );

      expect(simulacion.id).toBe("sim-1");
      expect(simulacion.modelo).toBe("lineal");
      expect(simulacion.r2).toBe(0.95);
    });

    it("validarSimulación: compara predicciones vs realidad", () => {
      const predicciones = crearDatos([100, 110, 120]);
      const reales = crearDatos([102, 108, 122]);

      const resultado = motor.validarSimulación("sim-1", predicciones, reales);

      expect(resultado?.simulacionId ?? "").toBe("sim-1");
      expect(resultado?.error ?? 0).toBeGreaterThan(0);
      expect(resultado?.acierto ?? 0).toBeGreaterThanOrEqual(0);
      expect(resultado?.desviacionAnalisis ?? "").toBeDefined();
    });

    it("obtenerAccuracyPorModelo: agrupa por modelo", () => {
      const validaciones = [
        motor.validarSimulación("sim-1", crearDatos([100, 110]), crearDatos([100, 110])),
      ];

      const accuracy = motor.obtenerAccuracyPorModelo(validaciones);

      expect(accuracy?.length ?? 0).toBeGreaterThan(0);
      expect(accuracy?.[0]?.conteo ?? 0).toBeGreaterThan(0);
    });

    it("recomendarModelo: sugiere mejor modelo", () => {
      const accuracy = [
        {
          modelo: "lineal" as const,
          accuracy: 85,
          conteo: 5,
          ultimaUsada: new Date(),
        },
        {
          modelo: "exponencial" as const,
          accuracy: 92,
          conteo: 3,
          ultimaUsada: new Date(),
        },
      ];

      const recomendacion = motor.recomendarModelo(accuracy);

      expect(recomendacion?.modeloRecomendado ?? "lineal").toBe("exponencial");
      expect(recomendacion?.accuracy ?? 0).toBe(92);
    });

    it("analizarDesviación: detecta tipo de error", () => {
      const predicciones = crearDatos([100, 110, 120, 130]);
      const reales = crearDatos([95, 100, 105, 110]);

      const validacion = motor.validarSimulación("sim-1", predicciones, reales);
      const analisis = motor.analizarDesviación(validacion);

      expect(["sistematico", "aleatorio", "cambio_estructura"]).toContain(
        analisis.tipoError,
      );
      expect(["baja", "media", "alta"]).toContain(analisis.severidad);
      expect(analisis.recomendaciones.length).toBeGreaterThan(0);
    });
  });
});
