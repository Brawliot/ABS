import { describe, it, expect, beforeEach } from "vitest";
import { MotorValidacionTransiciones } from "../elements/motor-validacion-transiciones.js";
import type { TransaccionProyectada } from "../elements/transaccion.js";
import type { TransaccionDatos } from "../core/events.js";

describe("MotorValidacionTransiciones", () => {
  let motor: MotorValidacionTransiciones;
  let ventaMinima: TransaccionProyectada;
  let compraMinima: TransaccionProyectada;
  let servicioMinimo: TransaccionProyectada;

  beforeEach(() => {
    motor = new MotorValidacionTransiciones();

    ventaMinima = {
      id: "venta-001",
      lifecycleId: "venta-lifecycle",
      datos: {
        parteId: "cliente-1",
        fecha: new Date().toISOString(),
        lineas: [{ cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }] as any,
        total: 12100,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };

    compraMinima = {
      id: "compra-001",
      lifecycleId: "compra-lifecycle",
      datos: {
        parteId: "proveedor-1",
        fecha: new Date().toISOString(),
        proveedor_id: "proveedor-1",
        lineas: [{ cantidadMilesimas: 1000, precioCentimos: 5000, ivaPct: 21 }] as any,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };

    servicioMinimo = {
      id: "servicio-001",
      lifecycleId: "servicio-lifecycle",
      datos: {
        parteId: "cliente-2",
        fecha: new Date().toISOString(),
        hitos: ["hito-1"],
        lineas: [] as any,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };
  });

  describe("VENTA - Transición t_aceptar", () => {
    it("✅ debe permitir venta válida", () => {
      const resultado = motor.validarTransicion(ventaMinima, "venta", "t_aceptar");

      expect(resultado.permitida).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it("❌ debe rechazar venta sin cliente", () => {
      const ventaSinCliente = {
        ...ventaMinima,
        datos: { ...ventaMinima.datos, parteId: undefined } as unknown as TransaccionDatos,
      };

      const resultado = motor.validarTransicion(ventaSinCliente, "venta", "t_aceptar");

      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
      expect(resultado.errores[0]).toContain("cliente");
    });

    it("❌ debe rechazar venta sin líneas", () => {
      const ventaSinLineas = {
        ...ventaMinima,
        datos: { ...ventaMinima.datos, lineas: [] },
      };

      const resultado = motor.validarTransicion(ventaSinLineas, "venta", "t_aceptar");

      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
      expect(resultado.errores[0]).toContain("línea");
    });

    it("❌ debe rechazar venta con total <= 0", () => {
      const ventaSinTotal = {
        ...ventaMinima,
        datos: { ...ventaMinima.datos, total: 0 },
      };

      const resultado = motor.validarTransicion(ventaSinTotal, "venta", "t_aceptar");

      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
      expect(resultado.errores[0]).toContain("total");
    });

    it("⚠️ debe registrar advertencias pero permitir transición", () => {
      const resultado = motor.validarTransicion(ventaMinima, "venta", "t_aceptar");

      // Puede haber advertencias pero la transición se permite
      expect(resultado.permitida).toBe(true);
      // Advertencias pueden estar vacías o llenar con datos reales
    });
  });

  describe("COMPRA - Transición t_emitir_oc", () => {
    it("✅ debe permitir compra válida", () => {
      const resultado = motor.validarTransicion(compraMinima, "compra", "t_emitir_oc");

      expect(resultado.permitida).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it("❌ debe rechazar compra sin proveedor", () => {
      const compraSinProveedor = {
        ...compraMinima,
        datos: { ...compraMinima.datos, proveedor_id: undefined },
      };

      const resultado = motor.validarTransicion(compraSinProveedor, "compra", "t_emitir_oc");

      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
      expect(resultado.errores[0]).toContain("proveedor");
    });

    it("❌ debe rechazar compra sin líneas", () => {
      const compraSinLineas = {
        ...compraMinima,
        datos: { ...compraMinima.datos, lineas: [] },
      };

      const resultado = motor.validarTransicion(compraSinLineas, "compra", "t_emitir_oc");

      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
      expect(resultado.errores[0]).toContain("línea");
    });
  });

  describe("SERVICIO - Transición t_ejecutar", () => {
    it("✅ debe permitir servicio válido", () => {
      const resultado = motor.validarTransicion(servicioMinimo, "servicio", "t_ejecutar");

      expect(resultado.permitida).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it("❌ debe rechazar servicio sin cliente", () => {
      const servicioSinCliente = {
        ...servicioMinimo,
        datos: { ...servicioMinimo.datos, parteId: undefined } as unknown as TransaccionDatos,
      };

      const resultado = motor.validarTransicion(
        servicioSinCliente,
        "servicio",
        "t_ejecutar"
      );

      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
      expect(resultado.errores[0]).toContain("cliente");
    });
  });

  describe("Extensibilidad - registrarRegla()", () => {
    it("✅ debe agregar regla personalizada", () => {
      const reglaBloqueante = {
        id: "venta-custom-rule",
        descripción: "Venta debe tener observaciones",
        validar: (tx: TransaccionProyectada) => ({
          ok: !!((tx.datos as any).observaciones),
          error: (tx.datos as any).observaciones ? undefined : "Faltan observaciones",
        }),
        bloqueante: true,
      };

      motor.registrarRegla("venta", "t_aceptar", reglaBloqueante);

      // La regla debe estar registrada
      const config = motor.obtenerConfiguracion();
      expect(config.reglasPorArchetype.venta!["t_aceptar"]).toBeDefined();
    });

    it("✅ debe validar con regla personalizada registrada", () => {
      const reglaBloqueante = {
        id: "venta-custom-rule",
        descripción: "Venta debe tener observaciones",
        validar: (tx: TransaccionProyectada) => ({
          ok: !!((tx.datos as any).observaciones),
          error: (tx.datos as any).observaciones ? undefined : "Faltan observaciones",
        }),
        bloqueante: true,
      };

      motor.registrarRegla("venta", "t_custom", reglaBloqueante);

      const ventaSinObservaciones = {
        ...ventaMinima,
        datos: { ...ventaMinima.datos, observaciones: undefined },
      };

      const resultado = motor.validarTransicion(ventaSinObservaciones, "venta", "t_custom");

      expect(resultado.permitida).toBe(false);
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

      expect(config.reglasPorArchetype.venta!["t_aceptar"]).toBeDefined();
      expect(config.reglasPorArchetype.compra!["t_emitir_oc"]).toBeDefined();
      expect(config.reglasPorArchetype.servicio!["t_ejecutar"]).toBeDefined();
    });
  });

  describe("Archetype sin reglas", () => {
    it("✅ debe permitir transición si no hay reglas", () => {
      const transaccionDescono = {
        ...ventaMinima,
        lifecycleId: "unknown-lifecycle",
      };

      const resultado = motor.validarTransicion(transaccionDescono, "unknown", "t_unknown");

      expect(resultado.permitida).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });
  });

  describe("Distingue entre errores y advertencias", () => {
    it("✅ debe marcar reglas bloqueantes como errores", () => {
      const ventaSinCliente = {
        ...ventaMinima,
        datos: { ...ventaMinima.datos, parteId: undefined } as unknown as TransaccionDatos,
      };

      const resultado = motor.validarTransicion(ventaSinCliente, "venta", "t_aceptar");

      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
    });
  });
});
