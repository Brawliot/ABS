/**
 * Crédito del cliente (SQLite): guarda el límite de crédito y total activo
 * (suma de a_cuenta pendientes + financiados en plazo). Almacén con actualizaciones
 * (el total activo se recalcula de los eventos, no se guarda).
 */

import Database from "better-sqlite3";

export interface CreditoClienteRegistro {
  readonly clienteId: string;
  readonly limiteCentimos: number;
  readonly actualizadoEn: string;
}

export class SqliteCreditoClienteStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS limites_credito_cliente (
        tenant_id TEXT NOT NULL,
        cliente_id TEXT NOT NULL,
        limite_centimos INTEGER NOT NULL CHECK (limite_centimos >= 0),
        actualizado_en TEXT NOT NULL,
        PRIMARY KEY (tenant_id, cliente_id)
      );
      CREATE INDEX IF NOT EXISTS idx_limites_cliente ON limites_credito_cliente(tenant_id, cliente_id);
    `);
  }

  establecerLimite(
    tenantId: string,
    clienteId: string,
    limiteCentimos: number,
  ): void {
    this.db
      .prepare(
        `INSERT INTO limites_credito_cliente (tenant_id, cliente_id, limite_centimos, actualizado_en)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (tenant_id, cliente_id) DO UPDATE SET
         limite_centimos = ?, actualizado_en = ?`,
      )
      .run(tenantId, clienteId, limiteCentimos, new Date().toISOString(), limiteCentimos, new Date().toISOString());
  }

  obtenerLimite(tenantId: string, clienteId: string): number {
    const row = this.db
      .prepare(
        `SELECT limite_centimos FROM limites_credito_cliente
         WHERE tenant_id = ? AND cliente_id = ?`,
      )
      .get(tenantId, clienteId) as { limite_centimos: number } | undefined;
    return row?.limite_centimos ?? 0;
  }

  close(): void {
    this.db.close();
  }
}
