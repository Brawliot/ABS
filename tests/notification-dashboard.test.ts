/**
 * Tests del dashboard de notificaciones.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ColaNotificaciones } from "../communication/notification-queue.js";
import { SqliteNotificacionesEnviosStore } from "../adapters/sqlite-notificaciones-envios-store.js";
import { DashboardEndpoints } from "../communication/dashboard-endpoints.js";
import { renderDashboardNotificacionesHtml } from "../communication/dashboard-page.js";
import type { AdaptadorCanal, ResultadoEnvio } from "../communication/adapters/base-adapter.js";
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

class AdaptadorMock implements AdaptadorCanal {
  canal = "mock";

  validar(): ResultadoEnvio {
    return { ok: true, detalle: "Mock OK" };
  }

  async enviar(notif: NotificacionParaEnviar): Promise<ResultadoEnvio> {
    return { ok: true, detalle: "Enviado" };
  }
}

describe("Dashboard de Notificaciones", () => {
  it("obtiene notificaciones con filtro de estado", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-dashboard-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificacionesEnviosStore(dbPath);
    const adaptador = new AdaptadorMock();
    const cola = new ColaNotificaciones(store, [adaptador]);
    const dashboard = new DashboardEndpoints(store, cola);

    const notif1 = {
      id: "notif_1",
      ruleId: "rule_1",
      evento: "expediente_cerrado",
      canal: "mock",
      destinatario: "cliente" as const,
      plantilla: "venta-confirmada",
      contacto: "cliente@example.com",
      datos: {},
      createdAt: new Date().toISOString(),
    };

    const notif2 = { ...notif1, id: "notif_2", evento: "pago_registrado" };

    await cola.encolarNotificacion(notif1);
    await cola.encolarNotificacion(notif2);
    await cola.procesarCola();

    const querystring = new URLSearchParams("estado=enviado");
    const resultado = dashboard["obtenerNotificaciones"](
      {
        writeHead: () => {},
        end: (data: string) => {
          const parsed = JSON.parse(data);
          expect(parsed.notificaciones).toHaveLength(2);
          expect(parsed.notificaciones[0].estado).toBe("enviado");
        },
      } as any,
      querystring
    );

    expect(resultado).toBe(true);
    store.close();
  });

  it("obtiene estadísticas correctas", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-dashboard-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificacionesEnviosStore(dbPath);
    const adaptador = new AdaptadorMock();
    const cola = new ColaNotificaciones(store, [adaptador]);
    const dashboard = new DashboardEndpoints(store, cola);

    const notif1 = {
      id: "notif_1",
      ruleId: "rule_1",
      evento: "expediente_cerrado",
      canal: "mock",
      destinatario: "cliente" as const,
      plantilla: "venta-confirmada",
      contacto: "cliente@example.com",
      datos: {},
      createdAt: new Date().toISOString(),
    };

    await cola.encolarNotificacion(notif1);
    await cola.procesarCola();

    const resultado = dashboard["obtenerEstadísticas"]({
      writeHead: () => {},
      end: (data: string) => {
        const parsed = JSON.parse(data);
        expect(parsed.hoy.enviadas).toBeGreaterThan(0);
        expect(parsed.hoy.total).toBeGreaterThan(0);
        expect(parsed.porCanal).toBeDefined();
        expect(parsed.porPlantilla).toBeDefined();
      },
    } as any);

    expect(resultado).toBe(true);
    store.close();
  });

  it("reintenta una notificación fallida", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-dashboard-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificacionesEnviosStore(dbPath);
    const adaptador = new AdaptadorMock();
    const cola = new ColaNotificaciones(store, [adaptador]);
    const dashboard = new DashboardEndpoints(store, cola);

    store.registrarPendiente("notif_1", "evento_1", "mock", "cliente", "venta");

    const resultado = dashboard["reintentarNotificación"](
      {
        writeHead: () => {},
        end: (data: string) => {
          const parsed = JSON.parse(data);
          expect(parsed.ok).toBe(true);
        },
      } as any,
      "notif_1"
    );

    expect(resultado).toBe(true);
    store.close();
  });

  it("renderiza página HTML correctamente", () => {
    const html = renderDashboardNotificacionesHtml();

    expect(html).toContain("Dashboard de Notificaciones");
    expect(html).toContain("Enviadas Hoy");
    expect(html).toContain("Fallidas");
    expect(html).toContain("Pendientes");
    expect(html).toContain("Evento");
    expect(html).toContain("Canal");
    expect(html).toContain("Plantilla");
    expect(html).toContain("Estado");
    expect(html).toContain("/notificaciones");
    expect(html).toContain("/notificaciones/estadísticas");
  });

  it("maneja rutas del dashboard correctamente", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-dashboard-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");

    const store = new SqliteNotificacionesEnviosStore(dbPath);
    const adaptador = new AdaptadorMock();
    const cola = new ColaNotificaciones(store, [adaptador]);
    const dashboard = new DashboardEndpoints(store, cola);

    const req = { method: "GET" } as any;
    const res = { writeHead: () => {}, end: () => {} } as any;

    const rutas = ["/notificaciones", "/notificaciones/estadísticas"];

    for (const ruta of rutas) {
      const resultado = dashboard.manejarRuta(req, res, ruta, new URLSearchParams());
      expect(resultado).toBe(true);
    }

    store.close();
  });
});
