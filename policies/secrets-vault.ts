import Database from 'better-sqlite3';
import { CryptoUtils } from '../adapters/crypto-utils.js';
import { randomUUID } from 'crypto';

export interface SecretoVault {
  readonly clave: string;
  readonly descripcion: string | undefined;
}

export class SecretsVault {
  private readonly db: Database.Database;
  private readonly guardarStmt: Database.Statement;
  private readonly obtenerStmt: Database.Statement;
  private readonly listarStmt: Database.Statement;
  private readonly rotarStmt: Database.Statement;
  private readonly registrarAccesoStmt: Database.Statement;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.inicializarTablas();

    this.guardarStmt = this.db.prepare(
      `INSERT OR REPLACE INTO secrets (clave, valor_encriptado, descripcion, created_at, modified_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    this.obtenerStmt = this.db.prepare(`SELECT valor_encriptado FROM secrets WHERE clave = ?`);
    this.listarStmt = this.db.prepare(`SELECT clave, descripcion FROM secrets ORDER BY clave`);
    this.rotarStmt = this.db.prepare(
      `INSERT INTO secrets_history (id, clave, version, valor_encriptado, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
    );
    this.registrarAccesoStmt = this.db.prepare(
      `INSERT INTO secrets_access_log (id, clave, usuario_id, timestamp) VALUES (?, ?, ?, ?)`,
    );
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        clave TEXT PRIMARY KEY NOT NULL,
        valor_encriptado TEXT NOT NULL,
        descripcion TEXT,
        created_at INTEGER NOT NULL,
        modified_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS secrets_history (
        id TEXT PRIMARY KEY NOT NULL,
        clave TEXT NOT NULL,
        version INTEGER NOT NULL,
        valor_encriptado TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS secrets_access_log (
        id TEXT PRIMARY KEY NOT NULL,
        clave TEXT NOT NULL,
        usuario_id TEXT,
        timestamp INTEGER NOT NULL
      );
    `);
  }

  guardarSecretiva(clave: string, valor: string, descripcion?: string): void {
    const valorEncriptado = CryptoUtils.encryptPII(valor);
    const ahora = Date.now();
    this.guardarStmt.run(clave, valorEncriptado, descripcion || null, ahora, ahora);
  }

  obtenerSecreto(clave: string, usuarioId?: string): string | undefined {
    const row = this.obtenerStmt.get(clave) as { valor_encriptado: string } | undefined;
    if (!row) return undefined;

    if (usuarioId) {
      this.registrarAccesoStmt.run(randomUUID(), clave, usuarioId, Date.now());
    }

    return CryptoUtils.decryptPII(row.valor_encriptado);
  }

  rotarSecretiva(clave: string, nuevoValor: string): void {
    const secretActual = this.obtenerSecreto(clave);
    if (secretActual) {
      const version = this.db
        .prepare(`SELECT MAX(version) as v FROM secrets_history WHERE clave = ?`)
        .get(clave) as { v: number | null };
      const proxVersion = (version.v || 0) + 1;

      this.rotarStmt.run(randomUUID(), clave, proxVersion, CryptoUtils.encryptPII(secretActual), Date.now());
    }

    this.guardarSecretiva(clave, nuevoValor);
  }

  listarSecretos(filtro?: string): SecretoVault[] {
    let rows = this.listarStmt.all() as Array<{ clave: string; descripcion: string | null }>;
    if (filtro) {
      rows = rows.filter(r => r.clave.includes(filtro));
    }
    return rows.map(r => ({
      clave: r.clave,
      descripcion: r.descripcion || undefined,
    }));
  }

  close(): void {
    this.db.close();
  }
}
