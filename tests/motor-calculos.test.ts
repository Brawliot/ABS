import { describe, it, expect } from "vitest";
import { MotorCalculos } from "../elements/motor-calculos.js";

describe("MotorCalculos", () => {
  const motor = new MotorCalculos();

  describe("Cálculo de venta.total", () => {
    it("debe calcular total de venta", () => {
      const tx = {
        arquetipo_id: "venta",
        id: "vta-1",
        lineas: [
          { cantidad: 2, precio: 50 },
          { cantidad: 3, precio: 100 },
        ],
      };
      const resultado = motor.calcular(tx, "total");
      expect(resultado).toBeDefined();
      if (resultado) {
        expect(resultado.campo).toBe("total");
        expect(typeof resultado.valor).toBe("number");
      }
    });
  });

  describe("Cálculo de venta.iva", () => {
    it("debe calcular IVA", () => {
      const tx = {
        arquetipo_id: "venta",
        total: 100,
        iva_pct: 21,
      };
      const resultado = motor.calcular(tx, "iva");
      expect(resultado).toBeDefined();
      if (resultado) {
        expect(resultado.campo).toBe("iva");
      }
    });
  });

  describe("Cálculo de venta.saldo_pendiente", () => {
    it("debe calcular saldo pendiente", () => {
      const tx = {
        arquetipo_id: "venta",
        total_con_iva: 121,
        pagado: 50,
      };
      const resultado = motor.calcular(tx, "saldo_pendiente");
      expect(resultado).toBeDefined();
      if (resultado) {
        expect(resultado.campo).toBe("saldo_pendiente");
        expect(resultado.valor).toBe(71);
      }
    });
  });

  describe("Cálculo de venta.dias_atraso", () => {
    it("debe calcular días de atraso", () => {
      const hoy = new Date();
      const vencimiento = new Date(hoy.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 días atrás

      const tx = {
        arquetipo_id: "venta",
        fecha_vencimiento: vencimiento.toISOString(),
      };
      const resultado = motor.calcular(tx, "dias_atraso");
      expect(resultado).toBeDefined();
      if (resultado) {
        expect(resultado.campo).toBe("dias_atraso");
        expect(resultado.valor).toBeGreaterThanOrEqual(4);
        expect(resultado.valor).toBeLessThanOrEqual(6);
      }
    });
  });

  describe("Calcular todos los campos", () => {
    it("debe calcular todos los campos para venta", () => {
      const tx = {
        arquetipo_id: "venta",
        total: 100,
        iva_pct: 21,
        pagado: 30,
        total_con_iva: 121,
      };
      const resultados = motor.calcularTodos(tx);
      expect(resultados.length).toBeGreaterThan(0);
      expect(resultados.some((r) => r.campo === "total")).toBe(true);
    });

    it("debe calcular campos para compra", () => {
      const tx = {
        arquetipo_id: "compra",
        total: 500,
        pagado: 200,
      };
      const resultados = motor.calcularTodos(tx);
      expect(resultados.length).toBeGreaterThan(0);
    });
  });

  describe("Cálculo de servicio.margen", () => {
    it("debe calcular margen de servicio", () => {
      const tx = {
        arquetipo_id: "servicio",
        tarifa: 100,
        costo_unitario: 60,
      };
      const resultado = motor.calcular(tx, "margen");
      expect(resultado).toBeDefined();
      if (resultado) {
        expect(resultado.valor).toBe(40); // (100 - 60) / 100 * 100 = 40%
      }
    });
  });

  describe("Registro dinámico de cálculos", () => {
    it("debe permitir agregar cálculos nuevos en tiempo de ejecución", () => {
      const motorDinamico = new MotorCalculos();
      motorDinamico.registrarCalculo(
        "venta",
        "comision",
        "total × comision_pct",
        "multiplicacion",
      );

      const config = motorDinamico.obtenerConfiguracion();
      const ventaCalcs = config.calculosPorArchetype["venta"];
      expect(ventaCalcs).toBeDefined();
      if (ventaCalcs) {
        expect(ventaCalcs.some((c) => c.campo === "comision")).toBe(true);
      }
    });
  });

  describe("Obtener configuración", () => {
    it("debe devolver la configuración completa", () => {
      const config = motor.obtenerConfiguracion();
      expect(config).toHaveProperty("calculosPorArchetype");
      expect(config.calculosPorArchetype["venta"]).toBeDefined();
      expect(config.calculosPorArchetype["compra"]).toBeDefined();
      expect(config.calculosPorArchetype["servicio"]).toBeDefined();
    });
  });

  describe("Cálculo no configurado", () => {
    it("debe retornar undefined si no hay cálculo configurado", () => {
      const tx = {
        arquetipo_id: "venta",
      };
      const resultado = motor.calcular(tx, "campo_inexistente");
      expect(resultado).toBeUndefined();
    });
  });
});
