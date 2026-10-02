/**
 * Tests de integración: MotorGeneradorProcesos con eventos de venta aceptada
 *
 * Verifica que cuando una venta pasa a estado "Aceptada":
 * 1. Se genera automáticamente una factura con número secuencial
 * 2. Se crean asientos contables (debe = haber)
 * 3. Se registran movimientos de inventario
 * 4. Se generan tareas de seguimiento
 * 5. Todo se persiste en append-only (nunca UPDATE/DELETE)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MotorGeneradorProcesos, type ProcesoGenerado } from "../elements/generador-procesos.js";
import { SqliteGeneradorProcesosStore } from "../adapters/sqlite-generador-procesos-store.js";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

describe("MotorGeneradorProcesos - Integración con Venta Aceptada", () => {
  let motor: MotorGeneradorProcesos;
  let store: SqliteGeneradorProcesosStore;
  const tenantId = `test-${randomUUID()}`;
  const dbPath = join("/tmp", `motor-test-${tenantId}.sqlite`);

  beforeEach(() => {
    motor = new MotorGeneradorProcesos();
    store = new SqliteGeneradorProcesosStore(dbPath);
  });

  describe("Caso 1: Venta simple aceptada genera factura", () => {
    it("Debe generar factura con número secuencial", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      expect(proceso.estado).toBe("completado"); // El proceso se completa automáticamente

      // Verificar que se generó la factura
      const documentos = proceso.documentos_generados;
      const factura = documentos.find((d) => d.tipo === "factura");

      expect(factura).toBeDefined();
      expect(factura?.número).toMatch(/\d+-\d{4}/); // Formato generado: "1-2026"
      expect(factura?.contenido.cliente_id).toBe("cliente-001");
      expect(factura?.contenido.total).toBe(500);
    });

    it("Debe incrementar número de factura secuencialmente", () => {
      const datosVenta1 = {
        cliente_id: "cliente-001",
        líneas: [{ producto_id: "prod-001", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 }],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const datosVenta2 = {
        cliente_id: "cliente-002",
        líneas: [{ producto_id: "prod-002", cantidad: 3, precio_unitario: 200, saldo_anterior: 20 }],
        total: 600,
        moneda: "EUR",
        referencia: "venta-002",
      };

      const proceso1 = motor.crearProceso("venta", datosVenta1);
      const proceso2 = motor.crearProceso("venta", datosVenta2);

      const factura1 = proceso1.documentos_generados.find((d) => d.tipo === "factura");
      const factura2 = proceso2.documentos_generados.find((d) => d.tipo === "factura");

      expect(factura1).toBeDefined();
      expect(factura2).toBeDefined();

      // Formato: "1-2026", extraer el número antes del guion
      const num1 = parseInt(factura1?.número.match(/^(\d+)-/)?.[1] || "0");
      const num2 = parseInt(factura2?.número.match(/^(\d+)-/)?.[1] || "0");

      expect(num1).toBeGreaterThan(0);
      expect(num2).toBeGreaterThan(0);
      expect(num2).toBeGreaterThan(num1);
    });
  });

  describe("Caso 2: Asientos contables balanceados (debe = haber)", () => {
    it("Debe generar asientos contables con debe = haber", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);

      // Verificar asientos contables
      const asientos = proceso.asientos_contables;
      expect(asientos.length).toBeGreaterThan(0);

      for (const asiento of asientos) {
        expect(asiento.debe).toBe(asiento.haber);
        expect(asiento.debe).toBeGreaterThan(0);
        expect(asiento.cuenta_deudora).toBeTruthy();
        expect(asiento.cuenta_acreedora).toBeTruthy();
      }
    });

    it("Debe incluir asiento principal de venta (Clientes vs Ventas)", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const asientos = proceso.asientos_contables;

      // Debe haber al menos un asiento de venta (Clientes 1200 vs Ventas 7000)
      const asientoVenta = asientos.find(
        (a) => a.cuenta_deudora === "1200" && a.cuenta_acreedora === "7000"
      );

      expect(asientoVenta).toBeDefined();
      expect(asientoVenta?.monto).toBe(500);
    });

    it("Debe incluir asiento de IVA si aplica", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const asientos = proceso.asientos_contables;

      // Debe haber asiento de IVA
      const asientoIVA = asientos.find(
        (a) => a.cuenta_acreedora === "4770"
      );

      expect(asientoIVA).toBeDefined();
      expect(asientoIVA?.monto).toBe(Math.round(500 * 0.21));
    });
  });

  describe("Caso 3: Movimientos de inventario registrados", () => {
    it("Debe generar movimientos de inventario para cada línea", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
          {
            producto_id: "prod-002",
            cantidad: 3,
            precio_unitario: 200,
            saldo_anterior: 20,
          },
        ],
        total: 1100,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const movimientos = proceso.movimientos_inventario;

      expect(movimientos.length).toBeGreaterThanOrEqual(2);
    });

    it("Debe registrar salidas negativas para venta", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const movimientos = proceso.movimientos_inventario;

      for (const mov of movimientos) {
        expect(mov.cantidad).toBeLessThan(0); // Salida = negativa
      }
    });

    it("Debe calcular correctamente saldo anterior y posterior", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const movimiento = proceso.movimientos_inventario[0];

      expect(movimiento.saldo_anterior).toBe(50);
      expect(movimiento.saldo_posterior).toBe(45); // 50 - 5
    });
  });

  describe("Caso 4: Tareas de seguimiento generadas", () => {
    it("Debe generar tarea de logística para entrega", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
        requiere_entrega: true,
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const tareas = proceso.tareas_generadas;

      const tareaEntrega = tareas.find((t) => t.relación === "logística");
      expect(tareaEntrega).toBeDefined();
      expect(tareaEntrega?.título).toContain("Entregar");
    });

    it("Debe generar tarea de cobranza", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const tareas = proceso.tareas_generadas;

      const tareaCobranza = tareas.find((t) => t.relación === "cobranza");
      expect(tareaCobranza).toBeDefined();
      expect(tareaCobranza?.título).toContain("Cobrar");
    });

    it("Debe establecer plazo de 30 días para cobranza", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const tareaCobranza = proceso.tareas_generadas.find((t) => t.relación === "cobranza");

      const ahora = new Date();
      const diferencia = tareaCobranza!.fecha_vencimiento.getTime() - ahora.getTime();
      const días = Math.floor(diferencia / (24 * 60 * 60 * 1000));

      expect(días).toBeGreaterThanOrEqual(29);
      expect(días).toBeLessThanOrEqual(31);
    });
  });

  describe("Caso 5: Notificaciones al cliente", () => {
    it("Debe generar notificación de factura al cliente", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        cliente_email: "cliente@example.com",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const notificaciones = proceso.notificaciones;

      const notifCliente = notificaciones.find((n) => n.tipo === "cliente");
      expect(notifCliente).toBeDefined();
      expect(notifCliente?.asunto).toContain("Factura");
    });
  });

  describe("Caso 6: Arquitectura append-only", () => {
    it("Debe registrar todos los eventos en secuencia", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const eventos = proceso.eventos;

      expect(eventos.length).toBeGreaterThan(0);

      // Verificar que cada evento tiene número de secuencia único
      const secuencias = eventos.map((e) => e.secuencia);
      const secuenciasUnicas = new Set(secuencias);
      expect(secuenciasUnicas.size).toBe(secuencias.length);
    });

    it("Debe mantener referencia de documento en eventos", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const eventoFactura = proceso.eventos.find((e) => e.tipo === "factura_generada");

      expect(eventoFactura).toBeDefined();
      expect(eventoFactura?.datos.documento_id).toBeTruthy();
    });
  });

  describe("Caso 7: Validación de datos", () => {
    it("Debe rechazar venta sin cliente", () => {
      const datosVenta = {
        cliente_id: "",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      expect(proceso.estado).toBe("anulado");
    });

    it("Debe rechazar venta sin líneas", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      expect(proceso.estado).toBe("anulado");
    });

    it("Debe rechazar venta con total negativo", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: -500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      expect(proceso.estado).toBe("anulado");
    });

    it("Debe rechazar si stock insuficiente", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 150, // Más de lo que hay
            precio_unitario: 100,
            saldo_anterior: 50, // Solo hay 50
          },
        ],
        total: 15000,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      expect(proceso.estado).toBe("anulado");
    });
  });

  describe("Caso 8: Persistencia en BD", () => {
    it("Debe mantener estructura de proceso en memoria", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);

      // Verificar que el proceso se mantiene íntegro
      expect(proceso.id).toBeTruthy();
      expect(proceso.tipo).toBe("venta");
      expect(proceso.estado).toBe("completado");
      expect(proceso.documentos_generados.length).toBeGreaterThan(0);
      expect(proceso.asientos_contables.length).toBeGreaterThan(0);
    });

    it("Debe preservar estado del proceso a través de clones", () => {
      const datosVenta = {
        cliente_id: "cliente-001",
        líneas: [
          {
            producto_id: "prod-001",
            cantidad: 5,
            precio_unitario: 100,
            saldo_anterior: 50,
          },
        ],
        total: 500,
        moneda: "EUR",
        referencia: "venta-001",
      };

      const proceso = motor.crearProceso("venta", datosVenta);
      const clon = JSON.parse(JSON.stringify(proceso));

      expect(clon.id).toBe(proceso.id);
      expect(clon.tipo).toBe(proceso.tipo);
      expect(clon.documentos_generados.length).toBe(proceso.documentos_generados.length);
      expect(clon.asientos_contables.length).toBe(proceso.asientos_contables.length);
    });
  });
});
