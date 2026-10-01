/**
 * Notificaciones (SQLite): registro append-only de notificaciones emitidas.
 * Nunca se borran ni se modifican; se marcan como leídas.
 * Canales: email, sms, app.
 */

import Database from "better-sqlite3";

export interface NotificacionRegistro {
  readonly id: string;
  readonly expedienteId: string;
  readonly actorId: string;
  readonly eventType: string;
  readonly asunto: string;
  readonly cuerpo: string;
  readonly canales: readonly string[];
  readonly leido: boolean;
  readonly timestamp: string;
}

export class SqliteNotificacionesStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notificaciones (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        expediente_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        asunto TEXT NOT NULL,
        cuerpo TEXT NOT NULL,
        canales TEXT NOT NULL,
        leido INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notificaciones_actor ON notificaciones(tenant_id, actor_id);
      CREATE INDEX IF NOT EXISTS idx_notificaciones_expediente ON notificaciones(tenant_id, expediente_id);
      CREATE INDEX IF NOT EXISTS idx_notificaciones_sin_leer ON notificaciones(tenant_id, actor_id, leido);
      CREATE TRIGGER IF NOT EXISTS notificaciones_no_update BEFORE UPDATE ON notificaciones
        WHEN OLD.leido = NEW.leido AND OLD.event_type = NEW.event_type
      BEGIN SELECT RAISE(ABORT, 'Las notificaciones no se modifican'); END;
      CREATE TRIGGER IF NOT EXISTS notificaciones_no_delete BEFORE DELETE ON notificaciones
      BEGIN SELECT RAISE(ABORT, 'Las notificaciones no se borran'); END;
    `);
  }

  crear(
    tenantId: string,
    reg: {
      readonly expedienteId: string;
      readonly actorId: string;
      readonly eventType: string;
      readonly asunto: string;
      readonly cuerpo: string;
      readonly canales: readonly string[];
    },
  ): string {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.db
      .prepare(
        `INSERT INTO notificaciones (id, tenant_id, expediente_id, actor_id, event_type, asunto, cuerpo, canales, leido, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        tenantId,
        reg.expedienteId,
        reg.actorId,
        reg.eventType,
        reg.asunto,
        reg.cuerpo,
        JSON.stringify(reg.canales),
        new Date().toISOString(),
        new Date().toISOString(),
      );
    return id;
  }

  deExpediente(
    tenantId: string,
    expedienteId: string,
  ): readonly NotificacionRegistro[] {
    const rows = this.db
      .prepare(
        `SELECT id, expediente_id, actor_id, event_type, asunto, cuerpo, canales, leido, timestamp
         FROM notificaciones
         WHERE tenant_id = ? AND expediente_id = ?
         ORDER BY timestamp DESC`,
      )
      .all(tenantId, expedienteId) as {
      id: string;
      expediente_id: string;
      actor_id: string;
      event_type: string;
      asunto: string;
      cuerpo: string;
      canales: string;
      leido: number;
      timestamp: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      expedienteId: r.expediente_id,
      actorId: r.actor_id,
      eventType: r.event_type,
      asunto: r.asunto,
      cuerpo: r.cuerpo,
      canales: JSON.parse(r.canales) as string[],
      leido: r.leido === 1,
      timestamp: r.timestamp,
    }));
  }

  deActor(
    tenantId: string,
    actorId: string,
    sinLeer?: boolean,
  ): readonly NotificacionRegistro[] {
    const query = sinLeer
      ? `SELECT id, expediente_id, actor_id, event_type, asunto, cuerpo, canales, leido, timestamp
         FROM notificaciones
         WHERE tenant_id = ? AND actor_id = ? AND leido = 0
         ORDER BY timestamp DESC`
      : `SELECT id, expediente_id, actor_id, event_type, asunto, cuerpo, canales, leido, timestamp
         FROM notificaciones
         WHERE tenant_id = ? AND actor_id = ?
         ORDER BY timestamp DESC`;

    const rows = this.db.prepare(query).all(tenantId, actorId) as {
      id: string;
      expediente_id: string;
      actor_id: string;
      event_type: string;
      asunto: string;
      cuerpo: string;
      canales: string;
      leido: number;
      timestamp: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      expedienteId: r.expediente_id,
      actorId: r.actor_id,
      eventType: r.event_type,
      asunto: r.asunto,
      cuerpo: r.cuerpo,
      canales: JSON.parse(r.canales) as string[],
      leido: r.leido === 1,
      timestamp: r.timestamp,
    }));
  }

  marcarComoLeida(tenantId: string, notificationId: string): void {
    this.db
      .prepare(
        `UPDATE notificaciones SET leido = 1 WHERE tenant_id = ? AND id = ?`,
      )
      .run(tenantId, notificationId);
  }

  conteoDeSinLeer(tenantId: string, actorId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(COUNT(*), 0) as total
         FROM notificaciones
         WHERE tenant_id = ? AND actor_id = ? AND leido = 0`,
      )
      .get(tenantId, actorId) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  close(): void {
    this.db.close();
  }
}
