/**
 * Asientos contables (SQLite): doble entrada.
 * Append-only: cada asiento registra débito en una cuenta y crédito en otra.
 * Almacén inmutable; la corrección se hace con asientos de reverso.
 */

import Database from "better-sqlite3";

export interface AsientoRegistro {
  readonly seq?: number;
  readonly fecha: string;
  readonly numero_asiento: string;
  readonly cuenta_deudora: string;
  readonly cuenta_acreedora: string;
  readonly importe_centimos: number;
  readonly concepto: string;
  readonly referencia: string;
}

export class SqliteAsientosStore {
  private readonly db: Database.Database;
  private asientoCounter: number = 0;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS asientos_contables (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        numero_asiento TEXT NOT NULL,
        cuenta_deudora TEXT NOT NULL,
        cuenta_acreedora TEXT NOT NULL,
        importe_centimos INTEGER NOT NULL CHECK (importe_centimos > 0),
        concepto TEXT NOT NULL,
        referencia TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_asientos_fecha ON asientos_contables(tenant_id, fecha);
      CREATE INDEX IF NOT EXISTS idx_asientos_cuenta ON asientos_contables(tenant_id, cuenta_deudora);
      CREATE INDEX IF NOT EXISTS idx_asientos_referencia ON asientos_contables(tenant_id, referencia);
      CREATE TRIGGER IF NOT EXISTS asientos_no_update BEFORE UPDATE ON asientos_contables
      BEGIN SELECT RAISE(ABORT, 'Los asientos no se modifican: registre un asiento de reverso'); END;
      CREATE TRIGGER IF NOT EXISTS asientos_no_delete BEFORE DELETE ON asientos_contables
      BEGIN SELECT RAISE(ABORT, 'Los asientos no se borran: registre un asiento de reverso'); END;
    `);
    this.inicializarContador();
  }

  private inicializarContador(): void {
    const row = this.db.prepare(`
      SELECT MAX(CAST(SUBSTR(numero_asiento, INSTR(numero_asiento, '-') + 1) AS INTEGER)) as max_num
      FROM asientos_contables
      WHERE numero_asiento LIKE '%-\d+' ESCAPE '\'
    `).get() as { max_num: number | null } | undefined;
    this.asientoCounter = (row?.max_num ?? 0) + 1;
  }

  registrar(
    tenantId: string,
    reg: {
      readonly fecha: string;
      readonly cuenta_deudora: string;
      readonly cuenta_acreedora: string;
      readonly importe_centimos: number;
      readonly concepto: string;
      readonly referencia: string;
    },
  ): string {
    const numeroAsiento = `${tenantId}-${this.asientoCounter++}`;
    this.db
      .prepare(
        `INSERT INTO asientos_contables (
          tenant_id, fecha, numero_asiento, cuenta_deudora, cuenta_acreedora,
          importe_centimos, concepto, referencia, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        reg.fecha,
        numeroAsiento,
        reg.cuenta_deudora,
        reg.cuenta_acreedora,
        reg.importe_centimos,
        reg.concepto,
        reg.referencia,
        new Date().toISOString(),
      );
    return numeroAsiento;
  }

  porCuenta(
    tenantId: string,
    cuenta: string,
    desde?: string,
    hasta?: string,
  ): readonly AsientoRegistro[] {
    const params: unknown[] = [tenantId, cuenta];
    let sql = `
      SELECT seq, fecha, numero_asiento, cuenta_deudora, cuenta_acreedora,
             importe_centimos, concepto, referencia
      FROM asientos_contables
      WHERE tenant_id = ? AND (cuenta_deudora = ? OR cuenta_acreedora = ?)
    `;
    params.push(cuenta);

    if (desde) {
      sql += ` AND fecha >= ?`;
      params.push(desde);
    }
    if (hasta) {
      sql += ` AND fecha <= ?`;
      params.push(hasta);
    }

    sql += ` ORDER BY fecha ASC, seq ASC`;

    return this.db.prepare(sql).all(...params) as AsientoRegistro[];
  }

  todos(tenantId: string, desde?: string, hasta?: string): readonly AsientoRegistro[] {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT seq, fecha, numero_asiento, cuenta_deudora, cuenta_acreedora,
             importe_centimos, concepto, referencia
      FROM asientos_contables
      WHERE tenant_id = ?
    `;

    if (desde) {
      sql += ` AND fecha >= ?`;
      params.push(desde);
    }
    if (hasta) {
      sql += ` AND fecha <= ?`;
      params.push(hasta);
    }

    sql += ` ORDER BY fecha ASC, seq ASC`;

    return this.db.prepare(sql).all(...params) as AsientoRegistro[];
  }

  close(): void {
    this.db.close();
  }
}
