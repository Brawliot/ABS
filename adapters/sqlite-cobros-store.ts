/**
 * Cobros parciales (SQLite): registra los pagos parciales en un expediente
 * (señal, hitos, pagos a cuenta). Almacén append-only con triggers que
 * impiden modificarlos o borrarlos; un error se corrige con otro cobro.
 */

import Database from "better-sqlite3";

export interface CobrosRegistro {
  readonly seq?: number;
  readonly expediente: string;
  readonly importeCentimos: number;
  readonly fecha: string;
  readonly hitoId?: string;
  readonly medio: string;
  readonly actor: string;
}

export class SqliteCobrosStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cobros_parciales (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        expediente TEXT NOT NULL,
        importe_centimos INTEGER NOT NULL CHECK (importe_centimos > 0),
        fecha TEXT NOT NULL,
        hito_id TEXT,
        medio TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cobros_expediente ON cobros_parciales(tenant_id, expediente);
      CREATE TRIGGER IF NOT EXISTS cobros_no_update BEFORE UPDATE ON cobros_parciales
      BEGIN SELECT RAISE(ABORT, 'Los cobros no se modifican: registre otro cobro'); END;
      CREATE TRIGGER IF NOT EXISTS cobros_no_delete BEFORE DELETE ON cobros_parciales
      BEGIN SELECT RAISE(ABORT, 'Los cobros no se borran: registre un reembolso'); END;
    `);
  }

  registrar(
    tenantId: string,
    reg: {
      readonly expediente: string;
      readonly importeCentimos: number;
      readonly fecha: string;
      readonly hitoId?: string;
      readonly medio: string;
      readonly actor: string;
    },
  ): void {
    this.db
      .prepare(
        `INSERT INTO cobros_parciales (tenant_id, expediente, importe_centimos, fecha, hito_id, medio, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        reg.expediente,
        reg.importeCentimos,
        reg.fecha,
        reg.hitoId ?? null,
        reg.medio,
        reg.actor,
        new Date().toISOString(),
      );
  }

  deExpediente(
    tenantId: string,
    expediente: string,
  ): readonly CobrosRegistro[] {
    const rows = this.db
      .prepare(
        `SELECT seq, expediente, importe_centimos, fecha, hito_id, medio, actor
         FROM cobros_parciales
         WHERE tenant_id = ? AND expediente = ?
         ORDER BY seq ASC`,
      )
      .all(tenantId, expediente) as {
      seq: number;
      expediente: string;
      importe_centimos: number;
      fecha: string;
      hito_id: string | null;
      medio: string;
      actor: string;
    }[];
    return rows.map((r) => ({
      seq: r.seq,
      expediente: r.expediente,
      importeCentimos: r.importe_centimos,
      fecha: r.fecha,
      ...(r.hito_id ? { hitoId: r.hito_id } : {}),
      medio: r.medio,
      actor: r.actor,
    }));
  }

  totalParcial(tenantId: string, expediente: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(importe_centimos), 0) as total
         FROM cobros_parciales
         WHERE tenant_id = ? AND expediente = ?`,
      )
      .get(tenantId, expediente) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  close(): void {
    this.db.close();
  }
}
