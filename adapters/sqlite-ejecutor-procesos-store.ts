/**
 * SqliteEjecutorProcesosStore: Almacenamiento Append-Only para Ejecuciones
 *
 * Arquitectura append-only:
 * - NUNCA UPDATE/DELETE en eventos, webhooks, pasos ejecutados
 * - Triggers previenen modificaciones
 * - Todos los cambios son inmutables
 * - La corrección se realiza con registros nuevos (nunca eliminando los antiguos)
 */

import Database from "better-sqlite3";
import type {
  EjecuciónProceso,
  ResultadoEjecuciónPaso,
  ResultadoWebhook,
  EventoDisparo,
} from "../elements/ejecutor-procesos";

export class SqliteEjecutorProcesosStore {
  private readonly db: Database.Database;
  private ejecuciónCounter: number = 0;
  private pasoCounter: number = 0;
  private webhookCounter: number = 0;
  private eventoCounter: number = 0;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.inicializarTablas();
    this.inicializarContadores();
  }

  /**
   * Inicializar tablas
   */
  private inicializarTablas(): void {
    this.db.exec(`
      -- Tabla de ejecuciones
      CREATE TABLE IF NOT EXISTS ejecuciones_procesos (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        proceso_id TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'en_progreso', 'pausado', 'completado', 'fallido', 'revertido')),
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT,
        transacción_id TEXT,
        usuario_ejecutor TEXT NOT NULL,
        número_secuencia INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ejecuciones_proceso ON ejecuciones_procesos(proceso_id);
      CREATE INDEX IF NOT EXISTS idx_ejecuciones_estado ON ejecuciones_procesos(estado);
      CREATE TRIGGER IF NOT EXISTS ejecuciones_no_update BEFORE UPDATE ON ejecuciones_procesos
      BEGIN SELECT RAISE(ABORT, 'Las ejecuciones se registran como append-only'); END;
      CREATE TRIGGER IF NOT EXISTS ejecuciones_no_delete BEFORE DELETE ON ejecuciones_procesos
      BEGIN SELECT RAISE(ABORT, 'Las ejecuciones no se borran'); END;

      -- Tabla de pasos ejecutados (APPEND-ONLY)
      CREATE TABLE IF NOT EXISTS pasos_ejecutados (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        paso_id TEXT NOT NULL,
        ejecución_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('éxito', 'error_recuperable', 'error_crítico', 'requiere_intervención')),
        datos_entrada TEXT NOT NULL,
        datos_salida TEXT,
        error TEXT,
        stack_trace TEXT,
        intentos_usados INTEGER NOT NULL,
        tiempo_ms INTEGER NOT NULL,
        webhook_disparado INTEGER DEFAULT 0,
        secuencia INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pasos_ejecución ON pasos_ejecutados(ejecución_id);
      CREATE INDEX IF NOT EXISTS idx_pasos_paso ON pasos_ejecutados(paso_id);
      CREATE TRIGGER IF NOT EXISTS pasos_no_update BEFORE UPDATE ON pasos_ejecutados
      BEGIN SELECT RAISE(ABORT, 'Los pasos ejecutados son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS pasos_no_delete BEFORE DELETE ON pasos_ejecutados
      BEGIN SELECT RAISE(ABORT, 'Los pasos no se borran'); END;

      -- Tabla de webhooks disparados (APPEND-ONLY)
      CREATE TABLE IF NOT EXISTS webhooks_disparados (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        ejecución_id TEXT NOT NULL,
        url TEXT NOT NULL,
        método TEXT NOT NULL,
        payload TEXT,
        status_code INTEGER,
        respuesta TEXT,
        error TEXT,
        timestamp TEXT NOT NULL,
        reintentos INTEGER NOT NULL,
        éxito INTEGER NOT NULL,
        tiempo_ms INTEGER NOT NULL,
        secuencia INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_webhooks_ejecución ON webhooks_disparados(ejecución_id);
      CREATE INDEX IF NOT EXISTS idx_webhooks_url ON webhooks_disparados(url);
      CREATE TRIGGER IF NOT EXISTS webhooks_no_update BEFORE UPDATE ON webhooks_disparados
      BEGIN SELECT RAISE(ABORT, 'Los webhooks son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS webhooks_no_delete BEFORE DELETE ON webhooks_disparados
      BEGIN SELECT RAISE(ABORT, 'Los webhooks no se borran'); END;

      -- Tabla de eventos disparados (APPEND-ONLY)
      CREATE TABLE IF NOT EXISTS eventos_disparados (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        ejecución_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        datos TEXT NOT NULL,
        enviado_a TEXT,
        secuencia INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_eventos_ejecución ON eventos_disparados(ejecución_id);
      CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos_disparados(tipo);
      CREATE TRIGGER IF NOT EXISTS eventos_no_update BEFORE UPDATE ON eventos_disparados
      BEGIN SELECT RAISE(ABORT, 'Los eventos son append-only'); END;
      CREATE TRIGGER IF NOT EXISTS eventos_no_delete BEFORE DELETE ON eventos_disparados
      BEGIN SELECT RAISE(ABORT, 'Los eventos no se borran'); END;

      -- Tabla de transacciones
      CREATE TABLE IF NOT EXISTS transacciones (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        estado TEXT NOT NULL CHECK (estado IN ('activa', 'committed', 'rolledback')),
        fecha_creación TEXT NOT NULL,
        fecha_actualización TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_transacciones_estado ON transacciones(estado);
    `);
  }

  /**
   * Inicializar contadores
   */
  private inicializarContadores(): void {
    const ejecResult = this.db
      .prepare("SELECT MAX(número_secuencia) as max_seq FROM ejecuciones_procesos")
      .get() as { max_seq: number | null } | undefined;
    this.ejecuciónCounter = (ejecResult?.max_seq ?? 0) + 1;

    const pasoResult = this.db
      .prepare("SELECT MAX(secuencia) as max_seq FROM pasos_ejecutados")
      .get() as { max_seq: number | null } | undefined;
    this.pasoCounter = (pasoResult?.max_seq ?? 0) + 1;

    const webhookResult = this.db
      .prepare("SELECT MAX(secuencia) as max_seq FROM webhooks_disparados")
      .get() as { max_seq: number | null } | undefined;
    this.webhookCounter = (webhookResult?.max_seq ?? 0) + 1;

    const eventoResult = this.db
      .prepare("SELECT MAX(secuencia) as max_seq FROM eventos_disparados")
      .get() as { max_seq: number | null } | undefined;
    this.eventoCounter = (eventoResult?.max_seq ?? 0) + 1;
  }

  /**
   * Guardar ejecución
   */
  guardarEjecución(ejecución: EjecuciónProceso): void {
    const stmt = this.db.prepare(`
      INSERT INTO ejecuciones_procesos (
        id, proceso_id, estado, fecha_inicio, fecha_fin, transacción_id,
        usuario_ejecutor, número_secuencia, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      ejecución.id,
      ejecución.proceso_id,
      ejecución.estado,
      ejecución.fecha_inicio.toISOString(),
      ejecución.fecha_fin?.toISOString() || null,
      ejecución.transacción_id || null,
      ejecución.usuario_ejecutor,
      ejecución.número_secuencia,
      new Date().toISOString()
    );
  }

  /**
   * Obtener ejecución
   */
  obtenerEjecución(id: string): EjecuciónProceso | undefined {
    const ejecRow = this.db
      .prepare("SELECT * FROM ejecuciones_procesos WHERE id = ?")
      .get(id) as any;

    if (!ejecRow) return undefined;

    const pasos = this.db
      .prepare("SELECT * FROM pasos_ejecutados WHERE ejecución_id = ? ORDER BY secuencia")
      .all(id) as any[];

    const eventos = this.db
      .prepare("SELECT * FROM eventos_disparados WHERE ejecución_id = ? ORDER BY secuencia")
      .all(id) as any[];

    const webhooks = this.db
      .prepare("SELECT * FROM webhooks_disparados WHERE ejecución_id = ? ORDER BY secuencia")
      .all(id) as any[];

    return {
      id: ejecRow.id,
      proceso_id: ejecRow.proceso_id,
      estado: ejecRow.estado,
      fecha_inicio: new Date(ejecRow.fecha_inicio),
      fecha_fin: ejecRow.fecha_fin ? new Date(ejecRow.fecha_fin) : undefined,
      pasos_ejecutados: pasos.map(this.mapearResultadoPaso),
      pasos_pendientes: [],
      errores_acumulados: [],
      eventos_disparados: eventos.map(this.mapearEvento),
      webhooks_enviados: webhooks.map(this.mapearWebhook),
      transacción_id: ejecRow.transacción_id,
      usuario_ejecutor: ejecRow.usuario_ejecutor,
      número_secuencia: ejecRow.número_secuencia,
    };
  }

  /**
   * Obtener historial de ejecuciones de un proceso
   */
  obtenerHistorial(proceso_id: string): EjecuciónProceso[] {
    const rows = this.db
      .prepare("SELECT id FROM ejecuciones_procesos WHERE proceso_id = ? ORDER BY seq DESC")
      .all(proceso_id) as any[];

    return rows
      .map(row => this.obtenerEjecución(row.id))
      .filter((e): e is EjecuciónProceso => !!e);
  }

  /**
   * Registrar paso ejecutado (APPEND-ONLY)
   */
  registrarPasoEjecutado(paso: ResultadoEjecuciónPaso): void {
    const stmt = this.db.prepare(`
      INSERT INTO pasos_ejecutados (
        id, paso_id, ejecución_id, timestamp, estado, datos_entrada,
        datos_salida, error, stack_trace, intentos_usados, tiempo_ms,
        webhook_disparado, secuencia, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      paso.id,
      paso.paso_id,
      paso.ejecución_id,
      paso.timestamp.toISOString(),
      paso.estado,
      JSON.stringify(paso.datos_entrada),
      paso.datos_salida ? JSON.stringify(paso.datos_salida) : null,
      paso.error || null,
      paso.stack_trace || null,
      paso.intentos_usados,
      paso.tiempo_ms,
      paso.webhook_disparado ? 1 : 0,
      paso.secuencia,
      new Date().toISOString()
    );
  }

  /**
   * Registrar webhook disparado (APPEND-ONLY)
   */
  registrarWebhookDisparado(webhook: ResultadoWebhook): void {
    const stmt = this.db.prepare(`
      INSERT INTO webhooks_disparados (
        id, ejecución_id, url, método, payload, status_code,
        respuesta, error, timestamp, reintentos, éxito,
        tiempo_ms, secuencia, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      webhook.id,
      webhook.ejecución_id,
      webhook.url,
      webhook.método,
      webhook.payload ? JSON.stringify(webhook.payload) : null,
      webhook.status_code || null,
      webhook.respuesta || null,
      webhook.error || null,
      webhook.timestamp.toISOString(),
      webhook.reintentos,
      webhook.éxito ? 1 : 0,
      webhook.tiempo_ms,
      webhook.secuencia,
      new Date().toISOString()
    );
  }

  /**
   * Registrar evento disparado (APPEND-ONLY)
   */
  registrarEventoDisparado(evento: EventoDisparo): void {
    const stmt = this.db.prepare(`
      INSERT INTO eventos_disparados (
        id, ejecución_id, tipo, timestamp, datos, enviado_a, secuencia, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      evento.id,
      evento.ejecución_id,
      evento.tipo,
      evento.timestamp.toISOString(),
      JSON.stringify(evento.datos),
      evento.enviado_a.join(","),
      evento.secuencia,
      new Date().toISOString()
    );
  }

  /**
   * Crear transacción
   */
  crearTransacción(id: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO transacciones (id, estado, fecha_creación, fecha_actualización)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, "activa", new Date().toISOString(), new Date().toISOString());
  }

  /**
   * Marcar transacción como committed o rolledback
   */
  marcarTransacciónComo(id: string, estado: "activa" | "committed" | "rolledback"): void {
    const stmt = this.db.prepare(`
      UPDATE transacciones SET estado = ?, fecha_actualización = ? WHERE id = ?
    `);

    stmt.run(estado, new Date().toISOString(), id);
  }

  /**
   * Mapear registro de paso a tipo
   */
  private mapearResultadoPaso = (row: any): ResultadoEjecuciónPaso => ({
    id: row.id,
    paso_id: row.paso_id,
    ejecución_id: row.ejecución_id,
    timestamp: new Date(row.timestamp),
    estado: row.estado,
    datos_entrada: JSON.parse(row.datos_entrada),
    datos_salida: row.datos_salida ? JSON.parse(row.datos_salida) : undefined,
    error: row.error || undefined,
    stack_trace: row.stack_trace || undefined,
    intentos_usados: row.intentos_usados,
    tiempo_ms: row.tiempo_ms,
    webhook_disparado: row.webhook_disparado === 1 ? true : undefined,
    secuencia: row.secuencia,
  });

  /**
   * Mapear registro de webhook a tipo
   */
  private mapearWebhook = (row: any): ResultadoWebhook => ({
    id: row.id,
    ejecución_id: row.ejecución_id,
    url: row.url,
    método: row.método,
    payload: row.payload ? JSON.parse(row.payload) : undefined,
    status_code: row.status_code || undefined,
    respuesta: row.respuesta || undefined,
    error: row.error || undefined,
    timestamp: new Date(row.timestamp),
    reintentos: row.reintentos,
    éxito: row.éxito === 1,
    tiempo_ms: row.tiempo_ms,
    secuencia: row.secuencia,
  });

  /**
   * Mapear registro de evento a tipo
   */
  private mapearEvento = (row: any): EventoDisparo => ({
    id: row.id,
    ejecución_id: row.ejecución_id,
    tipo: row.tipo,
    timestamp: new Date(row.timestamp),
    datos: JSON.parse(row.datos),
    enviado_a: row.enviado_a ? row.enviado_a.split(",") : [],
    secuencia: row.secuencia,
  });

  /**
   * Cerrar base de datos
   */
  cerrar(): void {
    this.db.close();
  }
}
