/**
 * Plan de cuentas (SQLite): codificación de cuentas contables.
 * 1xxx = Activo, 2xxx = Pasivo, 3xxx = Capital, 4xxx = Ingresos, 5xxx = Gastos.
 */

import Database from "better-sqlite3";

export type TipoCuenta = "activo" | "pasivo" | "capital" | "ingreso" | "gasto";

export interface CuentaRegistro {
  readonly codigo: string;
  readonly nombre: string;
  readonly tipo: TipoCuenta;
  readonly saldo_centimos: number;
}

export class SqliteCuentasStore {
  private readonly db: Database.Database;
  private saldos: Map<string, number> = new Map();

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plan_cuentas (
        codigo TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('activo', 'pasivo', 'capital', 'ingreso', 'gasto')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cuentas_tenant ON plan_cuentas(tenant_id);
      CREATE TABLE IF NOT EXISTS saldos_cuentas (
        codigo TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        saldo_centimos INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (codigo, tenant_id),
        FOREIGN KEY (codigo) REFERENCES plan_cuentas(codigo)
      );
    `);
    this.cargarSaldos();
  }

  private cargarSaldos(): void {
    const rows = this.db.prepare(`
      SELECT codigo, saldo_centimos FROM saldos_cuentas
    `).all() as Array<{ codigo: string; saldo_centimos: number }>;
    for (const row of rows) {
      this.saldos.set(row.codigo, row.saldo_centimos);
    }
  }

  crearPlanCuentas(tenantId: string): void {
    const plan = [
      { codigo: "1000", nombre: "Caja", tipo: "activo" as const },
      { codigo: "1100", nombre: "Banco", tipo: "activo" as const },
      { codigo: "1200", nombre: "Clientes", tipo: "activo" as const },
      { codigo: "1300", nombre: "Inventario", tipo: "activo" as const },
      { codigo: "2000", nombre: "Proveedores", tipo: "pasivo" as const },
      { codigo: "2100", nombre: "Préstamos", tipo: "pasivo" as const },
      { codigo: "3000", nombre: "Capital", tipo: "capital" as const },
      { codigo: "3100", nombre: "Resultados", tipo: "capital" as const },
      { codigo: "4000", nombre: "Ventas", tipo: "ingreso" as const },
      { codigo: "4100", nombre: "Ingresos por servicios", tipo: "ingreso" as const },
      { codigo: "5000", nombre: "Compras", tipo: "gasto" as const },
      { codigo: "5100", nombre: "Gastos de personal", tipo: "gasto" as const },
      { codigo: "5200", nombre: "Gastos generales", tipo: "gasto" as const },
    ];

    for (const cuenta of plan) {
      this.crearCuenta(tenantId, cuenta.codigo, cuenta.nombre, cuenta.tipo);
    }
  }

  crearCuenta(tenantId: string, codigo: string, nombre: string, tipo: TipoCuenta): void {
    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO plan_cuentas (codigo, tenant_id, nombre, tipo, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(codigo, tenantId, nombre, tipo, new Date().toISOString());

      // Inicializar saldo
      if (!this.saldos.has(codigo)) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO saldos_cuentas (codigo, tenant_id, saldo_centimos, updated_at)
             VALUES (?, ?, 0, ?)`,
          )
          .run(codigo, tenantId, new Date().toISOString());
        this.saldos.set(codigo, 0);
      }
    } catch (err) {
      // Silenciamente ignorar si ya existe
    }
  }

  obtener(codigo: string, tenantId: string): CuentaRegistro | undefined {
    const row = this.db
      .prepare(
        `SELECT c.codigo, c.nombre, c.tipo, COALESCE(s.saldo_centimos, 0) as saldo_centimos
         FROM plan_cuentas c
         LEFT JOIN saldos_cuentas s ON c.codigo = s.codigo AND s.tenant_id = c.tenant_id
         WHERE c.codigo = ? AND c.tenant_id = ?`,
      )
      .get(codigo, tenantId) as CuentaRegistro | undefined;
    return row;
  }

  todasCuentas(tenantId: string): readonly CuentaRegistro[] {
    return this.db
      .prepare(
        `SELECT c.codigo, c.nombre, c.tipo, COALESCE(s.saldo_centimos, 0) as saldo_centimos
         FROM plan_cuentas c
         LEFT JOIN saldos_cuentas s ON c.codigo = s.codigo AND s.tenant_id = c.tenant_id
         WHERE c.tenant_id = ?
         ORDER BY c.codigo`,
      )
      .all(tenantId) as CuentaRegistro[];
  }

  actualizarSaldo(codigo: string, tenantId: string, deltaCentimos: number): void {
    const saldoActual = this.saldos.get(codigo) ?? 0;
    const nuevoSaldo = saldoActual + deltaCentimos;
    this.saldos.set(codigo, nuevoSaldo);

    this.db
      .prepare(
        `INSERT INTO saldos_cuentas (codigo, tenant_id, saldo_centimos, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(codigo, tenant_id) DO UPDATE SET saldo_centimos = ?, updated_at = ?`,
      )
      .run(codigo, tenantId, nuevoSaldo, new Date().toISOString(), nuevoSaldo, new Date().toISOString());
  }

  close(): void {
    this.db.close();
  }
}
