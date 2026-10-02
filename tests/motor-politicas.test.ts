import { describe, it, expect } from "vitest";
import { MotorPoliticasDeNegocio } from "../elements/motor-politicas.js";

describe("MotorPoliticasDeNegocio", () => {
  const motor = new MotorPoliticasDeNegocio();

  describe("Validación de políticas de venta", () => {
    it("debe bloquear descuento mayor al 15%", () => {
      const tx = {
        arquetipo_id: "venta",
        descuento_pct: 20,
      };
      const resultado = motor.validarPoliticas(tx);
      expect(resultado.permitida).toBe(false);
      expect(resultado.violaciones.some((v) => v.policyId === "pol_venta_descuento_max")).toBe(true);
    });

    it("debe permitir descuento menor al 15%", () => {
      const tx = {
        arquetipo_id: "venta",
        descuento_pct: 10,
        margen: 25,
        cantidad_lineas: 5,
      };
      const resultado = motor.validarPoliticas(tx);
      expect(resultado.permitida).toBe(true);
      expect(resultado.violaciones.filter((v) => v.bloqueante)).toHaveLength(0);
    });

    it("debe bloquear margen menor al 20%", () => {
      const tx = {
        arquetipo_id: "venta",
        margen: 15,
      };
      const resultado = motor.validarPoliticas(tx);
      expect(resultado.permitida).toBe(false);
      expect(resultado.violaciones.some((v) => v.policyId === "pol_venta_margen_min")).toBe(true);
    });

    it("debe generar advertencia por líneas excesivas", () => {
      const tx = {
        arquetipo_id: "venta",
        cantidad_lineas: 150,
        descuento_pct: 10,
        margen: 25,
      };
      const resultado = motor.validarPoliticas(tx);
      expect(resultado.permitida).toBe(true);
      expect(resultado.advertencias.some((a) => a.policyId === "pol_venta_lineas_max")).toBe(true);
    });
  });

  describe("Validación de políticas de compra", () => {
    it("debe bloquear compra a proveedor inactivo", () => {
      const tx = {
        arquetipo_id: "compra",
        proveedor_activo: false,
        total: 500,
      };
      const resultado = motor.validarPoliticas(tx);
      expect(resultado.permitida).toBe(false);
      expect(resultado.violaciones.some((v) => v.policyId === "pol_compra_proveedor_activo")).toBe(true);
    });

    it("debe generar advertencia por orden pequeña", () => {
      const tx = {
        arquetipo_id: "compra",
        total: 50,
        proveedor_activo: true,
      };
      const resultado = motor.validarPoliticas(tx);
      expect(resultado.permitida).toBe(true);
      expect(resultado.advertencias.some((a) => a.policyId === "pol_compra_min_orden")).toBe(true);
    });

    it("debe permitir orden normal", () => {
      const tx = {
        arquetipo_id: "compra",
        total: 500,
        proveedor_activo: true,
      };
      const resultado = motor.validarPoliticas(tx);
      expect(resultado.permitida).toBe(true);
      expect(resultado.violaciones.filter((v) => v.bloqueante)).toHaveLength(0);
    });
  });

  describe("Validación de políticas de servicio", () => {
    it("debe bloquear plazo de crédito mayor a 90 días", () => {
      const tx = {
        arquetipo_id: "servicio",
        plazo_credito_dias: 120,
      };
      const resultado = motor.validarPoliticas(tx);
      expect(resultado.permitida).toBe(false);
      expect(resultado.violaciones.some((v) => v.policyId === "pol_servicio_plazo_credito_max")).toBe(true);
    });

    it("debe bloquear margen menor al 25% para servicio", () => {
      const tx = {
        arquetipo_id: "servicio",
        plazo_credito_dias: 60,
        margen: 20,
      };
      const resultado = motor.validarPoliticas(tx);
      expect(resultado.permitida).toBe(false);
      expect(resultado.violaciones.some((v) => v.policyId === "pol_servicio_margen_min")).toBe(true);
    });

    it("debe permitir servicio válido", () => {
      const tx = {
        arquetipo_id: "servicio",
        plazo_credito_dias: 60,
        margen: 30,
      };
      const resultado = motor.validarPoliticas(tx);
      expect(resultado.permitida).toBe(true);
      expect(resultado.violaciones.filter((v) => v.bloqueante)).toHaveLength(0);
    });
  });

  describe("Registro dinámico de políticas", () => {
    it("debe permitir agregar políticas nuevas en tiempo de ejecución", () => {
      const motorDinamico = new MotorPoliticasDeNegocio();
      motorDinamico.registrarPolitica(
        "pol_custom_precio_min",
        "venta",
        "precio_unitario",
        ">=",
        10,
        true,
        "Precio mínimo: 10",
      );

      const config = motorDinamico.obtenerConfiguracion();
      const ventaPolicies = config.politicasPorArchetype["venta"];
      expect(ventaPolicies).toBeDefined();
      if (ventaPolicies) {
        expect(ventaPolicies.some((p) => p.id === "pol_custom_precio_min")).toBe(true);
      }
    });
  });

  describe("Obtener configuración", () => {
    it("debe devolver la configuración completa", () => {
      const config = motor.obtenerConfiguracion();
      expect(config).toHaveProperty("politicasPorArchetype");
      expect(config.politicasPorArchetype["venta"]).toBeDefined();
      expect(config.politicasPorArchetype["compra"]).toBeDefined();
      expect(config.politicasPorArchetype["servicio"]).toBeDefined();
    });
  });

  describe("Información de violaciones", () => {
    it("cada violación debe tener estructura completa", () => {
      const tx = {
        arquetipo_id: "venta",
        descuento_pct: 50,
        margen: 5,
      };
      const resultado = motor.validarPoliticas(tx);

      for (const violacion of resultado.violaciones) {
        expect(violacion).toHaveProperty("policyId");
        expect(violacion).toHaveProperty("descripcion");
        expect(violacion).toHaveProperty("valor_actual");
        expect(violacion).toHaveProperty("valor_limite");
        expect(violacion).toHaveProperty("bloqueante");
      }
    });
  });
});
