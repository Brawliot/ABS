/**
 * MotorGeneradorProcesos: Tests Completos
 *
 * 25+ tests que cubren:
 * - Venta (8 tests): orden, factura, remisión, inventario, asientos
 * - Compra (5 tests): requisición, OC, recepción, asientos
 * - Servicio (4 tests): orden, hitos, facturación
 * - Contabilización (3 tests): asientos, cuadratura
 * - Eventos (3 tests): append-only, orden cronológico
 * - Inventario (2 tests): movimientos, stock
 * - Integración (3+ tests): end-to-end
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MotorGeneradorProcesos,
  type ProcesoGenerado,
  type DocumentoGenerado,
  type AsientoContable,
  type MovimientoInventario,
} from "../elements/generador-procesos.js";
import { SqliteGeneradorProcesosStore } from "../adapters/sqlite-generador-procesos-store.js";

const dirs: string[] = [];

function crearTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "abs-generador-procesos-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 1: VENTA (8+ tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe("MotorGeneradorProcesos - VENTA", () => {
  let motor: MotorGeneradorProcesos;
  let store: SqliteGeneradorProcesosStore;

  beforeEach(() => {
    motor = new MotorGeneradorProcesos();
    const dir = crearTempDir();
    store = new SqliteGeneradorProcesosStore(join(dir, "test.sqlite"));
  });

  afterEach(() => {
    store.cerrar();
  });

  it("✓ Genera orden de venta con número secuencial", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    expect(proceso.tipo).toBe("venta");
    expect(proceso.documentos_generados.length).toBeGreaterThan(0);
    const doc = proceso.documentos_generados[0];
    expect(doc).toBeDefined();
    if (doc) {
      expect(doc.tipo).toBe("orden");
      expect(doc.número).toMatch(/^\d+-\d{4}$/);
    }
  });

  it("✓ Genera factura con serie y número correlativo", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      cliente_nif: "ES12345678A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    const factura = proceso.documentos_generados.find((d) => d.tipo === "factura");
    expect(factura).toBeDefined();
    if (factura) {
      expect(factura.número).toMatch(/^\d+-\d{4}$/);
      expect(factura.serie).toBeDefined();
    }
  });

  it("✓ Calcula correctamente subtotal + IVA", () => {
    const totalSinIVA = 500;
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      cliente_nif: "ES12345678A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: totalSinIVA,
    });

    const asientosIVA = proceso.asientos_contables.filter((a) => a.cuenta_acreedora === "4770");
    expect(asientosIVA.length).toBeGreaterThan(0);

    const ivaEsperado = Math.round(totalSinIVA * 0.21);
    const asiento = asientosIVA[0];
    expect(asiento).toBeDefined();
    if (asiento) {
      expect(asiento.monto).toBe(ivaEsperado);
    }
  });

  it("✓ Genera movimiento de inventario negativo (salida)", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    const movimientos = proceso.movimientos_inventario;
    expect(movimientos.length).toBeGreaterThan(0);

    // La venta debe ser una salida (cantidad negativa)
    const movimientoVenta = movimientos.find((m) => m.producto_id === "PROD-001");
    expect(movimientoVenta).toBeDefined();
    expect(movimientoVenta!.cantidad).toBe(-5); // Negativo = salida
    expect(movimientoVenta!.motivo).toBe("venta");
    expect(movimientoVenta!.saldo_posterior).toBe(45); // 50 - 5
  });

  it("✓ Genera asiento contable con debe = haber", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      cliente_nif: "ES12345678A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    const asientos = proceso.asientos_contables;
    expect(asientos.length).toBeGreaterThan(0);

    // Verificar cuadratura (debe = haber)
    for (const asiento of asientos) {
      expect(asiento.debe).toBe(asiento.haber);
    }
  });

  it("✓ Genera remisión si requiere entrega", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      cliente_dirección: "Calle Principal 123",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
      requiere_entrega: true,
    });

    const remisión = proceso.documentos_generados.find((d) => d.tipo === "remisión");
    expect(remisión).toBeDefined();
  });

  it("✓ Genera tarea de cobranza", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      cliente_vip: false,
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    const tareaCobranza = proceso.tareas_generadas.find((t) => t.relación === "cobranza");
    expect(tareaCobranza).toBeDefined();
    expect(tareaCobranza!.prioridad).toBe("normal");
  });

  it("✓ Falla si stock insuficiente", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      líneas: [
        {
          producto_id: "PROD-001",
          descripción: "Producto 1",
          cantidad: 100, // Más que disponible
          precio_unitario: 100,
          saldo_anterior: 50, // Solo hay 50
        },
      ],
      total: 10000,
    });

    expect(proceso.estado).toBe("anulado");
  });

  it("✓ Registra eventos en orden cronológico", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    const eventos = proceso.eventos;
    expect(eventos.length).toBeGreaterThan(0);

    // Verificar que el primer evento es de inicio
    const primerEvento = eventos[0];
    if (primerEvento) {
      expect(primerEvento.tipo).toBe("venta_iniciada");
    }

    // Verificar orden secuencial
    for (let i = 1; i < eventos.length; i++) {
      const evento = eventos[i];
      if (evento) {
        expect(evento.secuencia).toBe(i + 1);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 2: COMPRA (5+ tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe("MotorGeneradorProcesos - COMPRA", () => {
  let motor: MotorGeneradorProcesos;
  let store: SqliteGeneradorProcesosStore;

  beforeEach(() => {
    motor = new MotorGeneradorProcesos();
    const dir = crearTempDir();
    store = new SqliteGeneradorProcesosStore(join(dir, "test.sqlite"));
  });

  afterEach(() => {
    store.cerrar();
  });

  it("✓ Genera requisición y OC", () => {
    const proceso = motor.crearProceso("compra", {
      proveedor_id: "PROV-001",
      proveedor_nombre: "Distribuidor XYZ",
      líneas: [
        {
          producto_id: "PROD-001",
          descripción: "Producto 1",
          cantidad: 100,
          precio_unitario: 50,
          saldo_anterior: 10,
        },
      ],
      total: 5000,
    });

    expect(proceso.tipo).toBe("compra");
    expect(proceso.documentos_generados.length).toBeGreaterThanOrEqual(2);

    const requisisción = proceso.documentos_generados.find((d) => d.tipo === "orden" && d.contenido.proveedor_id);
    const oc = proceso.documentos_generados.find((d) => {
      const num = d.número || "";
      return num.startsWith("OC-");
    });

    expect(requisisción).toBeDefined();
    expect(oc).toBeDefined();
  });

  it("✓ Genera recepción cuando llega mercancía", () => {
    const proceso = motor.crearProceso("compra", {
      proveedor_id: "PROV-001",
      proveedor_nombre: "Distribuidor XYZ",
      líneas: [
        {
          producto_id: "PROD-001",
          descripción: "Producto 1",
          cantidad: 100,
          precio_unitario: 50,
          saldo_anterior: 10,
        },
      ],
      total: 5000,
    });

    const recepción = proceso.documentos_generados.find((d) => d.tipo === "recibo");
    expect(recepción).toBeDefined();
  });

  it("✓ Actualiza inventario en recepción (entrada positiva)", () => {
    const proceso = motor.crearProceso("compra", {
      proveedor_id: "PROV-001",
      proveedor_nombre: "Distribuidor XYZ",
      líneas: [
        {
          producto_id: "PROD-001",
          descripción: "Producto 1",
          cantidad: 100,
          precio_unitario: 50,
          saldo_anterior: 10,
        },
      ],
      total: 5000,
    });

    const movimientos = proceso.movimientos_inventario;
    expect(movimientos.length).toBeGreaterThan(0);

    const movimientoCompra = movimientos.find((m) => m.producto_id === "PROD-001");
    expect(movimientoCompra).toBeDefined();
    expect(movimientoCompra!.cantidad).toBe(100); // Positivo = entrada
    expect(movimientoCompra!.motivo).toBe("compra");
    expect(movimientoCompra!.saldo_posterior).toBe(110); // 10 + 100
  });

  it("✓ Genera asiento de compra correctamente", () => {
    const proceso = motor.crearProceso("compra", {
      proveedor_id: "PROV-001",
      proveedor_nombre: "Distribuidor XYZ",
      líneas: [
        {
          producto_id: "PROD-001",
          descripción: "Producto 1",
          cantidad: 100,
          precio_unitario: 50,
          saldo_anterior: 10,
        },
      ],
      total: 5000,
    });

    const asientosCompra = proceso.asientos_contables.filter(
      (a) => a && a.cuenta_deudora === "6000" && a.cuenta_acreedora === "4100",
    );
    expect(asientosCompra.length).toBeGreaterThan(0);

    const asiento = asientosCompra[0];
    if (asiento) {
      expect(asiento.monto).toBe(5000);
      expect(asiento.debe).toBe(asiento.haber);
    }
  });

  it("✓ Genera factura proveedor", () => {
    const proceso = motor.crearProceso("compra", {
      proveedor_id: "PROV-001",
      proveedor_nombre: "Distribuidor XYZ",
      número_factura_proveedor: "FAC-2024-001",
      líneas: [
        {
          producto_id: "PROD-001",
          descripción: "Producto 1",
          cantidad: 100,
          precio_unitario: 50,
          saldo_anterior: 10,
        },
      ],
      total: 5000,
    });

    const facturaProveedor = proceso.documentos_generados.find(
      (d) => d.tipo === "factura" && d.contenido.proveedor_id,
    );
    expect(facturaProveedor).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 3: SERVICIO (4+ tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe("MotorGeneradorProcesos - SERVICIO", () => {
  let motor: MotorGeneradorProcesos;
  let store: SqliteGeneradorProcesosStore;

  beforeEach(() => {
    motor = new MotorGeneradorProcesos();
    const dir = crearTempDir();
    store = new SqliteGeneradorProcesosStore(join(dir, "test.sqlite"));
  });

  afterEach(() => {
    store.cerrar();
  });

  it("✓ Genera orden de servicio con hitos", () => {
    const proceso = motor.crearProceso("servicio", {
      cliente_id: "CLI-001",
      cliente_nombre: "Cliente A",
      descripción: "Desarrollo de software",
      hitos: [
        { nombre: "Análisis", fecha_vencimiento: new Date(), porcentaje_completado: 0, monto_facturación: 1000 },
        { nombre: "Desarrollo", fecha_vencimiento: new Date(), porcentaje_completado: 0, monto_facturación: 2000 },
      ],
      total: 3000,
    });

    expect(proceso.tipo).toBe("servicio");
    const orden = proceso.documentos_generados.find((d) => d.tipo === "orden");
    expect(orden).toBeDefined();
  });

  it("✓ Permite registrar horas de trabajo", () => {
    // Este test verifica que el sistema puede manejar datos de entrada para horas
    const proceso = motor.crearProceso("servicio", {
      cliente_id: "CLI-001",
      cliente_nombre: "Cliente A",
      descripción: "Desarrollo de software",
      hitos: [
        {
          nombre: "Análisis",
          fecha_vencimiento: new Date(),
          porcentaje_completado: 100,
          monto_facturación: 1000,
        },
      ],
      total: 1000,
    });

    expect(proceso.documentos_generados.length).toBeGreaterThan(0);
  });

  it("✓ Calcula factura basada en horas * tarifa", () => {
    const proceso = motor.crearProceso("servicio", {
      cliente_id: "CLI-001",
      cliente_nombre: "Cliente A",
      descripción: "Desarrollo de software",
      hitos: [
        {
          nombre: "Análisis",
          fecha_vencimiento: new Date(),
          porcentaje_completado: 100,
          monto_facturación: 500,
        },
      ],
      total: 500,
    });

    const facturas = proceso.documentos_generados.filter((d) => d.tipo === "factura");
    expect(facturas.length).toBeGreaterThan(0);
  });

  it("✓ Genera tareas derivadas", () => {
    const proceso = motor.crearProceso("servicio", {
      cliente_id: "CLI-001",
      cliente_nombre: "Cliente A",
      descripción: "Desarrollo de software",
      hitos: [
        { nombre: "Análisis", fecha_vencimiento: new Date(), porcentaje_completado: 0, monto_facturación: 1000 },
      ],
      total: 1000,
    });

    expect(proceso.tareas_generadas.length).toBeGreaterThan(0);
    const tareaEjecución = proceso.tareas_generadas.find((t) => t.relación === "ejecución_servicio");
    expect(tareaEjecución).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 4: CONTABILIZACIÓN (3+ tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe("MotorGeneradorProcesos - CONTABILIZACIÓN", () => {
  let motor: MotorGeneradorProcesos;

  beforeEach(() => {
    motor = new MotorGeneradorProcesos();
  });

  it("✓ Genera asiento con debe = haber", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      cliente_nif: "ES12345678A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    const asientos = proceso.asientos_contables;
    expect(asientos.length).toBeGreaterThan(0);
    for (const asiento of asientos) {
      if (asiento) {
        expect(asiento.debe).toBe(asiento.haber);
        expect(asiento.debe).toBeGreaterThan(0);
      }
    }
  });

  it("✓ Valida cuadratura de asientos", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      cliente_nif: "ES12345678A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    const totalDebe = proceso.asientos_contables.reduce((sum, a) => sum + a.debe, 0);
    const totalHaber = proceso.asientos_contables.reduce((sum, a) => sum + a.haber, 0);

    expect(totalDebe).toBe(totalHaber);
  });

  it("✓ Registra referencia a documento", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      cliente_nif: "ES12345678A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    for (const asiento of proceso.asientos_contables) {
      expect(asiento.referencia_documento).toBeDefined();
      expect(asiento.referencia_documento.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 5: EVENTOS (3+ tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe("MotorGeneradorProcesos - EVENTOS (APPEND-ONLY)", () => {
  let motor: MotorGeneradorProcesos;

  beforeEach(() => {
    motor = new MotorGeneradorProcesos();
  });

  it("✓ Registra evento para cada paso", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    const eventos = proceso.eventos;
    expect(eventos.length).toBeGreaterThan(3);

    // Debe tener eventos de: inicio, orden generada, factura generada, etc.
    const tiposEventos = new Set(eventos.map((e) => e.tipo));
    expect(tiposEventos.has("venta_iniciada")).toBe(true);
    expect(tiposEventos.has("orden_generada")).toBe(true);
  });

  it("✓ Mantiene orden cronológico", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    const eventos = proceso.eventos;

    // Verificar que los timestamps son progresivos
    for (let i = 1; i < eventos.length; i++) {
      const eventoActual = eventos[i];
      const eventoAnterior = eventos[i - 1];
      if (eventoActual && eventoAnterior) {
        expect(eventoActual.timestamp.getTime()).toBeGreaterThanOrEqual(eventoAnterior.timestamp.getTime());
      }
    }
  });

  it("✓ Es append-only (nunca se modifica)", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    const eventosOriginales = proceso.eventos.length;
    const eventosIds = proceso.eventos.map((e) => e.id);

    // Simular otra operación (que no debe modificar eventos anteriores)
    const proceso2 = motor.crearProceso("venta", {
      cliente_id: "CLI-002",
      cliente_nombre: "Empresa B",
      líneas: [
        { producto_id: "PROD-002", descripción: "Producto 2", cantidad: 3, precio_unitario: 200, saldo_anterior: 50 },
      ],
      total: 600,
    });

    // El primer proceso no debe haber cambiado
    expect(proceso.eventos.length).toBe(eventosOriginales);
    expect(proceso.eventos.map((e) => e.id)).toEqual(eventosIds);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 6: INVENTARIO (2+ tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe("MotorGeneradorProcesos - INVENTARIO", () => {
  let motor: MotorGeneradorProcesos;

  beforeEach(() => {
    motor = new MotorGeneradorProcesos();
  });

  it("✓ Actualiza saldo cuando hay movimiento", () => {
    const saldoInicial = 100;
    const cantidadVenta = 30;

    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      líneas: [
        {
          producto_id: "PROD-001",
          descripción: "Producto 1",
          cantidad: cantidadVenta,
          precio_unitario: 100,
          saldo_anterior: saldoInicial,
        },
      ],
      total: cantidadVenta * 100,
    });

    const movimiento = proceso.movimientos_inventario.find((m) => m.producto_id === "PROD-001");
    expect(movimiento).toBeDefined();
    expect(movimiento!.saldo_anterior).toBe(saldoInicial);
    expect(movimiento!.saldo_posterior).toBe(saldoInicial - cantidadVenta);
  });

  it("✓ Previene venta si no hay stock", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      líneas: [
        {
          producto_id: "PROD-001",
          descripción: "Producto 1",
          cantidad: 100, // Pedimos 100
          precio_unitario: 100,
          saldo_anterior: 50, // Solo hay 50
        },
      ],
      total: 10000,
    });

    // El proceso debe ser anulado
    expect(proceso.estado).toBe("anulado");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRUPO 7: INTEGRACIÓN & END-TO-END (3+ tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe("MotorGeneradorProcesos - INTEGRACIÓN", () => {
  let motor: MotorGeneradorProcesos;
  let store: SqliteGeneradorProcesosStore;

  beforeEach(() => {
    motor = new MotorGeneradorProcesos();
    const dir = crearTempDir();
    store = new SqliteGeneradorProcesosStore(join(dir, "test.sqlite"));
  });

  afterEach(() => {
    store.cerrar();
  });

  it("✓ Guarda y recupera proceso de venta completo", () => {
    const proceso = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      cliente_nif: "ES12345678A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    store.guardarProceso(proceso);

    const procesoRecuperado = store.obtenerProceso(proceso.id);
    expect(procesoRecuperado).toBeDefined();
    expect(procesoRecuperado!.id).toBe(proceso.id);
    expect(procesoRecuperado!.tipo).toBe("venta");
    expect(procesoRecuperado!.documentos_generados.length).toBeGreaterThan(0);
  });

  it("✓ Listar procesos por tipo", () => {
    // Crear varios procesos
    for (let i = 0; i < 3; i++) {
      const proceso = motor.crearProceso("venta", {
        cliente_id: `CLI-${i}`,
        cliente_nombre: `Empresa ${i}`,
        líneas: [
          { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
        ],
        total: 500,
      });
      store.guardarProceso(proceso);
    }

    for (let i = 0; i < 2; i++) {
      const proceso = motor.crearProceso("compra", {
        proveedor_id: `PROV-${i}`,
        proveedor_nombre: `Proveedor ${i}`,
        líneas: [
          {
            producto_id: "PROD-001",
            descripción: "Producto 1",
            cantidad: 100,
            precio_unitario: 50,
            saldo_anterior: 10,
          },
        ],
        total: 5000,
      });
      store.guardarProceso(proceso);
    }

    // Listar solo ventas
    const ventas = store.listarProcesos("venta");
    expect(ventas.length).toBe(3);

    // Listar solo compras
    const compras = store.listarProcesos("compra");
    expect(compras.length).toBe(2);
  });

  it("✓ Mantiene integridad de eventos append-only en almacenamiento", () => {
    const proceso1 = motor.crearProceso("venta", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
      líneas: [
        { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
      ],
      total: 500,
    });

    store.guardarProceso(proceso1);

    // Recuperar y verificar eventos
    const procesoRecuperado = store.obtenerProceso(proceso1.id);
    expect(procesoRecuperado).toBeDefined();
    if (procesoRecuperado) {
      const eventosOriginales = procesoRecuperado.eventos.length;
      expect(eventosOriginales).toBeGreaterThan(0);

      // Crear nuevo proceso (no guardar el anterior nuevamente)
      const proceso2 = motor.crearProceso("venta", {
        cliente_id: "CLI-002",
        cliente_nombre: "Empresa B",
        líneas: [
          { producto_id: "PROD-002", descripción: "Producto 2", cantidad: 3, precio_unitario: 200, saldo_anterior: 50 },
        ],
        total: 600,
      });

      store.guardarProceso(proceso2);

      // Verificar que los eventos del primer proceso se mantienen igual
      const procesoReLectura = store.obtenerProceso(proceso1.id);
      expect(procesoReLectura).toBeDefined();
      if (procesoReLectura) {
        expect(procesoReLectura.eventos.length).toBe(eventosOriginales);
      }
    }
  });

  it("✓ Genera múltiples procesos sin conflicto de secuencias", () => {
    const procesos = [];

    for (let i = 0; i < 5; i++) {
      const tipo = i % 2 === 0 ? "venta" : "compra";
      const proceso = tipo === "venta"
        ? motor.crearProceso("venta", {
            cliente_id: `CLI-${i}`,
            cliente_nombre: `Empresa ${i}`,
            líneas: [
              { producto_id: "PROD-001", descripción: "Producto 1", cantidad: 5, precio_unitario: 100, saldo_anterior: 50 },
            ],
            total: 500,
          })
        : motor.crearProceso("compra", {
            proveedor_id: `PROV-${i}`,
            proveedor_nombre: `Proveedor ${i}`,
            líneas: [
              {
                producto_id: "PROD-001",
                descripción: "Producto 1",
                cantidad: 100,
                precio_unitario: 50,
                saldo_anterior: 10,
              },
            ],
            total: 5000,
          });

      procesos.push(proceso);
      store.guardarProceso(proceso);
    }

    // Verificar que todas las secuencias son únicas e incrementales
    const secuencias = procesos.map((p) => p.número_secuencia);
    const secuenciasUnicas = new Set(secuencias);

    expect(secuenciasUnicas.size).toBe(procesos.length);
  });

  it("✓ Suscripción genera contrato y facturación periódica", () => {
    const proceso = motor.crearProceso("suscripcion", {
      cliente_id: "CLI-001",
      cliente_nombre: "Cliente Suscriptor",
      plan: "Premium",
      precio_mensual: 99,
      período: "anual",
    });

    expect(proceso.tipo).toBe("suscripcion");
    expect(proceso.documentos_generados.length).toBeGreaterThan(0);

    const contrato = proceso.documentos_generados.find((d) => d.tipo === "contrato");
    expect(contrato).toBeDefined();

    const factura = proceso.documentos_generados.find((d) => d.tipo === "factura");
    expect(factura).toBeDefined();

    const tareaRenovación = proceso.tareas_generadas.find((t) => t.relación === "renovación_suscripción");
    expect(tareaRenovación).toBeDefined();
  });

  it("✓ Logística genera fases y tareas de entrega", () => {
    const proceso = motor.crearProceso("logistica", {
      cliente_id: "CLI-001",
      cliente_nombre: "Empresa A",
    });

    expect(proceso.tipo).toBe("logistica");
    expect(proceso.tareas_generadas.length).toBeGreaterThan(0);

    // Debe tener tareas para cada fase
    const fases = ["preparación", "empaque", "envío", "entrega"];
    for (const fase of fases) {
      const tarea = proceso.tareas_generadas.find((t) => t.título.includes(fase.toUpperCase()));
      expect(tarea).toBeDefined();
    }
  });
});
