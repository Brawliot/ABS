/**
 * Almacén SQLite para módulo de Análisis: Consultas guardadas,
 * historico de consultas (append-only) y datasets para BI.
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type { ConsultaGuardada } from "../policies/analisis-query-builder.js";

export class SqliteAnalisisStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS consultas_guardadas (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        tabla TEXT NOT NULL,
        campos TEXT NOT NULL,
        filtros TEXT,
        agregaciones TEXT,
        agrupa_por TEXT,
        ordena_por TEXT,
        limite INTEGER,
        fecha_creacion TEXT NOT NULL,
        frecuencia TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS historico_consultas (
        id TEXT PRIMARY KEY,
        consulta_id TEXT,
        sql TEXT NOT NULL,
        filas_procesadas INTEGER NOT NULL,
        tiempo_ejecucion_ms INTEGER NOT NULL,
        fecha_ejecucion TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (consulta_id) REFERENCES consultas_guardadas(id)
      );

      CREATE TABLE IF NOT EXISTS datasets_bi (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        contenido TEXT NOT NULL,
        formato TEXT NOT NULL,
        fecha_creacion TEXT NOT NULL,
        fecha_actualizacion TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_consultas_nombre ON consultas_guardadas(nombre);
      CREATE INDEX IF NOT EXISTS idx_historico_consulta ON historico_consultas(consulta_id);
      CREATE INDEX IF NOT EXISTS idx_historico_fecha ON historico_consultas(fecha_ejecucion);
      CREATE INDEX IF NOT EXISTS idx_datasets_nombre ON datasets_bi(nombre);
    `);
  }

  guardarConsulta(consulta: ConsultaGuardada): void {
    const ahora = new Date();

    this.db.prepare(
      `INSERT OR REPLACE INTO consultas_guardadas
      (id, nombre, descripcion, tabla, campos, filtros, agregaciones,
       agrupa_por, ordena_por, limite, fecha_creacion, frecuencia, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      consulta.id,
      consulta.nombre,
      consulta.descripcion,
      consulta.tabla,
      JSON.stringify(consulta.campos),
      JSON.stringify(consulta.filtros),
      JSON.stringify(consulta.agregaciones),
      JSON.stringify(consulta.agrupaPor),
      JSON.stringify(consulta.ordenaPor),
      consulta.limite || null,
      consulta.fechaCreacion.toISOString(),
      consulta.frecuencia,
      ahora.toISOString()
    );
  }

  obtenerConsulta(id: string): ConsultaGuardada | undefined {
    const row = this.db.prepare(
      "SELECT * FROM consultas_guardadas WHERE id = ?"
    ).get(id) as any;

    if (!row) return undefined;

    return this.rowAConsulta(row);
  }

  obtenerTodasLasConsultas(): ConsultaGuardada[] {
    const rows = this.db.prepare(
      "SELECT * FROM consultas_guardadas ORDER BY created_at DESC"
    ).all() as any[];

    return rows.map(row => this.rowAConsulta(row));
  }

  eliminarConsulta(id: string): void {
    this.db.prepare("DELETE FROM consultas_guardadas WHERE id = ?").run(id);
  }

  registrarEjecucionConsulta(
    consultaId: string | undefined,
    sql: string,
    filasProcessadas: number,
    tiempoMs: number
  ): void {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO historico_consultas
      (id, consulta_id, sql, filas_procesadas, tiempo_ejecucion_ms, fecha_ejecucion, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      consultaId || null,
      sql,
      filasProcessadas,
      tiempoMs,
      ahora.toISOString(),
      ahora.toISOString()
    );
  }

  obtenerHistoricoConsultas(consultaId?: string): Array<{
    id: string;
    sql: string;
    filasProcessadas: number;
    tiempoEjecucionMs: number;
    fechaEjecucion: Date;
  }> {
    let query =
      "SELECT * FROM historico_consultas ORDER BY fecha_ejecucion DESC LIMIT 100";
    let params: any[] = [];

    if (consultaId) {
      query =
        "SELECT * FROM historico_consultas WHERE consulta_id = ? ORDER BY fecha_ejecucion DESC LIMIT 100";
      params = [consultaId];
    }

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      sql: row.sql,
      filasProcessadas: row.filas_procesadas,
      tiempoEjecucionMs: row.tiempo_ejecucion_ms,
      fechaEjecucion: new Date(row.fecha_ejecucion),
    }));
  }

  guardarDatasetBI(
    nombre: string,
    descripcion: string,
    contenido: string,
    formato: "CSV" | "JSON" | "SQL"
  ): string {
    const id = randomUUID();
    const ahora = new Date();

    this.db.prepare(
      `INSERT INTO datasets_bi
      (id, nombre, descripcion, contenido, formato, fecha_creacion, fecha_actualizacion)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      nombre,
      descripcion,
      contenido,
      formato,
      ahora.toISOString(),
      ahora.toISOString()
    );

    return id;
  }

  obtenerDataset(id: string): {
    nombre: string;
    descripcion: string;
    contenido: string;
    formato: string;
  } | undefined {
    const row = this.db.prepare(
      "SELECT nombre, descripcion, contenido, formato FROM datasets_bi WHERE id = ?"
    ).get(id) as any;

    return row
      ? {
          nombre: row.nombre,
          descripcion: row.descripcion,
          contenido: row.contenido,
          formato: row.formato,
        }
      : undefined;
  }

  obtenerTodosLosDatasets(): Array<{
    id: string;
    nombre: string;
    formato: string;
    fechaCreacion: Date;
  }> {
    const rows = this.db.prepare(
      "SELECT id, nombre, formato, fecha_creacion FROM datasets_bi ORDER BY fecha_creacion DESC"
    ).all() as any[];

    return rows.map(row => ({
      id: row.id,
      nombre: row.nombre,
      formato: row.formato,
      fechaCreacion: new Date(row.fecha_creacion),
    }));
  }

  private rowAConsulta(row: any): ConsultaGuardada {
    return {
      id: row.id,
      nombre: row.nombre,
      descripcion: row.descripcion || "",
      tabla: row.tabla,
      campos: JSON.parse(row.campos || "[]"),
      filtros: JSON.parse(row.filtros || "[]"),
      agregaciones: JSON.parse(row.agregaciones || "[]"),
      agrupaPor: JSON.parse(row.agrupa_por || "[]"),
      ordenaPor: JSON.parse(row.ordena_por || "[]"),
      limite: row.limite,
      fechaCreacion: new Date(row.fecha_creacion),
      frecuencia: row.frecuencia as "manual" | "diaria" | "semanal" | "mensual",
    };
  }

  close(): void {
    this.db.close();
  }
}
