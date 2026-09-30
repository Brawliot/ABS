/**
 * Acceso al portal del cliente: tokens de un solo uso con caducidad.
 * Base de datos: solo se guarda el SHA256 del token, nunca el token en claro.
 * El token se devuelve una sola vez al emitir; los siguientes accesos lo resuelven.
 */

import { randomBytes, createHash } from "node:crypto";
import Database from "better-sqlite3";
import type { TenantId } from "../tenancy/index.js";

interface Row {
  readonly hash_token: string;
  readonly parte_id: string;
  readonly tenant: string;
  readonly caduca_at: string;
  readonly revocado: number;
}

export class SqlitePortalAccess {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") {
      this.db.pragma("journal_mode = WAL");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS portal_accesos (
        hash_token TEXT PRIMARY KEY,
        parte_id TEXT NOT NULL,
        tenant TEXT NOT NULL,
        caduca_at TEXT NOT NULL,
        revocado INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_portal_parte ON portal_accesos(parte_id, tenant);
    `);
  }

  /**
   * Emite un enlace para el cliente. Devuelve el token en claro (una única vez).
   * Los siguientes accesos lo resuelven; si caduca o se revoca, devuelve null.
   */
  emitir(tenant: TenantId, parteId: string, diasValidez: number = 7): string {
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const ahora = new Date();
    const caduca = new Date(ahora.getTime() + diasValidez * 86400000).toISOString();

    this.db
      .prepare(
        `INSERT INTO portal_accesos (hash_token, parte_id, tenant, caduca_at, revocado, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
      )
      .run(hash, parteId, tenant, caduca, ahora.toISOString());

    return token;
  }

  /**
   * Resuelve un token. Devuelve parteId si es válido, null si caducó, fue revocado o no existe.
   */
  resolver(token: string, ahora: Date = new Date()): { parteId: string; tenant: string } | null {
    const hash = createHash("sha256").update(token).digest("hex");
    const row = this.db
      .prepare(`SELECT * FROM portal_accesos WHERE hash_token = ?`)
      .get(hash) as Row | undefined;

    if (!row) return null;
    if (row.revocado === 1) return null;
    if (new Date(row.caduca_at) < ahora) return null;

    return { parteId: row.parte_id, tenant: row.tenant };
  }

  /**
   * Revoca todos los enlaces de una parte.
   */
  revocar(tenant: TenantId, parteId: string): void {
    this.db
      .prepare(`UPDATE portal_accesos SET revocado = 1 WHERE parte_id = ? AND tenant = ?`)
      .run(parteId, tenant);
  }

  close(): void {
    this.db.close();
  }
}
