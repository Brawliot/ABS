import { describe, it, expect, beforeEach } from "vitest";
import { MotorAuditoria, type TipoEvento } from "../elements/motor-auditoria.js";

describe("MotorAuditoria", () => {
  let motor: MotorAuditoria;
  const txId = "tx-venta-001";
  const usuario = "vendedor-1";

  beforeEach(() => {
    motor = new MotorAuditoria();
  });

  describe("registrar()", () => {
    it("✅ registra evento correctamente", async () => {
      const resultado = await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "CREACION",
        usuario,
      });

      expect(resultado.ok).toBe(true);
      expect(resultado.registroId).toMatch(/^audit-/);
      expect(resultado.registroCreado.tipo).toBe("CREACION");
    });

    it("✅ asigna ID único a cada registro", async () => {
      const r1 = await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "CREACION",
        usuario,
      });

      const r2 = await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "VALIDACION",
        usuario,
      });

      expect(r1.registroId).not.toBe(r2.registroId);
    });

    it("✅ registra múltiples eventos en orden", async () => {
      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "CREACION",
        usuario,
      });

      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "VALIDACION",
        usuario,
      });

      const historial = motor.obtenerHistorial(txId);
      expect(historial).toHaveLength(2);
      expect(historial[0]!.tipo).toBe("CREACION");
      expect(historial[1]!.tipo).toBe("VALIDACION");
    });
  });

  describe("registrarTransicion()", () => {
    it("✅ registra cambio de estado", async () => {
      const resultado = await motor.registrarTransicion(
        txId,
        usuario,
        "BORRADOR",
        "VALIDADA",
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.registroCreado.tipo).toBe("CAMBIO_ESTADO");
      expect(resultado.registroCreado.estadoAntes).toBe("BORRADOR");
      expect(resultado.registroCreado.estadoDespues).toBe("VALIDADA");
    });
  });

  describe("registrarCambio()", () => {
    it("✅ detecta cambios de datos", async () => {
      const antes = { total: 100, impuesto: 21 };
      const despues = { total: 121, impuesto: 21 };

      const resultado = await motor.registrarCambio(
        txId,
        usuario,
        antes,
        despues,
        "motor-calculos",
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.registroCreado.cambios).toHaveLength(1);
      expect(resultado.registroCreado.cambios![0]!.campo).toBe("total");
      expect(resultado.registroCreado.cambios![0]!.antes).toBe(100);
      expect(resultado.registroCreado.cambios![0]!.despues).toBe(121);
    });

    it("✅ detecta nuevos campos", async () => {
      const antes = { total: 100 };
      const despues = { total: 100, descuento: 10 };

      const resultado = await motor.registrarCambio(
        txId,
        usuario,
        antes,
        despues,
        "motor-calculos",
      );

      const cambios = resultado.registroCreado.cambios;
      const cambioDescuento = cambios?.find((c) => c.campo === "descuento");
      expect(cambioDescuento).toBeDefined();
      expect(cambioDescuento!.antes).toBeUndefined();
      expect(cambioDescuento!.despues).toBe(10);
    });

    it("✅ detecta campos eliminados", async () => {
      const antes = { total: 100, temporal: "X" };
      const despues = { total: 100 };

      const resultado = await motor.registrarCambio(
        txId,
        usuario,
        antes,
        despues,
        "motor-calculos",
      );

      const cambios = resultado.registroCreado.cambios;
      const cambioTemporal = cambios?.find((c) => c.campo === "temporal");
      expect(cambioTemporal).toBeDefined();
      expect(cambioTemporal!.antes).toBe("X");
      expect(cambioTemporal!.despues).toBeUndefined();
    });
  });

  describe("registrarError()", () => {
    it("✅ registra errores con motor", async () => {
      const resultado = await motor.registrarError(
        txId,
        usuario,
        "motor-validacion",
        ["Cliente no activo", "Total negativo"],
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.registroCreado.tipo).toBe("ERROR");
      expect(resultado.registroCreado.resultado?.exitoso).toBe(false);
      expect(resultado.registroCreado.resultado?.errores).toHaveLength(2);
    });
  });

  describe("registrarValidacion()", () => {
    it("✅ registra validación exitosa", async () => {
      const resultado = await motor.registrarValidacion(
        txId,
        usuario,
        "motor-validacion",
        ["Margen bajo"],
      );

      expect(resultado.ok).toBe(true);
      expect(resultado.registroCreado.resultado?.exitoso).toBe(true);
      expect(resultado.registroCreado.resultado?.advertencias).toHaveLength(1);
    });
  });

  describe("obtenerHistorial()", () => {
    it("✅ retorna historial vacío si no existe", () => {
      const historial = motor.obtenerHistorial("tx-inexistente");
      expect(historial).toHaveLength(0);
    });

    it("✅ retorna todos los eventos de una transacción", async () => {
      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "CREACION",
        usuario,
      });

      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "VALIDACION",
        usuario,
      });

      const historial = motor.obtenerHistorial(txId);
      expect(historial).toHaveLength(2);
    });
  });

  describe("obtenerUltimosEventos()", () => {
    it("✅ retorna últimos N eventos", async () => {
      const tipos: TipoEvento[] = ["CREACION", "VALIDACION", "POLITICA", "CALCULO"];

      for (const tipo of tipos) {
        await motor.registrar({
          transaccionId: txId,
          timestamp: new Date().toISOString(),
          tipo,
          usuario,
        });
      }

      const ultimos = motor.obtenerUltimosEventos(txId, 2);
      expect(ultimos).toHaveLength(2);
      expect(ultimos[0]!.tipo).toBe("POLITICA");
      expect(ultimos[1]!.tipo).toBe("CALCULO");
    });

    it("✅ retorna por defecto 10 eventos", async () => {
      for (let i = 0; i < 15; i++) {
        await motor.registrar({
          transaccionId: txId,
          timestamp: new Date().toISOString(),
          tipo: "VALIDACION",
          usuario,
        });
      }

      const ultimos = motor.obtenerUltimosEventos(txId);
      expect(ultimos).toHaveLength(10);
    });
  });

  describe("obtenerEventosPorTipo()", () => {
    it("✅ filtra eventos por tipo", async () => {
      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "CREACION",
        usuario,
      });

      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "VALIDACION",
        usuario,
      });

      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "VALIDACION",
        usuario,
      });

      const validaciones = motor.obtenerEventosPorTipo(txId, "VALIDACION");
      expect(validaciones).toHaveLength(2);
    });
  });

  describe("obtenerEventosEnRango()", () => {
    it("✅ filtra por rango de tiempo", async () => {
      const ahora = new Date();
      const hace1Minuto = new Date(ahora.getTime() - 60000);
      const hace2Minutos = new Date(ahora.getTime() - 120000);

      await motor.registrar({
        transaccionId: txId,
        timestamp: hace2Minutos.toISOString(),
        tipo: "CREACION",
        usuario,
      });

      await motor.registrar({
        transaccionId: txId,
        timestamp: ahora.toISOString(),
        tipo: "VALIDACION",
        usuario,
      });

      const enRango = motor.obtenerEventosEnRango(
        txId,
        new Date(ahora.getTime() - 90000),
        ahora,
      );

      expect(enRango).toHaveLength(1);
      expect(enRango[0]!.tipo).toBe("VALIDACION");
    });
  });

  describe("generarReporte()", () => {
    it("✅ genera reporte completo", async () => {
      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "CREACION",
        usuario,
      });

      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "VALIDACION",
        usuario: "auditor",
        motor: "motor-validacion",
      });

      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "CAMBIO_ESTADO",
        usuario,
        motor: "motor-orquestador",
      });

      const reporte = motor.generarReporte(txId);

      expect(reporte.transaccionId).toBe(txId);
      expect(reporte.totalEventos).toBe(3);
      expect(reporte.eventosPorTipo["CREACION"]).toBe(1);
      expect(reporte.eventosPorTipo["VALIDACION"]).toBe(1);
      expect(reporte.usuarios).toContain(usuario);
      expect(reporte.usuarios).toContain("auditor");
      expect(reporte.motoresInvolucrados).toContain("motor-validacion");
      expect(reporte.primeraActividad).toBeDefined();
      expect(reporte.ultimaActividad).toBeDefined();
    });

    it("✅ incluye cambios finales en reporte", async () => {
      await motor.registrarCambio(
        txId,
        usuario,
        { total: 100 },
        { total: 121, impuesto: 21 },
        "motor-calculos",
      );

      const reporte = motor.generarReporte(txId);

      expect(reporte.cambiosFinales.total).toBe(121);
      expect(reporte.cambiosFinales.impuesto).toBe(21);
    });
  });

  describe("limpiarRegistrosAntiguos()", () => {
    it("✅ elimina registros más antiguos que N días", async () => {
      const ahora = new Date();
      const hace31Dias = new Date(ahora.getTime() - 31 * 24 * 60 * 60 * 1000);

      // Registrar evento antiguo manualmente
      await motor.registrar({
        transaccionId: "tx-antigua",
        timestamp: hace31Dias.toISOString(),
        tipo: "CREACION",
        usuario,
      });

      // Registrar evento reciente
      await motor.registrar({
        transaccionId: txId,
        timestamp: ahora.toISOString(),
        tipo: "CREACION",
        usuario,
      });

      const eliminados = motor.limpiarRegistrosAntiguos(30);

      expect(eliminados).toBe(1);
      expect(motor.obtenerHistorial("tx-antigua")).toHaveLength(0);
      expect(motor.obtenerHistorial(txId)).toHaveLength(1);
    });
  });

  describe("Flujo completo de auditoría", () => {
    it("✅ registra todo el ciclo de vida de una transacción", async () => {
      // 1. Creación
      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "CREACION",
        usuario: "vendedor-1",
      });

      // 2. Cálculos
      await motor.registrarCambio(
        txId,
        "sistema",
        { total: 0 },
        { total: 121, impuesto: 21 },
        "motor-calculos",
      );

      // 3. Validación
      await motor.registrarValidacion(
        txId,
        "sistema",
        "motor-validacion",
      );

      // 4. Cambio de estado
      await motor.registrarTransicion(txId, "vendedor-1", "BORRADOR", "VALIDADA");

      // 5. Orquestación (genera documentos)
      await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "ORQUESTACION",
        usuario: "sistema",
        motor: "motor-orquestador",
        resultado: { exitoso: true },
      });

      // Verificar historial
      const historial = motor.obtenerHistorial(txId);
      expect(historial).toHaveLength(5);

      // Verificar reporte
      const reporte = motor.generarReporte(txId);
      expect(reporte.totalEventos).toBe(5);
      expect(reporte.usuarios).toContain("vendedor-1");
      expect(reporte.usuarios).toContain("sistema");
      expect(reporte.motoresInvolucrados).toContain("motor-calculos");
      expect(reporte.cambiosFinales.total).toBe(121);
    });
  });

  describe("Configuración", () => {
    it("✅ obtiene configuración actual", () => {
      const config = motor.obtenerConfiguracion();
      expect(config.almacenamientoEnabled).toBe(true);
      expect(config.maxRegistrosPorTransaccion).toBeGreaterThan(0);
    });

    it("✅ actualiza configuración", () => {
      motor.actualizarConfiguracion({ almacenamientoEnabled: false });

      const config = motor.obtenerConfiguracion();
      expect(config.almacenamientoEnabled).toBe(false);
    });

    it("✅ respeta límite máximo de registros", async () => {
      const motorLimitado = new MotorAuditoria({ maxRegistrosPorTransaccion: 3 });

      for (let i = 0; i < 5; i++) {
        await motorLimitado.registrar({
          transaccionId: txId,
          timestamp: new Date().toISOString(),
          tipo: "VALIDACION",
          usuario,
        });
      }

      const historial = motorLimitado.obtenerHistorial(txId);
      expect(historial.length).toBeLessThanOrEqual(3);
    });
  });

  describe("Contexto y metadata", () => {
    it("✅ almacena contexto adicional", async () => {
      const resultado = await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "POLITICA",
        usuario,
        motor: "motor-politicas",
        contexto: {
          policyId: "venta-cliente-activo",
          resultado: "RECHAZADA",
        },
      });

      expect(resultado.registroCreado.contexto?.policyId).toBe("venta-cliente-activo");
    });

    it("✅ registra resultados detallados", async () => {
      const resultado = await motor.registrar({
        transaccionId: txId,
        timestamp: new Date().toISOString(),
        tipo: "ERROR",
        usuario,
        resultado: {
          exitoso: false,
          errores: ["Cliente no activo", "Crédito insuficiente"],
          advertencias: ["Margen bajo"],
        },
      });

      expect(resultado.registroCreado.resultado?.exitoso).toBe(false);
      expect(resultado.registroCreado.resultado?.errores).toHaveLength(2);
      expect(resultado.registroCreado.resultado?.advertencias).toHaveLength(1);
    });
  });
});
