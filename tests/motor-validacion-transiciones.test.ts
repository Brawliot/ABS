import { describe, it, expect } from "vitest";
import { MotorValidacionTransiciones } from "../elements/motor-validacion-transiciones.js";

describe("MotorValidacionTransiciones", () => {
  const motor = new MotorValidacionTransiciones();

  describe("Validación de venta.t_aceptar", () => {
    it("debe rechazar venta sin cliente", () => {
      const tx = {
        arquetipo_id: "venta",
        total: 100,
      };
      const resultado = motor.validarTransicion(tx, "t_aceptar");
      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.some((e) => e.includes("cliente"))).toBe(true);
    });

    it("debe rechazar venta sin total", () => {
      const tx = {
        arquetipo_id: "venta",
        cliente_id: "cli-1",
        total: 0,
      };
      const resultado = motor.validarTransicion(tx, "t_aceptar");
      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.some((e) => e.includes("total"))).toBe(true);
    });

    it("debe aceptar venta válida", () => {
      const tx = {
        arquetipo_id: "venta",
        cliente_id: "cli-1",
        total: 100,
      };
      const resultado = motor.validarTransicion(tx, "t_aceptar");
      expect(resultado.permitida).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });
  });

  describe("Validación de compra.t_aceptar", () => {
    it("debe rechazar compra sin proveedor", () => {
      const tx = {
        arquetipo_id: "compra",
        total: 100,
      };
      const resultado = motor.validarTransicion(tx, "t_aceptar");
      expect(resultado.permitida).toBe(false);
      expect(resultado.errores.some((e) => e.includes("proveedor"))).toBe(true);
    });

    it("debe aceptar compra válida", () => {
      const tx = {
        arquetipo_id: "compra",
        proveedor_id: "prov-1",
        total: 100,
      };
      const resultado = motor.validarTransicion(tx, "t_aceptar");
      expect(resultado.permitida).toBe(true);
      expect(resultado.errores).toHaveLength(0);
    });
  });

  describe("Registro dinámico de reglas", () => {
    it("debe permitir agregar reglas nuevas en tiempo de ejecución", () => {
      const motorDinamico = new MotorValidacionTransiciones();
      motorDinamico.registrarRegla("venta", "t_custom", {
        archetype: "venta",
        transitionId: "t_custom",
        condicion: "margen > 10",
        tipo: "bloqueante",
        mensaje: "Margen insuficiente",
      });

      const config = motorDinamico.obtenerConfiguracion();
      const ventaRules = config.reglasPorArchetype["venta"];
      expect(ventaRules).toBeDefined();
      if (ventaRules) {
        expect(ventaRules["t_custom"]).toBeDefined();
        expect(ventaRules["t_custom"]).toHaveLength(1);
      }
    });
  });

  describe("Obtener configuración", () => {
    it("debe devolver la configuración completa", () => {
      const config = motor.obtenerConfiguracion();
      expect(config).toHaveProperty("reglasPorArchetype");
      expect(config.reglasPorArchetype["venta"]).toBeDefined();
      expect(config.reglasPorArchetype["compra"]).toBeDefined();
      expect(config.reglasPorArchetype["servicio"]).toBeDefined();
    });
  });
});
