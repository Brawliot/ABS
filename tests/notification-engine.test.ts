/**
 * Tests del motor de notificaciones.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MotorNotificaciones } from "../communication/notification-engine.js";
import { SqliteNotificationRulesStore } from "../adapters/sqlite-notification-rules-store.js";

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

describe("Motor de Notificaciones", () => {
  it("carga reglas por negocio", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-notif-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificationRulesStore(dbPath);
    store.crearRegla("n02-panaderia", {
      evento: "expediente_cerrado",
      canales: ["email", "sms"],
      destinatario: "cliente",
      plantilla: "venta-confirmada",
      condicion: "estado === 'aceptado'",
    });

    const reglas = store.cargarReglasDe("n02-panaderia");
    expect(reglas).toHaveLength(1);
    expect(reglas[0]?.evento).toBe("expediente_cerrado");
    expect(reglas[0]?.canales).toContain("email");
    expect(reglas[0]?.canales).toContain("sms");
    store.close();
  });

  it("procesa evento y encuentra reglas coincidentes", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-notif-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificationRulesStore(dbPath);
    store.crearRegla("n02-panaderia", {
      evento: "expediente_cerrado",
      canales: ["email"],
      destinatario: "cliente",
      plantilla: "venta-confirmada",
    });

    const motor = new MotorNotificaciones(store);
    const resultado = motor.procesarEvento({
      subjectId: "transaccion_123",
      negocioId: "n02-panaderia",
      evento: "expediente_cerrado",
      estado: "aceptado",
      datos: {
        clienteContacto: "cliente@example.com",
      },
    });

    expect(resultado.notificaciones).toHaveLength(1);
    expect(resultado.notificaciones[0]?.canal).toBe("email");
    expect(resultado.notificaciones[0]?.contacto).toBe("cliente@example.com");
    store.close();
  });

  it("evalúa condiciones correctamente", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-notif-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificationRulesStore(dbPath);
    store.crearRegla("n02-panaderia", {
      evento: "pago_registrado",
      canales: ["sms"],
      destinatario: "empresario",
      plantilla: "pago-recibido",
      condicion: "estado === 'completado'",
    });

    const motor = new MotorNotificaciones(store);

    const resultadoCompleto = motor.procesarEvento({
      subjectId: "pago_123",
      negocioId: "n02-panaderia",
      evento: "pago_registrado",
      estado: "completado",
      datos: { empresarioContacto: "+34666555444" },
    });

    expect(resultadoCompleto.notificaciones).toHaveLength(1);

    const resultadoPendiente = motor.procesarEvento({
      subjectId: "pago_124",
      negocioId: "n02-panaderia",
      evento: "pago_registrado",
      estado: "pendiente",
      datos: { empresarioContacto: "+34666555444" },
    });

    expect(resultadoPendiente?.notificaciones).toHaveLength(0);
    store.close();
  });

  it("crea notificaciones para ambos destinatarios", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-notif-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificationRulesStore(dbPath);
    store.crearRegla("n02-panaderia", {
      evento: "expediente_cerrado",
      canales: ["email"],
      destinatario: "ambos",
      plantilla: "cierre-notificacion",
    });

    const motor = new MotorNotificaciones(store);
    const resultado = motor.procesarEvento({
      subjectId: "transaccion_125",
      negocioId: "n02-panaderia",
      evento: "expediente_cerrado",
      datos: {
        clienteContacto: "cliente@example.com",
        empresarioContacto: "empresa@example.com",
      },
    });

    expect(resultado.notificaciones).toHaveLength(2);
    expect(resultado.notificaciones[0]?.contacto).toBe("cliente@example.com");
    expect(resultado.notificaciones[1]?.contacto).toBe("empresa@example.com");
    store.close();
  });
});
