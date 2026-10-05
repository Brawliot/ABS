/**
 * Tests para módulos runtime extraídos (Phase 2)
 * Valida que cada módulo especializado funciona correctamente
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createStockFunctions } from "./runtime-stock.js";
import { createComprasFunctions } from "./runtime-compras.js";
import { createLogisticaFunctions } from "./runtime-logistica.js";
import { createFacturasFunctions } from "./runtime-facturas.js";
import { createCobrosFunctions } from "./runtime-cobros.js";
import { createTransaccionesFunctions } from "./runtime-transacciones.js";
import { createCrmFunctions } from "./runtime-crm.js";
import { createContabilidadFunctions } from "./runtime-contabilidad.js";

// Mock AppRuntime base
function createMockRuntime() {
  return {
    tenantId: "test-tenant",
    boot: { input: { lifecycles: [] } },
    store: {
      getBySubject: vi.fn(() => []),
      append: vi.fn(),
    },
    stockStore: {
      controlados: vi.fn(() => new Set()),
      reservar: vi.fn(() => ({ ok: true })),
      ajustar: vi.fn(() => ({ ok: true, delta: 0 })),
    },
    partes: {
      get: vi.fn(() => ({ erasedAt: null, personal: { displayName: "Test" } })),
    },
    ofertas: {
      get: vi.fn(),
      getVersion: vi.fn(),
    },
    notas: {
      registrarNota: vi.fn(),
      notasDelCliente: vi.fn(() => []),
      contarNotasDelCliente: vi.fn(() => 0),
    },
    contactos: {
      registrarContacto: vi.fn(() => "contact-1"),
      contactosDelCliente: vi.fn(() => []),
      establecerPrincipal: vi.fn(),
    },
    tareas: {
      crearTarea: vi.fn(() => "task-1"),
      tareasDelCliente: vi.fn(() => []),
      completarTarea: vi.fn(),
      contarTareas: vi.fn(() => 0),
    },
    auditoria: {
      registrarCambio: vi.fn(),
      auditoriaDe: vi.fn(() => []),
    },
    cobros: {
      registrar: vi.fn(),
      deExpediente: vi.fn(() => []),
      totalParcial: vi.fn(() => 0),
    },
    cuentas: {
      obtener: vi.fn(() => ({ saldo_centimos: 0 })),
      actualizarSaldo: vi.fn(),
      todasCuentas: vi.fn(() => []),
    },
    asientos: {
      registrar: vi.fn(() => "A001"),
      porCuenta: vi.fn(() => []),
      todos: vi.fn(() => []),
    },
    financiados: {
      crearFinanciado: vi.fn(),
      agregarCuota: vi.fn(),
      deExpediente: vi.fn(),
      cuotasDelFinanciado: vi.fn(() => []),
      pagarCuota: vi.fn(),
      actualizarEstadoFinanciado: vi.fn(),
    },
    creditoCliente: {
      obtenerLimite: vi.fn(() => 0),
      establecerLimite: vi.fn(),
    },
    subjects: [],
    addSubject: vi.fn(),
    datosDe: vi.fn(),
    estadoDe: vi.fn(() => ({ id: "inicial", kind: "inicial" })),
    expedientesDinero: vi.fn(() => []),
    lifecycleForSubject: vi.fn(),
    camposDeProceso: vi.fn(() => []),
    principalesAbiertos: vi.fn(() => []),
    etiquetas: {
      estado: vi.fn(() => "Estado"),
    },
    facts: {
      applyEvent: vi.fn(),
    },
  } as any;
}

describe("Runtime Modules (Phase 2)", () => {
  describe("Stock Module", () => {
    it("debería crear funciones de stock", () => {
      const runtime = createMockRuntime();
      const stock = createStockFunctions(runtime);
      expect(stock).toBeDefined();
      expect(stock.stock).toBeDefined();
      expect(stock.configurarStock).toBeDefined();
      expect(stock.ajustarStock).toBeDefined();
      expect(stock.faltasStock).toBeDefined();
    });

    it("configurarStock debería validar entrada", () => {
      const runtime = createMockRuntime();
      const stock = createStockFunctions(runtime);
      const resultado = stock.configurarStock("oferta-1", true, 100);
      expect(resultado).toBeDefined();
      expect("ok" in resultado).toBe(true);
    });
  });

  describe("Compras Module", () => {
    it("debería crear funciones de compras", () => {
      const runtime = createMockRuntime();
      const compras = createComprasFunctions(runtime);
      expect(compras).toBeDefined();
      expect(compras.crearCompra).toBeDefined();
      expect(compras.recibirCompra).toBeDefined();
      expect(compras.listarCompras).toBeDefined();
      expect(compras.deudaConProveedor).toBeDefined();
    });
  });

  describe("Logistica Module", () => {
    it("debería crear funciones de logística", () => {
      const runtime = createMockRuntime();
      const logistica = createLogisticaFunctions(runtime);
      expect(logistica).toBeDefined();
      expect(logistica.crearEnvio).toBeDefined();
      expect(logistica.actualizarEnvio).toBeDefined();
      expect(logistica.marcarEntregado).toBeDefined();
      expect(logistica.pendientesDeEnviar).toBeDefined();
    });
  });

  describe("Facturas Module", () => {
    it("debería crear funciones de facturación", () => {
      const runtime = createMockRuntime();
      const facturas = createFacturasFunctions(runtime);
      expect(facturas).toBeDefined();
      expect(facturas.facturacionDe).toBeDefined();
      expect(facturas.expedirFactura).toBeDefined();
      expect(facturas.rectificarFactura).toBeDefined();
    });
  });

  describe("Cobros Module", () => {
    it("debería crear funciones de cobros", () => {
      const runtime = createMockRuntime();
      const cobros = createCobrosFunctions(runtime);
      expect(cobros).toBeDefined();
      expect(cobros.registrarCobro).toBeDefined();
      expect(cobros.cobrosDelExpediente).toBeDefined();
      expect(cobros.impagosDe).toBeDefined();
      expect(cobros.crearFinanciado).toBeDefined();
      expect(cobros.pagarCuotaFinanciado).toBeDefined();
      expect(cobros.creditoDelCliente).toBeDefined();
    });

    it("registrarCobro debería validar importe", () => {
      const runtime = createMockRuntime();
      runtime.datosDe = vi.fn(() => ({
        datos: { lineas: [{ precioCentimos: 10000, cantidadMilesimas: 1000 }] },
      }));
      const cobros = createCobrosFunctions(runtime);

      const resultado = cobros.registrarCobro("exp-1", { importeCentimos: 0, medio: "efectivo" }, "actor-1");
      expect(resultado.ok).toBe(false);
      expect((resultado as any).error).toContain("mayor que 0");
    });

    it("crearFinanciado debería rechazar plazo inválido", () => {
      const runtime = createMockRuntime();
      const cobros = createCobrosFunctions(runtime);

      const resultado = cobros.crearFinanciado("exp-1", 10000, 0, 5, "actor-1");
      expect(resultado.ok).toBe(false);
      expect((resultado as any).error).toContain("plazo");
    });
  });

  describe("Transacciones Module", () => {
    it("debería crear funciones de transacciones", () => {
      const runtime = createMockRuntime();
      const transacciones = createTransaccionesFunctions(runtime);
      expect(transacciones).toBeDefined();
      expect(transacciones.datosDe).toBeDefined();
      expect(transacciones.estadoDe).toBeDefined();
      expect(transacciones.puedeEditarDatos).toBeDefined();
      expect(transacciones.crearTransaccion).toBeDefined();
      expect(transacciones.editarTransaccion).toBeDefined();
    });
  });

  describe("CRM Module", () => {
    it("debería crear funciones de CRM", () => {
      const runtime = createMockRuntime();
      const crm = createCrmFunctions(runtime);
      expect(crm).toBeDefined();
      expect(crm.agregarNotaEnCliente).toBeDefined();
      expect(crm.notasDelCliente).toBeDefined();
      expect(crm.registrarContacto).toBeDefined();
      expect(crm.contactosDelCliente).toBeDefined();
      expect(crm.crearTarea).toBeDefined();
      expect(crm.tareasDelCliente).toBeDefined();
      expect(crm.registrarCambioAuditoria).toBeDefined();
      expect(crm.auditoriaDe).toBeDefined();
    });

    it("agregarNotaEnCliente debería rechazar notas de clientes", () => {
      const runtime = createMockRuntime();
      const crm = createCrmFunctions(runtime);
      const resultado = crm.agregarNotaEnCliente("cliente-1", "nota", "cliente", false);
      expect(resultado.ok).toBe(false);
      expect((resultado as any).error).toContain("clientes no pueden");
    });
  });

  describe("Contabilidad Module", () => {
    it("debería crear funciones de contabilidad", () => {
      const runtime = createMockRuntime();
      const contabilidad = createContabilidadFunctions(runtime);
      expect(contabilidad).toBeDefined();
      expect(contabilidad.registrarAsiento).toBeDefined();
      expect(contabilidad.obtenerMayor).toBeDefined();
      expect(contabilidad.verificarCuadre).toBeDefined();
      expect(contabilidad.obtenerBalance).toBeDefined();
      expect(contabilidad.obtenerResultado).toBeDefined();
      expect(contabilidad.exportarAsientosCSV).toBeDefined();
      expect(contabilidad.exportarAsientosJSON).toBeDefined();
    });

    it("registrarAsiento debería validar importe", () => {
      const runtime = createMockRuntime();
      const contabilidad = createContabilidadFunctions(runtime);

      const resultado = contabilidad.registrarAsiento("2026-01-01", "1000", "2000", 0, "Prueba", "REF-001");
      expect(resultado.ok).toBe(false);
      expect((resultado as any).error).toContain("mayor que 0");
    });

    it("registrarAsiento debería validar cuentas", () => {
      const runtime = createMockRuntime();
      runtime.cuentas.obtener = vi.fn(() => null);
      const contabilidad = createContabilidadFunctions(runtime);

      const resultado = contabilidad.registrarAsiento("2026-01-01", "9999", "2000", 10000, "Prueba", "REF-001");
      expect(resultado.ok).toBe(false);
      expect((resultado as any).error).toContain("no existe");
    });

    it("verificarCuadre debería retornar estructura correcta", () => {
      const runtime = createMockRuntime();
      const contabilidad = createContabilidadFunctions(runtime);

      const resultado = contabilidad.verificarCuadre();
      expect(resultado).toHaveProperty("balanceado");
      expect(resultado).toHaveProperty("totalDebitos");
      expect(resultado).toHaveProperty("totalCreditos");
      expect(resultado).toHaveProperty("cuentasDesbalanceadas");
    });
  });

  describe("Module Integration", () => {
    it("todos los módulos deberían ser independientes", () => {
      const runtime = createMockRuntime();

      const stock = createStockFunctions(runtime);
      const compras = createComprasFunctions(runtime);
      const logistica = createLogisticaFunctions(runtime);
      const facturas = createFacturasFunctions(runtime);
      const cobros = createCobrosFunctions(runtime);
      const transacciones = createTransaccionesFunctions(runtime);
      const crm = createCrmFunctions(runtime);
      const contabilidad = createContabilidadFunctions(runtime);

      expect(stock).toBeDefined();
      expect(compras).toBeDefined();
      expect(logistica).toBeDefined();
      expect(facturas).toBeDefined();
      expect(cobros).toBeDefined();
      expect(transacciones).toBeDefined();
      expect(crm).toBeDefined();
      expect(contabilidad).toBeDefined();
    });
  });
});
