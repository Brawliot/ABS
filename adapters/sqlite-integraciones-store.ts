import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type {
  Conector,
  MapeoDatos,
  ResultadoSincronización,
} from "../policies/integraciones-connectors.js";
import type { FlujoIntegración, PasoFlujo } from "../policies/integraciones-flujos.js";

export class SqliteIntegracionesStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conectores (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        estado TEXT NOT NULL,
        credenciales_encrypted TEXT NOT NULL,
        último_sync TEXT,
        próximo_sync TEXT,
        tasa_éxito REAL DEFAULT 0,
        fecha_creación TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mapeos_datos (
        id TEXT PRIMARY KEY,
        conector_id TEXT NOT NULL,
        tabla_origen TEXT NOT NULL,
        tabla_destino TEXT NOT NULL,
        campo_origen TEXT NOT NULL,
        campo_destino TEXT NOT NULL,
        transformación TEXT,
        obligatorio INTEGER DEFAULT 0,
        FOREIGN KEY (conector_id) REFERENCES conectores(id)
      );

      CREATE TABLE IF NOT EXISTS flujos_integración (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        trigger TEXT NOT NULL,
        activo INTEGER DEFAULT 1,
        frecuencia TEXT,
        fecha_creación TEXT NOT NULL,
        última_ejecución TEXT
      );

      CREATE TABLE IF NOT EXISTS pasos_flujo (
        id TEXT PRIMARY KEY,
        flujo_id TEXT NOT NULL,
        orden INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        conector_id TEXT,
        configuración TEXT NOT NULL,
        FOREIGN KEY (flujo_id) REFERENCES flujos_integración(id)
      );

      CREATE TABLE IF NOT EXISTS histórico_sincronización (
        id TEXT PRIMARY KEY,
        conector_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        registros_traídos INTEGER DEFAULT 0,
        registros_actualizados INTEGER DEFAULT 0,
        registros_fallidos INTEGER DEFAULT 0,
        errores TEXT,
        duracion_ms INTEGER,
        FOREIGN KEY (conector_id) REFERENCES conectores(id)
      );

      CREATE TABLE IF NOT EXISTS eventos_flujo (
        id TEXT PRIMARY KEY,
        flujo_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        éxito INTEGER DEFAULT 0,
        registros_procesados INTEGER DEFAULT 0,
        tiempo_ms INTEGER,
        detalles_errores TEXT,
        FOREIGN KEY (flujo_id) REFERENCES flujos_integración(id)
      );

      CREATE INDEX IF NOT EXISTS idx_conectores_estado ON conectores(estado);
      CREATE INDEX IF NOT EXISTS idx_mapeos_conector ON mapeos_datos(conector_id);
      CREATE INDEX IF NOT EXISTS idx_flujos_activo ON flujos_integración(activo);
      CREATE INDEX IF NOT EXISTS idx_pasos_flujo ON pasos_flujo(flujo_id);
      CREATE INDEX IF NOT EXISTS idx_historial_conector ON histórico_sincronización(conector_id);
      CREATE INDEX IF NOT EXISTS idx_eventos_flujo ON eventos_flujo(flujo_id);
    `);
  }

  guardarConector(conector: Conector): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conectores
      (id, nombre, tipo, estado, credenciales_encrypted, último_sync, próximo_sync, tasa_éxito, fecha_creación)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      conector.id,
      conector.nombre,
      conector.tipo,
      conector.estado,
      conector.credenciales_encrypted,
      conector.último_sync?.toISOString() ?? null,
      conector.próximo_sync?.toISOString() ?? null,
      conector.tasa_éxito,
      conector.fecha_creación.toISOString()
    );
  }

  obtenerConector(id: string): Conector | undefined {
    const stmt = this.db.prepare("SELECT * FROM conectores WHERE id = ?");
    const row = stmt.get(id) as any;

    if (!row) return undefined;

    const conector: Conector = {
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo,
      estado: row.estado,
      credenciales_encrypted: row.credenciales_encrypted,
      último_sync: row.último_sync ? new Date(row.último_sync) : undefined,
      próximo_sync: row.próximo_sync ? new Date(row.próximo_sync) : undefined,
      tasa_éxito: row.tasa_éxito,
      fecha_creación: new Date(row.fecha_creación),
    };
    return conector;
  }

  listarConectores(): Conector[] {
    const stmt = this.db.prepare("SELECT * FROM conectores ORDER BY fecha_creación DESC");
    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo,
      estado: row.estado,
      credenciales_encrypted: row.credenciales_encrypted,
      último_sync: row.último_sync ? new Date(row.último_sync) : undefined,
      próximo_sync: row.próximo_sync ? new Date(row.próximo_sync) : undefined,
      tasa_éxito: row.tasa_éxito,
      fecha_creación: new Date(row.fecha_creación),
    }));
  }

  actualizarEstadoConector(id: string, estado: string): void {
    const stmt = this.db.prepare(
      "UPDATE conectores SET estado = ?, último_sync = ? WHERE id = ?"
    );
    stmt.run(estado, new Date().toISOString(), id);
  }

  guardarFlujo(flujo: FlujoIntegración): void {
    const stmtFlujo = this.db.prepare(`
      INSERT OR REPLACE INTO flujos_integración
      (id, nombre, trigger, activo, frecuencia, fecha_creación, última_ejecución)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmtFlujo.run(
      flujo.id,
      flujo.nombre,
      flujo.trigger,
      flujo.activo ? 1 : 0,
      flujo.frecuencia ?? null,
      flujo.fecha_creación.toISOString(),
      flujo.última_ejecución?.toISOString() ?? null
    );

    // Guardar pasos
    const stmtPaso = this.db.prepare(`
      INSERT OR REPLACE INTO pasos_flujo
      (id, flujo_id, orden, tipo, conector_id, configuración)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const paso of flujo.pasos) {
      stmtPaso.run(
        randomUUID(),
        flujo.id,
        paso.orden,
        paso.tipo,
        paso.conector_id ?? null,
        JSON.stringify(paso.configuración)
      );
    }
  }

  obtenerFlujo(id: string): FlujoIntegración | undefined {
    const stmt = this.db.prepare("SELECT * FROM flujos_integración WHERE id = ?");
    const row = stmt.get(id) as any;

    if (!row) return undefined;

    const stmtPasos = this.db.prepare("SELECT * FROM pasos_flujo WHERE flujo_id = ? ORDER BY orden");
    const pasos = stmtPasos.all(id) as any[];

    return {
      id: row.id,
      nombre: row.nombre,
      trigger: row.trigger,
      activo: row.activo === 1,
      frecuencia: row.frecuencia,
      fecha_creación: new Date(row.fecha_creación),
      última_ejecución: row.última_ejecución ? new Date(row.última_ejecución) : undefined,
      pasos: pasos.map((p) => ({
        orden: p.orden,
        tipo: p.tipo,
        conector_id: p.conector_id,
        configuración: JSON.parse(p.configuración),
      })),
    };
  }

  listarFlujos(activos?: boolean): FlujoIntegración[] {
    let stmt;
    if (activos === undefined) {
      stmt = this.db.prepare("SELECT * FROM flujos_integración ORDER BY fecha_creación DESC");
    } else {
      stmt = this.db.prepare(
        "SELECT * FROM flujos_integración WHERE activo = ? ORDER BY fecha_creación DESC"
      );
    }

    const rows =
      activos === undefined
        ? (stmt.all() as any[])
        : (stmt.all(activos ? 1 : 0) as any[]);

    return rows.map((row) => {
      const stmtPasos = this.db.prepare("SELECT * FROM pasos_flujo WHERE flujo_id = ? ORDER BY orden");
      const pasos = stmtPasos.all(row.id) as any[];

      return {
        id: row.id,
        nombre: row.nombre,
        trigger: row.trigger,
        activo: row.activo === 1,
        frecuencia: row.frecuencia,
        fecha_creación: new Date(row.fecha_creación),
        última_ejecución: row.última_ejecución ? new Date(row.última_ejecución) : undefined,
        pasos: pasos.map((p) => ({
          orden: p.orden,
          tipo: p.tipo,
          conector_id: p.conector_id,
          configuración: JSON.parse(p.configuración),
        })),
      };
    });
  }

  registrarSincronización(conector_id: string, resultado: ResultadoSincronización): void {
    const stmt = this.db.prepare(`
      INSERT INTO histórico_sincronización
      (id, conector_id, fecha, registros_traídos, registros_actualizados, registros_fallidos, errores, duracion_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      randomUUID(),
      conector_id,
      new Date().toISOString(),
      resultado.registros_traídos,
      resultado.registros_actualizados,
      resultado.registros_fallidos,
      JSON.stringify(resultado.errores),
      resultado.duracion_ms
    );
  }

  obtenerHistorialSincronización(conector_id: string, límite: number = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM histórico_sincronización
      WHERE conector_id = ?
      ORDER BY fecha DESC
      LIMIT ?
    `);

    const rows = stmt.all(conector_id, límite) as any[];
    return rows.map((row) => ({
      fecha: new Date(row.fecha),
      registros_traídos: row.registros_traídos,
      registros_actualizados: row.registros_actualizados,
      registros_fallidos: row.registros_fallidos,
      errores: JSON.parse(row.errores ?? "[]"),
      duracion_ms: row.duracion_ms,
    }));
  }

  registrarEventoFlujo(
    flujo_id: string,
    éxito: boolean,
    registros_procesados: number,
    tiempo_ms: number,
    detalles_errores?: string[]
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO eventos_flujo
      (id, flujo_id, fecha, éxito, registros_procesados, tiempo_ms, detalles_errores)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      randomUUID(),
      flujo_id,
      new Date().toISOString(),
      éxito ? 1 : 0,
      registros_procesados,
      tiempo_ms,
      detalles_errores ? JSON.stringify(detalles_errores) : null
    );
  }

  close(): void {
    this.db.close();
  }
}
