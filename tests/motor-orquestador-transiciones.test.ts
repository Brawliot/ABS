import { describe, it, expect } from "vitest";
import { MotorOrquestadorTransiciones } from "../elements/motor-orquestador-transiciones.js";

describe("MotorOrquestadorTransiciones", () => {
  const motor = new MotorOrquestadorTransiciones();

  describe("Orquestación de venta.t_aceptar", () => {
    it("debe generar confirmación, asiento y movimiento de inventario", () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
        cliente_id: "cli-1",
        total: 100,
      };
      const resultado = motor.alTransicionar(tx, "t_aceptar", "aceptada");

      expect(resultado.generados).toHaveLength(3);
      expect(resultado.generados.map((g) => g.tipo)).toContain("confirmacion");
      expect(resultado.generados.map((g) => g.tipo)).toContain(
        "asiento_contable",
      );
      expect(resultado.generados.map((g) => g.tipo)).toContain(
        "movimiento_inventario",
      );
      expect(resultado.erroresGeneracion).toHaveLength(0);
    });

    it("debe generar factura al facturar", () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
        estado: "aceptada",
        total: 100,
      };
      const resultado = motor.alTransicionar(tx, "t_facturar", "facturada");

      expect(resultado.generados).toHaveLength(2);
      expect(resultado.generados.map((g) => g.tipo)).toContain("factura");
      expect(resultado.generados.map((g) => g.tipo)).toContain(
        "asiento_facturacion",
      );
    });
  });

  describe("Orquestación de compra.t_aceptar", () => {
    it("debe generar orden de compra y asiento", () => {
      const tx = {
        id: "cmp-1",
        arquetipo_id: "compra",
        proveedor_id: "prov-1",
        total: 500,
      };
      const resultado = motor.alTransicionar(tx, "t_aceptar", "aceptada");

      expect(resultado.generados).toHaveLength(2);
      expect(resultado.generados.map((g) => g.tipo)).toContain("orden_compra");
      expect(resultado.generados.map((g) => g.tipo)).toContain(
        "asiento_contable",
      );
    });
  });

  describe("Orquestación de servicio.t_iniciar", () => {
    it("debe generar orden de servicio y cronograma", () => {
      const tx = {
        id: "srv-1",
        arquetipo_id: "servicio",
        cliente_id: "cli-1",
        descripcion: "Mantenimiento preventivo",
      };
      const resultado = motor.alTransicionar(tx, "t_iniciar", "iniciado");

      expect(resultado.generados).toHaveLength(2);
      expect(resultado.generados.map((g) => g.tipo)).toContain("orden_servicio");
      expect(resultado.generados.map((g) => g.tipo)).toContain("cronograma");
    });
  });

  describe("Sin generaciones configuradas", () => {
    it("debe devolver lista vacía si no hay reglas", () => {
      const tx = {
        id: "txn-1",
        arquetipo_id: "archetype_desconocido",
      };
      const resultado = motor.alTransicionar(tx, "t_unknown", "unknown");

      expect(resultado.generados).toHaveLength(0);
      expect(resultado.erroresGeneracion).toHaveLength(0);
    });
  });

  describe("Registro dinámico de generaciones", () => {
    it("debe permitir agregar reglas nuevas en tiempo de ejecución", () => {
      const motorDinamico = new MotorOrquestadorTransiciones();
      motorDinamico.registrarGeneracion("venta", "t_custom", [
        "documento_custom",
      ]);

      const tx = {
        id: "vta-custom",
        arquetipo_id: "venta",
      };
      const resultado = motorDinamico.alTransicionar(
        tx,
        "t_custom",
        "custom_state",
      );

      expect(resultado.generados).toHaveLength(1);
      const generado = resultado.generados[0];
      expect(generado).toBeDefined();
      if (generado) {
        expect(generado.tipo).toBe("documento_custom");
      }
    });
  });

  describe("Obtener configuración", () => {
    it("debe devolver la configuración completa", () => {
      const config = motor.obtenerConfiguracion();
      expect(config).toHaveProperty("generacionesPorArchetype");
      expect(config.generacionesPorArchetype["venta"]).toBeDefined();
      expect(config.generacionesPorArchetype["compra"]).toBeDefined();
      expect(config.generacionesPorArchetype["servicio"]).toBeDefined();
    });
  });

  describe("Información de elementos generados", () => {
    it("cada elemento generado debe tener id, tipo y label", () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
        total: 100,
      };
      const resultado = motor.alTransicionar(tx, "t_aceptar", "aceptada");

      expect(resultado.generados.length).toBeGreaterThan(0);
      for (const generado of resultado.generados) {
        expect(generado).toHaveProperty("id");
        expect(generado).toHaveProperty("tipo");
        expect(generado).toHaveProperty("label");
        expect(typeof generado.id).toBe("string");
        expect(typeof generado.tipo).toBe("string");
        expect(typeof generado.label).toBe("string");
      }
    });
  });
});
