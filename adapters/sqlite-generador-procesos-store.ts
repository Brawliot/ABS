/**
 * SQLite Store para MotorGeneradorProcesos
 *
 * Arquitectura APPEND-ONLY:
 * - NUNCA UPDATE/DELETE en eventos, movimientos, asientos
 * - Todos los cambios son inmutables
 * - Estado se deriva de los eventos (event sourcing)
 */

import { Database } from "better-sqlite3";
import {
  type ProcesoGenerado,
  type DocumentoGenerado,
  type EventoProceso,
  type MovimientoInventario,
  type AsientoContable,
  type TareaGenerada,
  type NotificaciónGenerada,
  type TipoProceso,
} from "../elements/generador-procesos.js";

export class SqliteGeneradorProcesosStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new (require("better-sqlite3"))(dbPath) as Database;
    this.inicializarTablas();
  }

  /**
   * Inicializar tablas de la base de datos
   */
  private inicializarTablas(): void {
    // Tabla de procesos generados
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS procesos_generados (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        estado TEXT NOT NULL,
        datos_entrada_json TEXT NOT NULL,
        fecha_creación TEXT NOT NULL,
        fecha_completación TEXT,
        número_secuencia INTEGER NOT NULL UNIQUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de documentos generados
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documentos_generados (
        id TEXT PRIMARY KEY,
        proceso_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        número TEXT NOT NULL,
        serie TEXT,
        contenido_json TEXT NOT NULL,
        estado TEXT NOT NULL,
        validaciones_json TEXT,
        referencia_documento TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proceso_id) REFERENCES procesos_generados(id)
      )
    `);

    // Tabla de eventos (APPEND-ONLY)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS eventos_procesos (
        id TEXT PRIMARY KEY,
        proceso_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        tipo TEXT NOT NULL,
        datos_json TEXT NOT NULL,
        usuario TEXT NOT NULL,
        referencia TEXT NOT NULL,
        secuencia INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proceso_id) REFERENCES procesos_generados(id)
      )
    `);

    // Tabla de movimientos de inventario (APPEND-ONLY)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS movimientos_inventario (
        id TEXT PRIMARY KEY,
        proceso_id TEXT NOT NULL,
        producto_id TEXT NOT NULL,
        cantidad INTEGER NOT NULL,
        motivo TEXT NOT NULL,
        saldo_anterior INTEGER NOT NULL,
        saldo_posterior INTEGER NOT NULL,
        fecha TEXT NOT NULL,
        usuario TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proceso_id) REFERENCES procesos_generados(id)
      )
    `);

    // Tabla de asientos contables (APPEND-ONLY)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS asientos_contables (
        id TEXT PRIMARY KEY,
        proceso_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        cuenta_deudora TEXT NOT NULL,
        cuenta_acreedora TEXT NOT NULL,
        monto INTEGER NOT NULL,
        descripción TEXT NOT NULL,
        referencia_documento TEXT NOT NULL,
        debe INTEGER NOT NULL,
        haber INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proceso_id) REFERENCES procesos_generados(id)
      )
    `);

    // Tabla de tareas generadas
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tareas_generadas (
        id TEXT PRIMARY KEY,
        proceso_id TEXT NOT NULL,
        título TEXT NOT NULL,
        descripción TEXT,
        asignado_a TEXT,
        fecha_vencimiento TEXT NOT NULL,
        prioridad TEXT NOT NULL,
        relación TEXT NOT NULL,
        completada INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proceso_id) REFERENCES procesos_generados(id)
      )
    `);

    // Tabla de notificaciones generadas
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notificaciones_generadas (
        id TEXT PRIMARY KEY,
        proceso_id TEXT NOT NULL,
        destinatario TEXT NOT NULL,
        tipo TEXT NOT NULL,
        asunto TEXT NOT NULL,
        contenido TEXT NOT NULL,
        adjuntos_json TEXT,
        enviado INTEGER DEFAULT 0,
        fecha_envío TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proceso_id) REFERENCES procesos_generados(id)
      )
    `);

    // Índices para rendimiento
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_procesos_tipo ON procesos_generados(tipo);
      CREATE INDEX IF NOT EXISTS idx_procesos_estado ON procesos_generados(estado);
      CREATE INDEX IF NOT EXISTS idx_documentos_proceso ON documentos_generados(proceso_id);
      CREATE INDEX IF NOT EXISTS idx_eventos_proceso ON eventos_procesos(proceso_id);
      CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos_procesos(tipo);
      CREATE INDEX IF NOT EXISTS idx_movimientos_proceso ON movimientos_inventario(proceso_id);
      CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos_inventario(producto_id);
      CREATE INDEX IF NOT EXISTS idx_asientos_proceso ON asientos_contables(proceso_id);
      CREATE INDEX IF NOT EXISTS idx_asientos_cuentas ON asientos_contables(cuenta_deudora, cuenta_acreedora);
      CREATE INDEX IF NOT EXISTS idx_tareas_proceso ON tareas_generadas(proceso_id);
      CREATE INDEX IF NOT EXISTS idx_notificaciones_proceso ON notificaciones_generadas(proceso_id);
    `);
  }

  /**
   * Guardar un proceso generado
   */
  guardarProceso(proceso: ProcesoGenerado): void {
    const stmt = this.db.prepare(`
      INSERT INTO procesos_generados (
        id, tipo, estado, datos_entrada_json, fecha_creación,
        fecha_completación, número_secuencia
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      proceso.id,
      proceso.tipo,
      proceso.estado,
      JSON.stringify(proceso.datos_entrada),
      proceso.fecha_creación.toISOString(),
      proceso.fecha_completación?.toISOString() || null,
      proceso.número_secuencia,
    );

    // Guardar documentos
    for (const doc of proceso.documentos_generados) {
      this.guardarDocumento(doc);
    }

    // Guardar eventos
    for (const evento of proceso.eventos) {
      this.registrarEvento(evento);
    }

    // Guardar movimientos de inventario
    for (const movimiento of proceso.movimientos_inventario) {
      this.registrarMovimientoInventario(movimiento);
    }

    // Guardar asientos contables
    for (const asiento of proceso.asientos_contables) {
      this.guardarAsiento(asiento);
    }

    // Guardar tareas
    for (const tarea of proceso.tareas_generadas) {
      this.guardarTarea(tarea);
    }

    // Guardar notificaciones
    for (const notif of proceso.notificaciones) {
      this.guardarNotificación(notif);
    }
  }

  /**
   * Obtener un proceso por ID
   */
  obtenerProceso(id: string): ProcesoGenerado | undefined {
    const stmt = this.db.prepare(`SELECT * FROM procesos_generados WHERE id = ?`);
    const row = stmt.get(id) as any;

    if (!row) return undefined;

    const resultado: {
      readonly id: string;
      readonly tipo: any;
      readonly estado: any;
      readonly datos_entrada: any;
      readonly documentos_generados: any[];
      readonly eventos: any[];
      readonly movimientos_inventario: any[];
      readonly asientos_contables: any[];
      readonly tareas_generadas: any[];
      readonly notificaciones: any[];
      readonly fecha_creación: Date;
      readonly fecha_completación?: Date;
      readonly número_secuencia: number;
    } = {
      id: row.id,
      tipo: row.tipo,
      estado: row.estado,
      datos_entrada: JSON.parse(row.datos_entrada_json),
      documentos_generados: this.obtenerDocumentos(id),
      eventos: this.obtenerEventos(id),
      movimientos_inventario: this.obtenerMovimientos(id),
      asientos_contables: this.obtenerAsientos(id),
      tareas_generadas: this.obtenerTareas(id),
      notificaciones: this.obtenerNotificaciones(id),
      fecha_creación: new Date(row.fecha_creación),
      número_secuencia: row.número_secuencia,
      ...(row.fecha_completación && { fecha_completación: new Date(row.fecha_completación) }),
    };

    return resultado as ProcesoGenerado;
  }

  /**
   * Listar procesos por tipo
   */
  listarProcesos(tipo?: TipoProceso): ProcesoGenerado[] {
    let sql = "SELECT * FROM procesos_generados";
    const params: any[] = [];

    if (tipo) {
      sql += " WHERE tipo = ?";
      params.push(tipo);
    }

    sql += " ORDER BY número_secuencia DESC";

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => {
      const resultado: {
        readonly id: string;
        readonly tipo: any;
        readonly estado: any;
        readonly datos_entrada: any;
        readonly documentos_generados: any[];
        readonly eventos: any[];
        readonly movimientos_inventario: any[];
        readonly asientos_contables: any[];
        readonly tareas_generadas: any[];
        readonly notificaciones: any[];
        readonly fecha_creación: Date;
        readonly fecha_completación?: Date;
        readonly número_secuencia: number;
      } = {
        id: row.id,
        tipo: row.tipo,
        estado: row.estado,
        datos_entrada: JSON.parse(row.datos_entrada_json),
        documentos_generados: this.obtenerDocumentos(row.id),
        eventos: this.obtenerEventos(row.id),
        movimientos_inventario: this.obtenerMovimientos(row.id),
        asientos_contables: this.obtenerAsientos(row.id),
        tareas_generadas: this.obtenerTareas(row.id),
        notificaciones: this.obtenerNotificaciones(row.id),
        fecha_creación: new Date(row.fecha_creación),
        número_secuencia: row.número_secuencia,
        ...(row.fecha_completación && { fecha_completación: new Date(row.fecha_completación) }),
      };

      return resultado as ProcesoGenerado;
    });
  }

  /**
   * Guardar documento generado
   */
  private guardarDocumento(doc: DocumentoGenerado): void {
    const stmt = this.db.prepare(`
      INSERT INTO documentos_generados (
        id, proceso_id, tipo, número, serie, contenido_json,
        estado, validaciones_json, referencia_documento
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      doc.id,
      doc.proceso_id,
      doc.tipo,
      doc.número,
      doc.serie || null,
      JSON.stringify(doc.contenido),
      doc.estado,
      JSON.stringify(doc.validaciones),
      doc.referencia_documento || null,
    );
  }

  /**
   * Obtener documentos de un proceso
   */
  private obtenerDocumentos(proceso_id: string): DocumentoGenerado[] {
    const stmt = this.db.prepare(`
      SELECT * FROM documentos_generados WHERE proceso_id = ? ORDER BY created_at
    `);
    const rows = stmt.all(proceso_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      proceso_id: row.proceso_id,
      número: row.número,
      serie: row.serie,
      fecha: new Date(row.created_at),
      contenido: JSON.parse(row.contenido_json),
      estado: row.estado,
      validaciones: JSON.parse(row.validaciones_json),
      referencia_documento: row.referencia_documento,
    }));
  }

  /**
   * Registrar evento (APPEND-ONLY)
   */
  private registrarEvento(evento: EventoProceso): void {
    const stmt = this.db.prepare(`
      INSERT INTO eventos_procesos (
        id, proceso_id, timestamp, tipo, datos_json, usuario, referencia, secuencia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      evento.id,
      evento.proceso_id,
      evento.timestamp.toISOString(),
      evento.tipo,
      JSON.stringify(evento.datos),
      evento.usuario,
      evento.referencia,
      evento.secuencia,
    );
  }

  /**
   * Obtener eventos de un proceso
   */
  private obtenerEventos(proceso_id: string): EventoProceso[] {
    const stmt = this.db.prepare(`
      SELECT * FROM eventos_procesos WHERE proceso_id = ? ORDER BY secuencia ASC
    `);
    const rows = stmt.all(proceso_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      proceso_id: row.proceso_id,
      timestamp: new Date(row.timestamp),
      tipo: row.tipo,
      datos: JSON.parse(row.datos_json),
      usuario: row.usuario,
      referencia: row.referencia,
      secuencia: row.secuencia,
    }));
  }

  /**
   * Registrar movimiento de inventario (APPEND-ONLY)
   */
  private registrarMovimientoInventario(mov: MovimientoInventario): void {
    const stmt = this.db.prepare(`
      INSERT INTO movimientos_inventario (
        id, proceso_id, producto_id, cantidad, motivo,
        saldo_anterior, saldo_posterior, fecha, usuario
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      mov.id,
      mov.proceso_id,
      mov.producto_id,
      mov.cantidad,
      mov.motivo,
      mov.saldo_anterior,
      mov.saldo_posterior,
      mov.fecha.toISOString(),
      mov.usuario,
    );
  }

  /**
   * Obtener movimientos de inventario de un proceso
   */
  private obtenerMovimientos(proceso_id: string): MovimientoInventario[] {
    const stmt = this.db.prepare(`
      SELECT * FROM movimientos_inventario WHERE proceso_id = ? ORDER BY fecha ASC
    `);
    const rows = stmt.all(proceso_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      proceso_id: row.proceso_id,
      producto_id: row.producto_id,
      cantidad: row.cantidad,
      motivo: row.motivo,
      saldo_anterior: row.saldo_anterior,
      saldo_posterior: row.saldo_posterior,
      fecha: new Date(row.fecha),
      usuario: row.usuario,
    }));
  }

  /**
   * Guardar asiento contable (APPEND-ONLY)
   */
  private guardarAsiento(asiento: AsientoContable): void {
    const stmt = this.db.prepare(`
      INSERT INTO asientos_contables (
        id, proceso_id, fecha, cuenta_deudora, cuenta_acreedora,
        monto, descripción, referencia_documento, debe, haber
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      asiento.id,
      asiento.proceso_id,
      asiento.fecha.toISOString(),
      asiento.cuenta_deudora,
      asiento.cuenta_acreedora,
      asiento.monto,
      asiento.descripción,
      asiento.referencia_documento,
      asiento.debe,
      asiento.haber,
    );
  }

  /**
   * Obtener asientos contables de un proceso
   */
  private obtenerAsientos(proceso_id: string): AsientoContable[] {
    const stmt = this.db.prepare(`
      SELECT * FROM asientos_contables WHERE proceso_id = ? ORDER BY fecha ASC
    `);
    const rows = stmt.all(proceso_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      proceso_id: row.proceso_id,
      fecha: new Date(row.fecha),
      cuenta_deudora: row.cuenta_deudora,
      cuenta_acreedora: row.cuenta_acreedora,
      monto: row.monto,
      descripción: row.descripción,
      referencia_documento: row.referencia_documento,
      debe: row.debe,
      haber: row.haber,
    }));
  }

  /**
   * Guardar tarea
   */
  private guardarTarea(tarea: TareaGenerada): void {
    const stmt = this.db.prepare(`
      INSERT INTO tareas_generadas (
        id, proceso_id, título, descripción, asignado_a,
        fecha_vencimiento, prioridad, relación, completada
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      tarea.id,
      tarea.proceso_id,
      tarea.título,
      tarea.descripción,
      tarea.asignado_a || null,
      tarea.fecha_vencimiento.toISOString(),
      tarea.prioridad,
      tarea.relación,
      tarea.completada ? 1 : 0,
    );
  }

  /**
   * Obtener tareas de un proceso
   */
  private obtenerTareas(proceso_id: string): TareaGenerada[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tareas_generadas WHERE proceso_id = ? ORDER BY fecha_vencimiento ASC
    `);
    const rows = stmt.all(proceso_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      proceso_id: row.proceso_id,
      título: row.título,
      descripción: row.descripción,
      asignado_a: row.asignado_a,
      fecha_vencimiento: new Date(row.fecha_vencimiento),
      prioridad: row.prioridad,
      relación: row.relación,
      completada: row.completada === 1,
    }));
  }

  /**
   * Guardar notificación
   */
  private guardarNotificación(notif: NotificaciónGenerada): void {
    const stmt = this.db.prepare(`
      INSERT INTO notificaciones_generadas (
        id, proceso_id, destinatario, tipo, asunto, contenido,
        adjuntos_json, enviado, fecha_envío
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      notif.id,
      notif.proceso_id,
      notif.destinatario,
      notif.tipo,
      notif.asunto,
      notif.contenido,
      notif.adjuntos ? JSON.stringify(notif.adjuntos) : null,
      notif.enviado ? 1 : 0,
      notif.fecha_envío?.toISOString() || null,
    );
  }

  /**
   * Obtener notificaciones de un proceso
   */
  private obtenerNotificaciones(proceso_id: string): NotificaciónGenerada[] {
    const stmt = this.db.prepare(`
      SELECT * FROM notificaciones_generadas WHERE proceso_id = ? ORDER BY created_at
    `);
    const rows = stmt.all(proceso_id) as any[];

    return rows.map((row) => {
      const resultado: {
        readonly id: string;
        readonly proceso_id: string;
        readonly destinatario: string;
        readonly tipo: any;
        readonly asunto: string;
        readonly contenido: string;
        readonly adjuntos?: string[];
        readonly enviado: boolean;
        readonly fecha_envío?: Date;
      } = {
        id: row.id,
        proceso_id: row.proceso_id,
        destinatario: row.destinatario,
        tipo: row.tipo,
        asunto: row.asunto,
        contenido: row.contenido,
        enviado: row.enviado === 1,
        ...(row.adjuntos_json && { adjuntos: JSON.parse(row.adjuntos_json) }),
        ...(row.fecha_envío && { fecha_envío: new Date(row.fecha_envío) }),
      };

      return resultado as NotificaciónGenerada;
    });
  }

  /**
   * Cerrar la base de datos
   */
  cerrar(): void {
    this.db.close();
  }
}
