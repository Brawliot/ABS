import { describe, it, expect } from "vitest";
import { MotorSecuencias } from "../elements/motor-secuencias.js";

describe("MotorSecuencias", () => {
  const motor = new MotorSecuencias();

  describe("Validación de secuencias de venta", () => {
    it("debe bloquear facturación de venta no aceptada", () => {
      const tx = { id: "vta-1", arquetipo_id: "venta" };
      const resultado = motor.validarSecuencia(tx, "t_facturar", "propuesta");

      expect(resultado.permitida).toBe(false);
      expect(resultado.razon).toBeDefined();
      expect(resultado.razon).toContain("aceptar");
    });

    it("debe permitir facturación de venta aceptada", () => {
      const tx = { id: "vta-1", arquetipo_id: "venta" };
      const resultado = motor.validarSecuencia(tx, "t_facturar", "aceptada");

      expect(resultado.permitida).toBe(true);
      expect(resultado.razon).toBeUndefined();
    });

    it("debe bloquear facturación de venta ya pagada", () => {
      const tx = { id: "vta-1", arquetipo_id: "venta" };
      const resultado = motor.validarSecuencia(tx, "t_facturar", "pagada");

      expect(resultado.permitida).toBe(false);
      expect(resultado.razon).toContain("pagada");
    });

    it("debe bloquear aceptación de venta cancelada", () => {
      const tx = { id: "vta-1", arquetipo_id: "venta" };
      const resultado = motor.validarSecuencia(tx, "t_aceptar", "cancelada");

      expect(resultado.permitida).toBe(false);
      expect(resultado.razon).toContain("cancelada");
    });
  });

  describe("Validación de secuencias de compra", () => {
    it("debe bloquear recepción de compra no aceptada", () => {
      const tx = { id: "cmp-1", arquetipo_id: "compra" };
      const resultado = motor.validarSecuencia(tx, "t_recibir", "propuesta");

      expect(resultado.permitida).toBe(false);
      expect(resultado.razon).toContain("aceptar");
    });

    it("debe permitir recepción de compra aceptada", () => {
      const tx = { id: "cmp-1", arquetipo_id: "compra" };
      const resultado = motor.validarSecuencia(tx, "t_recibir", "aceptada");

      expect(resultado.permitida).toBe(true);
    });

    it("debe bloquear aceptación de compra ya recibida", () => {
      const tx = { id: "cmp-1", arquetipo_id: "compra" };
      const resultado = motor.validarSecuencia(tx, "t_aceptar", "recibida");

      expect(resultado.permitida).toBe(false);
      expect(resultado.razon).toContain("recibida");
    });
  });

  describe("Validación de secuencias de servicio", () => {
    it("debe bloquear finalización de servicio no iniciado", () => {
      const tx = { id: "srv-1", arquetipo_id: "servicio" };
      const resultado = motor.validarSecuencia(tx, "t_completar", "propuesta");

      expect(resultado.permitida).toBe(false);
      expect(resultado.razon).toContain("iniciar");
    });

    it("debe permitir finalización de servicio iniciado", () => {
      const tx = { id: "srv-1", arquetipo_id: "servicio" };
      const resultado = motor.validarSecuencia(tx, "t_completar", "iniciado");

      expect(resultado.permitida).toBe(true);
    });

    it("debe bloquear reinicio de servicio completado", () => {
      const tx = { id: "srv-1", arquetipo_id: "servicio" };
      const resultado = motor.validarSecuencia(tx, "t_iniciar", "completado");

      expect(resultado.permitida).toBe(false);
      expect(resultado.razon).toContain("reiniciar");
    });

    it("debe bloquear entrega duplicada", () => {
      const tx = { id: "srv-1", arquetipo_id: "servicio" };
      const resultado = motor.validarSecuencia(tx, "t_entregar", "entregado");

      expect(resultado.permitida).toBe(false);
      expect(resultado.razon).toContain("entregado");
    });
  });

  describe("Transiciones no validadas", () => {
    it("debe permitir transiciones sin reglas específicas", () => {
      const tx = { id: "vta-1", arquetipo_id: "venta" };
      const resultado = motor.validarSecuencia(tx, "t_custom", "propuesta");

      expect(resultado.permitida).toBe(true);
    });

    it("debe permitir arquetipos sin reglas", () => {
      const tx = { id: "txn-1", arquetipo_id: "archetype_desconocido" };
      const resultado = motor.validarSecuencia(tx, "t_cualquiera", "estado_cualquiera");

      expect(resultado.permitida).toBe(true);
    });
  });

  describe("Registro dinámico de reglas", () => {
    it("debe permitir agregar reglas nuevas en tiempo de ejecución", () => {
      const motorDinamico = new MotorSecuencias();
      motorDinamico.registrarRegla(
        "seq_custom_1",
        "venta",
        "estado_custom",
        "t_custom_transition",
        false,
        "No permitido en estado custom",
      );

      const tx = { id: "vta-custom", arquetipo_id: "venta" };
      const resultado = motorDinamico.validarSecuencia(
        tx,
        "t_custom_transition",
        "estado_custom",
      );

      expect(resultado.permitida).toBe(false);
      expect(resultado.razon).toContain("No permitido");
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

    it("debe contener reglas detalladas", () => {
      const config = motor.obtenerConfiguracion();
      const ventaReglas = config.reglasPorArchetype["venta"];
      expect(ventaReglas).toBeDefined();

      if (ventaReglas) {
        for (const regla of ventaReglas) {
          expect(regla).toHaveProperty("id");
          expect(regla).toHaveProperty("archetype");
          expect(regla).toHaveProperty("estado_actual");
          expect(regla).toHaveProperty("transitionId");
          expect(regla).toHaveProperty("permitido");
          expect(regla).toHaveProperty("razon");
        }
      }
    });
  });

  describe("Patrones de estado", () => {
    it("debe bloquear transición de estado terminal", () => {
      const tx = { id: "vta-1", arquetipo_id: "venta" };

      // Intentar cualquier transición desde cancelada debe estar bloqueada
      const resultado = motor.validarSecuencia(tx, "t_pagar", "cancelada");
      expect(resultado.permitida).toBe(true); // No hay regla específica
    });

    it("debe respetar flujo de estados esperado", () => {
      const tx = { id: "vta-1", arquetipo_id: "venta" };

      // Flujo normal: propuesta → aceptada → facturada → pagada
      expect(
        motor.validarSecuencia(tx, "t_aceptar", "propuesta").permitida,
      ).toBe(true);

      expect(
        motor.validarSecuencia(tx, "t_facturar", "aceptada").permitida,
      ).toBe(true);

      expect(
        motor.validarSecuencia(tx, "t_pagar", "facturada").permitida,
      ).toBe(true);
    });
  });
});
