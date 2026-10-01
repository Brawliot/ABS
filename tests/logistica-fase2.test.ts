/**
 * Tests Logística Fase 2: Proveedores, costos, notificaciones, reportes.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { MotorLogistica } from "../policies/logistica.js";
import {
  ProveedorDHL,
  ProveedorFedEx,
} from "../adapters/logistica-providers.js";
import { generarReporteLogistica } from "../web/reportes-logistica.js";

describe("Logística Fase 2 — Proveedores y Costos", () => {
  let logistica: MotorLogistica;

  beforeEach(() => {
    logistica = new MotorLogistica();
    logistica.registrarProveedor("DHL", new ProveedorDHL());
    logistica.registrarProveedor("FedEx", new ProveedorFedEx());
  });

  it("calcula costo DHL zona metropolitana", () => {
    const costo = logistica.calcularCostoEnvio(1, "metropolitana", "DHL");

    // tarifaBase (5000) + peso * tarifaPorKg (2500) + cargoZona (0)
    expect(costo).toBe(7500);
  });

  it("calcula costo DHL zona no metropolitana", () => {
    const costo = logistica.calcularCostoEnvio(1, "regiones", "DHL");

    // tarifaBase (5000) + peso * tarifaPorKg (2500) + cargoZona (5000)
    expect(costo).toBe(12500);
  });

  it("calcula costo FedEx diferente a DHL", () => {
    const costoDHL = logistica.calcularCostoEnvio(1, "metropolitana", "DHL");
    const costoFedEx = logistica.calcularCostoEnvio(1, "metropolitana", "FedEx");

    expect(costoFedEx).toBeGreaterThan(costoDHL);
  });

  it("crea envío con proveedor DHL", () => {
    const envio = logistica.crearEnvio(
      "exp-001",
      "DHL",
      "Santiago",
      1,
      "metropolitana"
    );

    expect(envio.proveedor).toBe("DHL");
    expect(envio.estado).toBe("preparado");
    expect(envio.numeroSeguimiento).toContain("DHL");
  });

  it("crea envío con proveedor FedEx", () => {
    const envio = logistica.crearEnvio(
      "exp-001",
      "FedEx",
      "Valparaíso",
      1.5,
      "regiones"
    );

    expect(envio.proveedor).toBe("FedEx");
    expect(envio.numeroSeguimiento).toContain("FX");
  });

  it("rechaza proveedor no registrado", () => {
    expect(() => {
      logistica.crearEnvio(
        "exp-001",
        "Correos",
        "Santiago",
        1,
        "metropolitana"
      );
    }).toThrow("no está registrado");
  });

  it("genera número de seguimiento consistente", () => {
    const envio1 = logistica.crearEnvio(
      "exp-001",
      "DHL",
      "Santiago",
      1,
      "metropolitana"
    );
    const envio2 = logistica.crearEnvio(
      "exp-001",
      "DHL",
      "Santiago",
      1,
      "metropolitana"
    );

    // Aunque sean del mismo expediente, son envíos diferentes
    expect(envio1.numeroSeguimiento).not.toBe(envio2.numeroSeguimiento);
  });
});

describe("Logística Fase 2 — Actualizaciones y Tracking", () => {
  let logistica: MotorLogistica;

  beforeEach(() => {
    logistica = new MotorLogistica();
    logistica.registrarProveedor("DHL", new ProveedorDHL());
  });

  it("actualiza estado de envío", () => {
    const envio = logistica.crearEnvio(
      "exp-001",
      "DHL",
      "Santiago",
      1,
      "metropolitana"
    );

    const actualizado = logistica.actualizarEstadoEnvio(envio.id, "enviado");

    expect(actualizado.estado).toBe("enviado");
    expect(actualizado.fechaEnvio).toBeDefined();
  });

  it("registra fecha de entrega al completar", () => {
    const envio = logistica.crearEnvio(
      "exp-001",
      "DHL",
      "Santiago",
      1,
      "metropolitana"
    );

    logistica.actualizarEstadoEnvio(envio.id, "enviado");
    const entregado = logistica.actualizarEstadoEnvio(envio.id, "entregado");

    expect(entregado.fechaEntrega).toBeDefined();
  });

  it("obtiene tracking realista", () => {
    const envio = logistica.crearEnvio(
      "exp-001",
      "DHL",
      "Santiago",
      1,
      "metropolitana"
    );

    const tracking = logistica.obtenerTracking(envio.numeroSeguimiento);

    expect(tracking).toBeDefined();
    expect(tracking?.estado).toBeDefined();
    expect(tracking?.ubicacion).toBeDefined();
    expect(tracking?.eta).toBeDefined();
  });

  it("retorna null si tracking no existe", () => {
    const tracking = logistica.obtenerTracking("NUM-INEXISTENTE");

    expect(tracking).toBeNull();
  });
});

describe("Logística Fase 2 — Reportes", () => {
  let logistica: MotorLogistica;

  beforeEach(() => {
    logistica = new MotorLogistica();
    logistica.registrarProveedor("DHL", new ProveedorDHL());
  });

  it("genera reporte con cero envíos", () => {
    const desde = new Date("2024-01-01");
    const hasta = new Date("2024-01-31");

    const reporte = logistica.generarReporteLogistica(desde, hasta);

    expect(reporte.enviosTotal).toBe(0);
    expect(reporte.tasaEntrega).toBe(0);
    expect(reporte.costoPromedio).toBe(0);
    expect(reporte.demora_promedio_dias).toBe(0);
  });

  it("calcula tasa de entrega correctamente", () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - 1); // ayer
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + 1); // mañana

    // Crear 4 envíos
    const envio1 = logistica.crearEnvio(
      "exp-001",
      "DHL",
      "Santiago",
      1,
      "metropolitana"
    );
    const envio2 = logistica.crearEnvio(
      "exp-002",
      "DHL",
      "Valparaíso",
      1,
      "regiones"
    );
    const envio3 = logistica.crearEnvio(
      "exp-003",
      "DHL",
      "Concepción",
      1,
      "regiones"
    );
    const envio4 = logistica.crearEnvio(
      "exp-004",
      "DHL",
      "Valdivia",
      1,
      "regiones"
    );

    // Marcar 3 como entregados
    logistica.actualizarEstadoEnvio(envio1.id, "enviado");
    logistica.actualizarEstadoEnvio(envio1.id, "entregado");

    logistica.actualizarEstadoEnvio(envio2.id, "enviado");
    logistica.actualizarEstadoEnvio(envio2.id, "entregado");

    logistica.actualizarEstadoEnvio(envio3.id, "enviado");
    logistica.actualizarEstadoEnvio(envio3.id, "entregado");

    const reporte = logistica.generarReporteLogistica(desde, hasta);

    expect(reporte.enviosTotal).toBe(4);
    expect(reporte.tasaEntrega).toBe(75); // 3 de 4
  });

  it("calcula costo promedio", () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - 1);
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + 1);

    logistica.crearEnvio("exp-001", "DHL", "Santiago", 1, "metropolitana"); // 7500
    logistica.crearEnvio("exp-002", "DHL", "Santiago", 1, "metropolitana"); // 7500

    const reporte = logistica.generarReporteLogistica(desde, hasta);

    expect(reporte.costoPromedio).toBe(7500);
  });

  it("genera reporte HTML y CSV", () => {
    logistica.crearEnvio("exp-001", "DHL", "Santiago", 1, "metropolitana");

    const desde = new Date();
    desde.setDate(desde.getDate() - 1);
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + 1);

    const { html, csv } = generarReporteLogistica(logistica, desde, hasta);

    expect(html).toContain("<html>");
    expect(html).toContain("exp-001");
    expect(csv).toContain("exp-001");
    expect(csv).toContain("DHL");
  });

  it("calcula demora promedio en días", () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - 1);
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + 1);

    const envio = logistica.crearEnvio(
      "exp-001",
      "DHL",
      "Santiago",
      1,
      "metropolitana"
    );

    logistica.actualizarEstadoEnvio(envio.id, "enviado");
    logistica.actualizarEstadoEnvio(envio.id, "entregado");

    const reporte = logistica.generarReporteLogistica(desde, hasta);

    expect(reporte.demora_promedio_dias).toBeGreaterThanOrEqual(0);
  });

  it("lista todos los envíos", () => {
    logistica.crearEnvio("exp-001", "DHL", "Santiago", 1, "metropolitana");
    logistica.crearEnvio("exp-002", "DHL", "Valparaíso", 1, "regiones");

    const envios = logistica.listarEnvios();

    expect(envios).toHaveLength(2);
  });
});
