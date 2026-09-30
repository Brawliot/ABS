/**
 * Devoluciones (SQLite): registra las devoluciones de productos.
 * Almacén append-only con triggers que impiden modificarlos o borrarlos;
 * un error se corrige con otra devolución o ajuste.
 */

import Database from "better-sqlite3";

export interface DevolucionRegistro {
  readonly seq?: number;
  readonly expediente: string;
  readonly lineas: readonly { readonly ofertaId: string; readonly cantidadMilesimas: number }[];
  readonly importeCentimos: number;
  readonly fecha: string;
  readonly motivo: string;
  readonly actor: string;
}

export class SqliteDevolucionesStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devoluciones (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        expediente TEXT NOT NULL,
        lineas_json TEXT NOT NULL,
        importe_centimos INTEGER NOT NULL CHECK (importe_centimos > 0),
        fecha TEXT NOT NULL,
        motivo TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_devoluciones_expediente ON devoluciones(tenant_id, expediente);
      CREATE TRIGGER IF NOT EXISTS devoluciones_no_update BEFORE UPDATE ON devoluciones
      BEGIN SELECT RAISE(ABORT, 'Las devoluciones no se modifican: registre otra devolución'); END;
      CREATE TRIGGER IF NOT EXISTS devoluciones_no_delete BEFORE DELETE ON devoluciones
      BEGIN SELECT RAISE(ABORT, 'Las devoluciones no se borran: registre un ajuste'); END;
    `);
  }

  registrar(
    tenantId: string,
    reg: {
      readonly expediente: string;
      readonly lineas: readonly { readonly ofertaId: string; readonly cantidadMilesimas: number }[];
      readonly importeCentimos: number;
      readonly fecha: string;
      readonly motivo: string;
      readonly actor: string;
    },
  ): void {
    this.db
      .prepare(
        `INSERT INTO devoluciones (tenant_id, expediente, lineas_json, importe_centimos, fecha, motivo, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        reg.expediente,
        JSON.stringify(reg.lineas),
        reg.importeCentimos,
        reg.fecha,
        reg.motivo,
        reg.actor,
        new Date().toISOString(),
      );
  }

  delExpediente(
    tenantId: string,
    expediente: string,
  ): readonly DevolucionRegistro[] {
    const rows = this.db
      .prepare(
        `SELECT seq, expediente, lineas_json, importe_centimos, fecha, motivo, actor
         FROM devoluciones
         WHERE tenant_id = ? AND expediente = ?
         ORDER BY seq ASC`,
      )
      .all(tenantId, expediente) as {
      seq: number;
      expediente: string;
      lineas_json: string;
      importe_centimos: number;
      fecha: string;
      motivo: string;
      actor: string;
    }[];
    return rows.map((r) => ({
      seq: r.seq,
      expediente: r.expediente,
      lineas: JSON.parse(r.lineas_json),
      importeCentimos: r.importe_centimos,
      fecha: r.fecha,
      motivo: r.motivo,
      actor: r.actor,
    }));
  }

  totalDevuelto(tenantId: string, expediente: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(importe_centimos), 0) as total
         FROM devoluciones
         WHERE tenant_id = ? AND expediente = ?`,
      )
      .get(tenantId, expediente) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  close(): void {
    this.db.close();
  }
}
