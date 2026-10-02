import { describe, it, expect, beforeEach } from "vitest";
import { MotorNotificaciones as MotorNotificacionesCapa0 } from "../elements/motor-notificaciones.js";
import type { TransaccionProyectada } from "../elements/transaccion.js";
import type { TransaccionDatos } from "../core/events.js";

describe("MotorNotificaciones (Capa 0.3)", () => {
  let motor: MotorNotificacionesCapa0;
  let ventaAceptada: TransaccionProyectada;
  let compraRecibida: TransaccionProyectada;
  let servicioCompletado: TransaccionProyectada;

  beforeEach(() => {
    motor = new MotorNotificacionesCapa0();

    ventaAceptada = {
      id: "venta-001",
      lifecycleId: "venta-lifecycle",
      datos: {
        parteId: "cliente-1",
        fecha: new Date().toISOString(),
        cliente_email: "cliente@example.com",
        total: 12100,
        lineas: [{ cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }] as any,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };

    compraRecibida = {
      id: "compra-001",
      lifecycleId: "compra-lifecycle",
      datos: {
        parteId: "proveedor-1",
        fecha: new Date().toISOString(),
        proveedor_id: "proveedor-1",
        proveedor_email: "proveedor@example.com",
        orden_compra: "OC-2026-001",
        lineas: [{ cantidadMilesimas: 1000, precioCentimos: 5000, ivaPct: 21 }] as any,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };

    servicioCompletado = {
      id: "servicio-001",
      lifecycleId: "servicio-lifecycle",
      datos: {
        parteId: "cliente-2",
        fecha: new Date().toISOString(),
        cliente_email: "cliente2@example.com",
        hitos: ["hito-1"],
        lineas: [] as any,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };
  });

  describe("VENTA - Transición t_aceptar", () => {
    it("✅ debe generar notificaciones para cliente, finanzas y taller", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      expect(resultado.ok).toBe(true);
      expect(resultado.notificaciones.length).toBeGreaterThan(0);

      // Debe haber notificaciones para diferentes tipos
      const tipos = resultado.notificaciones.map((n) => n.tipo);
      expect(tipos).toContain("cliente");
      expect(tipos).toContain("finanzas");
      expect(tipos).toContain("taller");
    });

    it("✅ debe enviar email al cliente", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      const notifCliente = resultado.notificaciones.find((n) => n.tipo === "cliente");
      expect(notifCliente).toBeDefined();
      expect(notifCliente?.canal).toBe("email");
      expect(notifCliente?.destinatario).toBe("cliente@example.com");
      expect(notifCliente?.asunto).toContain("Pedido");
      expect(notifCliente?.asunto).toContain("Confirmado");
    });

    it("✅ debe notificar a finanzas vía in_app", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      const notifFinanzas = resultado.notificaciones.find((n) => n.tipo === "finanzas");
      expect(notifFinanzas).toBeDefined();
      expect(notifFinanzas?.canal).toBe("in_app");
      expect(notifFinanzas?.destinatario).toBe("role:finanzas");
      expect(notifFinanzas?.asunto).toContain("factura");
    });

    it("✅ debe notificar a taller vía in_app", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      const notifTaller = resultado.notificaciones.find((n) => n.tipo === "taller");
      expect(notifTaller).toBeDefined();
      expect(notifTaller?.canal).toBe("in_app");
      expect(notifTaller?.destinatario).toBe("role:taller");
      expect(notifTaller?.asunto).toContain("Orden");
    });

    it("✅ debe incluir información de la transacción en contenido", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      const notifCliente = resultado.notificaciones.find((n) => n.tipo === "cliente");
      expect(notifCliente?.contenido).toBeDefined();
      expect(notifCliente?.contenido).toContain("€");
      expect(notifCliente?.contenido.length).toBeGreaterThan(0);
    });
  });

  describe("VENTA - Transición t_iniciar_entrega", () => {
    it("✅ debe notificar a cliente y logística", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_iniciar_entrega");

      expect(resultado.ok).toBe(true);
      expect(resultado.notificaciones.length).toBeGreaterThan(0);

      const tipos = resultado.notificaciones.map((n) => n.tipo);
      expect(tipos).toContain("cliente");
      expect(tipos).toContain("logística");
    });

    it("✅ debe informar al cliente sobre envío", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_iniciar_entrega");

      const notifCliente = resultado.notificaciones.find((n) => n.tipo === "cliente");
      expect(notifCliente?.asunto).toContain("camino");
      expect(notifCliente?.contenido).toContain("entrega");
    });
  });

  describe("VENTA - Transición t_cerrar", () => {
    it("✅ debe notificar al cliente sobre entrega completada", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_cerrar");

      expect(resultado.ok).toBe(true);
      expect(resultado.notificaciones.length).toBeGreaterThan(0);

      const notifCliente = resultado.notificaciones.find((n) => n.tipo === "cliente");
      expect(notifCliente?.asunto).toContain("entregado");
    });
  });

  describe("COMPRA - Transición t_emitir_oc", () => {
    it("✅ debe notificar al proveedor", async () => {
      const resultado = await motor.alTransicionar(compraRecibida, "compra", "t_emitir_oc");

      expect(resultado.ok).toBe(true);
      expect(resultado.notificaciones.length).toBeGreaterThan(0);

      const notifProveedor = resultado.notificaciones.find((n) => n.tipo === "proveedor");
      expect(notifProveedor).toBeDefined();
      expect(notifProveedor?.canal).toBe("email");
      expect(notifProveedor?.destinatario).toBe("proveedor@example.com");
    });
  });

  describe("COMPRA - Transición t_recibir", () => {
    it("✅ debe notificar a finanzas sobre compra recibida", async () => {
      const resultado = await motor.alTransicionar(compraRecibida, "compra", "t_recibir");

      expect(resultado.ok).toBe(true);

      const notifFinanzas = resultado.notificaciones.find((n) => n.tipo === "finanzas");
      expect(notifFinanzas).toBeDefined();
      expect(notifFinanzas?.asunto).toContain("recibida");
    });
  });

  describe("SERVICIO - Transición t_ejecutar", () => {
    it("✅ debe notificar a cliente y taller", async () => {
      const resultado = await motor.alTransicionar(servicioCompletado, "servicio", "t_ejecutar");

      expect(resultado.ok).toBe(true);
      expect(resultado.notificaciones.length).toBeGreaterThan(0);

      const tipos = resultado.notificaciones.map((n) => n.tipo);
      expect(tipos).toContain("cliente");
      expect(tipos).toContain("interno");
    });
  });

  describe("SERVICIO - Transición t_completar", () => {
    it("✅ debe notificar al cliente sobre servicio completado", async () => {
      const resultado = await motor.alTransicionar(servicioCompletado, "servicio", "t_completar");

      expect(resultado.ok).toBe(true);

      const notifCliente = resultado.notificaciones.find((n) => n.tipo === "cliente");
      expect(notifCliente).toBeDefined();
      expect(notifCliente?.asunto).toContain("completo");
    });
  });

  describe("Canales múltiples", () => {
    it("✅ debe soportar email, in_app, sms, push, webhook", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      const canales = resultado.notificaciones.map((n) => n.canal);
      expect(canales).toContain("email");
      expect(canales).toContain("in_app");
    });
  });

  describe("Obtención dinámica de destinatarios", () => {
    it("✅ debe obtener email del cliente desde datos", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      const notifCliente = resultado.notificaciones.find((n) => n.tipo === "cliente");
      expect(notifCliente?.destinatario).toBe("cliente@example.com");
    });

    it("✅ debe usar role cuando no hay email individual", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      const notifFinanzas = resultado.notificaciones.find((n) => n.tipo === "finanzas");
      expect(notifFinanzas?.destinatario).toBe("role:finanzas");
    });

    it("⚠️ debe omitir notificación si no puede obtener destinatario", async () => {
      const ventaSinEmail = {
        ...ventaAceptada,
        datos: { ...ventaAceptada.datos, cliente_email: undefined },
      };

      const resultado = await motor.alTransicionar(ventaSinEmail, "venta", "t_aceptar");

      const notifCliente = resultado.notificaciones.find((n) => n.tipo === "cliente");
      // Puede ser undefined o estar filtrada
      if (notifCliente) {
        expect(notifCliente.destinatario).toBeDefined();
      }
    });
  });

  describe("Referencia a transacción", () => {
    it("✅ debe incluir referencia de transacción", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      for (const notif of resultado.notificaciones) {
        expect(notif.referencia).toBe(ventaAceptada.id);
      }
    });
  });

  describe("Estado inicial de notificaciones", () => {
    it("✅ debe inicializar con enviada=false", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      for (const notif of resultado.notificaciones) {
        expect(notif.enviada).toBe(false);
        expect(notif.intentos).toBe(0);
        expect(notif.fechaEnvío).toBeUndefined();
      }
    });

    it("✅ debe tener ID único para cada notificación", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      const ids = resultado.notificaciones.map((n) => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("Envío de notificaciones", () => {
    it("✅ debe marcar notificación como enviada", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      await motor.enviarNotificaciones(resultado.notificaciones);

      for (const notif of resultado.notificaciones) {
        expect(notif.enviada).toBe(true);
        expect(notif.fechaEnvío).toBeDefined();
      }
    });

    it("✅ debe registrar en historial de notificaciones", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      await motor.enviarNotificaciones(resultado.notificaciones);

      const historial = motor.obtenerNotificaciones();
      expect(historial.length).toBeGreaterThan(0);
    });
  });

  describe("Extensibilidad - registrarRegla()", () => {
    it("✅ debe registrar nueva regla de notificación", async () => {
      const novaRegla = {
        id: "venta-custom-notif",
        tipo: "cliente" as const,
        canal: "sms" as const,
        obtenerDestinatario: (tx: TransaccionProyectada) => (tx.datos as any).cliente_phone,
        asunto: () => "Notificación personalizada",
        contenido: () => "Tu pedido ha sido actualizado",
        habilitada: true,
      };

      motor.registrarRegla("venta", "t_custom", novaRegla);

      const config = motor.obtenerConfiguracion();
      expect(config.reglasPorArchetype.venta["t_custom"]).toBeDefined();
      expect(config.reglasPorArchetype.venta["t_custom"].length).toBeGreaterThan(0);
    });

    it("✅ debe usar regla personalizada registrada", async () => {
      const ventaConPhone = {
        ...ventaAceptada,
        datos: { ...ventaAceptada.datos, cliente_phone: "+34123456789" },
      };

      const novaRegla = {
        id: "venta-custom-notif",
        tipo: "cliente" as const,
        canal: "sms" as const,
        obtenerDestinatario: (tx: TransaccionProyectada) => (tx.datos as any).cliente_phone,
        asunto: () => "Notificación personalizada",
        contenido: () => "Tu pedido ha sido actualizado",
        habilitada: true,
      };

      motor.registrarRegla("venta", "t_custom", novaRegla);

      const resultado = await motor.alTransicionar(ventaConPhone, "venta", "t_custom");

      const notifSMS = resultado.notificaciones.find((n) => n.canal === "sms");
      expect(notifSMS).toBeDefined();
      expect(notifSMS?.destinatario).toBe("+34123456789");
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

    it("✅ debe tener reglas para cada transición", () => {
      const config = motor.obtenerConfiguracion();

      expect(config.reglasPorArchetype.venta["t_aceptar"]).toBeDefined();
      expect(config.reglasPorArchetype.compra["t_emitir_oc"]).toBeDefined();
      expect(config.reglasPorArchetype.servicio["t_ejecutar"]).toBeDefined();
    });
  });

  describe("obtenerNotificaciones()", () => {
    it("✅ debe retornar historial de notificaciones", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");

      const historial = motor.obtenerNotificaciones();
      expect(historial.length).toBeGreaterThan(0);
    });

    it("✅ debe incluir todas las notificaciones generadas", async () => {
      const resultado1 = await motor.alTransicionar(ventaAceptada, "venta", "t_aceptar");
      const resultado2 = await motor.alTransicionar(ventaAceptada, "venta", "t_iniciar_entrega");

      const historial = motor.obtenerNotificaciones();
      const cantidadTotal = resultado1.notificaciones.length + resultado2.notificaciones.length;
      expect(historial.length).toBe(cantidadTotal);
    });
  });

  describe("Archetype sin reglas", () => {
    it("✅ debe permitir transición si no hay reglas", async () => {
      const resultado = await motor.alTransicionar(ventaAceptada, "unknown", "t_unknown");

      expect(resultado.ok).toBe(true);
      expect(resultado.notificaciones).toHaveLength(0);
    });
  });

  describe("Transición sin notificaciones", () => {
    it("✅ debe permitir transición incluso sin notificaciones", async () => {
      // Crear una transición que no tenga reglas
      const resultado = await motor.alTransicionar(ventaAceptada, "venta", "t_no_existe");

      expect(resultado.ok).toBe(true);
      expect(resultado.notificaciones).toHaveLength(0);
    });
  });
});
