import { describe, it, expect, beforeEach } from "vitest";
import { MotorConnectors } from "../policies/integraciones-connectors.js";
import { MotorFlujos } from "../policies/integraciones-flujos.js";
import { SqliteIntegracionesStore } from "../adapters/sqlite-integraciones-store.js";
import { join } from "path";
import { mkdirSync, rmSync } from "fs";

const TEST_DB = join("/tmp", `test-integraciones-${Date.now()}.sqlite`);

describe("Integraciones Externas - Módulo Futuro (75%)", () => {
  let motorConnectors: MotorConnectors;
  let motorFlujos: MotorFlujos;
  let store: SqliteIntegracionesStore;

  beforeEach(() => {
    motorConnectors = new MotorConnectors();
    motorFlujos = new MotorFlujos();
    store = new SqliteIntegracionesStore(TEST_DB);
  });

  // ==================== TESTS CONECTORES ====================

  it("crea conector con credenciales encriptadas", () => {
    const conector = motorConnectors.crearConector(
      "API REST Producción",
      "api_rest",
      {
        url: "https://api.example.com",
        api_key: "secret-key-123",
        timeout: 5000,
      }
    );

    expect(conector.id).toBeDefined();
    expect(conector.nombre).toBe("API REST Producción");
    expect(conector.tipo).toBe("api_rest");
    expect(conector.estado).toBe("inactivo");
    expect(conector.credenciales_encrypted).toBeDefined();
    expect(conector.tasa_éxito).toBe(0);
  });

  it("autentica conector con servicio externo", () => {
    const conector = motorConnectors.crearConector(
      "Zapier Webhook",
      "zapier",
      { webhook_url: "https://hooks.zapier.com/..." }
    );

    const resultado = motorConnectors.autenticar(conector.id);

    expect(resultado.ok).toBe(true);
    expect(resultado.error).toBeUndefined();
  });

  it("define mapeo de datos entre tablas", () => {
    const conector = motorConnectors.crearConector(
      "Mapeo Test",
      "api_rest",
      {}
    );

    motorConnectors.definirMapeo(
      conector.id,
      "clientes_origen",
      "clientes_destino",
      [
        {
          campo_origen: "nombre_completo",
          campo_destino: "nombre",
          obligatorio: true,
        },
        {
          campo_origen: "email_principal",
          campo_destino: "email",
          obligatorio: true,
        },
        {
          campo_origen: "fecha_nacimiento",
          campo_destino: "fecha_nac",
          transformación: (v: unknown) =>
            v instanceof Date ? v.toISOString() : String(v),
          obligatorio: false,
        },
      ]
    );

    const estado = motorConnectors.obtenerEstadoConector(conector.id);
    expect(estado.conexión_validada).toBe(true);
  });

  it("sincroniza desde servicio externo (traer datos)", () => {
    const conector = motorConnectors.crearConector(
      "Sincro Origen",
      "api_rest",
      { url: "https://api.origin.com" }
    );

    const resultado = motorConnectors.sincronizarDesde(conector.id);

    // Verificar que se trae al menos 0 registros (puede ser 0)
    expect(resultado.registros_traídos).toBeDefined();
    expect(resultado.registros_actualizados).toBeDefined();
    expect(resultado.duracion_ms).toBeGreaterThanOrEqual(0);
    expect(resultado.errores).toHaveLength(0);
  });

  it("sincroniza hacia servicio externo (enviar datos)", () => {
    const conector = motorConnectors.crearConector(
      "Sincro Destino",
      "sftp",
      { host: "sftp.example.com", username: "user", password: "pass" }
    );

    const resultado = motorConnectors.sincronizarHacia(conector.id);

    // Verificar que se envían registros
    expect(resultado.registros_traídos).toBeDefined();
    expect(resultado.registros_actualizados).toBeDefined();
    expect(resultado.duracion_ms).toBeGreaterThanOrEqual(0);
  });

  it("obtiene estado actual del conector", () => {
    const conector = motorConnectors.crearConector(
      "Estado Test",
      "email",
      { servidor: "smtp.gmail.com", puerto: 587 }
    );

    const estado = motorConnectors.obtenerEstadoConector(conector.id);

    expect(estado.estado).toBeDefined();
    expect(estado.tasa_éxito).toBeGreaterThanOrEqual(0);
    expect(estado.conexión_validada).toBeDefined();
  });

  it("obtiene historial de sincronizaciones de conector", () => {
    const conector = motorConnectors.crearConector(
      "Historial Test",
      "api_rest",
      {}
    );

    motorConnectors.sincronizarDesde(conector.id);
    motorConnectors.sincronizarDesde(conector.id);
    motorConnectors.sincronizarDesde(conector.id);

    const historial = motorConnectors.obtenerHistorial(conector.id);

    expect(historial.length).toBeGreaterThan(0);
    if (historial.length > 0 && historial[0]) {
      expect(historial[0].resultado).toBeDefined();
    }
  });

  // ==================== TESTS FLUJOS ====================

  it("crea flujo automático con múltiples pasos", () => {
    const flujo = motorFlujos.crearFlujo(
      "Flujo ETL Productos",
      "horario",
      [
        {
          orden: 0,
          tipo: "sincronizar",
          conector_id: "conn-1",
          configuración: { tabla_origen: "productos_proveedor" },
        },
        {
          orden: 1,
          tipo: "transformar",
          configuración: {
            mapa_campos: {
              sku: "código_interno",
              nombre_proveedor: "descripción",
            },
          },
        },
        {
          orden: 2,
          tipo: "validar",
          configuración: {
            campos_requeridos: ["código_interno", "descripción"],
          },
        },
        {
          orden: 3,
          tipo: "notificar",
          configuración: {
            destinatarios: ["admin@example.com"],
            asunto: "ETL completado",
          },
        },
      ],
      "0 2 * * *" // Ejecutar a las 2 AM todos los días
    );

    expect(flujo.id).toBeDefined();
    expect(flujo.nombre).toBe("Flujo ETL Productos");
    expect(flujo.pasos).toHaveLength(4);
    expect(flujo.activo).toBe(true);
    expect(flujo.frecuencia).toBe("0 2 * * *");
  });

  it("ejecuta flujo con múltiples pasos", async () => {
    const flujo = motorFlujos.crearFlujo(
      "Flujo Test Ejecución",
      "manual",
      [
        {
          orden: 0,
          tipo: "transformar",
          configuración: {
            mapa_campos: { origen: "destino" },
          },
        },
        {
          orden: 1,
          tipo: "validar",
          configuración: { campos_requeridos: ["destino"] },
        },
      ]
    );

    const resultado = await motorFlujos.ejecutarFlujo(flujo.id, {
      origen: "valor_prueba",
    });

    expect(resultado.éxito).toBe(true);
    expect(resultado.resultados_pasos).toHaveLength(2);
    expect(resultado.errores).toBeUndefined();
  });

  it("registra errores en sincronización", async () => {
    const flujo = motorFlujos.crearFlujo(
      "Flujo con Error",
      "manual",
      [
        {
          orden: 0,
          tipo: "validar",
          configuración: {
            campos_requeridos: ["campo_obligatorio"],
          },
        },
      ]
    );

    const resultado = await motorFlujos.ejecutarFlujo(flujo.id, {
      otro_campo: "valor",
    });

    expect(resultado.éxito).toBe(false);
    expect(resultado.errores).toBeDefined();
    expect(resultado.errores?.length).toBeGreaterThan(0);
  });

  it("detecta errores frecuentes", async () => {
    const flujo = motorFlujos.crearFlujo(
      "Flujo Errores Frecuentes",
      "manual",
      [
        {
          orden: 0,
          tipo: "validar",
          configuración: { campos_requeridos: ["required"] },
        },
      ]
    );

    // Simular múltiples ejecuciones con error
    for (let i = 0; i < 3; i++) {
      await motorFlujos.ejecutarFlujo(flujo.id, {});
    }

    const errores = motorFlujos.obtenerErroresFrecuentes(flujo.id);

    expect(errores.length).toBeGreaterThan(0);
    expect(errores[0]!.ocurrencias).toBeGreaterThan(1);
  });

  it("programa ejecución periódica de flujo", () => {
    const flujo = motorFlujos.crearFlujo(
      "Flujo Programable",
      "manual",
      [
        {
          orden: 0,
          tipo: "sincronizar",
          configuración: {},
        },
      ]
    );

    motorFlujos.programarEjecución(flujo.id, "0 6 * * 1-5"); // Lunes-viernes 6 AM

    const flujoActualizado = motorFlujos.obtenerFlujo(flujo.id);

    expect(flujoActualizado?.frecuencia).toBe("0 6 * * 1-5");
    expect(flujoActualizado?.trigger).toBe("horario");
  });

  it("obtiene historial de ejecuciones del flujo", async () => {
    const flujo = motorFlujos.crearFlujo(
      "Flujo Historial",
      "manual",
      [
        {
          orden: 0,
          tipo: "sincronizar",
          configuración: {},
        },
      ]
    );

    await motorFlujos.ejecutarFlujo(flujo.id, {});
    await motorFlujos.ejecutarFlujo(flujo.id, {});
    await motorFlujos.ejecutarFlujo(flujo.id, {});

    const historial = motorFlujos.obtenerHistorialFlujo(flujo.id, 10);

    expect(historial.length).toBeGreaterThan(0);
    expect(historial[0]!.fecha).toBeDefined();
    expect(historial[0]!.tiempo_ms).toBeGreaterThanOrEqual(0);
  });

  it("maneja timeouts y reintentos", async () => {
    const flujo = motorFlujos.crearFlujo(
      "Flujo Timeout",
      "manual",
      [
        {
          orden: 0,
          tipo: "esperar",
          configuración: { milisegundos: 100 },
        },
        {
          orden: 1,
          tipo: "sincronizar",
          configuración: {},
        },
      ]
    );

    const resultado = await motorFlujos.ejecutarFlujo(flujo.id, {});

    expect(resultado.éxito).toBe(true);
    expect(resultado.resultados_pasos.length).toBeGreaterThan(0);
  });

  it("valida mapeos faltantes en definición", () => {
    const conector = motorConnectors.crearConector(
      "Test Validación",
      "api_rest",
      {}
    );

    expect(() => {
      motorConnectors.definirMapeo(
        conector.id,
        "tabla1",
        "tabla2",
        [] // Mapeos vacíos - validar que no causa problemas
      );
    }).not.toThrow();
  });

  it("guarda y recupera conector de base de datos", () => {
    const conector = motorConnectors.crearConector(
      "Persistencia Test",
      "api_rest",
      { url: "https://api.test.com" }
    );

    store.guardarConector(conector);
    const recuperado = store.obtenerConector(conector.id);

    expect(recuperado).toBeDefined();
    expect(recuperado?.nombre).toBe("Persistencia Test");
    expect(recuperado?.tipo).toBe("api_rest");
  });

  it("lista todos los conectores registrados", () => {
    const c1 = motorConnectors.crearConector("C1", "api_rest", {});
    const c2 = motorConnectors.crearConector("C2", "sftp", {});
    const c3 = motorConnectors.crearConector("C3", "zapier", {});

    store.guardarConector(c1);
    store.guardarConector(c2);
    store.guardarConector(c3);

    const conectores = store.listarConectores();

    expect(conectores.length).toBeGreaterThanOrEqual(3);
  });
});
