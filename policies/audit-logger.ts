import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface AuditEvent {
  readonly id: string;
  readonly usuarioId: string;
  readonly accion: string;
  readonly recurso: string;
  readonly cambios?: { from: string; to: string };
  readonly ip?: string;
  readonly userAgent?: string;
  readonly exito: boolean;
  readonly timestamp: Date;
}

export class AuditLogger {
  private readonly db: Database.Database;
  private readonly registrarStmt: Database.Statement;
  private readonly obtenerEventosStmt: Database.Statement;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.inicializarTablas();

    this.registrarStmt = this.db.prepare(
      `INSERT INTO audit_log (id, usuario_id, accion, recurso, cambios, ip, user_agent, exito, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.obtenerEventosStmt = this.db.prepare(
      `SELECT * FROM audit_log WHERE usuario_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`,
    );
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY NOT NULL,
        usuario_id TEXT NOT NULL,
        accion TEXT NOT NULL,
        recurso TEXT NOT NULL,
        cambios TEXT,
        ip TEXT,
        user_agent TEXT,
        exito INTEGER NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_usuario ON audit_log(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    `);
  }

  registrar(evento: Omit<AuditEvent, 'id' | 'timestamp'>): void {
    const id = randomUUID();
    const timestamp = Date.now();
    const cambios = evento.cambios ? JSON.stringify(evento.cambios) : null;

    this.registrarStmt.run(
      id,
      evento.usuarioId,
      evento.accion,
      evento.recurso,
      cambios,
      evento.ip || null,
      evento.userAgent || null,
      evento.exito ? 1 : 0,
      timestamp,
    );
  }

  obtenerEventos(usuarioId: string, desde: Date, hasta: Date): AuditEvent[] {
    const desdeMs = desde.getTime();
    const hastaMs = hasta.getTime();

    const rows = this.obtenerEventosStmt.all(usuarioId, desdeMs, hastaMs) as any[];

    return rows.map(row => ({
      id: row.id,
      usuarioId: row.usuario_id,
      accion: row.accion,
      recurso: row.recurso,
      cambios: row.cambios ? JSON.parse(row.cambios) : undefined,
      ip: row.ip || undefined,
      userAgent: row.user_agent || undefined,
      exito: row.exito === 1,
      timestamp: new Date(row.timestamp),
    }));
  }

  close(): void {
    this.db.close();
  }
}
