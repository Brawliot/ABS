import { describe, it, expect } from "vitest";
import { MotorReversiones } from "../elements/motor-reversiones.js";

describe("MotorReversiones", () => {
  const motor = new MotorReversiones();

  describe("Reversiones de venta", () => {
    it("debe ejecutar plan de reversión al cancelar venta", () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
        total: 100,
      };
      const resultado = motor.revertir(tx, "cancelar");

      expect(resultado.acciones_ejecutadas.length).toBeGreaterThan(0);
      expect(resultado.estado_nuevo).toBe("cancelada");
      expect(resultado.errores).toHaveLength(0);

      const tipos = resultado.acciones_ejecutadas.map((a) => a.tipo);
      expect(tipos).toContain("reversar_asiento");
      expect(tipos).toContain("devolver_inventario");
      expect(tipos).toContain("cancelar_documento");
    });

    it("debe anular venta sin deshacer factura", () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
      };
      const resultado = motor.revertir(tx, "anular");

      expect(resultado.acciones_ejecutadas.length).toBeGreaterThan(0);
      expect(resultado.estado_nuevo).toBe("anulada");

      const tipos = resultado.acciones_ejecutadas.map((a) => a.tipo);
      expect(tipos).toContain("reversar_asiento");
      expect(tipos).toContain("devolver_inventario");
      expect(tipos).not.toContain("cancelar_documento");
    });
  });

  describe("Reversiones de compra", () => {
    it("debe ejecutar plan al cancelar compra", () => {
      const tx = {
        id: "cmp-1",
        arquetipo_id: "compra",
      };
      const resultado = motor.revertir(tx, "cancelar");

      expect(resultado.acciones_ejecutadas.length).toBeGreaterThan(0);
      expect(resultado.estado_nuevo).toBe("cancelada");

      const tipos = resultado.acciones_ejecutadas.map((a) => a.tipo);
      expect(tipos).toContain("reversar_asiento");
      expect(tipos).toContain("cancelar_documento");
    });

    it("debe rechazar compra sin reversiones contables", () => {
      const tx = {
        id: "cmp-1",
        arquetipo_id: "compra",
      };
      const resultado = motor.revertir(tx, "rechazar");

      expect(resultado.estado_nuevo).toBe("rechazada");
      expect(resultado.acciones_ejecutadas.length).toBeGreaterThan(0);

      const tipos = resultado.acciones_ejecutadas.map((a) => a.tipo);
      expect(tipos).toContain("cancelar_documento");
      expect(tipos).not.toContain("reversar_asiento");
    });
  });

  describe("Reversiones de servicio", () => {
    it("debe liberar recursos al cancelar servicio", () => {
      const tx = {
        id: "srv-1",
        arquetipo_id: "servicio",
      };
      const resultado = motor.revertir(tx, "cancelar");

      expect(resultado.estado_nuevo).toBe("cancelada");
      expect(resultado.acciones_ejecutadas.length).toBeGreaterThan(0);

      const tipos = resultado.acciones_ejecutadas.map((a) => a.tipo);
      expect(tipos).toContain("liberar_recurso");
    });
  });

  describe("Sin reversiones configuradas", () => {
    it("debe retornar estado cancelada sin acciones si no hay regla", () => {
      const tx = {
        id: "txn-1",
        arquetipo_id: "archetype_desconocido",
      };
      const resultado = motor.revertir(tx, "t_unknown");

      expect(resultado.acciones_ejecutadas).toHaveLength(0);
      expect(resultado.estado_nuevo).toBe("cancelada");
      expect(resultado.errores).toHaveLength(0);
    });
  });

  describe("Registro dinámico de reversiones", () => {
    it("debe permitir agregar planes de reversión nuevos en tiempo de ejecución", () => {
      const motorDinamico = new MotorReversiones();
      motorDinamico.registrarReversiones("venta", "devolver", [
        {
          tipo: "devolver_inventario",
          entidad: "inventario",
          razon: "Devolución de producto",
        },
        {
          tipo: "reversar_asiento",
          entidad: "devoluciones",
          razon: "Nota de crédito",
        },
      ]);

      const tx = {
        id: "vta-dev-1",
        arquetipo_id: "venta",
      };
      const resultado = motorDinamico.revertir(tx, "devolver");

      expect(resultado.acciones_ejecutadas).toHaveLength(2);
    });
  });

  describe("Obtener configuración", () => {
    it("debe devolver la configuración completa", () => {
      const config = motor.obtenerConfiguracion();
      expect(config).toHaveProperty("reversionesPorArchetype");
      expect(config.reversionesPorArchetype["venta"]).toBeDefined();
      expect(config.reversionesPorArchetype["compra"]).toBeDefined();
      expect(config.reversionesPorArchetype["servicio"]).toBeDefined();
    });
  });

  describe("Información de acciones ejecutadas", () => {
    it("cada acción debe tener estructura completa", () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
      };
      const resultado = motor.revertir(tx, "cancelar");

      for (const accion of resultado.acciones_ejecutadas) {
        expect(accion).toHaveProperty("tipo");
        expect(accion).toHaveProperty("entidad");
        expect(accion).toHaveProperty("razon");
        expect(
          ["reversar_asiento", "devolver_inventario", "cancelar_documento", "liberar_recurso"].includes(
            accion.tipo,
          ),
        ).toBe(true);
      }
    });
  });
});
