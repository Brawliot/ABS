/**
 * Tareas de cliente (SQLite): lista de tareas append-only con estado.
 * Las tareas no se borran, solo se marcan como completadas.
 */

import Database from "better-sqlite3";

export interface TareaCrm {
  readonly id?: string;
  readonly clienteId: string;
  readonly texto: string;
  readonly fechaVencimiento?: string;
  readonly estado: "pendiente" | "completada";
  readonly asignadoA?: string;
  readonly prioridad: "baja" | "media" | "alta";
  readonly fechaCreacion: string;
  readonly fechaComplecion?: string;
}

export class SqliteTareasCrmStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tareas_crm (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        cliente_id TEXT NOT NULL,
        texto TEXT NOT NULL,
        fecha_vencimiento TEXT,
        estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'completada')),
        asignado_a TEXT,
        prioridad TEXT NOT NULL CHECK (prioridad IN ('baja', 'media', 'alta')),
        fecha_creacion TEXT NOT NULL,
        fecha_completicion TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tareas_cliente ON tareas_crm(tenant_id, cliente_id);
      CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas_crm(tenant_id, cliente_id, estado);
    `);
  }

  crearTarea(
    tenantId: string,
    clienteId: string,
    datos: {
      readonly texto: string;
      readonly fechaVencimiento?: string;
      readonly prioridad?: "baja" | "media" | "alta";
      readonly asignadoA?: string;
    },
    id?: string,
  ): string {
    const texto = datos.texto.trim();
    if (!texto) throw new Error("La tarea no puede estar vacía.");
    if (texto.length > 500) throw new Error("La tarea es demasiado larga.");

    const crypto = require("crypto");
    const tareaId = id || `tarea-${crypto.randomUUID()}`;
    const prioridad = datos.prioridad ?? "media";

    this.db
      .prepare(
        `INSERT INTO tareas_crm (id, tenant_id, cliente_id, texto, fecha_vencimiento, estado, asignado_a, prioridad, fecha_creacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tareaId,
        tenantId,
        clienteId,
        texto,
        datos.fechaVencimiento ?? null,
        "pendiente",
        datos.asignadoA ?? null,
        prioridad,
        new Date().toISOString(),
      );

    return tareaId;
  }

  tareasDelCliente(
    tenantId: string,
    clienteId: string,
    filtro?: "pendientes" | "todas",
  ): readonly TareaCrm[] {
    let query = `
      SELECT id, cliente_id, texto, fecha_vencimiento, estado, asignado_a, prioridad, fecha_creacion, fecha_completicion
      FROM tareas_crm
      WHERE tenant_id = ? AND cliente_id = ?
    `;
    const params: (string | null)[] = [tenantId, clienteId];

    if (filtro === "pendientes") {
      query += ` AND estado = 'pendiente'`;
    }

    query += ` ORDER BY CASE WHEN prioridad = 'alta' THEN 1 WHEN prioridad = 'media' THEN 2 ELSE 3 END, fecha_vencimiento ASC, fecha_creacion DESC`;

    const rows = this.db.prepare(query).all(...params) as {
      id: string;
      cliente_id: string;
      texto: string;
      fecha_vencimiento: string | null;
      estado: "pendiente" | "completada";
      asignado_a: string | null;
      prioridad: "baja" | "media" | "alta";
      fecha_creacion: string;
      fecha_completicion: string | null;
    }[];

    return rows.map((r) => ({
      id: r.id,
      clienteId: r.cliente_id,
      texto: r.texto,
      ...(r.fecha_vencimiento ? { fechaVencimiento: r.fecha_vencimiento } : {}),
      estado: r.estado,
      ...(r.asignado_a ? { asignadoA: r.asignado_a } : {}),
      prioridad: r.prioridad,
      fechaCreacion: r.fecha_creacion,
      ...(r.fecha_completicion ? { fechaComplecion: r.fecha_completicion } : {}),
    }));
  }

  completarTarea(tenantId: string, tareaId: string): void {
    const ahora = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE tareas_crm SET estado = 'completada', fecha_completicion = ?
         WHERE tenant_id = ? AND id = ?`,
      )
      .run(ahora, tenantId, tareaId);
  }

  obtenerTarea(tenantId: string, tareaId: string): TareaCrm | undefined {
    const row = this.db
      .prepare(
        `SELECT id, cliente_id, texto, fecha_vencimiento, estado, asignado_a, prioridad, fecha_creacion, fecha_completicion
         FROM tareas_crm
         WHERE tenant_id = ? AND id = ?`,
      )
      .get(tenantId, tareaId) as {
      id: string;
      cliente_id: string;
      texto: string;
      fecha_vencimiento: string | null;
      estado: "pendiente" | "completada";
      asignado_a: string | null;
      prioridad: "baja" | "media" | "alta";
      fecha_creacion: string;
      fecha_completicion: string | null;
    } | undefined;

    if (!row) return undefined;
    return {
      id: row.id,
      clienteId: row.cliente_id,
      texto: row.texto,
      ...(row.fecha_vencimiento ? { fechaVencimiento: row.fecha_vencimiento } : {}),
      estado: row.estado,
      ...(row.asignado_a ? { asignadoA: row.asignado_a } : {}),
      prioridad: row.prioridad,
      fechaCreacion: row.fecha_creacion,
      ...(row.fecha_completicion ? { fechaComplecion: row.fecha_completicion } : {}),
    };
  }

  contarTareas(tenantId: string, clienteId: string, estado?: "pendiente" | "completada"): number {
    let query = `SELECT COUNT(*) as count FROM tareas_crm WHERE tenant_id = ? AND cliente_id = ?`;
    const params: (string | null)[] = [tenantId, clienteId];
    if (estado) {
      query += ` AND estado = ?`;
      params.push(estado);
    }
    const result = this.db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  close(): void {
    this.db.close();
  }
}
