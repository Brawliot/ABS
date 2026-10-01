import Database from 'better-sqlite3';
import { CryptoUtils } from './crypto-utils.js';

export class Sqlite2FAStore {
  private readonly db: Database.Database;
  private readonly habilitarStmt: Database.Statement;
  private readonly obtenerSecretoStmt: Database.Statement;
  private readonly estaHabilitadoStmt: Database.Statement;

  constructor(path: string = ':memory:') {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.inicializarTablas();

    this.habilitarStmt = this.db.prepare(
      `INSERT OR REPLACE INTO usuarios_2fa (usuario_id, secret_encriptado, habilitado, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    this.obtenerSecretoStmt = this.db.prepare(
      `SELECT secret_encriptado FROM usuarios_2fa WHERE usuario_id = ?`,
    );
    this.estaHabilitadoStmt = this.db.prepare(
      `SELECT habilitado FROM usuarios_2fa WHERE usuario_id = ?`,
    );
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usuarios_2fa (
        usuario_id TEXT PRIMARY KEY NOT NULL,
        secret_encriptado TEXT NOT NULL,
        habilitado INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        modified_at INTEGER
      );
    `);
  }

  habilitarPara(usuarioId: string, secret: string): void {
    const secretEncriptado = CryptoUtils.encryptPII(secret);
    this.habilitarStmt.run(usuarioId, secretEncriptado, 1, Date.now());
  }

  estaHabilitado(usuarioId: string): boolean {
    const row = this.estaHabilitadoStmt.get(usuarioId) as { habilitado: number } | undefined;
    return row ? row.habilitado === 1 : false;
  }

  obtenerSecreto(usuarioId: string): string | undefined {
    const row = this.obtenerSecretoStmt.get(usuarioId) as { secret_encriptado: string } | undefined;
    if (!row) return undefined;
    return CryptoUtils.decryptPII(row.secret_encriptado);
  }

  deshabilitarPara(usuarioId: string): void {
    this.db.prepare(`DELETE FROM usuarios_2fa WHERE usuario_id = ?`).run(usuarioId);
  }

  close(): void {
    this.db.close();
  }
}
