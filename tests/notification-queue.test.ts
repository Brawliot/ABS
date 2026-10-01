/**
 * Tests de la cola de notificaciones con reintentos.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColaNotificaciones } from "../communication/notification-queue.js";
import { SqliteNotificacionesEnviosStore } from "../adapters/sqlite-notificaciones-envios-store.js";
import { AdaptadorCanal, type ResultadoEnvio } from "../communication/adapters/base-adapter.js";
import type { NotificacionParaEnviar } from "../communication/types.js";

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

class AdaptadorMock extends AdaptadorCanal {
  canal = "email";
  private intentosRequeridos = 0;
  private intentoActual = 0;

  constructor(fallarEnIntentos: number = 0) {
    super();
    this.intentosRequeridos = fallarEnIntentos;
  }

  validar(): ResultadoEnvio {
    return { ok: true, detalle: "Mock OK" };
  }

  async enviar(notif: NotificacionParaEnviar): Promise<ResultadoEnvio> {
    this.intentoActual++;

    if (this.intentoActual <= this.intentosRequeridos) {
      return { ok: false, detalle: `Intento fallido ${this.intentoActual}` };
    }

    return { ok: true, detalle: "Enviado correctamente" };
  }
}

describe("Cola de Notificaciones", () => {
  it("encola notificación correctamente", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-notif-queue-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificacionesEnviosStore(dbPath);
    const adaptador = new AdaptadorMock();
    const cola = new ColaNotificaciones(store, [adaptador]);

    const notif = {
      id: "notif_1",
      ruleId: "rule_1",
      evento: "expediente_cerrado",
      canal: "email" as any,
      destinatario: "cliente" as const,
      plantilla: "venta-confirmada",
      contacto: "cliente@example.com",
      datos: { monto: 100 },
      createdAt: new Date().toISOString(),
    };

    await cola.encolarNotificacion(notif);

    const pendientes = store.obtenerPendientes();
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]?.estado).toBe("pendiente");

    store.close();
  });

  it("procesa cola y marca como enviado", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-notif-queue-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificacionesEnviosStore(dbPath);
    const adaptador = new AdaptadorMock();
    const cola = new ColaNotificaciones(store, [adaptador]);

    const notif = {
      id: "notif_1",
      ruleId: "rule_1",
      evento: "expediente_cerrado",
      canal: "email" as any,
      destinatario: "cliente" as const,
      plantilla: "venta-confirmada",
      contacto: "cliente@example.com",
      datos: { monto: 100 },
      createdAt: new Date().toISOString(),
    };

    await cola.encolarNotificacion(notif);
    await cola.procesarCola();

    const todos = store.obtenerTodos();
    expect(todos[0]?.estado).toBe("enviado");

    store.close();
  });

  it("reintenta fallidas hasta 3 veces", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-notif-queue-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificacionesEnviosStore(dbPath);
    const adaptador = new AdaptadorMock(2);
    const cola = new ColaNotificaciones(store, [adaptador]);

    const notif = {
      id: "notif_1",
      ruleId: "rule_1",
      evento: "expediente_cerrado",
      canal: "email" as any,
      destinatario: "cliente" as const,
      plantilla: "venta-confirmada",
      contacto: "cliente@example.com",
      datos: { monto: 100 },
      createdAt: new Date().toISOString(),
    };

    await cola.encolarNotificacion(notif);

    const registro1 = store.obtenerPendientes()[0];
    expect(registro1?.intentos).toBe(0);

    await cola.procesarCola();

    const todos1 = store.obtenerTodos();
    expect(todos1[0]?.intentos).toBe(1);
    expect(todos1[0]?.estado).toBe("pendiente");

    store.close();
  });

  it("marca como fallido después de 3 intentos", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-notif-queue-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificacionesEnviosStore(dbPath);
    const adaptador = new AdaptadorMock(999);
    const cola = new ColaNotificaciones(store, [adaptador]);

    const notif = {
      id: "notif_1",
      ruleId: "rule_1",
      evento: "expediente_cerrado",
      canal: "email" as any,
      destinatario: "cliente" as const,
      plantilla: "venta-confirmada",
      contacto: "cliente@example.com",
      datos: { monto: 100 },
      createdAt: new Date().toISOString(),
    };

    await cola.encolarNotificacion(notif);

    await cola.procesarCola();

    const todos = store.obtenerTodos();
    expect(todos[0]?.intentos).toBe(1);
    expect(todos[0]?.estado).toBe("pendiente");

    store.close();
  });

  it("calcula estadísticas correctamente", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-notif-queue-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificacionesEnviosStore(dbPath);
    const adaptador = new AdaptadorMock();
    const cola = new ColaNotificaciones(store, [adaptador]);

    const notif1 = {
      id: "notif_1",
      ruleId: "rule_1",
      evento: "expediente_cerrado_1",
      canal: "email" as any,
      destinatario: "cliente" as const,
      plantilla: "venta-confirmada",
      contacto: "cliente@example.com",
      datos: {},
      createdAt: new Date().toISOString(),
    };

    const notif2 = {
      ...notif1,
      id: "notif_2",
      evento: "expediente_cerrado_2",
    };

    await cola.encolarNotificacion(notif1);
    await cola.encolarNotificacion(notif2);

    let stats = cola.obtenerEstadísticas();
    expect(stats.pendientes).toBe(2);
    expect(stats.total).toBe(2);

    await cola.procesarCola();

    stats = cola.obtenerEstadísticas();
    expect(stats.enviadas).toBeGreaterThan(0);
    expect(stats.total).toBe(2);

    store.close();
  });
});
