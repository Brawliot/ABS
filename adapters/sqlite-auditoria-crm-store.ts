/**
 * Auditoría de cliente (SQLite): registro append-only de cambios en datos maestros.
 * Cada cambio se documenta: quién lo hizo, qué cambió, valores anteriores/nuevos.
 */

import Database from "better-sqlite3";

export interface RegistroAuditoria {
  readonly seq?: number;
  readonly clienteId: string;
  readonly campo: string;
  readonly valorAnterior?: string;
  readonly valorNuevo?: string;
  readonly autor: string;
  readonly fecha: string;
}

export class SqliteAuditoriaStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auditoria_crm (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        cliente_id TEXT NOT NULL,
        campo TEXT NOT NULL,
        valor_anterior TEXT,
        valor_nuevo TEXT,
        autor TEXT NOT NULL,
        fecha TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auditoria_cliente ON auditoria_crm(tenant_id, cliente_id);
      CREATE TRIGGER IF NOT EXISTS auditoria_no_update BEFORE UPDATE ON auditoria_crm
      BEGIN SELECT RAISE(ABORT, 'La auditoría no se modifica'); END;
      CREATE TRIGGER IF NOT EXISTS auditoria_no_delete BEFORE DELETE ON auditoria_crm
      BEGIN SELECT RAISE(ABORT, 'La auditoría no se borra'); END;
    `);
  }

  registrarCambio(
    tenantId: string,
    clienteId: string,
    campo: string,
    valorAnterior: string | undefined,
    valorNuevo: string | undefined,
    autor: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO auditoria_crm (tenant_id, cliente_id, campo, valor_anterior, valor_nuevo, autor, fecha, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        clienteId,
        campo,
        valorAnterior ?? null,
        valorNuevo ?? null,
        autor,
        new Date().toISOString(),
        new Date().toISOString(),
      );
  }

  auditoriaDe(tenantId: string, clienteId: string): readonly RegistroAuditoria[] {
    const rows = this.db
      .prepare(
        `SELECT seq, cliente_id, campo, valor_anterior, valor_nuevo, autor, fecha
         FROM auditoria_crm
         WHERE tenant_id = ? AND cliente_id = ?
         ORDER BY fecha DESC`,
      )
      .all(tenantId, clienteId) as {
      seq: number;
      cliente_id: string;
      campo: string;
      valor_anterior: string | null;
      valor_nuevo: string | null;
      autor: string;
      fecha: string;
    }[];

    return rows.map((r) => ({
      seq: r.seq,
      clienteId: r.cliente_id,
      campo: r.campo,
      ...(r.valor_anterior ? { valorAnterior: r.valor_anterior } : {}),
      ...(r.valor_nuevo ? { valorNuevo: r.valor_nuevo } : {}),
      autor: r.autor,
      fecha: r.fecha,
    }));
  }

  close(): void {
    this.db.close();
  }
}
