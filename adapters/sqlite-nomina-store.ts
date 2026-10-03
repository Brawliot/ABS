/**
 * HR Module - Append-only payroll storage (SQLite).
 * Nóminas are immutable once created (financial audit trail).
 */

import Database from "better-sqlite3";
import type { Nomina } from "../elements/index.js";

export class SqliteNominaStore {
  private readonly db: Database.Database;
  private readonly insertStmt: Database.Statement;
  private readonly selectByEmpleadoStmt: Database.Statement;
  private readonly selectByPeriodoStmt: Database.Statement;
  private readonly selectAllStmt: Database.Statement;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nominas (
        id TEXT PRIMARY KEY,
        empleado_id TEXT NOT NULL,
        periodo TEXT NOT NULL,
        salario_base INTEGER NOT NULL,
        horas_trabajadas REAL NOT NULL,
        descuentos_afp INTEGER NOT NULL,
        descuentos_isapre INTEGER NOT NULL,
        descuentos_impuesto_renta INTEGER NOT NULL,
        descuentos_otros INTEGER NOT NULL,
        bonificaciones INTEGER NOT NULL,
        salario_neto INTEGER NOT NULL,
        estado TEXT NOT NULL,
        fecha_pago TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(empleado_id, periodo)
      );
      CREATE INDEX IF NOT EXISTS idx_nominas_empleado ON nominas(empleado_id);
      CREATE INDEX IF NOT EXISTS idx_nominas_periodo ON nominas(periodo);
    `);

    this.insertStmt = this.db.prepare(`
      INSERT INTO nominas (
        id, empleado_id, periodo, salario_base, horas_trabajadas,
        descuentos_afp, descuentos_isapre, descuentos_impuesto_renta,
        descuentos_otros, bonificaciones, salario_neto, estado,
        fecha_pago, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectByEmpleadoStmt = this.db.prepare(
      `SELECT * FROM nominas WHERE empleado_id = ? ORDER BY periodo DESC`,
    );

    this.selectByPeriodoStmt = this.db.prepare(
      `SELECT * FROM nominas WHERE periodo = ? ORDER BY created_at ASC`,
    );

    this.selectAllStmt = this.db.prepare(
      `SELECT * FROM nominas ORDER BY periodo DESC`,
    );
  }

  async guardarNomina(nomina: Nomina): Promise<void> {
    try {
      this.insertStmt.run(
        nomina.id,
        nomina.empleadoId,
        nomina.periodo,
        nomina.salarioBase,
        nomina.horasTrabajadas,
        nomina.descuentos.afp,
        nomina.descuentos.isapre,
        nomina.descuentos.impuestoRenta,
        nomina.descuentos.otros,
        nomina.bonificaciones,
        nomina.salarioNeto,
        nomina.estado,
        nomina.fechaPago?.toISOString() ?? null,
        nomina.createdAt.toISOString(),
      );
    } catch (e) {
      if ((e as any).message?.includes("UNIQUE")) {
        throw new Error(
          `Payroll already exists for employee ${nomina.empleadoId} in period ${nomina.periodo}`,
        );
      }
      throw e;
    }
  }

  async obtenerNominasPorEmpleado(
    empleadoId: string,
    periodo?: string,
  ): Promise<Nomina[]> {
    const rows = this.selectByEmpleadoStmt.all(empleadoId) as any[];
    return rows
      .filter((r) => !periodo || r.periodo === periodo)
      .map((r) => this.rowToNomina(r));
  }

  async obtenerNominasPorPeriodo(periodo: string): Promise<Nomina[]> {
    const rows = this.selectByPeriodoStmt.all(periodo) as any[];
    return rows.map((r) => this.rowToNomina(r));
  }

  async obtenerTodasLasNominas(): Promise<Nomina[]> {
    const rows = this.selectAllStmt.all() as any[];
    return rows.map((r) => this.rowToNomina(r));
  }

  private rowToNomina(row: any): Nomina {
    const nomina: Nomina = {
      id: row.id,
      empleadoId: row.empleado_id,
      periodo: row.periodo,
      salarioBase: row.salario_base,
      horasTrabajadas: row.horas_trabajadas,
      descuentos: {
        afp: row.descuentos_afp,
        isapre: row.descuentos_isapre,
        impuestoRenta: row.descuentos_impuesto_renta,
        otros: row.descuentos_otros,
      },
      bonificaciones: row.bonificaciones,
      salarioNeto: row.salario_neto,
      estado: row.estado,
      createdAt: new Date(row.created_at),
    };

    if (row.fecha_pago) {
      return { ...nomina, fechaPago: new Date(row.fecha_pago) };
    }
    return nomina;
  }

  close(): void {
    this.db.close();
  }
}
