import { describe, it, expect } from "vitest";
import { MotorNotificaciones } from "../elements/motor-notificaciones.js";

describe("MotorNotificaciones", () => {
  const motor = new MotorNotificaciones();

  describe("Notificaciones de venta.t_aceptar", () => {
    it("debe preparar notificaciones para admin y cliente", async () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
        cliente_id: "cli-1",
        total: 100,
      };
      const resultado = motor.alTransicionar(tx, "t_aceptar");

      // Admin: email + in_app
      // Cliente: email + sms
      expect(resultado.notificaciones.length).toBeGreaterThan(0);
      expect(resultado.errores).toHaveLength(0);

      const canales = resultado.notificaciones.map((n) => n.canal);
      expect(canales).toContain("email");
      expect(canales).toContain("in_app");
      expect(canales).toContain("sms");
    });

    it("cada notificación debe tener estructura completa", async () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
        cliente_id: "cli-1",
        total: 100,
      };
      const resultado = motor.alTransicionar(tx, "t_aceptar");

      for (const notif of resultado.notificaciones) {
        expect(notif).toHaveProperty("id");
        expect(notif).toHaveProperty("actorId");
        expect(notif).toHaveProperty("canal");
        expect(notif).toHaveProperty("asunto");
        expect(notif).toHaveProperty("cuerpo");
        expect(typeof notif.id).toBe("string");
        expect(typeof notif.actorId).toBe("string");
        expect(
          ["email", "sms", "push", "in_app", "webhook"].includes(notif.canal),
        ).toBe(true);
      }
    });
  });

  describe("Notificaciones de venta.t_facturar", () => {
    it("debe notificar a finanzas y cliente", () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
        cliente_id: "cli-1",
        total: 100,
      };
      const resultado = motor.alTransicionar(tx, "t_facturar");

      expect(resultado.notificaciones.length).toBeGreaterThan(0);

      const actores = resultado.notificaciones.map((n) => n.actorId);
      expect(actores).toContain("finanzas");
      expect(actores).toContain("cliente");
    });
  });

  describe("Notificaciones de compra.t_aceptar", () => {
    it("debe notificar a logística", () => {
      const tx = {
        id: "cmp-1",
        arquetipo_id: "compra",
        proveedor_id: "prov-1",
        total: 500,
      };
      const resultado = motor.alTransicionar(tx, "t_aceptar");

      expect(resultado.notificaciones.length).toBeGreaterThan(0);

      const actores = resultado.notificaciones.map((n) => n.actorId);
      expect(actores).toContain("logistica");
    });
  });

  describe("Notificaciones de servicio.t_iniciar", () => {
    it("debe notificar al equipo técnico", () => {
      const tx = {
        id: "srv-1",
        arquetipo_id: "servicio",
        cliente_id: "cli-1",
        descripcion: "Mantenimiento",
      };
      const resultado = motor.alTransicionar(tx, "t_iniciar");

      expect(resultado.notificaciones.length).toBeGreaterThan(0);

      const actores = resultado.notificaciones.map((n) => n.actorId);
      expect(actores).toContain("equipo");
    });
  });

  describe("Sin notificaciones configuradas", () => {
    it("debe devolver lista vacía si no hay reglas", () => {
      const tx = {
        id: "txn-1",
        arquetipo_id: "archetype_desconocido",
      };
      const resultado = motor.alTransicionar(tx, "t_unknown");

      expect(resultado.notificaciones).toHaveLength(0);
      expect(resultado.errores).toHaveLength(0);
    });
  });

  describe("Envío de notificaciones", () => {
    it("debe enviar todas las notificaciones sin errores", async () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
        cliente_id: "cli-1",
        total: 100,
      };
      const resultado = motor.alTransicionar(tx, "t_aceptar");

      // No debe lanzar error
      await expect(
        motor.enviarNotificaciones(resultado.notificaciones),
      ).resolves.toBeUndefined();
    });
  });

  describe("Registro dinámico de reglas", () => {
    it("debe permitir agregar reglas nuevas en tiempo de ejecución", () => {
      const motorDinamico = new MotorNotificaciones();
      motorDinamico.registrarRegla(
        "venta",
        "t_custom",
        [
          {
            actorId: "gerente",
            roles: ["gerente"],
            canales: ["email"],
          },
        ],
        "venta_custom",
      );

      const tx = {
        id: "vta-custom",
        arquetipo_id: "venta",
      };
      const resultado = motorDinamico.alTransicionar(tx, "t_custom");

      expect(resultado.notificaciones.length).toBeGreaterThan(0);
      const notif = resultado.notificaciones[0];
      expect(notif).toBeDefined();
      if (notif) {
        expect(notif.actorId).toBe("gerente");
      }
    });
  });

  describe("Obtener configuración", () => {
    it("debe devolver la configuración completa", () => {
      const config = motor.obtenerConfiguracion();
      expect(config).toHaveProperty("notificacionesPorArchetype");
      expect(config.notificacionesPorArchetype["venta"]).toBeDefined();
      expect(config.notificacionesPorArchetype["compra"]).toBeDefined();
      expect(config.notificacionesPorArchetype["servicio"]).toBeDefined();
    });
  });

  describe("Canales de notificación", () => {
    it("debe soportar múltiples canales", () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
        total: 100,
      };
      const resultado = motor.alTransicionar(tx, "t_aceptar");

      const canalesUnicos = new Set(resultado.notificaciones.map((n) => n.canal));
      expect(canalesUnicos.size).toBeGreaterThan(1);

      for (const canal of canalesUnicos) {
        expect(
          ["email", "sms", "push", "in_app", "webhook"].includes(canal),
        ).toBe(true);
      }
    });

    it("notificación in_app debe incluir URL", () => {
      const tx = {
        id: "vta-1",
        arquetipo_id: "venta",
        total: 100,
      };
      const resultado = motor.alTransicionar(tx, "t_aceptar");

      const inAppNotifs = resultado.notificaciones.filter(
        (n) => n.canal === "in_app",
      );
      for (const notif of inAppNotifs) {
        expect(notif.url).toBeDefined();
        if (notif.url) {
          expect(notif.url).toContain("/transacciones/");
        }
      }
    });
  });
});
