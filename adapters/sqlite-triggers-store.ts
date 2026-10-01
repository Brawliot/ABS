/**
 * Store SQLite para triggers: append-only, sin UPDATE/DELETE en tablas principales.
 */

import Database from "better-sqlite3";
import type { Trigger, TriggerEvento } from "../policies/triggers.js";

export class SqliteTriggersStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS triggers (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        condicion TEXT NOT NULL,
        accion TEXT NOT NULL,
        activo INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trigger_eventos_log (
        id TEXT PRIMARY KEY,
        trigger_id TEXT NOT NULL,
        expediente_id TEXT NOT NULL,
        resultado TEXT NOT NULL,
        mensaje TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (trigger_id) REFERENCES triggers(id)
      );

      CREATE INDEX IF NOT EXISTS idx_trigger_eventos_trigger
        ON trigger_eventos_log(trigger_id);

      CREATE INDEX IF NOT EXISTS idx_trigger_eventos_expediente
        ON trigger_eventos_log(expediente_id);
    `);
  }

  registrarTrigger(trigger: Trigger): void {
    const stmt = this.db.prepare(`
      INSERT INTO triggers
        (id, nombre, tipo, condicion, accion, activo, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      trigger.id,
      trigger.nombre,
      trigger.tipo,
      trigger.condicion,
      trigger.accion,
      trigger.activo ? 1 : 0,
      trigger.createdAt.toISOString()
    );
  }

  registrarEvento(evento: TriggerEvento): void {
    const stmt = this.db.prepare(`
      INSERT INTO trigger_eventos_log
        (id, trigger_id, expediente_id, resultado, mensaje, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      evento.id,
      evento.triggerId,
      evento.expedienteId,
      evento.resultado,
      evento.mensaje || null,
      evento.timestamp.toISOString()
    );
  }

  obtenerTrigger(triggerId: string): Trigger | null {
    const stmt = this.db.prepare(`
      SELECT * FROM triggers WHERE id = ?
    `);

    const row = stmt.get(triggerId) as any;
    if (!row) return null;

    return {
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo,
      condicion: row.condicion,
      accion: row.accion,
      activo: row.activo === 1,
      createdAt: new Date(row.created_at),
    };
  }

  listarTriggers(): Trigger[] {
    const stmt = this.db.prepare(`
      SELECT * FROM triggers ORDER BY created_at DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      tipo: row.tipo,
      condicion: row.condicion,
      accion: row.accion,
      activo: row.activo === 1,
      createdAt: new Date(row.created_at),
    }));
  }

  listarEventosPorTrigger(triggerId: string): TriggerEvento[] {
    const stmt = this.db.prepare(`
      SELECT * FROM trigger_eventos_log
      WHERE trigger_id = ?
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(triggerId) as any[];
    return rows.map((row) => ({
      id: row.id,
      triggerId: row.trigger_id,
      expedienteId: row.expediente_id,
      resultado: row.resultado,
      mensaje: row.mensaje,
      timestamp: new Date(row.timestamp),
    }));
  }

  listarEventosPorExpediente(expedienteId: string): TriggerEvento[] {
    const stmt = this.db.prepare(`
      SELECT * FROM trigger_eventos_log
      WHERE expediente_id = ?
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(expedienteId) as any[];
    return rows.map((row) => ({
      id: row.id,
      triggerId: row.trigger_id,
      expedienteId: row.expediente_id,
      resultado: row.resultado,
      mensaje: row.mensaje,
      timestamp: new Date(row.timestamp),
    }));
  }

  desactivarTrigger(triggerId: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO triggers
        (id, nombre, tipo, condicion, accion, activo, created_at)
      SELECT id, nombre, tipo, condicion, accion, 0, created_at
      FROM triggers WHERE id = ?
    `);

    stmt.run(triggerId);
  }

  close(): void {
    this.db.close();
  }
}
