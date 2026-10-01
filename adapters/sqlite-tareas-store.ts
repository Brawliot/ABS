/**
 * Tareas recurrentes y recordatorios (SQLite): almacén append-only.
 * Tipos de tarea: cobro_vencido, cliente_bloqueado, stock_bajo, factura_sin_enviar.
 * Las tareas nunca se borran, solo se marcan como completadas/canceladas.
 * Un trigger impide modificaciones; errores se corrigen con nuevas tareas.
 */

import Database from "better-sqlite3";

export type TareaTipo = "cobro_vencido" | "cliente_bloqueado" | "stock_bajo" | "factura_sin_enviar";
export type TareaPeriodicidad = "diaria" | "semanal" | "mensual";
export type TareaEstado = "pendiente" | "completada" | "cancelada";

export interface TareaRegistro {
  readonly seq?: number;
  readonly tipo: TareaTipo;
  readonly referencia: string;
  readonly periodicidad: TareaPeriodicidad;
  readonly proximaEjecucion: string;
  readonly ultimaEjecucion?: string;
  readonly estado: TareaEstado;
  readonly creada: string;
}

export class SqliteTareasStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tareas (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('cobro_vencido', 'cliente_bloqueado', 'stock_bajo', 'factura_sin_enviar')),
        referencia TEXT NOT NULL,
        periodicidad TEXT NOT NULL CHECK (periodicidad IN ('diaria', 'semanal', 'mensual')),
        proxima_ejecucion TEXT NOT NULL,
        ultima_ejecucion TEXT,
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completada', 'cancelada')),
        creada_en TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tareas_tenant ON tareas(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_tareas_referencia ON tareas(tenant_id, referencia);
      CREATE INDEX IF NOT EXISTS idx_tareas_proxima ON tareas(tenant_id, proxima_ejecucion);
      CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas(tenant_id, estado);
      CREATE TRIGGER IF NOT EXISTS tareas_no_update BEFORE UPDATE ON tareas
      BEGIN SELECT RAISE(ABORT, 'Las tareas no se modifican: cancele y cree una nueva'); END;
      CREATE TRIGGER IF NOT EXISTS tareas_no_delete BEFORE DELETE ON tareas
      BEGIN SELECT RAISE(ABORT, 'Las tareas no se borran: cancele la tarea'); END;
    `);
  }

  registrar(
    tenantId: string,
    tarea: {
      readonly tipo: TareaTipo;
      readonly referencia: string;
      readonly periodicidad: TareaPeriodicidad;
      readonly proximaEjecucion: string;
    },
  ): void {
    this.db
      .prepare(
        `INSERT INTO tareas (tenant_id, tipo, referencia, periodicidad, proxima_ejecucion, estado, creada_en)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(tenantId, tarea.tipo, tarea.referencia, tarea.periodicidad, tarea.proximaEjecucion, "pendiente", new Date().toISOString());
  }

  /** Obtiene todas las tareas de una referencia. */
  deReferencia(tenantId: string, referencia: string): readonly TareaRegistro[] {
    const rows = this.db
      .prepare(
        `SELECT seq, tipo, referencia, periodicidad, proxima_ejecucion, ultima_ejecucion, estado, creada_en
         FROM tareas
         WHERE tenant_id = ? AND referencia = ?
         ORDER BY seq DESC`,
      )
      .all(tenantId, referencia) as {
      seq: number;
      tipo: TareaTipo;
      referencia: string;
      periodicidad: TareaPeriodicidad;
      proxima_ejecucion: string;
      ultima_ejecucion: string | null;
      estado: TareaEstado;
      creada_en: string;
    }[];
    return rows.map((r) => ({
      seq: r.seq,
      tipo: r.tipo,
      referencia: r.referencia,
      periodicidad: r.periodicidad,
      proximaEjecucion: r.proxima_ejecucion,
      ...(r.ultima_ejecucion ? { ultimaEjecucion: r.ultima_ejecucion } : {}),
      estado: r.estado,
      creada: r.creada_en,
    }));
  }

  /** Obtiene todas las tareas pendientes de hoy. */
  vencidasHoy(tenantId: string, hoy: string): readonly TareaRegistro[] {
    const rows = this.db
      .prepare(
        `SELECT seq, tipo, referencia, periodicidad, proxima_ejecucion, ultima_ejecucion, estado, creada_en
         FROM tareas
         WHERE tenant_id = ? AND estado = 'pendiente' AND proxima_ejecucion <= ?
         ORDER BY proxima_ejecucion ASC`,
      )
      .all(tenantId, hoy) as {
      seq: number;
      tipo: TareaTipo;
      referencia: string;
      periodicidad: TareaPeriodicidad;
      proxima_ejecucion: string;
      ultima_ejecucion: string | null;
      estado: TareaEstado;
      creada_en: string;
    }[];
    return rows.map((r) => ({
      seq: r.seq,
      tipo: r.tipo,
      referencia: r.referencia,
      periodicidad: r.periodicidad,
      proximaEjecucion: r.proxima_ejecucion,
      ...(r.ultima_ejecucion ? { ultimaEjecucion: r.ultima_ejecucion } : {}),
      estado: r.estado,
      creada: r.creada_en,
    }));
  }

  /** Marca una tarea como completada: registra el evento y crea la próxima ocurrencia. */
  completar(tenantId: string, seq: number, hoy: string): void {
    const tarea = this.db
      .prepare(`SELECT tipo, referencia, periodicidad, proxima_ejecucion FROM tareas WHERE tenant_id = ? AND seq = ?`)
      .get(tenantId, seq) as {
      tipo: TareaTipo;
      referencia: string;
      periodicidad: TareaPeriodicidad;
      proxima_ejecucion: string;
    } | undefined;

    if (!tarea) throw new Error(`Tarea ${seq} no encontrada`);

    const proximaFecha = this.calcularProxima(new Date(tarea.proxima_ejecucion), tarea.periodicidad);

    this.db
      .prepare(
        `INSERT INTO tareas (tenant_id, tipo, referencia, periodicidad, proxima_ejecucion, ultima_ejecucion, estado, creada_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        tarea.tipo,
        tarea.referencia,
        tarea.periodicidad,
        proximaFecha.toISOString().split("T")[0],
        hoy,
        "completada",
        new Date().toISOString(),
      );
  }

  /** Calcula la próxima fecha de ejecución según la periodicidad. */
  private calcularProxima(fecha: Date, periodicidad: TareaPeriodicidad): Date {
    const proxima = new Date(fecha);
    if (periodicidad === "diaria") {
      proxima.setDate(proxima.getDate() + 1);
    } else if (periodicidad === "semanal") {
      proxima.setDate(proxima.getDate() + 7);
    } else if (periodicidad === "mensual") {
      proxima.setMonth(proxima.getMonth() + 1);
    }
    return proxima;
  }

  /** Cancela una tarea: registra una nueva tarea con estado cancelada. */
  cancelar(tenantId: string, seq: number): void {
    const tarea = this.db
      .prepare(`SELECT tipo, referencia, periodicidad, proxima_ejecucion FROM tareas WHERE tenant_id = ? AND seq = ?`)
      .get(tenantId, seq) as {
      tipo: TareaTipo;
      referencia: string;
      periodicidad: TareaPeriodicidad;
      proxima_ejecucion: string;
    } | undefined;

    if (!tarea) throw new Error(`Tarea ${seq} no encontrada`);

    this.db
      .prepare(
        `INSERT INTO tareas (tenant_id, tipo, referencia, periodicidad, proxima_ejecucion, ultima_ejecucion, estado, creada_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        tarea.tipo,
        tarea.referencia,
        tarea.periodicidad,
        tarea.proxima_ejecucion,
        null,
        "cancelada",
        new Date().toISOString(),
      );
  }

  /** Obtiene todas las tareas por tipo. */
  porTipo(tenantId: string, tipo: TareaTipo): readonly TareaRegistro[] {
    const rows = this.db
      .prepare(
        `SELECT seq, tipo, referencia, periodicidad, proxima_ejecucion, ultima_ejecucion, estado, creada_en
         FROM tareas
         WHERE tenant_id = ? AND tipo = ?
         ORDER BY seq DESC`,
      )
      .all(tenantId, tipo) as {
      seq: number;
      tipo: TareaTipo;
      referencia: string;
      periodicidad: TareaPeriodicidad;
      proxima_ejecucion: string;
      ultima_ejecucion: string | null;
      estado: TareaEstado;
      creada_en: string;
    }[];
    return rows.map((r) => ({
      seq: r.seq,
      tipo: r.tipo,
      referencia: r.referencia,
      periodicidad: r.periodicidad,
      proximaEjecucion: r.proxima_ejecucion,
      ...(r.ultima_ejecucion ? { ultimaEjecucion: r.ultima_ejecucion } : {}),
      estado: r.estado,
      creada: r.creada_en,
    }));
  }

  close(): void {
    this.db.close();
  }
}
