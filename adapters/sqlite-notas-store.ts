/**
 * Notas de cliente (SQLite): historial append-only de notas internas y públicas.
 * No se modifican ni se borran; cada nota se registra con autor, fecha y visibilidad.
 */

import Database from "better-sqlite3";

export interface NotaCliente {
  readonly seq?: number;
  readonly clienteId: string;
  readonly texto: string;
  readonly autor: string;
  readonly fecha: string;
  readonly esInterna: boolean;
}

export class SqliteNotasStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notas_cliente (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        cliente_id TEXT NOT NULL,
        texto TEXT NOT NULL,
        autor TEXT NOT NULL,
        fecha TEXT NOT NULL,
        es_interna BOOLEAN NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notas_cliente ON notas_cliente(tenant_id, cliente_id);
      CREATE TRIGGER IF NOT EXISTS notas_no_update BEFORE UPDATE ON notas_cliente
      BEGIN SELECT RAISE(ABORT, 'Las notas no se modifican'); END;
      CREATE TRIGGER IF NOT EXISTS notas_no_delete BEFORE DELETE ON notas_cliente
      BEGIN SELECT RAISE(ABORT, 'Las notas no se borran'); END;
    `);
  }

  registrarNota(
    tenantId: string,
    clienteId: string,
    texto: string,
    autor: string,
    esInterna: boolean,
  ): void {
    const m = texto.trim();
    if (!m) throw new Error("La nota no puede estar vacía.");
    if (m.length > 5000) throw new Error("La nota es demasiado larga.");
    this.db
      .prepare(
        `INSERT INTO notas_cliente (tenant_id, cliente_id, texto, autor, fecha, es_interna, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        clienteId,
        m,
        autor,
        new Date().toISOString(),
        esInterna ? 1 : 0,
        new Date().toISOString(),
      );
  }

  notasDelCliente(
    tenantId: string,
    clienteId: string,
    filtroInternas?: boolean,
  ): readonly NotaCliente[] {
    let query = `
      SELECT seq, cliente_id, texto, autor, fecha, es_interna
      FROM notas_cliente
      WHERE tenant_id = ? AND cliente_id = ?
    `;
    const params: (string | number)[] = [tenantId, clienteId];
    if (filtroInternas !== undefined) {
      query += ` AND es_interna = ?`;
      params.push(filtroInternas ? 1 : 0);
    }
    query += ` ORDER BY fecha DESC`;

    const rows = this.db.prepare(query).all(...params) as {
      seq: number;
      cliente_id: string;
      texto: string;
      autor: string;
      fecha: string;
      es_interna: number;
    }[];

    return rows.map((r) => ({
      seq: r.seq,
      clienteId: r.cliente_id,
      texto: r.texto,
      autor: r.autor,
      fecha: r.fecha,
      esInterna: r.es_interna === 1,
    }));
  }

  contarNotasDelCliente(tenantId: string, clienteId: string): number {
    const result = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM notas_cliente WHERE tenant_id = ? AND cliente_id = ?`,
      )
      .get(tenantId, clienteId) as { count: number };
    return result.count;
  }

  close(): void {
    this.db.close();
  }
}
