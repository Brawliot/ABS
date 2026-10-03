/**
 * Almacén append-only de intentos de envío de notificaciones.
 * Tabla: id, evento_id, canal, destinatario, plantilla, estado, intentos, próximo_intento, error, timestamp.
 */

import Database from "better-sqlite3";

export interface RegistroEnvio {
  readonly id: string;
  readonly evento_id: string;
  readonly canal: string;
  readonly destinatario: string;
  readonly plantilla: string;
  readonly estado: "pendiente" | "enviado" | "fallido";
  readonly intentos: number;
  readonly proximo_intento?: string;
  readonly error?: string;
  readonly timestamp: string;
}

export class SqliteNotificacionesEnviosStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializar();
  }

  private inicializar(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notificaciones_envios (
        id TEXT PRIMARY KEY,
        evento_id TEXT NOT NULL,
        canal TEXT NOT NULL,
        destinatario TEXT NOT NULL,
        plantilla TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente',
        intentos INTEGER NOT NULL DEFAULT 0,
        proximo_intento TEXT,
        error TEXT,
        timestamp TEXT NOT NULL,
        UNIQUE(evento_id, canal, destinatario, plantilla)
      );
      CREATE INDEX IF NOT EXISTS idx_notif_envios_estado
        ON notificaciones_envios(estado);
      CREATE INDEX IF NOT EXISTS idx_notif_envios_proximo
        ON notificaciones_envios(proximo_intento);
    `);
  }

  registrarPendiente(
    id: string,
    evento_id: string,
    canal: string,
    destinatario: string,
    plantilla: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO notificaciones_envios (
        id, evento_id, canal, destinatario, plantilla, estado, intentos, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      evento_id,
      canal,
      destinatario,
      plantilla,
      "pendiente",
      0,
      new Date().toISOString()
    );
  }

  registrarEnviado(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE notificaciones_envios
      SET estado = ?, intentos = intentos + 1, timestamp = ?
      WHERE id = ?
    `);

    stmt.run("enviado", new Date().toISOString(), id);
  }

  registrarFallido(id: string, error: string, reintentar: boolean = true): void {
    const proximoIntento = reintentar
      ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
      : null;

    const stmt = this.db.prepare(`
      UPDATE notificaciones_envios
      SET estado = ?, intentos = intentos + 1, error = ?, proximo_intento = ?, timestamp = ?
      WHERE id = ?
    `);

    stmt.run(
      reintentar ? "pendiente" : "fallido",
      error,
      proximoIntento,
      new Date().toISOString(),
      id
    );
  }

  obtenerPendientes(limite: number = 100): RegistroEnvio[] {
    const ahora = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM notificaciones_envios
      WHERE estado = 'pendiente'
      AND (proximo_intento IS NULL OR proximo_intento <= ?)
      AND intentos < 3
      ORDER BY timestamp ASC
      LIMIT ?
    `);

    return stmt.all(ahora, limite) as RegistroEnvio[];
  }

  obtenerFallidos(limite: number = 100): RegistroEnvio[] {
    const stmt = this.db.prepare(`
      SELECT * FROM notificaciones_envios
      WHERE estado = 'fallido'
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limite) as RegistroEnvio[];
  }

  obtenerTodos(limite: number = 100): RegistroEnvio[] {
    const stmt = this.db.prepare(`
      SELECT * FROM notificaciones_envios
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limite) as RegistroEnvio[];
  }

  contar(estado?: string): number {
    if (estado) {
      const stmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM notificaciones_envios WHERE estado = ?"
      );
      const result = stmt.get(estado) as { count: number };
      return result.count;
    }

    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM notificaciones_envios");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  close(): void {
    this.db.close();
  }
}
