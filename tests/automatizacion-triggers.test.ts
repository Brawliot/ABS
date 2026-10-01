/**
 * Tests Automatización: Triggers, evaluación, ejecución de acciones.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { MotorTriggers } from "../policies/triggers.js";

describe("Automatización — Triggers", () => {
  let motor: MotorTriggers;

  beforeEach(() => {
    motor = new MotorTriggers();
  });

  it("crea trigger con datos válidos", () => {
    const trigger = motor.crearTrigger(
      "Factura automática",
      "evento",
      "estado = 'completado'",
      "facturar"
    );

    expect(trigger.nombre).toBe("Factura automática");
    expect(trigger.tipo).toBe("evento");
    expect(trigger.activo).toBe(true);
    expect(trigger.id).toBeDefined();
  });

  it("evalúa condición simple correctamente", () => {
    motor.crearTrigger(
      "Factura automática",
      "evento",
      "estado = 'completado'",
      "facturar"
    );

    const evento = { estado: "completado" };
    const acciones = motor.evaluarTriggers(evento);

    expect(acciones).toContain("facturar");
  });

  it("no evalúa condición si no coincide", () => {
    motor.crearTrigger(
      "Factura automática",
      "evento",
      "estado = 'completado'",
      "facturar"
    );

    const evento = { estado: "pendiente" };
    const acciones = motor.evaluarTriggers(evento);

    expect(acciones).not.toContain("facturar");
  });

  it("ejecuta acción de facturación", () => {
    const resultado = motor.ejecutarAccion("facturar", { id: "exp-001" });

    expect(resultado.ok).toBe(true);
    expect(resultado.resultado).toBeDefined();
    if (resultado.resultado) {
      expect((resultado.resultado as any).tipoAccion).toBe("factura");
    }
  });

  it("ejecuta acción de notificación", () => {
    const resultado = motor.ejecutarAccion("notificar", { cliente: "cli-001" });

    expect(resultado.ok).toBe(true);
    expect(resultado.resultado).toBeDefined();
    if (resultado.resultado) {
      expect((resultado.resultado as any).tipoAccion).toBe("notificacion");
    }
  });

  it("registra evento exitoso", () => {
    const trigger = motor.crearTrigger(
      "Test",
      "evento",
      "estado = 'test'",
      "notificar"
    );

    const evento = motor.registrarEvento(
      trigger.id,
      "exp-001",
      "exitoso"
    );

    expect(evento.resultado).toBe("exitoso");
    expect(evento.triggerId).toBe(trigger.id);
    expect(evento.expedienteId).toBe("exp-001");
  });

  it("evalúa múltiples triggers en un evento", () => {
    motor.crearTrigger(
      "Factura automática",
      "evento",
      "estado = 'completado'",
      "facturar"
    );
    motor.crearTrigger(
      "Reporte automático",
      "evento",
      "estado = 'completado'",
      "exportar_reporte"
    );

    const evento = { estado: "completado" };
    const acciones = motor.evaluarTriggers(evento);

    expect(acciones).toHaveLength(2);
    expect(acciones).toContain("facturar");
    expect(acciones).toContain("exportar_reporte");
  });

  it("desactiva trigger correctamente", () => {
    const trigger = motor.crearTrigger(
      "Test",
      "evento",
      "estado = 'test'",
      "notificar"
    );

    motor.desactivarTrigger(trigger.id);
    const evento = { estado: "test" };
    const acciones = motor.evaluarTriggers(evento);

    expect(acciones).toHaveLength(0);
  });

  it("lista todos los triggers", () => {
    motor.crearTrigger(
      "Trigger 1",
      "evento",
      "estado = 'test1'",
      "facturar"
    );
    motor.crearTrigger(
      "Trigger 2",
      "evento",
      "estado = 'test2'",
      "notificar"
    );

    const triggers = motor.listarTriggers();

    expect(triggers).toHaveLength(2);
    const trig1 = triggers[0];
    const trig2 = triggers[1];
    expect(trig1).toBeDefined();
    expect(trig2).toBeDefined();
    if (trig1 && trig2) {
      expect(trig1.nombre).toBe("Trigger 1");
      expect(trig2.nombre).toBe("Trigger 2");
    }
  });

  it("lista eventos por trigger", () => {
    const trigger = motor.crearTrigger(
      "Test",
      "evento",
      "estado = 'test'",
      "notificar"
    );

    motor.registrarEvento(trigger.id, "exp-001", "exitoso");
    motor.registrarEvento(trigger.id, "exp-002", "exitoso");

    const eventos = motor.listarEventosPorTrigger(trigger.id);

    expect(eventos).toHaveLength(2);
    const evt0 = eventos[0];
    const evt1 = eventos[1];
    expect(evt0).toBeDefined();
    expect(evt1).toBeDefined();
    if (evt0 && evt1) {
      expect(evt0.expedienteId).toBe("exp-001");
      expect(evt1.expedienteId).toBe("exp-002");
    }
  });

  it("obtiene trigger por ID", () => {
    const creado = motor.crearTrigger(
      "Test",
      "evento",
      "estado = 'test'",
      "notificar"
    );

    const obtenido = motor.obtenerTrigger(creado.id);

    expect(obtenido).toBeDefined();
    if (obtenido) {
      expect(obtenido.id).toBe(creado.id);
      expect(obtenido.nombre).toBe("Test");
    }
  });

  it("rechaza desactivación de trigger inexistente", () => {
    expect(() => {
      motor.desactivarTrigger("trigger-inexistente");
    }).toThrow("no existe");
  });
});
