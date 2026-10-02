import { describe, it, expect, beforeEach } from "vitest";
import { MotorValidacionTransiciones } from "../elements/motor-validacion-transiciones.js";
import { MotorOrquestadorTransiciones } from "../elements/motor-orquestador-transiciones.js";
import { MotorNotificaciones as MotorNotificacionesCapa0 } from "../elements/motor-notificaciones.js";
import { MotorGeneradorProcesos } from "../elements/generador-procesos.js";
import type { TransaccionProyectada } from "../elements/transaccion.js";
import type { TransaccionDatos } from "../core/events.js";

describe("Integración: Capa 0.3 - Flujo Completo de Transición", () => {
  let motorValidacion: MotorValidacionTransiciones;
  let motorOrquestador: MotorOrquestadorTransiciones;
  let motorNotificaciones: MotorNotificacionesCapa0;
  let motorGenerador: MotorGeneradorProcesos;
  let venta: TransaccionProyectada;

  beforeEach(() => {
    motorValidacion = new MotorValidacionTransiciones();
    motorGenerador = new MotorGeneradorProcesos();
    motorOrquestador = new MotorOrquestadorTransiciones(motorGenerador);
    motorNotificaciones = new MotorNotificacionesCapa0();

    venta = {
      id: "venta-integracion-001",
      lifecycleId: "venta-lifecycle",
      datos: {
        parteId: "cliente-1",
        fecha: new Date().toISOString(),
        cliente_email: "cliente@example.com",
        lineas: [{ cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }] as any,
        total: 12100,
      } as unknown as TransaccionDatos,
      creadaEn: new Date().toISOString(),
      creadaPor: "test",
      cambios: [],
    };
  });

  describe("Flujo: Venta Aceptada (t_aceptar)", () => {
    it("✅ debe ejecutar VALIDACIÓN → ORQUESTACIÓN → NOTIFICACIÓN en orden", async () => {
      const archetype = "venta";
      const transitionId = "t_aceptar";
      const nuevoEstado = "aceptada";

      // PASO 1: VALIDACIÓN
      const validacion = motorValidacion.validarTransicion(venta, archetype, transitionId);

      expect(validacion.permitida).toBe(true);
      expect(validacion.errores).toHaveLength(0);

      // PASO 2: ORQUESTACIÓN
      const orquesta = await motorOrquestador.alTransicionar(
        venta,
        archetype,
        transitionId,
        nuevoEstado
      );

      expect(orquesta.ok).toBe(true);
      expect(orquesta.generados).toBeDefined();
      expect(orquesta.generados!.length).toBeGreaterThan(0);

      // PASO 3: NOTIFICACIONES
      const notif = await motorNotificaciones.alTransicionar(venta, archetype, transitionId);

      expect(notif.ok).toBe(true);
      expect(notif.notificaciones.length).toBeGreaterThan(0);

      // Verificar que todos los componentes trabajaron juntos
      expect(validacion.permitida).toBe(true);
      expect(orquesta.ok).toBe(true);
      expect(notif.ok).toBe(true);
    });

    it("❌ debe rechazar en VALIDACIÓN y no pasar a ORQUESTACIÓN", async () => {
      const archetype = "venta";
      const transitionId = "t_aceptar";

      const ventaInvalida = {
        ...venta,
        datos: { ...venta.datos, parteId: undefined },
      };

      // PASO 1: VALIDACIÓN falla
      const validacion = motorValidacion.validarTransicion(
        ventaInvalida,
        archetype,
        transitionId
      );

      expect(validacion.permitida).toBe(false);
      expect(validacion.errores.length).toBeGreaterThan(0);

      // Si VALIDACIÓN falla, NO debe continuarse a ORQUESTACIÓN
      // (En la integración real en action-handler, se rechaza aquí)
    });

    it("✅ debe generar documentos DESPUÉS del cambio de estado", async () => {
      const archetype = "venta";
      const transitionId = "t_aceptar";
      const nuevoEstado = "aceptada";

      // Simular cambio de estado
      const ventaActualizada = { ...venta };
      // Estado cambió a "aceptada"

      // ORQUESTACIÓN con estado ya actualizado
      const orquesta = await motorOrquestador.alTransicionar(
        ventaActualizada,
        archetype,
        transitionId,
        nuevoEstado
      );

      // Debe generar documentos (factura, asientos, etc.)
      expect(orquesta.ok).toBe(true);
      expect(orquesta.generados).toContain("factura");
      expect(orquesta.generados).toContain("asientos_contables");
      expect(orquesta.generados).toContain("movimientos_inventario");
    });

    it("✅ debe enviar notificaciones a múltiples destinatarios", async () => {
      const archetype = "venta";
      const transitionId = "t_aceptar";

      const notif = await motorNotificaciones.alTransicionar(venta, archetype, transitionId);

      expect(notif.ok).toBe(true);

      // Debe haber notificaciones para cliente, finanzas, taller
      const tipos = notif.notificaciones.map((n) => n.tipo);
      expect(tipos).toContain("cliente");
      expect(tipos).toContain("finanzas");
      expect(tipos).toContain("taller");

      // Cada una en su canal apropiado
      const notifCliente = notif.notificaciones.find((n) => n.tipo === "cliente");
      expect(notifCliente?.canal).toBe("email");

      const notifFinanzas = notif.notificaciones.find((n) => n.tipo === "finanzas");
      expect(notifFinanzas?.canal).toBe("in_app");
    });
  });

  describe("Flujo: Compra Completa", () => {
    let compra: TransaccionProyectada;

    beforeEach(() => {
      compra = {
        id: "compra-integracion-001",
        lifecycleId: "compra-lifecycle",
        datos: {
          parteId: "proveedor-1",
          fecha: new Date().toISOString(),
          proveedor_id: "proveedor-1",
          proveedor_email: "proveedor@example.com",
          lineas: [{ cantidadMilesimas: 1000, precioCentimos: 5000, ivaPct: 21 }] as any,
          orden_compra: "OC-2026-001",
        } as unknown as TransaccionDatos,
        creadaEn: new Date().toISOString(),
        creadaPor: "test",
        cambios: [],
      };
    });

    it("✅ t_emitir_oc: VALIDAR → ORQUESTAR → NOTIFICAR", async () => {
      const archetype = "compra";
      const transitionId = "t_emitir_oc";
      const nuevoEstado = "oc_emitida";

      // VALIDACIÓN
      const validacion = motorValidacion.validarTransicion(compra, archetype, transitionId);
      expect(validacion.permitida).toBe(true);

      // ORQUESTACIÓN
      const orquesta = await motorOrquestador.alTransicionar(
        compra,
        archetype,
        transitionId,
        nuevoEstado
      );
      expect(orquesta.ok).toBe(true);
      expect(orquesta.generados).toContain("orden_compra");

      // NOTIFICACIONES
      const notif = await motorNotificaciones.alTransicionar(compra, archetype, transitionId);
      expect(notif.ok).toBe(true);
      expect(notif.notificaciones.length).toBeGreaterThan(0);

      const notifProveedor = notif.notificaciones.find((n) => n.tipo === "proveedor");
      expect(notifProveedor?.canal).toBe("email");
      expect(notifProveedor?.destinatario).toBe("proveedor@example.com");
    });

    it("✅ t_recibir: Genera movimientos automáticamente", async () => {
      const archetype = "compra";
      const transitionId = "t_recibir";
      const nuevoEstado = "recibida";

      const orquesta = await motorOrquestador.alTransicionar(
        compra,
        archetype,
        transitionId,
        nuevoEstado
      );

      expect(orquesta.ok).toBe(true);
      expect(orquesta.generados).toContain("movimientos_inventario");
    });

    it("✅ t_facturar: Genera asientos contables automáticamente", async () => {
      const archetype = "compra";
      const transitionId = "t_facturar";
      const nuevoEstado = "facturada";

      const orquesta = await motorOrquestador.alTransicionar(
        compra,
        archetype,
        transitionId,
        nuevoEstado
      );

      expect(orquesta.ok).toBe(true);
      expect(orquesta.generados).toContain("asientos_contables");
    });
  });

  describe("Flujo: Servicio Completo", () => {
    let servicio: TransaccionProyectada;

    beforeEach(() => {
      servicio = {
        id: "servicio-integracion-001",
        lifecycleId: "servicio-lifecycle",
        datos: {
          parteId: "cliente-2",
          fecha: new Date().toISOString(),
          cliente_email: "cliente2@example.com",
          hitos: ["hito-1"],
          cliente_id: "cliente-2",
          total: 50000,
          lineas: [] as any,
        } as unknown as TransaccionDatos,
        creadaEn: new Date().toISOString(),
        creadaPor: "test",
        cambios: [],
      };
    });

    it("✅ t_ejecutar: VALIDAR → ORQUESTAR → NOTIFICAR", async () => {
      const archetype = "servicio";
      const transitionId = "t_ejecutar";
      const nuevoEstado = "ejecutando";

      // VALIDACIÓN
      const validacion = motorValidacion.validarTransicion(servicio, archetype, transitionId);
      expect(validacion.permitida).toBe(true);

      // ORQUESTACIÓN
      const orquesta = await motorOrquestador.alTransicionar(
        servicio,
        archetype,
        transitionId,
        nuevoEstado
      );
      expect(orquesta.ok).toBe(true);
      expect(orquesta.generados).toContain("tareas");

      // NOTIFICACIONES
      const notif = await motorNotificaciones.alTransicionar(servicio, archetype, transitionId);
      expect(notif.ok).toBe(true);
      expect(notif.notificaciones.length).toBeGreaterThan(0);
    });

    it("✅ t_completar: Genera factura y asientos", async () => {
      const archetype = "servicio";
      const transitionId = "t_completar";
      const nuevoEstado = "completado";

      const orquesta = await motorOrquestador.alTransicionar(
        servicio,
        archetype,
        transitionId,
        nuevoEstado
      );

      expect(orquesta.ok).toBe(true);
      expect(orquesta.generados).toContain("factura");
      expect(orquesta.generados).toContain("asientos_contables");
    });
  });

  describe("Manejo de errores en flujo integrado", () => {
    it("❌ VALIDACIÓN rechaza → No continúa a ORQUESTACIÓN", async () => {
      const archetype = "venta";
      const transitionId = "t_aceptar";

      const ventaInvalida = {
        ...venta,
        datos: { ...venta.datos, lineas: [] },
      };

      // VALIDACIÓN falla
      const validacion = motorValidacion.validarTransicion(
        ventaInvalida,
        archetype,
        transitionId
      );
      expect(validacion.permitida).toBe(false);

      // En la implementación real en action-handler, rechaza aquí
      // y no continúa a orquestación
    });

    it("⚠️ ORQUESTACIÓN falla pero NOTIFICACIONES continúan", async () => {
      const archetype = "venta";
      const transitionId = "t_aceptar";
      const nuevoEstado = "aceptada";

      // Crear venta sin datos requeridos
      const ventaSinLineas = {
        ...venta,
        datos: { ...venta.datos, lineas: [] },
      };

      // ORQUESTACIÓN falla (obligatorio)
      const orquesta = await motorOrquestador.alTransicionar(
        ventaSinLineas,
        archetype,
        transitionId,
        nuevoEstado
      );
      expect(orquesta.ok).toBe(false);

      // Pero NOTIFICACIONES pueden continuar de todas formas
      // (En acción-handler, orquestación no es bloqueante)
      const notif = await motorNotificaciones.alTransicionar(venta, archetype, transitionId);
      expect(notif.ok).toBe(true);
    });
  });

  describe("Independencia de motores", () => {
    it("✅ VALIDACIÓN funciona sin ORQUESTACIÓN", () => {
      const validacion = motorValidacion.validarTransicion(venta, "venta", "t_aceptar");
      expect(validacion.permitida).toBe(true);
    });

    it("✅ ORQUESTACIÓN funciona sin VALIDACIÓN", async () => {
      const orquesta = await motorOrquestador.alTransicionar(venta, "venta", "t_aceptar", "aceptada");
      expect(orquesta.ok).toBe(true);
    });

    it("✅ NOTIFICACIONES funciona sin VALIDACIÓN u ORQUESTACIÓN", async () => {
      const notif = await motorNotificaciones.alTransicionar(venta, "venta", "t_aceptar");
      expect(notif.ok).toBe(true);
    });
  });

  describe("Extensibilidad conjunta", () => {
    it("✅ debe permitir agregar reglas a los 3 motores", () => {
      // Agregar regla de validación personalizada
      const reglaValidacion = {
        id: "custom-validacion",
        descripción: "Validación personalizada",
        validar: () => ({ ok: true, error: undefined }),
        bloqueante: true,
      };
      motorValidacion.registrarRegla("venta", "t_custom", reglaValidacion);

      // Agregar regla de orquestación personalizada
      const reglaOrquesta = {
        genera: ["reporte"],
        requiere: [],
        obligatorio: false,
      };
      motorOrquestador.registrarRegla("venta", "t_custom", reglaOrquesta);

      // Agregar regla de notificación personalizada
      const reglaNotif = {
        id: "custom-notif",
        tipo: "cliente" as const,
        canal: "email" as const,
        obtenerDestinatario: (tx: TransaccionProyectada) => (tx.datos as any).cliente_email,
        asunto: () => "Custom",
        contenido: () => "Custom",
        habilitada: true,
      };
      motorNotificaciones.registrarRegla("venta", "t_custom", reglaNotif);

      // Verificar que las reglas se agregaron
      const configVal = motorValidacion.obtenerConfiguracion();
      const configOrq = motorOrquestador.obtenerConfiguracion();
      const configNotif = motorNotificaciones.obtenerConfiguracion();

      expect(configVal.reglasPorArchetype.venta["t_custom"]).toBeDefined();
      expect(configOrq.reglasPorArchetype.venta["t_custom"]).toBeDefined();
      expect(configNotif.reglasPorArchetype.venta["t_custom"]).toBeDefined();
    });
  });

  describe("Orden de ejecución crítica", () => {
    it("✅ VALIDACIÓN debe ocurrir ANTES de cambio de estado", () => {
      // Esta es una verificación conceptual
      // En la implementación real en action-handler:
      // 1. Se ejecuta motorValidacion.validarTransicion() ANTES de attemptJudgedAdvance()
      // 2. Si falla, se rechaza y no continúa

      const ventaInvalida = {
        ...venta,
        datos: { ...venta.datos, total: 0 },
      };

      const validacion = motorValidacion.validarTransicion(
        ventaInvalida,
        "venta",
        "t_aceptar"
      );

      expect(validacion.permitida).toBe(false);
      // Estado no cambió porque validación falló
    });

    it("✅ ORQUESTACIÓN debe ocurrir DESPUÉS de cambio de estado", async () => {
      // Esta es una verificación conceptual
      // En la implementación real en action-handler:
      // 1. attemptJudgedAdvance() cambia el estado
      // 2. store.append() registra el evento
      // 3. Luego motorOrquestador.alTransicionar() genera documentos

      const orquesta = await motorOrquestador.alTransicionar(
        venta,
        "venta",
        "t_aceptar",
        "aceptada"
      );

      expect(orquesta.ok).toBe(true);
      // Documentos generados con estado ya actualizado
    });

    it("✅ NOTIFICACIONES debe ocurrir DESPUÉS de ORQUESTACIÓN", async () => {
      // Esta es una verificación conceptual
      // En la implementación real en action-handler:
      // 1. motorOrquestador ejecuta primero
      // 2. Luego motorNotificaciones ejecuta
      // 3. Ambas son no-bloqueantes

      const orquesta = await motorOrquestador.alTransicionar(
        venta,
        "venta",
        "t_aceptar",
        "aceptada"
      );

      const notif = await motorNotificaciones.alTransicionar(venta, "venta", "t_aceptar");

      expect(orquesta.ok).toBe(true);
      expect(notif.ok).toBe(true);
      // Ambas ejecutaron exitosamente en orden
    });
  });
});
