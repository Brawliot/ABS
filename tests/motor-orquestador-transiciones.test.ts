import { describe, it, expect, beforeEach, vi } from "vitest";
import { MotorOrquestadorTransiciones } from "../elements/motor-orquestador-transiciones.js";
import { MotorGeneradorProcesos } from "../elements/generador-procesos.js";
import type { TransaccionProyectada } from "../elements/transaccion.js";
import type { TransaccionDatos } from "../core/events.js";

describe("MotorOrquestadorTransiciones", () => {
  let motor: MotorOrquestadorTransiciones;
  let motorGenerador: MotorGeneradorProcesos;
  let ventaAceptada: TransaccionProyectada;
  let compraRecibida: TransaccionProyectada;
  let servicioCompletado: TransaccionProyectada;

  beforeEach(() => {
    motorGenerador = new MotorGeneradorProcesos();
    motor = new MotorOrquestadorTransiciones(motorGenerador);

    ventaAceptada = {
      id: "venta-001",
      lifecycleId: "venta-lifecycle",
      datos: {
        parteId: "cliente-1",
        fecha: new Date().toISOString(),
        lineas: [{ cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }] as any,
        total: 12100,
        cliente_email: "cliente@example.com",
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };

    compraRecibida = {
      id: "compra-001",
      lifecycleId: "compra-lifecycle",
      datos: {
        parteId: "proveedor-1",
        fecha: new Date().toISOString(),
        proveedor_id: "proveedor-1",
        lineas: [{ cantidadMilesimas: 1000, precioCentimos: 5000, ivaPct: 21 }] as any,
        orden_compra: "OC-2026-001",
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };

    servicioCompletado = {
      id: "servicio-001",
      lifecycleId: "servicio-lifecycle",
      datos: {
        parteId: "cliente-2",
        fecha: new Date().toISOString(),
        hitos: ["hito-1"],
        cliente_id: "cliente-2",
        total: 50000,
        lineas: [] as any,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };
  });

  describe("VENTA - Transición t_aceptar", () => {
    it("✅ debe generar documentos automáticamente", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar", "aceptada");

      expect(resultado.ok).toBe(true);
      expect(resultado.generados).toBeDefined();
      expect(resultado.generados).toContain("factura");
      expect(resultado.generados).toContain("asientos_contables");
      expect(resultado.generados).toContain("movimientos_inventario");
      expect(resultado.generados).toContain("tareas");
    });

    it("❌ debe rechazar si faltan datos requeridos", async () => {
      const ventaSinCliente = {
        ...ventaAceptada,
        datos: { ...ventaAceptada.datos, cliente_id: undefined, parteId: undefined } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alTransicionar(
        ventaSinCliente,
        "venta",
        "t_aceptar",
        "aceptada"
      );

      expect(resultado.ok).toBe(false);
      expect(resultado.error).toBeDefined();
    });

    it("⚠️ debe continuar con warning si regla no es obligatoria", async () => {
      const ventaSinMovimiento = {
        ...ventaAceptada,
        datos: { ...ventaAceptada.datos, movimiento_inventario: undefined },
      };

      const resultado = await motor.alTransicionar(
        ventaSinMovimiento,
        "venta",
        "t_iniciar_entrega",
        "en_entrega"
      );

      // Si la regla no es obligatoria, debe continuar
      expect(resultado.ok).toBe(true);
    });
  });

  describe("COMPRA - Transición t_emitir_oc", () => {
    it("✅ debe generar orden de compra", async () => {
      const resultado = await motor.alTransicionar(
        compraRecibida,
        "compra",
        "t_emitir_oc",
        "oc_emitida"
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.generados).toContain("orden_compra");
    });

    it("✅ debe generar movimientos al recibir compra", async () => {
      const resultado = await motor.alTransicionar(
        compraRecibida,
        "compra",
        "t_recibir",
        "recibida"
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.generados).toContain("movimientos_inventario");
    });

    it("✅ debe generar asientos al facturar compra", async () => {
      const resultado = await motor.alTransicionar(
        compraRecibida,
        "compra",
        "t_facturar",
        "facturada"
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.generados).toContain("asientos_contables");
    });
  });

  describe("SERVICIO - Transición t_ejecutar", () => {
    it("✅ debe generar tareas de ejecución", async () => {
      const resultado = await motor.alTransicionar(
        servicioCompletado,
        "servicio",
        "t_ejecutar",
        "ejecutando"
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.generados).toContain("tareas");
    });

    it("✅ debe generar factura al completar servicio", async () => {
      const resultado = await motor.alTransicionar(
        servicioCompletado,
        "servicio",
        "t_completar",
        "completado"
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.generados).toContain("factura");
      expect(resultado.generados).toContain("asientos_contables");
    });
  });

  describe("Validación de precondiciones", () => {
    it("✅ debe validar datos requeridos", async () => {
      const ventaIncompleta = {
        ...ventaAceptada,
        datos: { ...ventaAceptada.datos, lineas: [] },
      };

      const resultado = await motor.alTransicionar(
        ventaIncompleta,
        "venta",
        "t_aceptar",
        "aceptada"
      );

      expect(resultado.ok).toBe(false);
      expect(resultado.error).toContain("requerido");
    });

    it("✅ debe aceptar si todos los datos requeridos existen", async () => {
      const resultado = await motor.alTransicionar(
        ventaAceptada,
        "venta",
        "t_aceptar",
        "aceptada"
      );

      expect(resultado.ok).toBe(true);
    });
  });

  describe("Manejo de errores", () => {
    it("✅ debe retornar error si hay excepción", async () => {
      // Crear una venta con datos inválidos que puedan causar error
      const ventaErronea = {
        ...ventaAceptada,
        datos: null as any,
      };

      const resultado = await motor.alTransicionar(
        ventaErronea,
        "venta",
        "t_aceptar",
        "aceptada"
      );

      // Debe manejar el error gracefully
      expect(resultado.ok).toBe(false);
      expect(resultado.error).toBeDefined();
    });
  });

  describe("Extensibilidad - registrarRegla()", () => {
    it("✅ debe registrar nueva regla de generación", async () => {
      const novaRegla = {
        genera: ["reporte_ventas"],
        requiere: ["cliente_id"],
        obligatorio: false,
      };

      motor.registrarRegla("venta", "t_reporte", novaRegla);

      const config = motor.obtenerConfiguracion();
      expect(config.reglasPorArchetype.venta["t_reporte"]).toBeDefined();
      expect(config.reglasPorArchetype.venta["t_reporte"].genera).toContain("reporte_ventas");
    });

    it("✅ debe usar regla personalizada registrada", async () => {
      const novaRegla = {
        genera: ["reporte_ventas"],
        requiere: ["cliente_id"],
        obligatorio: false,
      };

      motor.registrarRegla("venta", "t_reporte", novaRegla);

      const resultado = await motor.alTransicionar(
        ventaAceptada,
        "venta",
        "t_reporte",
        "reportado"
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.generados).toContain("reporte_ventas");
    });
  });

  describe("obtenerConfiguracion()", () => {
    it("✅ debe retornar configuración actual", () => {
      const config = motor.obtenerConfiguracion();

      expect(config.reglasPorArchetype).toBeDefined();
      expect(config.reglasPorArchetype.venta).toBeDefined();
      expect(config.reglasPorArchetype.compra).toBeDefined();
      expect(config.reglasPorArchetype.servicio).toBeDefined();
    });

    it("✅ debe tener reglas para cada transición", () => {
      const config = motor.obtenerConfiguracion();

      expect(config.reglasPorArchetype.venta["t_aceptar"]).toBeDefined();
      expect(config.reglasPorArchetype.compra["t_emitir_oc"]).toBeDefined();
      expect(config.reglasPorArchetype.servicio["t_ejecutar"]).toBeDefined();
    });

    it("✅ debe mostrar documentos generados por regla", () => {
      const config = motor.obtenerConfiguracion();
      const reglaVentaAcepta = config.reglasPorArchetype.venta["t_aceptar"];

      expect(reglaVentaAcepta.genera).toContain("factura");
      expect(reglaVentaAcepta.genera).toContain("asientos_contables");
      expect(reglaVentaAcepta.genera).toContain("movimientos_inventario");
      expect(reglaVentaAcepta.genera).toContain("tareas");
    });
  });

  describe("Archetype sin reglas", () => {
    it("✅ debe permitir transición si no hay reglas", async () => {
      const resultado = await motor.alTransicionar(
        ventaAceptada,
        "unknown",
        "t_unknown",
        "unknown_state"
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.generados).toHaveLength(0);
    });
  });

  describe("Transición sin generaciones", () => {
    it("✅ debe permitir transición incluso sin generaciones", async () => {
      const resultado = await motor.alTransicionar(
        ventaAceptada,
        "venta",
        "t_iniciar_entrega",
        "en_entrega"
      );

      expect(resultado.ok).toBe(true);
      // t_iniciar_entrega tiene genera: [] (sin generaciones)
      expect(resultado.generados).toHaveLength(0);
    });
  });

  describe("Manejo de obligatorio vs opcional", () => {
    it("✅ debe rechazar si dato obligatorio falta", async () => {
      const ventaSinCliente = {
        ...ventaAceptada,
        datos: { ...ventaAceptada.datos, cliente_id: undefined, parteId: undefined } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alTransicionar(
        ventaSinCliente,
        "venta",
        "t_aceptar",
        "aceptada"
      );

      expect(resultado.ok).toBe(false);
    });
  });
});
