/**
 * Store SQLite para vacaciones: append-only, sin UPDATE/DELETE en tablas principales.
 */

import Database from "better-sqlite3";
import type { VacacionesDisponibles, SolicitudVacaciones } from "../policies/vacaciones.js";

export class SqliteVacacionesStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vacaciones_disponibles (
        empleado_id TEXT NOT NULL,
        año INTEGER NOT NULL,
        dias_totales INTEGER NOT NULL,
        dias_usados INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        version INTEGER NOT NULL,
        PRIMARY KEY (empleado_id, año)
      );

      CREATE TABLE IF NOT EXISTS solicitudes_vacaciones (
        id TEXT PRIMARY KEY,
        empleado_id TEXT NOT NULL,
        fecha_inicio TEXT NOT NULL,
        fecha_termino TEXT NOT NULL,
        dias_solicitados INTEGER NOT NULL,
        estado TEXT NOT NULL,
        aprobado_por TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_solicitudes_empleado
        ON solicitudes_vacaciones(empleado_id);
    `);
  }

  registrarAcumulacion(
    empleadoId: string,
    año: number,
    diasTotales: number
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO vacaciones_disponibles
        (empleado_id, año, dias_totales, dias_usados, created_at, version)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      empleadoId,
      año,
      diasTotales,
      0,
      new Date().toISOString(),
      1
    );
  }

  registrarSolicitud(solicitud: SolicitudVacaciones): void {
    const stmt = this.db.prepare(`
      INSERT INTO solicitudes_vacaciones
        (id, empleado_id, fecha_inicio, fecha_termino, dias_solicitados,
         estado, aprobado_por, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      solicitud.id,
      solicitud.empleadoId,
      solicitud.fechaInicio.toISOString(),
      solicitud.fechaTermino.toISOString(),
      solicitud.diasSolicitados,
      solicitud.estado,
      solicitud.aprobadoPor || null,
      solicitud.createdAt.toISOString()
    );
  }

  registrarAprobacion(solicitudId: string, aprobadoPor: string): void {
    // Append-only: insertar evento de aprobación
    const stmt = this.db.prepare(`
      INSERT INTO solicitudes_vacaciones
        (id, empleado_id, fecha_inicio, fecha_termino, dias_solicitados,
         estado, aprobado_por, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Obtener la solicitud existente
    const solicitud = this.obtenerSolicitud(solicitudId);
    if (!solicitud) throw new Error(`Solicitud ${solicitudId} no encontrada`);

    stmt.run(
      solicitud.id,
      solicitud.empleadoId,
      solicitud.fechaInicio.toISOString(),
      solicitud.fechaTermino.toISOString(),
      solicitud.diasSolicitados,
      "aprobada",
      aprobadoPor,
      new Date().toISOString()
    );

    // Actualizar disponibles
    const año = solicitud.fechaInicio.getFullYear();
    const currentAvail = this.obtenerDisponibles(solicitud.empleadoId, año);
    if (currentAvail) {
      const stmt2 = this.db.prepare(`
        INSERT INTO vacaciones_disponibles
          (empleado_id, año, dias_totales, dias_usados, created_at, version)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt2.run(
        solicitud.empleadoId,
        año,
        currentAvail.diasTotales,
        currentAvail.diasUsados + solicitud.diasSolicitados,
        new Date().toISOString(),
        (currentAvail as any).version + 1
      );
    }
  }

  obtenerDisponibles(
    empleadoId: string,
    año: number
  ): VacacionesDisponibles | null {
    const stmt = this.db.prepare(`
      SELECT
        empleado_id, año, dias_totales, dias_usados,
        dias_totales - dias_usados as dias_disponibles
      FROM vacaciones_disponibles
      WHERE empleado_id = ? AND año = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const row = stmt.get(empleadoId, año) as any;
    if (!row) return null;

    return {
      empleadoId: row.empleado_id,
      año: row.año,
      diasTotales: row.dias_totales,
      diasUsados: row.dias_usados,
      diasDisponibles: row.dias_disponibles,
    };
  }

  obtenerSolicitud(solicitudId: string): SolicitudVacaciones | null {
    const stmt = this.db.prepare(`
      SELECT * FROM solicitudes_vacaciones WHERE id = ?
      ORDER BY created_at DESC LIMIT 1
    `);

    const row = stmt.get(solicitudId) as any;
    if (!row) return null;

    return {
      id: row.id,
      empleadoId: row.empleado_id,
      fechaInicio: new Date(row.fecha_inicio),
      fechaTermino: new Date(row.fecha_termino),
      diasSolicitados: row.dias_solicitados,
      estado: row.estado,
      aprobadoPor: row.aprobado_por,
      createdAt: new Date(row.created_at),
    };
  }

  listarSolicitudesPorEmpleado(empleadoId: string): SolicitudVacaciones[] {
    const stmt = this.db.prepare(`
      SELECT * FROM solicitudes_vacaciones
      WHERE empleado_id = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(empleadoId) as any[];
    return rows.map((row) => ({
      id: row.id,
      empleadoId: row.empleado_id,
      fechaInicio: new Date(row.fecha_inicio),
      fechaTermino: new Date(row.fecha_termino),
      diasSolicitados: row.dias_solicitados,
      estado: row.estado,
      aprobadoPor: row.aprobado_por,
      createdAt: new Date(row.created_at),
    }));
  }

  close(): void {
    this.db.close();
  }
}
