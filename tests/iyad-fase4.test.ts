/**
 * Tests para I+D - Fase 4B
 * 16+ tests para proyectos, experimentos, MVPs y roll-outs
 */

import { describe, it, expect } from "vitest";
import { MotorProyectosIyD } from "../policies/iyad-motor-proyectos.js";
import { MotorExperimentos } from "../policies/iyad-experimentos.js";
import { MotorIntegración } from "../policies/iyad-integracion-produccion.js";

describe("I+D Fase 4B", () => {
  describe("MotorProyectosIyD", () => {
    const motor = new MotorProyectosIyD();

    it("crearProyecto: crea proyecto inicial", () => {
      const proyecto = motor.crearProyecto(
        "proj-1",
        "Plataforma IA",
        "producto",
        "Desarrollar plataforma de IA",
        ["emp-1", "emp-2"],
        50000,
      );

      expect(proyecto.id).toBe("proj-1");
      expect(proyecto.nombre).toBe("Plataforma IA");
      expect(proyecto.estado).toBe("planificación");
      expect(proyecto.presupuestoEstimado).toBe(50000);
    });

    it("agregarHito: agrega hito con dependencias", () => {
      let proyecto = motor.crearProyecto(
        "proj-1",
        "API",
        "producto",
        "Crear API",
        ["emp-1"],
        30000,
      );

      const hito = {
        id: "hito-1",
        nombre: "Diseño arquitectura",
        fechaEstimada: new Date(2024, 10, 15),
        completado: false,
        dependencias: [],
      };

      proyecto = motor.agregarHito(proyecto, hito);

      expect(proyecto.hitos?.length ?? 0).toBe(1);
      expect(proyecto.hitos?.[0]?.nombre ?? "").toBe("Diseño arquitectura");
    });

    it("registrarTiempoTrabajo: registra horas de empleado", () => {
      let proyecto = motor.crearProyecto(
        "proj-1",
        "API",
        "producto",
        "Crear API",
        ["emp-1"],
        30000,
      );

      proyecto = motor.registrarTiempoTrabajo(
        proyecto,
        "emp-1",
        "Juan Pérez",
        8,
        "Implementar endpoints",
      );

      expect(proyecto.tiempoTrabajo?.length ?? 0).toBe(1);
      expect(proyecto.tiempoTrabajo?.[0]?.horasTrabajadas ?? 0).toBe(8);
    });

    it("registrarGasto: registra gasto en herramientas", () => {
      let proyecto = motor.crearProyecto(
        "proj-1",
        "API",
        "producto",
        "Crear API",
        ["emp-1"],
        30000,
      );

      proyecto = motor.registrarGasto(
        proyecto,
        "herramientas",
        1500,
        "USD",
        "Licencia IDE",
      );

      expect(proyecto.gastos?.length ?? 0).toBe(1);
      expect(proyecto.gastos?.[0]?.monto ?? 0).toBe(1500);
    });

    it("obtenerPresupuestoGastado: calcula costos totales", () => {
      let proyecto = motor.crearProyecto(
        "proj-1",
        "API",
        "producto",
        "Crear API",
        ["emp-1"],
        30000,
      );

      proyecto = motor.registrarTiempoTrabajo(
        proyecto,
        "emp-1",
        "Juan",
        40,
        "Desarrollo",
      );
      proyecto = motor.registrarGasto(
        proyecto,
        "herramientas",
        1000,
        "USD",
        "Licencia",
      );

      const presupuesto = motor.obtenerPresupuestoGastado(proyecto);

      expect(presupuesto.costoHoras).toBe(4000); // 40 horas * 100/hora
      expect(presupuesto.costosDirectos).toBe(1000);
      expect(presupuesto.totalGastado).toBe(5000);
    });

    it("obtenerPresupuestoGastado: detecta sobrecosto", () => {
      let proyecto = motor.crearProyecto(
        "proj-1",
        "API",
        "producto",
        "Crear API",
        ["emp-1"],
        5000, // presupuesto bajo
      );

      proyecto = motor.registrarTiempoTrabajo(
        proyecto,
        "emp-1",
        "Juan",
        100,
        "Desarrollo",
      );

      const presupuesto = motor.obtenerPresupuestoGastado(proyecto);

      expect(presupuesto.totalGastado).toBeGreaterThan(
        presupuesto.presupuestoEstimado,
      );
      expect(presupuesto.sobreCostoEnPorc).toBeGreaterThan(0);
    });

    it("completarHito: marca hito como completado", () => {
      let proyecto = motor.crearProyecto(
        "proj-1",
        "API",
        "producto",
        "Crear API",
        ["emp-1"],
        30000,
      );

      const hito = {
        id: "hito-1",
        nombre: "Diseño",
        fechaEstimada: new Date(2024, 10, 15),
        completado: false,
        dependencias: [],
      };

      proyecto = motor.agregarHito(proyecto, hito);
      proyecto = motor.completarHito(proyecto, "hito-1");

      expect(proyecto.hitos?.[0]?.completado ?? false).toBe(true);
      expect(proyecto.hitos?.[0]?.fechaReal).toBeDefined();
    });

    it("completarProyecto: cierra proyecto con resultado", () => {
      let proyecto = motor.crearProyecto(
        "proj-1",
        "API",
        "producto",
        "Crear API",
        ["emp-1"],
        30000,
      );

      const resultado = {
        éxito: true,
        métrica: "Usuarios activos",
        metrícaValor: 10000,
        metrícaUnidad: "usuarios",
        roi: 3.5,
        aprendizajes: ["IA es importante", "Escalabilidad crítica"],
        recomendación: "Continuar inversión",
      };

      proyecto = motor.completarProyecto(proyecto, resultado);

      expect(proyecto.estado).toBe("completado");
      expect(proyecto.resultado).toBeDefined();
      expect(proyecto.fechaCompletado).toBeDefined();
    });

    it("generarReporteProyecto: genera resumen completo", () => {
      let proyecto = motor.crearProyecto(
        "proj-1",
        "API",
        "producto",
        "Crear API",
        ["emp-1", "emp-2"],
        30000,
      );

      const hito1 = {
        id: "hito-1",
        nombre: "Diseño",
        fechaEstimada: new Date(2024, 10, 15),
        completado: true,
        fechaReal: new Date(2024, 10, 20),
        dependencias: [],
      };

      proyecto = motor.agregarHito(proyecto, hito1);
      proyecto = motor.registrarTiempoTrabajo(
        proyecto,
        "emp-1",
        "Juan",
        40,
        "Desarrollo",
      );
      proyecto = motor.registrarTiempoTrabajo(
        proyecto,
        "emp-2",
        "María",
        30,
        "Testing",
      );

      const reporte = motor.generarReporteProyecto(proyecto);

      expect(reporte.nombre).toBe("API");
      expect(reporte.progreso).toBeGreaterThan(0);
      expect(reporte.presupuesto.totalGastado).toBe(7000);
      expect(reporte.productividad.personas).toBe(2);
    });
  });

  describe("MotorExperimentos", () => {
    const motor = new MotorExperimentos();

    it("crearExperimento: crea experimento A/B", () => {
      const exp = motor.crearExperimento(
        "exp-1",
        "Checkout simplificado",
        "ab",
        "Probar checkout de un paso",
        "Reducir fricción aumenta conversión",
        1000,
        1000,
      );

      expect(exp.id).toBe("exp-1");
      expect(exp.tipo).toBe("ab");
      expect(exp.grupoControl.tamaño).toBe(1000);
      expect(exp.grupoTratamiento.tamaño).toBe(1000);
    });

    it("registrarResultadoExperimento: calcula p-value", () => {
      const exp = motor.crearExperimento(
        "exp-1",
        "Checkout",
        "ab",
        "Test checkout",
        "Hip",
        1000,
        1000,
      );

      const resultado = motor.registrarResultadoExperimento(
        exp,
        0.02, // 2% conversión en control
        0.025, // 2.5% en tratamiento
      );

      expect(resultado.experimentoId).toBe("exp-1");
      expect(resultado.pValue).toBeGreaterThanOrEqual(0);
      expect(resultado.pValue).toBeLessThanOrEqual(1);
      expect(["control", "tratamiento", "empate"]).toContain(resultado.ganador);
    });

    it("registrarResultadoExperimento: detecta ganador significante", () => {
      const exp = motor.crearExperimento(
        "exp-1",
        "Checkout",
        "ab",
        "Test",
        "Hip",
        5000,
        5000,
      );

      // Diferencia grande (10 vs 15, es decir 50% más)
      const resultado = motor.registrarResultadoExperimento(exp, 10, 15);

      // Con diferencia de 50%, debería detectar ganador
      expect(resultado?.porcentajeChange ?? 0).toBeGreaterThan(0);
      expect(resultado?.ganador ?? "empate").not.toBe("control");
    });

    it("calcularTamañoMuestra: retorna n para confianza 95%", () => {
      const n = motor.calcularTamañoMuestra(
        100,
        20,
        120,
        20,
        0.05,
        0.8,
      );

      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(10000);
    });

    it("analizarMultiplesExperimentos: calcula portfolio metrics", () => {
      const exp1 = motor.crearExperimento(
        "exp-1",
        "Test1",
        "ab",
        "Desc",
        "Hip",
        1000,
        1000,
      );
      exp1.fechaFinal = new Date();

      const exp2 = motor.crearExperimento(
        "exp-2",
        "Test2",
        "ab",
        "Desc",
        "Hip",
        1000,
        1000,
      );
      exp2.fechaFinal = new Date();

      const resultado1 = motor.registrarResultadoExperimento(exp1, 100, 120);
      const resultado2 = motor.registrarResultadoExperimento(exp2, 100, 101);

      const portfolio = motor.analizarMultiplesExperimentos(
        [exp1, exp2],
        [resultado1, resultado2],
      );

      expect(portfolio.tasaÉxito).toBeGreaterThanOrEqual(0);
      expect(portfolio.tasaÉxito).toBeLessThanOrEqual(100);
      expect(portfolio.learningRate).toBeGreaterThanOrEqual(0);
      expect(portfolio.impactoPromedio).toBeGreaterThan(0);
    });
  });

  describe("MotorIntegración", () => {
    const motor = new MotorIntegración();

    it("promoverMVPaProducción: comienza rollout 5%", () => {
      const proyecto = {
        id: "proj-1",
        nombre: "MVP Chat",
        tipo: "MVprime" as const,
        estado: "desarrollo" as const,
        objetivo: "Chat IA",
        equipo: ["emp-1"],
        presupuestoEstimado: 10000,
        hitos: [],
        tiempoTrabajo: [],
        gastos: [],
        fechaCreación: new Date(),
      };

      const integracion = motor.promoverMVPaProducción(
        proyecto,
        "chat-ia",
        "Chat IA para usuarios",
      );

      expect(integracion.estadoRollout).toBe("5%");
      expect(integracion.porcentajeActual).toBe(5);
      expect(integracion.featureName).toBe("chat-ia");
      expect(integracion.revertido).toBe(false);
    });

    it("monitorearRollout: avanza de 5% a 25%", () => {
      const proyecto = {
        id: "proj-1",
        nombre: "MVP",
        tipo: "MVprime" as const,
        estado: "desarrollo" as const,
        objetivo: "MVP",
        equipo: ["emp-1"],
        presupuestoEstimado: 10000,
        hitos: [],
        tiempoTrabajo: [],
        gastos: [],
        fechaCreación: new Date(),
      };

      let integracion = motor.promoverMVPaProducción(
        proyecto,
        "feature",
        "Doc",
      );

      integracion = motor.monitorearRollout(
        integracion,
        [{ nombre: "latencia", baseline: 100, actual: 105 }],
        true, // aprobar avance
      );

      expect(integracion.estadoRollout).toBe("25%");
      expect(integracion.porcentajeActual).toBe(25);
    });

    it("monitorearRollout: puede alcanzar 100%", () => {
      const proyecto = {
        id: "proj-1",
        nombre: "MVP",
        tipo: "MVprime" as const,
        estado: "desarrollo" as const,
        objetivo: "MVP",
        equipo: ["emp-1"],
        presupuestoEstimado: 10000,
        hitos: [],
        tiempoTrabajo: [],
        gastos: [],
        fechaCreación: new Date(),
      };

      let integracion = motor.promoverMVPaProducción(
        proyecto,
        "feature",
        "Doc",
      );

      // 5% -> 25%
      integracion = motor.monitorearRollout(integracion, [], true);
      expect(integracion.estadoRollout).toBe("25%");

      // 25% -> 100%
      integracion = motor.monitorearRollout(integracion, [], true);
      expect(integracion.estadoRollout).toBe("100%");
      expect(integracion.porcentajeActual).toBe(100);
    });

    it("revertirCambio: cancela rollout ante falla", () => {
      const proyecto = {
        id: "proj-1",
        nombre: "MVP",
        tipo: "MVprime" as const,
        estado: "desarrollo" as const,
        objetivo: "MVP",
        equipo: ["emp-1"],
        presupuestoEstimado: 10000,
        hitos: [],
        tiempoTrabajo: [],
        gastos: [],
        fechaCreación: new Date(),
      };

      let integracion = motor.promoverMVPaProducción(
        proyecto,
        "feature",
        "Doc",
      );

      integracion = motor.monitorearRollout(
        integracion,
        [{ nombre: "latencia", baseline: 100, actual: 500 }],
        true,
      );

      integracion = motor.revertirCambio(integracion, "Latencia crítica");

      expect(integracion.revertido).toBe(true);
      expect(integracion.motivoReversión).toBe("Latencia crítica");
      expect(integracion.estadoRollout).toBe("revertido");
    });

    it("documentarFuncionality: actualiza documentación", () => {
      const proyecto = {
        id: "proj-1",
        nombre: "MVP",
        tipo: "MVprime" as const,
        estado: "desarrollo" as const,
        objetivo: "MVP",
        equipo: ["emp-1"],
        presupuestoEstimado: 10000,
        hitos: [],
        tiempoTrabajo: [],
        gastos: [],
        fechaCreación: new Date(),
      };

      let integracion = motor.promoverMVPaProducción(
        proyecto,
        "feature",
        "Versión 1",
      );

      integracion = motor.documentarFuncionality(integracion, "Versión 2 - mejorada");

      expect(integracion.documentación).toBe("Versión 2 - mejorada");
    });
  });
});
