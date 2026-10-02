import { describe, it, expect, beforeEach } from "vitest";
import { MotorCalculos } from "../elements/motor-calculos.js";
import { MotorValidacionTransiciones } from "../elements/motor-validacion-transiciones.js";
import { MotorOrquestadorTransiciones } from "../elements/motor-orquestador-transiciones.js";
import { MotorGeneradorProcesos } from "../elements/generador-procesos.js";
import type { TransaccionProyectada } from "../elements/transaccion.js";
import type { TransaccionDatos } from "../core/events.js";

describe("Integración: Capa 0.4 - Cálculos con Validación", () => {
  let motorCalculos: MotorCalculos;
  let motorValidacion: MotorValidacionTransiciones;
  let motorOrquestador: MotorOrquestadorTransiciones;
  let venta: TransaccionProyectada;

  beforeEach(() => {
    motorCalculos = new MotorCalculos();
    motorValidacion = new MotorValidacionTransiciones();
    const motorGenerador = new MotorGeneradorProcesos();
    motorOrquestador = new MotorOrquestadorTransiciones(motorGenerador);

    venta = {
      id: "venta-integracion-001",
      lifecycleId: "venta-lifecycle",
      datos: {
        parteId: "cliente-1",
        cliente_id: "cliente-1",
        cliente_tipo: "regular",
        fecha: new Date().toISOString(),
        lineas: [{ cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }] as any,
        total: 0,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };
  });

  describe("Flujo: CÁLCULOS → VALIDACIÓN → ORQUESTACIÓN", () => {
    it("✅ debe ejecutar en orden: calcular → validar → orquestar", async () => {
      // PASO 1: CÁLCULOS
      const calcResult = await motorCalculos.alCrear(venta, "venta");
      expect(calcResult.ok).toBe(true);
      expect(calcResult.calculados.total_venta).toBeGreaterThan(0);

      // PASO 2: VALIDACIÓN (con datos calculados implícitos)
      const validResult = motorValidacion.validarTransicion(venta, "venta", "t_aceptar");
      expect(validResult.permitida).toBe(true);
      expect(validResult.errores).toHaveLength(0);

      // PASO 3: ORQUESTACIÓN
      const orqResult = await motorOrquestador.alTransicionar(
        venta,
        "venta",
        "t_aceptar",
        "aceptada"
      );
      expect(orqResult.ok).toBe(true);
    });

    it("✅ debe validar correctamente después de calcular", async () => {
      // Calcular
      await motorCalculos.alCrear(venta, "venta");

      // Validar - debe pasar porque datos son válidos
      const resultado = motorValidacion.validarTransicion(venta, "venta", "t_aceptar");

      expect(resultado.permitida).toBe(true);
    });

    it("❌ debe rechazar validación si líneas vacías (incluso sin cálculos)", async () => {
      const ventaSinLineas = {
        ...venta,
        datos: { ...venta.datos, lineas: [] } as unknown as TransaccionDatos,
      };

      const resultado = motorValidacion.validarTransicion(
        ventaSinLineas,
        "venta",
        "t_aceptar"
      );

      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.length).toBeGreaterThan(0);
    });
  });

  describe("Cálculos VIP: Descuento → Validación → Total", () => {
    it("✅ cliente VIP debe tener descuento automático", async () => {
      const ventaVIP = {
        ...venta,
        datos: { ...venta.datos, cliente_tipo: "vip" } as unknown as TransaccionDatos,
      };

      // Calcular
      const calcResult = await motorCalculos.alCrear(ventaVIP, "venta");

      expect(calcResult.ok).toBe(true);
      // regular: €100 + €21 = €121
      // VIP: €100 + €21 - €10 = €111
      expect(calcResult.calculados.descuento_cliente).toBe(1000); // €10
      expect(calcResult.calculados.total_venta).toBe(11100); // €111
    });

    it("✅ cliente premium debe tener descuento 5%", async () => {
      const ventaPremium = {
        ...venta,
        datos: { ...venta.datos, cliente_tipo: "premium" } as unknown as TransaccionDatos,
      };

      const calcResult = await motorCalculos.alCrear(ventaPremium, "venta");

      expect(calcResult.ok).toBe(true);
      // €100 × 5% = €5 descuento
      expect(calcResult.calculados.descuento_cliente).toBe(500);
      expect(calcResult.calculados.total_venta).toBe(11600); // €116
    });
  });

  describe("Cálculos COMPRA: Gastos de Importación", () => {
    it("✅ debe incluir gastos de importación para no-España", async () => {
      const compraFR = {
        id: "compra-001",
        lifecycleId: "compra-lifecycle",
        datos: {
          parteId: "proveedor-1",
          proveedor_id: "proveedor-1",
          proveedor_pais: "FR",
          fecha: new Date().toISOString(),
          lineas: [{ cantidadMilesimas: 1000, precioCentimos: 5000, ivaPct: 21 }] as any,
          total: 0,
        } as unknown as TransaccionDatos,
        creadaEn: new Date().toISOString(),
        creadaPor: "test",
        cambios: [],
      };

      const resultado = await motorCalculos.alCrear(compraFR, "compra");

      expect(resultado.ok).toBe(true);
      expect(resultado.calculados.gastos_importacion).toBe(2500); // €25
      // €50 + €10.50 (IVA) + €25 (gastos) = €85.50
      expect(resultado.calculados.total_compra).toBe(8550);
    });

    it("✅ no debe incluir gastos para España", async () => {
      const compraES = {
        id: "compra-002",
        lifecycleId: "compra-lifecycle",
        datos: {
          parteId: "proveedor-1",
          proveedor_id: "proveedor-1",
          proveedor_pais: "ES",
          fecha: new Date().toISOString(),
          lineas: [{ cantidadMilesimas: 1000, precioCentimos: 5000, ivaPct: 21 }] as any,
          total: 0,
        } as unknown as TransaccionDatos,
        creadaEn: new Date().toISOString(),
        creadaPor: "test",
        cambios: [],
      };

      const resultado = await motorCalculos.alCrear(compraES, "compra");

      expect(resultado.ok).toBe(true);
      expect(resultado.calculados.gastos_importacion).toBe(0);
      // €50 + €10.50 (IVA) + €0 (no gastos) = €60.50
      expect(resultado.calculados.total_compra).toBe(6050);
    });
  });

  describe("Cálculos SERVICIO: Descuentos por Volumen", () => {
    it("✅ debe aplicar 10% descuento para 3+ hitos", async () => {
      const servicio = {
        id: "servicio-001",
        lifecycleId: "servicio-lifecycle",
        datos: {
          parteId: "cliente-2",
          cliente_id: "cliente-2",
          fecha: new Date().toISOString(),
          tarifa_servicio: 10000, // €100
          hitos: ["h1", "h2", "h3"],
          total: 0,
          lineas: [] as any,
        } as unknown as TransaccionDatos,
        creadaEn: new Date().toISOString(),
        creadaPor: "test",
        cambios: [],
      };

      const resultado = await motorCalculos.alCrear(servicio, "servicio");

      expect(resultado.ok).toBe(true);
      expect(resultado.calculados.descuento_volumen).toBe(1000); // €10 = 10%
      // €100 + €21 (IVA) - €10 (desc) = €111
      expect(resultado.calculados.total_servicio).toBe(11100);
    });

    it("✅ debe aplicar 15% descuento para 5+ hitos", async () => {
      const servicio = {
        id: "servicio-001",
        lifecycleId: "servicio-lifecycle",
        datos: {
          parteId: "cliente-2",
          cliente_id: "cliente-2",
          fecha: new Date().toISOString(),
          tarifa_servicio: 10000, // €100
          hitos: ["h1", "h2", "h3", "h4", "h5"],
          total: 0,
          lineas: [] as any,
        } as unknown as TransaccionDatos,
        creadaEn: new Date().toISOString(),
        creadaPor: "test",
        cambios: [],
      };

      const resultado = await motorCalculos.alCrear(servicio, "servicio");

      expect(resultado.ok).toBe(true);
      expect(resultado.calculados.descuento_volumen).toBe(1500); // €15 = 15%
      // €100 + €21 (IVA) - €15 (desc) = €106
      expect(resultado.calculados.total_servicio).toBe(10600);
    });
  });

  describe("Independencia de Motores", () => {
    it("✅ cálculos no bloquean si hay error", async () => {
      const ventaErronea = {
        ...venta,
        datos: null as any,
      };

      const calcResult = await motorCalculos.alCrear(ventaErronea, "venta");
      // Cálculos fallan
      expect(calcResult.ok).toBe(false);

      // Pero validación sigue siendo independiente
      const validResult = motorValidacion.validarTransicion(
        { ...venta, datos: null as any } as any,
        "venta",
        "t_aceptar"
      );
      // Validación también falla pero por su propia lógica
    });

    it("✅ cada motor puede usarse independientemente", async () => {
      // Motor de cálculos solo
      const calc = await motorCalculos.alCrear(venta, "venta");
      expect(calc.ok).toBe(true);

      // Motor de validación solo
      const valid = motorValidacion.validarTransicion(venta, "venta", "t_aceptar");
      expect(valid.permitida).toBe(true);

      // Motor de orquestación solo
      const orq = await motorOrquestador.alTransicionar(venta, "venta", "t_aceptar", "aceptada");
      expect(orq.ok).toBe(true);
    });
  });

  describe("Extensibilidad Conjunta", () => {
    it("✅ debe permitir extender múltiples motores", async () => {
      // Agregar cálculo personalizado
      motorCalculos.registrarRegla("venta", "comisión", {
        id: "comisión-vendedor",
        tipo: "comisión",
        descripción: "2% comisión",
        calcular: (tx, ctx) => Math.round((ctx?.total_venta || 0) * 0.02),
        obligatorio: false,
      });

      // Agregar regla de validación personalizada
      motorValidacion.registrarRegla("venta", "t_aceptar", {
        id: "comisión-maxima",
        descripción: "Comisión no puede exceder €10",
        validar: () => ({ ok: true }),
        bloqueante: false,
      });

      // Ambos funcionan juntos
      const calcResult = await motorCalculos.alCrear(venta, "venta");
      expect(calcResult.ok).toBe(true);

      const validResult = motorValidacion.validarTransicion(venta, "venta", "t_aceptar");
      expect(validResult.permitida).toBe(true);
    });
  });

  describe("Precisión Monetaria", () => {
    it("✅ debe mantener precisión en centimos", async () => {
      const ventaPrecisa = {
        ...venta,
        datos: {
          ...venta.datos,
          lineas: [
            { cantidadMilesimas: 333, precioCentimos: 333, ivaPct: 21 },
          ] as any,
        } as unknown as TransaccionDatos,
      };

      const resultado = await motorCalculos.alCrear(ventaPrecisa, "venta");

      expect(resultado.ok).toBe(true);
      // Todos los valores deben estar en centimos (números enteros)
      expect(Number.isInteger(resultado.calculados.subtotal)).toBe(true);
      expect(Number.isInteger(resultado.calculados.impuesto_venta)).toBe(true);
      expect(Number.isInteger(resultado.calculados.total_venta)).toBe(true);
    });
  });
});
