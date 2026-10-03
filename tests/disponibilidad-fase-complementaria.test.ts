/**
 * Tests para módulo de Disponibilidad: Recursos, reservas, calendarios,
 * recordatorios y análisis de ocupación.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { MotorDisponibilidad } from "../policies/disponibilidad-motor.js";
import { MotorCalendarios } from "../policies/disponibilidad-calendarios.js";
import { MotorAnálisisOcupación } from "../policies/disponibilidad-analisis.js";
import { SqliteDisponibilidadStore } from "../adapters/sqlite-disponibilidad-store.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("Módulo de Disponibilidad - Fase Complementaria", () => {
  describe("MotorDisponibilidad", () => {
    it("crea recursos", () => {
      const motor = new MotorDisponibilidad();

      const recurso = motor.crearRecurso(
        "Sala de Reuniones A",
        "sala",
        "Sala con proyector",
        "Piso 3"
      );

      expect(recurso.id).toBeTruthy();
      expect(recurso.nombre).toBe("Sala de Reuniones A");
      expect(recurso.disponible).toBe(true);
    });

    it("obtiene disponibilidad de recurso", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const disponibilidad = motor.obtenerDisponibilidad(recurso.id);

      expect(disponibilidad.disponible).toBe(true);
      expect(disponibilidad.porcentajeOcupado).toBe(0);
    });

    it("crea reservas sin conflictos", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

      const resultado = motor.crearReserva(
        recurso.id,
        "cliente-001",
        "Reunión",
        inicio,
        fin,
        "cliente@example.com"
      );

      expect(resultado.exito).toBe(true);
      expect(resultado.reserva).toBeDefined();
      expect(resultado.reserva!.estado).toBe("confirmada");
    });

    it("detecta conflictos de reservas", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const inicio1 = new Date();
      const fin1 = new Date(inicio1.getTime() + 2 * 60 * 60 * 1000);

      motor.crearReserva(recurso.id, "cliente-001", "R1", inicio1, fin1, "email");

      // Intentar solapar
      const inicio2 = new Date(inicio1.getTime() + 60 * 60 * 1000); // 1 hora después del inicio
      const fin2 = new Date(fin1.getTime() + 60 * 60 * 1000);

      const resultado = motor.crearReserva(
        recurso.id,
        "cliente-002",
        "R2",
        inicio2,
        fin2,
        "email"
      );

      expect(resultado.exito).toBe(false);
      expect(resultado.error).toContain("Ya existe una reserva en ese horario");
    });

    it("cancela reservas y registra información", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

      const resultado = motor.crearReserva(
        recurso.id,
        "cliente-001",
        "R1",
        inicio,
        fin,
        "email"
      );
      const reservaId = resultado.reserva!.id;

      const cancelacion = motor.cancelarReserva(reservaId, "Cliente cambió de planes", 5000);

      expect(cancelacion).toBeDefined();
      expect(cancelacion!.razon).toBe("Cliente cambió de planes");
      expect(cancelacion!.reembolso).toBe(5000);
    });

    it("reprograma reservas", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

      const resultado = motor.crearReserva(
        recurso.id,
        "cliente-001",
        "R1",
        inicio,
        fin,
        "email"
      );
      const reservaId = resultado.reserva!.id;

      const nuevoInicio = new Date(inicio.getTime() + 24 * 60 * 60 * 1000); // +1 día
      const nuevoFin = new Date(nuevoInicio.getTime() + 2 * 60 * 60 * 1000);

      const resultadoReprog = motor.reprogramarReserva(
        reservaId,
        nuevoInicio,
        nuevoFin
      );

      expect(resultadoReprog.exito).toBe(true);
      expect(resultadoReprog.reserva!.fechaInicio.getTime()).toBe(
        nuevoInicio.getTime()
      );
    });

    it("sugiere slots disponibles", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const slot = motor.sugerirSlotDisponible(recurso.id, 60);

      expect(slot).toBeDefined();
      expect(slot!.inicio).toBeTruthy();
      expect(slot!.fin).toBeTruthy();
    });

    it("calcula ocupación", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 8 * 60 * 60 * 1000);

      motor.crearReserva(recurso.id, "cliente-001", "R1", inicio, fin, "email");

      const ocupacion = motor.obtenerOcupación(recurso.id);

      expect(ocupacion).toBeGreaterThan(0);
      expect(ocupacion).toBeLessThanOrEqual(100);
    });
  });

  describe("MotorCalendarios", () => {
    it("genera calendario HTML", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

      const { reserva } = motor.crearReserva(
        recurso.id,
        "cliente-001",
        "Reunión importante",
        inicio,
        fin,
        "email"
      );

      const calendario = new MotorCalendarios();
      const html = calendario.generarCalendarioHTML(
        [reserva!],
        inicio.getMonth() + 1,
        inicio.getFullYear()
      );

      expect(html).toContain("calendario");
      expect(html).toContain("table");
      expect(html).toContain("Reunión importante");
    });

    it("exporta a formato iCal", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

      const { reserva } = motor.crearReserva(
        recurso.id,
        "cliente-001",
        "Test Event",
        inicio,
        fin,
        "email"
      );

      const calendario = new MotorCalendarios();
      const ics = calendario.exportarAlCalendarioCliente([reserva!]);

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("END:VCALENDAR");
      expect(ics).toContain("Test Event");
      expect(ics).toContain("VEVENT");
    });

    it("configura recordatorios", () => {
      const calendario = new MotorCalendarios();

      const recordatorio = calendario.configurarRecordatorio("reserva-001", 60);

      expect(recordatorio.id).toBeTruthy();
      expect(recordatorio.tiempoAntes).toBe(60);
      expect(recordatorio.enviado).toBe(false);
    });

    it("obtiene eventos próximos", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

      const { reserva } = motor.crearReserva(
        recurso.id,
        "cliente-001",
        "Próximo evento",
        inicio,
        fin,
        "email"
      );

      const calendario = new MotorCalendarios();
      const eventos = calendario.obtenerEventosProximos([reserva!], 7);

      expect(eventos.length).toBeGreaterThan(0);
      expect(eventos[0]!.titulo).toBe("Próximo evento");
    });
  });

  describe("MotorAnálisisOcupación", () => {
    it("calcula métricas de ocupación", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 4 * 60 * 60 * 1000);

      const { reserva } = motor.crearReserva(
        recurso.id,
        "cliente-001",
        "R1",
        inicio,
        fin,
        "email"
      );

      const analisis = new MotorAnálisisOcupación();
      const metricas = analisis.obtenerMetricasOcupación([reserva!], []);

      expect(metricas.ocupación).toBeGreaterThan(0);
      expect(metricas.cancelaciones).toBe(0);
    });

    it("detecta patrones de ocupación", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const reservas = [];
      for (let i = 0; i < 5; i++) {
        const inicio = new Date();
        inicio.setDate(inicio.getDate() + i);
        inicio.setHours(10, 0, 0, 0);

        const fin = new Date(inicio);
        fin.setHours(12, 0, 0, 0);

        const { reserva } = motor.crearReserva(
          recurso.id,
          "cliente-001",
          `R${i}`,
          inicio,
          fin,
          "email"
        );
        if (reserva) reservas.push(reserva);
      }

      const analisis = new MotorAnálisisOcupación();
      const patrones = analisis.detectarPatronesOcupación(reservas);

      expect(patrones.diaLaborable).toBeTruthy();
      expect(patrones.horasPico.length).toBeGreaterThan(0);
    });

    it("proyecta demanda futura", () => {
      const motor = new MotorDisponibilidad();
      const recurso = motor.crearRecurso("Sala", "sala", "Test", "Piso 1");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

      const { reserva } = motor.crearReserva(
        recurso.id,
        "cliente-001",
        "R1",
        inicio,
        fin,
        "email"
      );

      const analisis = new MotorAnálisisOcupación();
      const proyecciones = analisis.proyectarDemanda([reserva!], 10);

      expect(proyecciones.length).toBe(10);
      expect(proyecciones[0]!.ocupacionEsperada).toBeGreaterThanOrEqual(0);
      expect(proyecciones[0]!.ocupacionEsperada).toBeLessThanOrEqual(100);
    });

    it("sugiere precios dinámicos", () => {
      const analisis = new MotorAnálisisOcupación();

      const preciosAlta = analisis.sugerirPreciosDinámicos(95, 100, 80);
      expect(preciosAlta.factor).toBeGreaterThan(1);

      const preciosBaja = analisis.sugerirPreciosDinámicos(30, 100, 80);
      expect(preciosBaja.factor).toBeLessThan(1);

      const preciosNormales = analisis.sugerirPreciosDinámicos(75, 100, 80);
      expect(preciosNormales.factor).toBeLessThan(1);
      expect(preciosNormales.factor).toBeGreaterThan(0.7);
    });
  });

  describe("SqliteDisponibilidadStore", () => {
    it("almacena y recupera recursos", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-disponibilidad-"));
      dirs.push(dir);
      const store = new SqliteDisponibilidadStore(join(dir, "db.sqlite"));

      const recursoId = store.crearRecurso(
        "Sala A",
        "sala",
        "Descripción",
        "Ubicación",
        20
      );

      const recurso = store.obtenerRecurso(recursoId);

      expect(recurso).toBeDefined();
      expect(recurso!.nombre).toBe("Sala A");
      expect(recurso!.capacidad).toBe(20);

      store.close();
    });

    it("almacena y recupera reservas", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-disponibilidad-"));
      dirs.push(dir);
      const store = new SqliteDisponibilidadStore(join(dir, "db.sqlite"));

      const recursoId = store.crearRecurso("Sala", "sala", "Desc", "Ubicación");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

      const reservaId = store.crearReserva(
        recursoId,
        "cliente-001",
        "Reunión",
        inicio,
        fin,
        "contacto@example.com"
      );

      const reserva = store.obtenerReserva(reservaId);

      expect(reserva).toBeDefined();
      expect(reserva!.titulo).toBe("Reunión");
      expect(reserva!.estado).toBe("confirmada");

      store.close();
    });

    it("registra cancelaciones (append-only)", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-disponibilidad-"));
      dirs.push(dir);
      const store = new SqliteDisponibilidadStore(join(dir, "db.sqlite"));

      const recursoId = store.crearRecurso("Sala", "sala", "Desc", "Ubicación");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

      const reservaId = store.crearReserva(
        recursoId,
        "cliente-001",
        "Reunión",
        inicio,
        fin,
        "contacto@example.com"
      );

      store.registrarCancelación(reservaId, "Cliente cambió de planes", 5000);
      store.registrarCancelación(reservaId, "Segunda cancelación", 2500);

      const cancelaciones = store.obtenerCancelaciones(recursoId);

      expect(cancelaciones.length).toBe(2);
      expect(cancelaciones[0]!.reembolso).toBe(2500); // Más reciente primero
      expect(cancelaciones[1]!.reembolso).toBe(5000);

      store.close();
    });

    it("gestiona recordatorios", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-disponibilidad-"));
      dirs.push(dir);
      const store = new SqliteDisponibilidadStore(join(dir, "db.sqlite"));

      const recursoId = store.crearRecurso("Sala", "sala", "Desc", "Ubicación");

      const inicio = new Date();
      const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);

      const reservaId = store.crearReserva(
        recursoId,
        "cliente-001",
        "Reunión",
        inicio,
        fin,
        "contacto@example.com"
      );

      store.crearRecordatorio(reservaId, 60);
      store.crearRecordatorio(reservaId, 15);

      const recordatorios = store.obtenerRecordatoriosPendientes();

      expect(recordatorios.length).toBe(2);

      store.close();
    });
  });
});
