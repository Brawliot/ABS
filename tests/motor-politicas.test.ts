import { describe, it, expect, beforeEach } from "vitest";
import { MotorPolicias } from "../elements/motor-politicas.js";
import type { TransaccionProyectada } from "../elements/transaccion.js";
import type { TransaccionDatos } from "../core/events.js";

describe("MotorPolicias", () => {
  let motor: MotorPolicias;
  let venta: TransaccionProyectada;
  let compra: TransaccionProyectada;
  let servicio: TransaccionProyectada;

  beforeEach(() => {
    motor = new MotorPolicias();

    venta = {
      id: "venta-001",
      lifecycleId: "venta-lifecycle",
      datos: {
        parteId: "cliente-1",
        cliente_id: "cliente-1",
        cliente_activo: true,
        cliente_credito_disponible: 50000, // €500
        cliente_lista_negra: false,
        fecha: new Date().toISOString(),
        lineas: [{ cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }] as any,
        total: 12100,
        costo_total: 8000, // €80
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };

    compra = {
      id: "compra-001",
      lifecycleId: "compra-lifecycle",
      datos: {
        parteId: "proveedor-1",
        proveedor_id: "proveedor-1",
        proveedor_activo: true,
        precio_unitario: 5000,
        precio_promedio_historico: 5000,
        fecha: new Date().toISOString(),
        lineas: [{ cantidadMilesimas: 1000, precioCentimos: 5000, ivaPct: 21 }] as any,
        total: 6050,
        precio_venta_estimado: 8000,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };

    servicio = {
      id: "servicio-001",
      lifecycleId: "servicio-lifecycle",
      datos: {
        parteId: "cliente-2",
        cliente_id: "cliente-2",
        cliente_activo: true,
        fecha: new Date().toISOString(),
        tarifa_servicio: 10000, // €100
        hitos: ["hito-1"],
        total: 0,
        lineas: [] as any,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };
  });

  describe("VENTA - Políticas", () => {
    it("✅ debe permitir venta si cliente activo", async () => {
      const resultado = await motor.aplicar(venta, "venta");

      expect(resultado.ok).toBe(true);
      expect(resultado.permitido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it("❌ debe rechazar si cliente no está activo", async () => {
      const ventaInactiva = {
        ...venta,
        datos: { ...venta.datos, cliente_activo: false } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(ventaInactiva, "venta");

      expect(resultado.permitido).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
    });

    it("❌ debe rechazar si excede límite de crédito", async () => {
      const ventaAlta = {
        ...venta,
        datos: {
          ...venta.datos,
          total: 60000, // €600, pero crédito disponible es €500
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(ventaAlta, "venta");

      expect(resultado.permitido).toBe(false);
      expect(resultado.errores.some(e => e.includes("crédito"))).toBe(true);
    });

    it("❌ debe rechazar si cliente está en lista negra", async () => {
      const ventaListaNegra = {
        ...venta,
        datos: {
          ...venta.datos,
          cliente_lista_negra: true,
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(ventaListaNegra, "venta");

      expect(resultado.permitido).toBe(false);
      expect(resultado.errores.some(e => e.includes("negra"))).toBe(true);
    });

    it("⚠️ debe advertir si margen por debajo de 20%", async () => {
      const ventaMargenBajo = {
        ...venta,
        datos: {
          ...venta.datos,
          total: 10000, // €100
          costo_total: 9000, // €90, margen = 10%
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(ventaMargenBajo, "venta");

      expect(resultado.ok).toBe(true);
      expect(resultado.permitido).toBe(true); // No bloqueante
      expect(resultado.advertencias.length).toBeGreaterThan(0);
    });
  });

  describe("COMPRA - Políticas", () => {
    it("✅ debe permitir compra si proveedor activo", async () => {
      const resultado = await motor.aplicar(compra, "compra");

      expect(resultado.permitido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it("❌ debe rechazar si proveedor no está activo", async () => {
      const compraInactiva = {
        ...compra,
        datos: { ...compra.datos, proveedor_activo: false } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(compraInactiva, "compra");

      expect(resultado.permitido).toBe(false);
      expect(resultado.errores.some(e => e.includes("proveedor"))).toBe(true);
    });

    it("⚠️ debe advertir si precio varía mucho", async () => {
      const compraCaraLet = {
        ...compra,
        datos: {
          ...compra.datos,
          precio_unitario: 5800, // 16% más que promedio
          precio_promedio_historico: 5000,
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(compraCaraLet, "compra");

      expect(resultado.permitido).toBe(false); // >15% no permitido
      expect(resultado.errores.some(e => e.includes("rango"))).toBe(true);
    });

    it("✅ debe permitir si margen ≥ 10%", async () => {
      const resultado = await motor.aplicar(compra, "compra");

      expect(resultado.permitido).toBe(true);
      // Margen: (8000 - 6050) / 8000 = 24.4% ✅
    });
  });

  describe("SERVICIO - Políticas", () => {
    it("✅ debe permitir servicio si cliente activo", async () => {
      const resultado = await motor.aplicar(servicio, "servicio");

      expect(resultado.permitido).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });

    it("❌ debe rechazar si cliente no está activo", async () => {
      const servicioInactivo = {
        ...servicio,
        datos: {
          ...servicio.datos,
          cliente_activo: false,
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(servicioInactivo, "servicio");

      expect(resultado.permitido).toBe(false);
    });

    it("❌ debe rechazar si no hay hitos", async () => {
      const servicioSinHitos = {
        ...servicio,
        datos: {
          ...servicio.datos,
          hitos: [],
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(servicioSinHitos, "servicio");

      expect(resultado.permitido).toBe(false);
      expect(resultado.errores.some(e => e.includes("hito"))).toBe(true);
    });

    it("❌ debe rechazar si precio < €50", async () => {
      const servicioBarato = {
        ...servicio,
        datos: {
          ...servicio.datos,
          tarifa_servicio: 2000, // €20
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(servicioBarato, "servicio");

      expect(resultado.permitido).toBe(false);
      expect(resultado.errores.some(e => e.includes("mínimo"))).toBe(true);
    });
  });

  describe("Extensibilidad - registrarRegla()", () => {
    it("✅ debe registrar nueva política", async () => {
      const nuevaRegla = {
        id: "venta-descuento-maximo",
        tipo: "regla_negocio" as const,
        descripción: "Descuento máximo 30%",
        validar: (tx: TransaccionProyectada) => {
          const descuento = (tx.datos as any).descuento || 0;
          const permitido = descuento <= 30;
          return {
            ok: permitido,
            advertencias: [],
            errores: permitido ? [] : ["Descuento no puede exceder 30%"],
          };
        },
        bloqueante: false,
      };

      motor.registrarRegla("venta", "descuento_maximo", nuevaRegla);

      const config = motor.obtenerConfiguracion();
      expect(config.reglasPorArchetype.venta!["descuento_maximo"]).toBeDefined();
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

    it("✅ debe tener políticas para cada archetype", () => {
      const config = motor.obtenerConfiguracion();

      expect(Object.keys(config.reglasPorArchetype.venta!).length).toBeGreaterThan(0);
      expect(Object.keys(config.reglasPorArchetype.compra!).length).toBeGreaterThan(0);
      expect(Object.keys(config.reglasPorArchetype.servicio!).length).toBeGreaterThan(0);
    });
  });

  describe("Archetype sin políticas", () => {
    it("✅ debe permitir si no hay políticas", async () => {
      const resultado = await motor.aplicar(venta, "unknown");

      expect(resultado.ok).toBe(true);
      expect(resultado.permitido).toBe(true);
      expect(resultado.aplicadas).toHaveLength(0);
    });
  });

  describe("Manejo de errores", () => {
    it("✅ debe manejar datos nulos gracefully", async () => {
      const ventaErronea = {
        ...venta,
        datos: null as any,
      };

      const resultado = await motor.aplicar(ventaErronea, "venta");

      // Debe fallar pero manejar el error
      expect(resultado.ok).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
    });
  });

  describe("Distinción bloqueante vs no-bloqueante", () => {
    it("✅ política bloqueante rechaza", async () => {
      const ventaInactiva = {
        ...venta,
        datos: { ...venta.datos, cliente_activo: false } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(ventaInactiva, "venta");

      // cliente_activo es bloqueante
      expect(resultado.permitido).toBe(false);
    });

    it("⚠️ política no-bloqueante advierte pero permite", async () => {
      const ventaMargenBajo = {
        ...venta,
        datos: {
          ...venta.datos,
          total: 10000,
          costo_total: 9500, // Margen bajo
        } as unknown as TransaccionDatos,
      };

      const resultado = await motor.aplicar(ventaMargenBajo, "venta");

      // margen_minimo es no-bloqueante
      expect(resultado.permitido).toBe(true);
      expect(resultado.advertencias.length).toBeGreaterThan(0);
    });
  });
});
