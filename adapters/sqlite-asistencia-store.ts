/**
 * HR Module - Append-only attendance storage (SQLite).
 */

import Database from "better-sqlite3";
import type { RegistroAsistencia } from "../elements/index.js";

export class SqliteAsistenciaStore {
  private readonly db: Database.Database;
  private readonly insertStmt: Database.Statement;
  private readonly selectByEmpleadoStmt: Database.Statement;
  private readonly selectByFechaStmt: Database.Statement;
  private readonly updateStmt: Database.Statement;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS asistencia (
        id TEXT PRIMARY KEY,
        empleado_id TEXT NOT NULL,
        fecha TEXT NOT NULL,
        hora_entrada TEXT NOT NULL,
        hora_salida TEXT,
        observaciones TEXT,
        estado TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_asistencia_empleado ON asistencia(empleado_id);
      CREATE INDEX IF NOT EXISTS idx_asistencia_fecha ON asistencia(fecha);
      CREATE INDEX IF NOT EXISTS idx_asistencia_empleado_fecha ON asistencia(empleado_id, fecha);
    `);

    this.insertStmt = this.db.prepare(`
      INSERT INTO asistencia (
        id, empleado_id, fecha, hora_entrada, hora_salida,
        observaciones, estado, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.updateStmt = this.db.prepare(`
      UPDATE asistencia
      SET hora_salida = ?, estado = ?
      WHERE id = ?
    `);

    this.selectByEmpleadoStmt = this.db.prepare(
      `SELECT * FROM asistencia WHERE empleado_id = ? ORDER BY fecha ASC`,
    );

    this.selectByFechaStmt = this.db.prepare(
      `SELECT * FROM asistencia WHERE empleado_id = ? AND fecha BETWEEN ? AND ? ORDER BY fecha ASC`,
    );
  }

  async guardarRegistro(registro: RegistroAsistencia): Promise<void> {
    this.insertStmt.run(
      registro.id,
      registro.empleadoId,
      registro.fecha.toISOString().split("T")[0],
      registro.horaEntrada,
      registro.horaSalida ?? null,
      registro.observaciones ?? null,
      registro.estado,
      registro.createdAt.toISOString(),
    );
  }

  async actualizarRegistro(registro: RegistroAsistencia): Promise<void> {
    this.updateStmt.run(registro.horaSalida ?? null, registro.estado, registro.id);
  }

  async obtenerRegistrosPorEmpleado(
    empleadoId: string,
    desde?: Date,
    hasta?: Date,
  ): Promise<RegistroAsistencia[]> {
    let rows: any[];
    if (desde && hasta) {
      rows = this.selectByFechaStmt.all(
        empleadoId,
        desde.toISOString().split("T")[0],
        hasta.toISOString().split("T")[0],
      ) as any[];
    } else {
      rows = this.selectByEmpleadoStmt.all(empleadoId) as any[];
    }
    return rows.map((r) => this.rowToRegistro(r));
  }

  async obtenerRegistroPorId(id: string): Promise<RegistroAsistencia | null> {
    const row = this.db
      .prepare("SELECT * FROM asistencia WHERE id = ?")
      .get(id) as any;
    return row ? this.rowToRegistro(row) : null;
  }

  private rowToRegistro(row: any): RegistroAsistencia {
    return {
      id: row.id,
      empleadoId: row.empleado_id,
      fecha: new Date(row.fecha),
      horaEntrada: row.hora_entrada,
      horaSalida: row.hora_salida ?? undefined,
      observaciones: row.observaciones ?? undefined,
      estado: row.estado,
      createdAt: new Date(row.created_at),
    };
  }

  close(): void {
    this.db.close();
  }
}
