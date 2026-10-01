import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { TareaCrm } from '../elements/tarea-crm.js';
import type { EtiquetaTarea } from '../elements/tarea-etiquetas.js';
import type { ComentarioTarea } from '../elements/tarea-comentarios.js';

export class SqliteTareasCrmStore {
  private readonly db: Database.Database;
  private readonly crearTareaStmt: Database.Statement;
  private readonly obtenerTareaStmt: Database.Statement;
  private readonly listarTareasStmt: Database.Statement;
  private readonly actualizarEstadoStmt: Database.Statement;
  private readonly crearEtiquetaStmt: Database.Statement;
  private readonly obtenerEtiquetasStmt: Database.Statement;
  private readonly agregarEtiquetaStmt: Database.Statement;
  private readonly removerEtiquetaStmt: Database.Statement;
  private readonly agregarComentarioStmt: Database.Statement;
  private readonly obtenerComentariosStmt: Database.Statement;

  constructor(path: string = ':memory:') {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.inicializarTablas();

    this.crearTareaStmt = this.db.prepare(
      `INSERT INTO tareas (id, texto, estado, prioridad, asignado_a, vencimiento, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.obtenerTareaStmt = this.db.prepare(`SELECT * FROM tareas WHERE id = ?`);
    this.listarTareasStmt = this.db.prepare(`SELECT * FROM tareas ORDER BY created_at DESC`);
    this.actualizarEstadoStmt = this.db.prepare(
      `UPDATE tareas SET estado = ?, completado_en = ? WHERE id = ?`,
    );
    this.crearEtiquetaStmt = this.db.prepare(
      `INSERT INTO etiquetas_tareas (id, nombre, color, descripcion, created_at) VALUES (?, ?, ?, ?, ?)`,
    );
    this.obtenerEtiquetasStmt = this.db.prepare(
      `SELECT et.* FROM etiquetas_tareas et
       JOIN tarea_etiqueta_mapping tem ON et.id = tem.etiqueta_id
       WHERE tem.tarea_id = ? ORDER BY tem.created_at`,
    );
    this.agregarEtiquetaStmt = this.db.prepare(
      `INSERT INTO tarea_etiqueta_mapping (tarea_id, etiqueta_id, created_at) VALUES (?, ?, ?)`,
    );
    this.removerEtiquetaStmt = this.db.prepare(
      `DELETE FROM tarea_etiqueta_mapping WHERE tarea_id = ? AND etiqueta_id = ?`,
    );
    this.agregarComentarioStmt = this.db.prepare(
      `INSERT INTO comentarios_tareas (id, tarea_id, autor_id, texto, created_at) VALUES (?, ?, ?, ?, ?)`,
    );
    this.obtenerComentariosStmt = this.db.prepare(
      `SELECT * FROM comentarios_tareas WHERE tarea_id = ? ORDER BY created_at ASC`,
    );
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tareas (
        id TEXT PRIMARY KEY NOT NULL,
        texto TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'completada')),
        prioridad TEXT NOT NULL CHECK (prioridad IN ('baja', 'media', 'alta')),
        asignado_a TEXT,
        vencimiento INTEGER,
        created_at INTEGER NOT NULL,
        completado_en INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas(estado);
      CREATE INDEX IF NOT EXISTS idx_tareas_asignado_a ON tareas(asignado_a);
      CREATE INDEX IF NOT EXISTS idx_tareas_vencimiento ON tareas(vencimiento);

      CREATE TABLE IF NOT EXISTS etiquetas_tareas (
        id TEXT PRIMARY KEY NOT NULL,
        nombre TEXT NOT NULL,
        color TEXT NOT NULL,
        descripcion TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tarea_etiqueta_mapping (
        tarea_id TEXT NOT NULL,
        etiqueta_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (tarea_id, etiqueta_id),
        FOREIGN KEY (tarea_id) REFERENCES tareas(id),
        FOREIGN KEY (etiqueta_id) REFERENCES etiquetas_tareas(id)
      );

      CREATE TABLE IF NOT EXISTS comentarios_tareas (
        id TEXT PRIMARY KEY NOT NULL,
        tarea_id TEXT NOT NULL,
        autor_id TEXT NOT NULL,
        texto TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        FOREIGN KEY (tarea_id) REFERENCES tareas(id)
      );
      CREATE INDEX IF NOT EXISTS idx_comentarios_tarea ON comentarios_tareas(tarea_id);
    `);
  }

  crearTarea(texto: string, prioridad: 'baja' | 'media' | 'alta' = 'media', asignadoA?: string, vencimiento?: Date): TareaCrm {
    const id = randomUUID();
    const ahora = Date.now();
    const vencimientoMs = vencimiento ? vencimiento.getTime() : null;

    this.crearTareaStmt.run(id, texto, 'pendiente', prioridad, asignadoA || null, vencimientoMs, ahora);

    return {
      id,
      texto,
      estado: 'pendiente',
      prioridad,
      asignadoA: asignadoA || undefined,
      vencimiento: vencimiento || undefined,
      etiquetaIds: [],
      createdAt: new Date(ahora),
      completadoEn: undefined,
    };
  }

  obtenerTarea(id: string): TareaCrm | undefined {
    const row = this.obtenerTareaStmt.get(id) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      texto: row.texto,
      estado: row.estado,
      prioridad: row.prioridad,
      asignadoA: row.asignado_a || undefined,
      vencimiento: row.vencimiento ? new Date(row.vencimiento) : undefined,
      etiquetaIds: this.obtenerEtiquetasIds(id),
      createdAt: new Date(row.created_at),
      completadoEn: row.completado_en ? new Date(row.completado_en) : undefined,
    };
  }

  listarTareas(): TareaCrm[] {
    const rows = this.listarTareasStmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      texto: row.texto,
      estado: row.estado,
      prioridad: row.prioridad,
      asignadoA: row.asignado_a || undefined,
      vencimiento: row.vencimiento ? new Date(row.vencimiento) : undefined,
      etiquetaIds: this.obtenerEtiquetasIds(row.id),
      createdAt: new Date(row.created_at),
      completadoEn: row.completado_en ? new Date(row.completado_en) : undefined,
    }));
  }

  completarTarea(id: string): void {
    this.actualizarEstadoStmt.run('completada', Date.now(), id);
  }

  crearEtiqueta(nombre: string, color: string, descripcion?: string): EtiquetaTarea {
    const id = randomUUID();
    const ahora = Date.now();
    this.crearEtiquetaStmt.run(id, nombre, color, descripcion || null, ahora);
    return {
      id,
      nombre,
      color,
      descripcion,
      createdAt: new Date(ahora),
    };
  }

  agregarEtiqueta(tareaId: string, etiquetaId: string): void {
    this.agregarEtiquetaStmt.run(tareaId, etiquetaId, Date.now());
  }

  removerEtiqueta(tareaId: string, etiquetaId: string): void {
    this.removerEtiquetaStmt.run(tareaId, etiquetaId);
  }

  obtenerEtiquetasDeTarea(tareaId: string): EtiquetaTarea[] {
    const rows = this.obtenerEtiquetasStmt.all(tareaId) as any[];
    return rows.map(row => ({
      id: row.id,
      nombre: row.nombre,
      color: row.color,
      descripcion: row.descripcion || undefined,
      createdAt: new Date(row.created_at),
    }));
  }

  private obtenerEtiquetasIds(tareaId: string): string[] {
    const rows = this.db
      .prepare(`SELECT etiqueta_id FROM tarea_etiqueta_mapping WHERE tarea_id = ?`)
      .all(tareaId) as { etiqueta_id: string }[];
    return rows.map(r => r.etiqueta_id);
  }

  agregarComentario(tareaId: string, autorId: string, texto: string): ComentarioTarea {
    const id = randomUUID();
    const ahora = Date.now();
    this.agregarComentarioStmt.run(id, tareaId, autorId, texto, ahora);
    return {
      id,
      tareaId,
      autorId,
      texto,
      createdAt: new Date(ahora),
      updatedAt: undefined,
    };
  }

  obtenerComentarios(tareaId: string): ComentarioTarea[] {
    const rows = this.obtenerComentariosStmt.all(tareaId) as any[];
    return rows.map(row => ({
      id: row.id,
      tareaId: row.tarea_id,
      autorId: row.autor_id,
      texto: row.texto,
      createdAt: new Date(row.created_at),
      updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    }));
  }

  close(): void {
    this.db.close();
  }
}
