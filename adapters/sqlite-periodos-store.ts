/**
 * Períodos contables cerrados (SQLite).
 * Un período cerrado no puede ser editado; los asientos de cierre se generan automáticamente.
 */

import Database from "better-sqlite3";

export interface PerıodoRegistro {
  readonly seq?: number;
  readonly fecha_cierre: string;
  readonly numero: string;
  readonly asiento_cierre: string;
  readonly estado: "abierto" | "cerrado";
}

export class SqlitePeriodsStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS periodos_contables (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        fecha_cierre TEXT NOT NULL,
        numero TEXT NOT NULL,
        asiento_cierre TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'cerrado' CHECK (estado IN ('abierto', 'cerrado')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_periodos_tenant ON periodos_contables(tenant_id, fecha_cierre);
      CREATE TRIGGER IF NOT EXISTS periodos_no_update BEFORE UPDATE ON periodos_contables
      BEGIN SELECT RAISE(ABORT, 'Los períodos no se modifican una vez cerrados'); END;
      CREATE TRIGGER IF NOT EXISTS periodos_no_delete BEFORE DELETE ON periodos_contables
      BEGIN SELECT RAISE(ABORT, 'Los períodos cerrados no se borran'); END;
    `);
  }

  cerrarPeriodo(
    tenantId: string,
    fecha: string,
    numeroAsientoCierre: string,
  ): { ok: true } | { ok: false; error: string } {
    // Verificar que no hay ya un período cerrado en esta fecha
    const existe = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM periodos_contables WHERE tenant_id = ? AND fecha_cierre = ?`
    ).get(tenantId, fecha) as { cnt: number };

    if (existe.cnt > 0) {
      return { ok: false, error: "Período ya cerrado" };
    }

    try {
      this.db
        .prepare(
          `INSERT INTO periodos_contables (tenant_id, fecha_cierre, numero, asiento_cierre, estado, created_at)
           VALUES (?, ?, ?, ?, 'cerrado', ?)`,
        )
        .run(
          tenantId,
          fecha,
          `P-${fecha}`,
          numeroAsientoCierre,
          new Date().toISOString(),
        );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  obtenerPeriodos(tenantId: string): readonly PerıodoRegistro[] {
    return this.db
      .prepare(
        `SELECT seq, fecha_cierre, numero, asiento_cierre, estado
         FROM periodos_contables
         WHERE tenant_id = ?
         ORDER BY fecha_cierre DESC`,
      )
      .all(tenantId) as PerıodoRegistro[];
  }

  estaCerrado(tenantId: string, fecha: string): boolean {
    // Una fecha está cerrada si hay un período cerrado cuya fecha es ANTERIOR a la fecha a verificar
    // (es decir, si cierre = 2026-09-30 y fecha = 2026-10-01, la fecha está cerrada)
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM periodos_contables WHERE tenant_id = ? AND fecha_cierre < ? AND estado = 'cerrado'`
    ).get(tenantId, fecha) as { cnt: number };

    return row.cnt > 0;
  }

  close(): void {
    this.db.close();
  }
}
