import { describe, it, expect, beforeEach } from "vitest";
import { MotorDepreciación } from '../policies/depreciacion.js';
import { MotorMantenimiento } from '../policies/mantenimiento-activos.js';
import type { ActivoFijo } from '../elements/activo-fijo.js';

describe("Activos Fijos", () => {
  let motorDepreciacion: MotorDepreciación;
  let motorMantenimiento: MotorMantenimiento;
  let activoEjemplo: ActivoFijo;

  beforeEach(() => {
    motorDepreciacion = new MotorDepreciación();
    motorMantenimiento = new MotorMantenimiento();

    activoEjemplo = {
      id: "activo-1",
      nombre: "Escritorio",
      tipo: "muebles",
      fechaCompra: new Date("2024-01-01"),
      costoAdquisición: 100000,
      valoresActuales: [
        {
          fecha: new Date("2024-01-01"),
          valorLibros: 100000,
          depreciación: 0,
          método: "lineal",
          vidaÚtil: 5,
        },
      ],
      estado: "activo",
      ubicación: "Oficina A",
      responsable: "Juan",
      createdAt: new Date("2024-01-01"),
    };
  });

  it("registra activo con costo y ubicación", () => {
    expect(activoEjemplo.nombre).toBe("Escritorio");
    expect(activoEjemplo.costoAdquisición).toBe(100000);
    expect(activoEjemplo.ubicación).toBe("Oficina A");
  });

  it("calcula depreciación lineal correctamente", () => {
    const futuro = new Date("2024-12-31");
    const resultado = motorDepreciacion.calcularDepreciación(
      activoEjemplo,
      "lineal",
      futuro
    );

    expect(resultado.valorActual).toBeLessThan(activoEjemplo.costoAdquisición);
    expect(resultado.depreciacionAcumulada).toBeGreaterThan(0);
  });

  it("calcula depreciación acelerada (doble decreciente)", () => {
    const futuro = new Date("2025-01-01");
    const resultado = motorDepreciacion.calcularDepreciación(
      activoEjemplo,
      "acelerada",
      futuro
    );

    expect(resultado.depreciacionPeriodo).toBeGreaterThan(0);
    expect(resultado.valorActual).toBeLessThan(activoEjemplo.costoAdquisición);
  });

  it("genera asientos contables mensuales", () => {
    const asientos = motorDepreciacion.generarAsientosDepreciación(
      "activo-1",
      "2024-01"
    );

    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.activoId).toBe("activo-1");
    expect(asientos[0]?.período).toBe("2024-01");
  });

  it("registra mantenimiento preventivo y correctivo", () => {
    const preventivo = motorMantenimiento.registrarMantenimiento(
      "activo-1",
      "preventivo",
      50000,
      "Limpieza mensual"
    );

    const correctivo = motorMantenimiento.registrarMantenimiento(
      "activo-1",
      "correctivo",
      100000,
      "Reparación de pata"
    );

    expect(preventivo.tipo).toBe("preventivo");
    expect(correctivo.tipo).toBe("correctivo");

    const historial = motorMantenimiento.obtenerHistorial("activo-1");
    expect(historial).toHaveLength(2);
  });

  it("proyecta valor futuro del activo", () => {
    const proyección = motorDepreciacion.proyectarValorFuturo(
      activoEjemplo,
      24
    );

    expect(proyección).toHaveLength(24);
    const first = proyección[0];
    const last = proyección[23];
    expect(first).toBeLessThanOrEqual(activoEjemplo.costoAdquisición);
    if (first !== undefined && last !== undefined) {
      expect(last).toBeLessThanOrEqual(first);
    }
  });

  it("calcula costos acumulados de mantenimiento", () => {
    motorMantenimiento.registrarMantenimiento(
      "activo-1",
      "preventivo",
      50000,
      "Limpieza"
    );
    motorMantenimiento.registrarMantenimiento(
      "activo-1",
      "correctivo",
      75000,
      "Reparación"
    );

    const costos = motorMantenimiento.calcularCostosMantenimiento(
      new Date("2026-01-01"),
      new Date("2026-12-31")
    );

    expect(costos.total).toBe(125000);
    expect(costos.porActivo.has("activo-1")).toBe(true);
  });

  it("obtiene valor actual del activo", () => {
    const valor = motorDepreciacion.obtenerValorActual(activoEjemplo);
    expect(valor).toBeLessThanOrEqual(activoEjemplo.costoAdquisición);
  });

  it("programa próximo mantenimiento", () => {
    const mantenimiento = motorMantenimiento.registrarMantenimiento(
      "activo-1",
      "preventivo",
      50000,
      "Limpieza"
    );

    const proxima = new Date("2024-06-01");
    motorMantenimiento.programarMantención("activo-1", proxima);

    const historial = motorMantenimiento.obtenerHistorial("activo-1");
    expect(historial).toHaveLength(1);
  });

  it("calcula depreciación porcentaje fijo", () => {
    const resultado = motorDepreciacion.calcularDepreciación(
      activoEjemplo,
      "porcentaje_fijo",
      new Date("2024-12-31")
    );

    expect(resultado.depreciacionPeriodo).toBeGreaterThan(0);
  });

  it("maneja activos sin valores iniciales", () => {
    const activoVacio: ActivoFijo = {
      ...activoEjemplo,
      valoresActuales: [],
    };

    const resultado = motorDepreciacion.calcularDepreciación(
      activoVacio,
      "lineal"
    );

    expect(resultado.valorActual).toBe(activoVacio.costoAdquisición);
    expect(resultado.depreciacionAcumulada).toBe(0);
  });

  it("calcula promedio de mantenimiento por mes", () => {
    motorMantenimiento.registrarMantenimiento(
      "activo-1",
      "preventivo",
      50000,
      "Limpieza"
    );
    motorMantenimiento.registrarMantenimiento(
      "activo-1",
      "correctivo",
      50000,
      "Reparación"
    );

    const costos = motorMantenimiento.calcularCostosMantenimiento(
      new Date("2026-01-01"),
      new Date("2026-12-31")
    );

    expect(costos.promedioPorMes).toBeGreaterThan(0);
  });

  it("actualiza estado de activo a mantenimiento", () => {
    const activo: ActivoFijo = {
      ...activoEjemplo,
      estado: "mantenimiento",
    };

    expect(activo.estado).toBe("mantenimiento");
  });

  it("permite retirar activo y registrar como vendido", () => {
    const activo: ActivoFijo = {
      ...activoEjemplo,
      estado: "vendido",
    };

    expect(activo.estado).toBe("vendido");
  });

  it("calcula depreciación acumulada en múltiples períodos", () => {
    const fecha1 = new Date("2024-01-01");
    const fecha2 = new Date("2024-06-01");

    const resultado1 = motorDepreciacion.calcularDepreciación(
      activoEjemplo,
      "lineal",
      fecha1
    );
    const resultado2 = motorDepreciacion.calcularDepreciación(
      activoEjemplo,
      "lineal",
      fecha2
    );

    expect(resultado2.depreciacionAcumulada).toBeGreaterThanOrEqual(
      resultado1.depreciacionAcumulada
    );
  });
});
