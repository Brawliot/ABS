/**
 * Tests RRHH Fase 2: Vacaciones, Beneficios, Integración Contable.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { MotorVacaciones } from "../policies/vacaciones.js";
import { MotorBeneficios, type Nomina } from "../policies/beneficios.js";
import type { TipoBeneficio } from "../elements/beneficios.js";

describe("RRHH Fase 2 — Vacaciones", () => {
  let motor: MotorVacaciones;

  beforeEach(() => {
    motor = new MotorVacaciones();
  });

  it("acumula 15 días de vacaciones anuales", () => {
    motor.acumularDias("emp-001", 2024, 15);
    const disponibles = motor.obtenerDisponibles("emp-001", 2024);

    expect(disponibles.diasTotales).toBe(15);
    expect(disponibles.diasUsados).toBe(0);
    expect(disponibles.diasDisponibles).toBe(15);
  });

  it("rechaza solicitud que excede días disponibles", () => {
    motor.acumularDias("emp-001", 2024, 10);
    const fechaInicio = new Date("2024-01-15");

    expect(() => {
      motor.solicitarVacaciones("emp-001", fechaInicio, 20);
    }).toThrow("excede");
  });

  it("crea solicitud válida de vacaciones", () => {
    motor.acumularDias("emp-001", 2024, 15);
    const fechaInicio = new Date("2024-01-15");

    const solicitud = motor.solicitarVacaciones("emp-001", fechaInicio, 5);

    expect(solicitud.diasSolicitados).toBe(5);
    expect(solicitud.estado).toBe("pendiente");
    expect(solicitud.empleadoId).toBe("emp-001");
  });

  it("aprueba solicitud y actualiza disponibles", () => {
    motor.acumularDias("emp-001", 2024, 15);
    const fechaInicio = new Date("2024-01-15");
    const solicitud = motor.solicitarVacaciones("emp-001", fechaInicio, 5);

    motor.aprobarSolicitud(solicitud.id, "gerente-001");
    const solicitudAprobada = motor.obtenerSolicitud(solicitud.id);

    expect(solicitudAprobada.estado).toBe("aprobada");
    expect(solicitudAprobada.aprobadoPor).toBe("gerente-001");

    const disponibles = motor.obtenerDisponibles("emp-001", 2024);
    expect(disponibles.diasUsados).toBe(5);
    expect(disponibles.diasDisponibles).toBe(10);
  });

  it("rechaza solicitudes solapadas", () => {
    motor.acumularDias("emp-001", 2024, 30);
    const fecha1 = new Date("2024-01-15");
    const fecha2 = new Date("2024-01-18");

    const solicitud1 = motor.solicitarVacaciones("emp-001", fecha1, 5);
    motor.aprobarSolicitud(solicitud1.id, "gerente-001");

    expect(() => {
      motor.solicitarVacaciones("emp-001", fecha2, 3);
    }).toThrow("solapa");
  });

  it("rechaza acumulación inexistente", () => {
    expect(() => {
      motor.solicitarVacaciones("emp-001", new Date("2024-01-15"), 5);
    }).toThrow("No hay acumulación");
  });

  it("registra estado correcto en obtenerSolicitud", () => {
    motor.acumularDias("emp-001", 2024, 15);
    const solicitud = motor.solicitarVacaciones(
      "emp-001",
      new Date("2024-01-15"),
      5
    );

    const retrieved = motor.obtenerSolicitud(solicitud.id);
    expect(retrieved.estado).toBe("pendiente");
  });

  it("maneja múltiples empleados independientemente", () => {
    motor.acumularDias("emp-001", 2024, 15);
    motor.acumularDias("emp-002", 2024, 20);

    const disp1 = motor.obtenerDisponibles("emp-001", 2024);
    const disp2 = motor.obtenerDisponibles("emp-002", 2024);

    expect(disp1.diasTotales).toBe(15);
    expect(disp2.diasTotales).toBe(20);
  });

  it("preserva aprobaciones después de múltiples solicitudes", () => {
    motor.acumularDias("emp-001", 2024, 30);
    const fecha1 = new Date("2024-01-15");
    const fecha2 = new Date("2024-02-15");

    const solicitud1 = motor.solicitarVacaciones("emp-001", fecha1, 5);
    const solicitud2 = motor.solicitarVacaciones("emp-001", fecha2, 5);

    motor.aprobarSolicitud(solicitud1.id, "gerente-001");

    const sol1 = motor.obtenerSolicitud(solicitud1.id);
    const sol2 = motor.obtenerSolicitud(solicitud2.id);

    expect(sol1.estado).toBe("aprobada");
    expect(sol2.estado).toBe("pendiente");
  });
});

describe("RRHH Fase 2 — Beneficios", () => {
  let motor: MotorBeneficios;

  beforeEach(() => {
    motor = new MotorBeneficios();
  });

  it("configura beneficio AFP para empleado", () => {
    motor.configurarBeneficio("emp-001", "afp", 10);
    const beneficios = motor.obtenerBeneficios("emp-001");

    expect(beneficios).toHaveLength(1);
    const beneficio = beneficios[0];
    expect(beneficio).toBeDefined();
    if (beneficio) {
      expect(beneficio.tipo).toBe("afp");
      expect(beneficio.valor).toBe(10);
      expect(beneficio.activo).toBe(true);
    }
  });

  it("rechaza beneficio duplicado", () => {
    motor.configurarBeneficio("emp-001", "isapre", 7);

    expect(() => {
      motor.configurarBeneficio("emp-001", "isapre", 8);
    }).toThrow("ya está configurado");
  });

  it("aplica descuentos a nómina según beneficios", () => {
    motor.configurarBeneficio("emp-001", "afp", 10);
    motor.configurarBeneficio("emp-001", "isapre", 7);

    const nomina: Nomina = {
      id: "nom-001",
      empleadoId: "emp-001",
      periodo: new Date("2024-01"),
      salarioBruto: 1000000,
      descuentos: 0,
      salarioNeto: 1000000,
      detalleDescuentos: {},
    };

    const beneficios = motor.obtenerBeneficios("emp-001");
    const nominaActualizada = motor.aplicarAlNomina(nomina, beneficios);

    // 10% AFP = 100,000, 7% ISAPRE = 70,000
    expect(nominaActualizada.detalleDescuentos["afp"]).toBe(100000);
    expect(nominaActualizada.detalleDescuentos["isapre"]).toBe(70000);
    expect(nominaActualizada.descuentos).toBe(170000);
    expect(nominaActualizada.salarioNeto).toBe(830000);
  });

  it("aplica beneficio de bonificación", () => {
    motor.configurarBeneficio("emp-001", "bonificacion", 50000);

    const nomina: Nomina = {
      id: "nom-001",
      empleadoId: "emp-001",
      periodo: new Date("2024-01"),
      salarioBruto: 1000000,
      descuentos: 0,
      salarioNeto: 1000000,
      detalleDescuentos: {},
    };

    const beneficios = motor.obtenerBeneficios("emp-001");
    const nominaActualizada = motor.aplicarAlNomina(nomina, beneficios);

    expect(nominaActualizada.detalleDescuentos["bonificacion"]).toBe(50000);
  });

  it("desactiva beneficio correctamente", () => {
    motor.configurarBeneficio("emp-001", "afp", 10);
    motor.desactivarBeneficio("emp-001", "afp");

    const beneficios = motor.obtenerBeneficios("emp-001");
    const afp = beneficios.find((b) => b.tipo === "afp");

    expect(afp).toBeDefined();
    if (afp) {
      expect(afp.activo).toBe(false);
      expect(afp.hasta).toBeDefined();
    }
  });

  it("rechaza desactivación de beneficio no activo", () => {
    motor.configurarBeneficio("emp-001", "afp", 10);
    motor.desactivarBeneficio("emp-001", "afp");

    expect(() => {
      motor.desactivarBeneficio("emp-001", "afp");
    }).toThrow("no está activo");
  });
});
