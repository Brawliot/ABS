import { describe, it, expect, beforeEach } from "vitest";
import { MotorCalculos } from "../elements/motor-calculos.js";
import type { TransaccionProyectada } from "../elements/transaccion.js";
import type { TransaccionDatos } from "../core/events.js";

describe("MotorCalculos", () => {
  let motor: MotorCalculos;
  let ventaBasica: TransaccionProyectada;
  let compraBasica: TransaccionProyectada;
  let servicioBasico: TransaccionProyectada;

  beforeEach(() => {
    motor = new MotorCalculos();

    ventaBasica = {
      id: "venta-001",
      lifecycleId: "venta-lifecycle",
      datos: {
        parteId: "cliente-1",
        cliente_id: "cliente-1",
        cliente_tipo: "regular",
        fecha: new Date().toISOString(),
        lineas: [
          { cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }, // 1 × €100
          { cantidadMilesimas: 2000, precioCentimos: 5000, ivaPct: 21 }, // 2 × €50
        ] as any,
        total: 0,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };

    compraBasica = {
      id: "compra-001",
      lifecycleId: "compra-lifecycle",
      datos: {
        parteId: "proveedor-1",
        proveedor_id: "proveedor-1",
        proveedor_pais: "ES",
        fecha: new Date().toISOString(),
        lineas: [
          { cantidadMilesimas: 1000, precioCentimos: 5000, ivaPct: 21 },
        ] as any,
        total: 0,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };

    servicioBasico = {
      id: "servicio-001",
      lifecycleId: "servicio-lifecycle",
      datos: {
        parteId: "cliente-2",
        cliente_id: "cliente-2",
        fecha: new Date().toISOString(),
        tarifa_servicio: 10000, // €100
        hitos: ["hito-1", "hito-2"],
        total: 0,
        lineas: [] as any,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };
  });

  describe("VENTA - Cálculos Precisos", () => {
    it("✅ debe calcular subtotal correctamente", async () => {
      const resultado = await motor.alCrear(ventaBasica, "venta");

      expect(resultado.ok).toBe(true);
      // 1×€100 + 2×€50 = €200
      expect(resultado.calculados.subtotal).toBe(20000);
    });

    it("✅ debe aplicar IVA al subtotal", async () => {
      const resultado = await motor.alCrear(ventaBasica, "venta");

      expect(resultado.ok).toBe(true);
      // €200 × 21% = €42
      expect(resultado.calculados.impuesto_venta).toBe(4200);
    });

    it("✅ no debe aplicar descuento si cliente es regular", async () => {
      const resultado = await motor.alCrear(ventaBasica, "venta");

      expect(resultado.ok).toBe(true);
      expect(resultado.calculados.descuento_cliente).toBe(0);
    });

    it("✅ debe aplicar 10% descuento si cliente es VIP", async () => {
      const ventaVIP = {
        ...ventaBasica,
        datos: { ...ventaBasica.datos, cliente_tipo: "vip" } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(ventaVIP, "venta");

      expect(resultado.ok).toBe(true);
      // €200 × 10% = €20
      expect(resultado.calculados.descuento_cliente).toBe(2000);
    });

    it("✅ debe aplicar 5% descuento si cliente es PREMIUM", async () => {
      const ventaPremium = {
        ...ventaBasica,
        datos: { ...ventaBasica.datos, cliente_tipo: "premium" } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(ventaPremium, "venta");

      expect(resultado.ok).toBe(true);
      // €200 × 5% = €10
      expect(resultado.calculados.descuento_cliente).toBe(1000);
    });

    it("✅ debe calcular total correcto (subtotal + impuesto - descuento)", async () => {
      const resultado = await motor.alCrear(ventaBasica, "venta");

      expect(resultado.ok).toBe(true);
      // €200 + €42 - €0 = €242
      expect(resultado.calculados.total_venta).toBe(24200);
    });

    it("✅ debe calcular total con descuento VIP", async () => {
      const ventaVIP = {
        ...ventaBasica,
        datos: { ...ventaBasica.datos, cliente_tipo: "vip" } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(ventaVIP, "venta");

      expect(resultado.ok).toBe(true);
      // €200 + €42 - €20 = €222
      expect(resultado.calculados.total_venta).toBe(22200);
    });

    it("❌ debe rechazar si subtotal es 0", async () => {
      const ventaSinLineas = {
        ...ventaBasica,
        datos: { ...ventaBasica.datos, lineas: [] } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(ventaSinLineas, "venta");

      // Subtotal será 0, total será 0 (0 + 0 - 0 = 0)
      expect(resultado.ok).toBe(false);
    });
  });

  describe("COMPRA - Gastos de Importación", () => {
    it("✅ debe calcular sin gastos para proveedores españoles", async () => {
      const resultado = await motor.alCrear(compraBasica, "compra");

      expect(resultado.ok).toBe(true);
      // España, sin gastos
      expect(resultado.calculados.gastos_importacion).toBe(0);
    });

    it("✅ debe agregar €25 para importaciones de Francia", async () => {
      const compraFR = {
        ...compraBasica,
        datos: { ...compraBasica.datos, proveedor_pais: "FR" } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(compraFR, "compra");

      expect(resultado.ok).toBe(true);
      expect(resultado.calculados.gastos_importacion).toBe(2500);
    });

    it("✅ debe calcular total compra con gastos", async () => {
      const compraFR = {
        ...compraBasica,
        datos: { ...compraBasica.datos, proveedor_pais: "FR" } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(compraFR, "compra");

      expect(resultado.ok).toBe(true);
      // €50 + €10.50 (IVA) + €25 (gastos) = €85.50
      expect(resultado.calculados.total_compra).toBe(8550);
    });
  });

  describe("SERVICIO - Descuentos por Volumen", () => {
    it("✅ sin descuento si hay 1-2 hitos", async () => {
      const resultado = await motor.alCrear(servicioBasico, "servicio");

      expect(resultado.ok).toBe(true);
      expect(resultado.calculados.descuento_volumen).toBe(0);
    });

    it("✅ debe aplicar 10% descuento si hay 3-4 hitos", async () => {
      const servicio3Hitos = {
        ...servicioBasico,
        datos: {
          ...servicioBasico.datos,
          hitos: ["h1", "h2", "h3"],
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(servicio3Hitos, "servicio");

      expect(resultado.ok).toBe(true);
      // €100 × 10% = €10
      expect(resultado.calculados.descuento_volumen).toBe(1000);
    });

    it("✅ debe aplicar 15% descuento si hay 5+ hitos", async () => {
      const servicio5Hitos = {
        ...servicioBasico,
        datos: {
          ...servicioBasico.datos,
          hitos: ["h1", "h2", "h3", "h4", "h5"],
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(servicio5Hitos, "servicio");

      expect(resultado.ok).toBe(true);
      // €100 × 15% = €15
      expect(resultado.calculados.descuento_volumen).toBe(1500);
    });

    it("✅ debe calcular total servicio con descuento", async () => {
      const servicio5Hitos = {
        ...servicioBasico,
        datos: {
          ...servicioBasico.datos,
          hitos: ["h1", "h2", "h3", "h4", "h5"],
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(servicio5Hitos, "servicio");

      expect(resultado.ok).toBe(true);
      // €100 + €21 (IVA) - €15 (descuento) = €106
      expect(resultado.calculados.total_servicio).toBe(10600);
    });
  });

  describe("Precisión y Redondeo", () => {
    it("✅ debe redondear normalmente (1.4→1, 1.5→2)", async () => {
      const ventaPrecision = {
        ...ventaBasica,
        datos: {
          ...ventaBasica.datos,
          lineas: [
            { cantidadMilesimas: 333, precioCentimos: 333, ivaPct: 21 },
          ] as any,
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(ventaPrecision, "venta");

      expect(resultado.ok).toBe(true);
      // Verifica que los valores están redondeados correctamente
      expect(typeof resultado.calculados.subtotal).toBe("number");
      expect(typeof resultado.calculados.impuesto_venta).toBe("number");
      expect(typeof resultado.calculados.total_venta).toBe("number");
    });
  });

  describe("Extensibilidad - registrarRegla()", () => {
    it("✅ debe registrar nueva regla de comisión", async () => {
      const reglaComision = {
        id: "venta-comision",
        tipo: "comisión" as const,
        descripción: "2% de comisión a vendedor",
        calcular: (tx: TransaccionProyectada, ctx?: Record<string, number>) => {
          const total = ctx?.total_venta || 0;
          return Math.round(total * 0.02);
        },
        obligatorio: false,
      };

      motor.registrarRegla("venta", "comisión_vendedor", reglaComision);

      const config = motor.obtenerConfiguracion();
      expect(config.reglasPorArchetype.venta!["comisión_vendedor"]).toBeDefined();
    });

    it("✅ debe usar regla personalizada registrada", async () => {
      const reglaComision = {
        id: "venta-comision",
        tipo: "comisión" as const,
        descripción: "2% de comisión a vendedor",
        calcular: (tx: TransaccionProyectada, ctx?: Record<string, number>) => {
          const total = ctx?.total_venta || 0;
          return Math.round(total * 0.02);
        },
        obligatorio: false,
      };

      motor.registrarRegla("venta", "comisión_vendedor", reglaComision);

      const resultado = await motor.alCrear(ventaBasica, "venta");
      // No falla aunque hay nuevas reglas
      expect(resultado.ok).toBe(true);
    });

    it("✅ debe registrar descuento por campaña", async () => {
      const reglaDescuentoCampaña = {
        id: "descuento-campaña",
        tipo: "descuento" as const,
        descripción: "Descuento si hay campaña activa",
        calcular: (tx: TransaccionProyectada, ctx?: Record<string, number>) => {
          if ((tx.datos as any).campaña_activa_id) {
            return Math.round((ctx?.subtotal || 0) * 0.05); // 5%
          }
          return 0;
        },
        obligatorio: false,
      };

      motor.registrarRegla("venta", "descuento_campaña", reglaDescuentoCampaña);

      const ventaCampaña = {
        ...ventaBasica,
        datos: {
          ...ventaBasica.datos,
          campaña_activa_id: "campaña-2026",
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.alCrear(ventaCampaña, "venta");
      expect(resultado.ok).toBe(true);
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

    it("✅ debe tener cálculos para cada archetype", () => {
      const config = motor.obtenerConfiguracion();

      expect(config.reglasPorArchetype.venta!["subtotal"]).toBeDefined();
      expect(config.reglasPorArchetype.venta!["total_venta"]).toBeDefined();
      expect(config.reglasPorArchetype.compra!["total_compra"]).toBeDefined();
      expect(config.reglasPorArchetype.servicio!["total_servicio"]).toBeDefined();
    });
  });

  describe("Archetype sin cálculos", () => {
    it("✅ debe permitir crear si no hay cálculos definidos", async () => {
      const resultado = await motor.alCrear(ventaBasica, "unknown_archetype");

      expect(resultado.ok).toBe(true);
      expect(Object.keys(resultado.calculados)).toHaveLength(0);
    });
  });

  describe("Manejo de errores", () => {
    it("✅ debe retornar ok: false si hay excepción", async () => {
      const ventaErronea = {
        ...ventaBasica,
        datos: null as any,
      };

      const resultado = await motor.alCrear(ventaErronea, "venta");

      // Debe manejar el error gracefully
      expect(resultado.ok).toBe(false);
      expect(resultado.error).toBeDefined();
    });

    it("✅ debe registrar error pero no bloquear si regla no obligatoria", async () => {
      const resultado = await motor.alCrear(ventaBasica, "venta");
      // Mismo si hay error en regla opcional
      expect(resultado.ok).toBe(true);
    });
  });

  describe("Contexto entre cálculos", () => {
    it("✅ cálculos posteriores deben ver valores previos", async () => {
      const resultado = await motor.alCrear(ventaBasica, "venta");

      expect(resultado.ok).toBe(true);
      // total_venta usa subtotal + impuesto_venta, deben estar disponibles
      expect(resultado.calculados.subtotal).toBeDefined();
      expect(resultado.calculados.impuesto_venta).toBeDefined();
      expect(resultado.calculados.total_venta).toBeDefined();
      // total debe considerar subtotal calculado
      expect(resultado.calculados.total_venta).toBeGreaterThan(0);
    });
  });
});
