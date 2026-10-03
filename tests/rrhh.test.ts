/**
 * HR Module Tests - Payroll, Attendance, and Employee Management.
 * Tests run with real data (not mocks).
 */

import { describe, it, expect, beforeEach } from "vitest";
import type {
  Empleado,
  Contrato,
  RegistroAsistencia,
} from "../elements/index.js";
import { MotorNomina } from "../policies/nomina.js";
import { MotorAsistencia } from "../policies/asistencia.js";
import { SqliteNominaStore } from "../adapters/sqlite-nomina-store.js";
import { SqliteAsistenciaStore } from "../adapters/sqlite-asistencia-store.js";
import { RRHHHandler } from "../web/rrhh-handler.js";

// ===== Helpers =====

function crearEmpleado(overrides: Partial<Empleado> = {}): Empleado {
  const base: Empleado = {
    id: `emp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    nombre: overrides.nombre ?? "Juan Pérez",
    rut: overrides.rut ?? "12345678-9",
    email: overrides.email ?? "juan@example.com",
    puesto: overrides.puesto ?? "operario",
    departamento: overrides.departamento ?? "taller",
    estadoContrato: overrides.estadoContrato ?? "activo",
    fechaContratacion:
      overrides.fechaContratacion ?? new Date("2025-01-01"),
    salarioBase: overrides.salarioBase ?? 1500000, // $1.5M CLP in cents
    createdAt: overrides.createdAt ?? new Date(),
  };

  if (overrides.telefono !== undefined) {
    return { ...base, telefono: overrides.telefono };
  }
  return base;
}

function crearContrato(overrides: Partial<Contrato> = {}): Contrato {
  const base: Contrato = {
    id: `con-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    empleadoId: overrides.empleadoId ?? `emp-${Date.now()}`,
    tipo: overrides.tipo ?? "indefinido",
    fechaInicio: overrides.fechaInicio ?? new Date("2025-01-01"),
    salarioBase: overrides.salarioBase ?? 1500000,
    beneficios: overrides.beneficios ?? { afp: 0.1 },
    createdAt: overrides.createdAt ?? new Date(),
  };

  if (overrides.fechaTermino !== undefined) {
    return { ...base, fechaTermino: overrides.fechaTermino };
  }
  return base;
}

function crearRegistro(overrides: Partial<RegistroAsistencia> = {}): RegistroAsistencia {
  const base = {
    id: `reg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    empleadoId: overrides.empleadoId ?? `emp-${Date.now()}`,
    fecha: overrides.fecha ?? new Date(),
    horaEntrada: overrides.horaEntrada ?? "09:00",
    estado: overrides.estado ?? ("asistente" as const),
    createdAt: overrides.createdAt ?? new Date(),
  };

  let result: any = base;

  // Handle horaSalida
  if ("horaSalida" in overrides) {
    if (overrides.horaSalida === undefined) {
      // Don't include it
    } else {
      result.horaSalida = overrides.horaSalida;
    }
  } else {
    result.horaSalida = "17:30";
  }

  // Handle observaciones
  if (overrides.observaciones !== undefined) {
    result.observaciones = overrides.observaciones;
  }

  return result as RegistroAsistencia;
}

function crearRegistros(cantidad: number): RegistroAsistencia[] {
  const registros: RegistroAsistencia[] = [];
  for (let i = 0; i < cantidad; i++) {
    registros.push(
      crearRegistro({
        horaEntrada: "09:00",
        horaSalida: "17:30",
      }),
    );
  }
  return registros;
}

// ===== PAYROLL TESTS =====

describe("RRHH — Nómina", () => {
  let motor: MotorNomina;

  beforeEach(() => {
    motor = new MotorNomina();
  });

  it("calcula nómina correctamente con descuentos legales", () => {
    const empleado = crearEmpleado({ nombre: "Juan" });
    const contrato = crearContrato({
      empleadoId: empleado.id,
      salarioBase: 1500000, // $1.5M
      beneficios: { afp: 0.1 },
    });
    const registros = crearRegistros(22); // 22 days worked

    const nomina = motor.calcularNomina(
      empleado,
      contrato,
      registros,
      "2026-10",
    );

    // Verify structure
    expect(nomina.empleadoId).toBe(empleado.id);
    expect(nomina.periodo).toBe("2026-10");
    expect(nomina.estado).toBe("generada");

    // Verify AFP deduction (10% of 22 days salary)
    expect(nomina.descuentos.afp).toBeGreaterThan(0);
    expect(nomina.descuentos.afp).toBeLessThanOrEqual(nomina.salarioBase);

    // Net must be less than gross
    expect(nomina.salarioNeto).toBeLessThan(nomina.salarioBase);

    // Net must be positive
    expect(nomina.salarioNeto).toBeGreaterThan(0);
  });

  it("calcula descuentos tributarios correctamente", () => {
    const empleado = crearEmpleado();
    const contrato = crearContrato({
      empleadoId: empleado.id,
      salarioBase: 3000000, // $3M - in income tax bracket
    });
    const registros = crearRegistros(22);

    const nomina = motor.calcularNomina(
      empleado,
      contrato,
      registros,
      "2026-10",
    );

    // Should have income tax (renta)
    expect(nomina.descuentos.impuestoRenta).toBeGreaterThan(0);
  });

  it("calcula horas trabajadas correctamente", () => {
    const empleado = crearEmpleado();
    const contrato = crearContrato({ empleadoId: empleado.id });

    // 8 hours per day for 10 days = 80 hours
    const registros = Array(10)
      .fill(null)
      .map(() =>
        crearRegistro({
          horaEntrada: "09:00",
          horaSalida: "17:00", // 8 hours
        }),
      );

    const nomina = motor.calcularNomina(
      empleado,
      contrato,
      registros,
      "2026-10",
    );

    expect(nomina.horasTrabajadas).toBe(80);
  });

  it("maneja medio tiempo correctamente", () => {
    const empleado = crearEmpleado();
    const contrato = crearContrato({ empleadoId: empleado.id });

    // 4 hours per day for 20 days = 80 hours
    const registros = Array(20)
      .fill(null)
      .map(() =>
        crearRegistro({
          horaEntrada: "09:00",
          horaSalida: "13:00", // 4 hours
        }),
      );

    const nomina = motor.calcularNomina(
      empleado,
      contrato,
      registros,
      "2026-10",
    );

    expect(nomina.horasTrabajadas).toBe(80);
  });

  it("no calcula horas para registro sin salida", () => {
    const empleado = crearEmpleado();
    const contrato = crearContrato({ empleadoId: empleado.id });

    const reg1 = crearRegistro({
      horaEntrada: "09:00",
    });
    const reg1NoSalida: RegistroAsistencia = {
      id: reg1.id,
      empleadoId: reg1.empleadoId,
      fecha: reg1.fecha,
      horaEntrada: reg1.horaEntrada,
      estado: reg1.estado,
      createdAt: reg1.createdAt,
    };

    const registros: RegistroAsistencia[] = [
      reg1NoSalida,
      crearRegistro({
        horaEntrada: "10:00",
        horaSalida: "18:00",
      }),
    ];

    const nomina = motor.calcularNomina(
      empleado,
      contrato,
      registros,
      "2026-10",
    );

    // Only one full 8-hour day counts
    expect(nomina.horasTrabajadas).toBe(8);
  });

  it("retorna salario neto positivo o cero", () => {
    const empleado = crearEmpleado();
    const contrato = crearContrato({ empleadoId: empleado.id });
    const registros = crearRegistros(1); // Only 1 day

    const nomina = motor.calcularNomina(
      empleado,
      contrato,
      registros,
      "2026-10",
    );

    expect(nomina.salarioNeto).toBeGreaterThanOrEqual(0);
  });
});

// ===== ATTENDANCE TESTS =====

describe("RRHH — Asistencia", () => {
  let motor: MotorAsistencia;

  beforeEach(() => {
    motor = new MotorAsistencia();
  });

  it("registra entrada correctamente", () => {
    const registro = motor.registrarEntrada("emp-1", new Date(), "09:00");

    expect(registro.empleadoId).toBe("emp-1");
    expect(registro.horaEntrada).toBe("09:00");
    expect(registro.estado).toBe("asistente");
    expect(registro.id).toBeDefined();
  });

  it("registra salida correctamente", () => {
    const entrada = motor.registrarEntrada("emp-1", new Date(), "09:00");
    const salida = motor.registrarSalida(entrada, "17:30");

    expect(salida.horaEntrada).toBe("09:00");
    expect(salida.horaSalida).toBe("17:30");
    expect(salida.estado).toBe("asistente");
  });

  it("registra falta con razón", () => {
    const falta = motor.registrarFalta(
      "emp-1",
      new Date(),
      "Enfermedad",
    );

    expect(falta.empleadoId).toBe("emp-1");
    expect(falta.estado).toBe("ausente");
    expect(falta.horaEntrada).toBe("--:--");
    expect(falta.observaciones).toBe("Enfermedad");
  });

  it("registra licencia", () => {
    const licencia = motor.registrarLicencia(
      "emp-1",
      new Date(),
      "Licencia médica",
    );

    expect(licencia.estado).toBe("licencia");
    expect(licencia.observaciones).toBe("Licencia médica");
  });

  it("genera reporte de asistencia correctamente", () => {
    const registros = [
      crearRegistro({ estado: "asistente" }),
      crearRegistro({ estado: "asistente" }),
      crearRegistro({ estado: "ausente" }),
      crearRegistro({ estado: "licencia" }),
    ];

    const reporte = motor.generarReporteAsistencia(registros, "2026-10");

    expect(reporte.asistencias).toBe(2);
    expect(reporte.faltas).toBe(1);
    expect(reporte.licencias).toBe(1);
    expect(reporte.porcentajeAsistencia).toBe(50);
  });

  it("calcula 100% asistencia cuando todos asisten", () => {
    const registros = [
      crearRegistro({ estado: "asistente" }),
      crearRegistro({ estado: "asistente" }),
      crearRegistro({ estado: "asistente" }),
    ];

    const reporte = motor.generarReporteAsistencia(registros, "2026-10");

    expect(reporte.asistencias).toBe(3);
    expect(reporte.porcentajeAsistencia).toBe(100);
  });

  it("maneja reporte vacío correctamente", () => {
    const reporte = motor.generarReporteAsistencia([], "2026-10");

    expect(reporte.asistencias).toBe(0);
    expect(reporte.faltas).toBe(0);
    expect(reporte.licencias).toBe(0);
    expect(reporte.porcentajeAsistencia).toBe(0);
  });
});

// ===== STORAGE TESTS =====

describe("RRHH — Almacenamiento", () => {
  it("guarda y recupera nóminas sin corrupción", async () => {
    const store = new SqliteNominaStore(":memory:");

    const nomina = {
      id: "nomina-1",
      empleadoId: "emp-1",
      periodo: "2026-10",
      salarioBase: 1500000,
      horasTrabajadas: 160,
      descuentos: {
        afp: 150000,
        isapre: 0,
        impuestoRenta: 0,
        otros: 0,
      },
      bonificaciones: 0,
      salarioNeto: 1350000,
      estado: "generada" as const,
      createdAt: new Date(),
    };

    await store.guardarNomina(nomina);
    const recuperadas = await store.obtenerNominasPorPeriodo("2026-10");

    expect(recuperadas).toHaveLength(1);
    const recuperada = recuperadas[0];
    if (recuperada) {
      expect(recuperada.id).toBe(nomina.id);
      expect(recuperada.empleadoId).toBe(nomina.empleadoId);
      expect(recuperada.salarioNeto).toBe(nomina.salarioNeto);
    }

    store.close();
  });

  it("previene duplicados en nómina (único empleado-período)", async () => {
    const store = new SqliteNominaStore(":memory:");

    const nomina1 = {
      id: "nomina-1",
      empleadoId: "emp-1",
      periodo: "2026-10",
      salarioBase: 1500000,
      horasTrabajadas: 160,
      descuentos: {
        afp: 150000,
        isapre: 0,
        impuestoRenta: 0,
        otros: 0,
      },
      bonificaciones: 0,
      salarioNeto: 1350000,
      estado: "generada" as const,
      createdAt: new Date(),
    };

    const nomina2 = {
      ...nomina1,
      id: "nomina-2",
    };

    await store.guardarNomina(nomina1);

    try {
      await store.guardarNomina(nomina2);
      expect(true).toBe(false); // Should throw
    } catch (e) {
      expect((e as Error).message).toContain("already exists");
    }

    store.close();
  });

  it("guarda y recupera registros de asistencia", async () => {
    const store = new SqliteAsistenciaStore(":memory:");

    const registro = crearRegistro({
      empleadoId: "emp-1",
      fecha: new Date("2026-10-01"),
    });

    await store.guardarRegistro(registro);
    const recuperados = await store.obtenerRegistrosPorEmpleado("emp-1");

    expect(recuperados).toHaveLength(1);
    const recuperado = recuperados[0];
    if (recuperado) {
      expect(recuperado.id).toBe(registro.id);
      expect(recuperado.horaEntrada).toBe(registro.horaEntrada);
    }

    store.close();
  });

  it("actualiza registro de asistencia con salida", async () => {
    const store = new SqliteAsistenciaStore(":memory:");

    const temp = crearRegistro({
      empleadoId: "emp-1",
    });
    const registroInicial: RegistroAsistencia = {
      id: temp.id,
      empleadoId: temp.empleadoId,
      fecha: temp.fecha,
      horaEntrada: temp.horaEntrada,
      estado: temp.estado,
      createdAt: temp.createdAt,
    };

    await store.guardarRegistro(registroInicial);

    const registroActualizado = {
      ...registroInicial,
      horaSalida: "17:30",
    };

    await store.actualizarRegistro(registroActualizado);
    const recuperado = await store.obtenerRegistroPorId(registroInicial.id);

    expect(recuperado?.horaSalida).toBe("17:30");

    store.close();
  });
});

// ===== HANDLER TESTS =====

describe("RRHH — Handler Business Logic", () => {
  let handler: RRHHHandler;

  beforeEach(() => {
    handler = new RRHHHandler(":memory:");
  });

  it("crea y recupera empleados", async () => {
    const empleado = crearEmpleado({ nombre: "María" });
    await handler.crearEmpleado(empleado);

    const recuperado = await handler.obtenerEmpleado(empleado.id);
    expect(recuperado).toBeTruthy();
    expect(recuperado?.nombre).toBe("María");
  });

  it("crea contratos y obtiene activos", async () => {
    const empleado = crearEmpleado();
    const contrato = crearContrato({ empleadoId: empleado.id });

    await handler.crearEmpleado(empleado);
    await handler.crearContrato(contrato);

    const activo = await handler.obtenerContratoActivo(empleado.id);
    expect(activo).toBeTruthy();
    expect(activo?.id).toBe(contrato.id);
  });

  it("registra entrada y salida de empleado", async () => {
    const empleado = crearEmpleado();
    await handler.crearEmpleado(empleado);

    const entrada = await handler.registrarEntradaEmpleado(
      empleado.id,
      "09:00",
    );
    expect(entrada.horaEntrada).toBe("09:00");

    const salida = await handler.registrarSalidaEmpleado(empleado.id, "17:30");
    expect(salida).toBeTruthy();
    if (salida) {
      expect(salida.horaSalida).toBe("17:30");
    }
  });

  it("registra faltas", async () => {
    const empleado = crearEmpleado();
    await handler.crearEmpleado(empleado);

    const falta = await handler.registrarFalta(
      empleado.id,
      new Date(),
      "Enfermedad",
    );
    expect(falta.estado).toBe("ausente");
  });

  it("genera nómina del mes para empleados activos", async () => {
    const empleado = crearEmpleado({ estadoContrato: "activo" });
    const contrato = crearContrato({ empleadoId: empleado.id });

    await handler.crearEmpleado(empleado);
    await handler.crearContrato(contrato);

    // Add some attendance records
    for (let i = 0; i < 22; i++) {
      const fecha = new Date(2026, 9, i + 1); // Oct 2026
      await handler.registrarEntradaEmpleado(empleado.id, "09:00");
      await handler.registrarSalidaEmpleado(empleado.id, "17:30");
    }

    const nominas = await handler.generarNominaDelMes("2026-10");

    expect(nominas.length).toBeGreaterThan(0);
    const nomina = nominas[0];
    if (nomina) {
      expect(nomina.periodo).toBe("2026-10");
      expect(nomina.salarioNeto).toBeGreaterThan(0);
    }
  });

  it("obtiene reporte mensual", async () => {
    const empleado = crearEmpleado();
    const contrato = crearContrato({ empleadoId: empleado.id });

    await handler.crearEmpleado(empleado);
    await handler.crearContrato(contrato);

    // Create payroll
    for (let i = 0; i < 22; i++) {
      await handler.registrarEntradaEmpleado(empleado.id, "09:00");
      await handler.registrarSalidaEmpleado(empleado.id, "17:30");
    }

    await handler.generarNominaDelMes("2026-10");
    const reporte = await handler.obtenerReporteMensual("2026-10");

    expect(reporte.nominasGeneradas).toBeGreaterThan(0);
    expect(reporte.sumaTotal).toBeGreaterThan(0);
    expect(reporte.promedioSalario).toBeGreaterThan(0);
  });

  it("obtiene reporte de asistencia", async () => {
    const empleado = crearEmpleado();
    await handler.crearEmpleado(empleado);

    // Register some attendance
    for (let i = 0; i < 20; i++) {
      await handler.registrarEntradaEmpleado(empleado.id, "09:00");
      await handler.registrarSalidaEmpleado(empleado.id, "17:30");
    }

    // Register some absences
    for (let i = 0; i < 2; i++) {
      await handler.registrarFalta(empleado.id, new Date(), "Enfermedad");
    }

    const reporte = await handler.obtenerReporteAsistencia(
      empleado.id,
      "2026-10",
    );

    expect(reporte.asistencias).toBeGreaterThan(0);
    expect(reporte.faltas).toBeGreaterThan(0);
  });

  it("cierra recursos correctamente", () => {
    expect(() => handler.close()).not.toThrow();
  });
});
