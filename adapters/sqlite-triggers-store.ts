/**
 * Triggers (SQLite): automatización de acciones basadas en eventos.
 * Triggers simples: ejecutados cuando ocurre un evento (no recurrentes).
 * Condiciones: factura grande, cliente bloqueado, expediente cerrado, financiado creado.
 */

import Database from "better-sqlite3";

export interface CondicionTrigger {
  readonly tipo: "factura_grande" | "cliente_bloqueado" | "expediente_cerrado" | "financiado_creado";
  readonly parametros?: Record<string, unknown>;
}

export interface AccionTrigger {
  readonly tipo: "notificacion" | "recordatorio";
  readonly parametros: Record<string, unknown>;
}

export interface TriggerRegistro {
  readonly id: string;
  readonly nombre: string;
  readonly actorId: string;
  readonly condicion: CondicionTrigger;
  readonly accion: AccionTrigger;
  readonly activo: boolean;
  readonly ultimaEjecucion?: string;
  readonly createdAt: string;
}

export class SqliteTriggersStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS triggers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        nombre TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        condicion TEXT NOT NULL,
        accion TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1,
        ultima_ejecucion TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_triggers_actor ON triggers(tenant_id, actor_id);
      CREATE INDEX IF NOT EXISTS idx_triggers_activo ON triggers(tenant_id, activo);
      CREATE TABLE IF NOT EXISTS trigger_ejecuciones (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        trigger_id TEXT NOT NULL,
        evento_tipo TEXT NOT NULL,
        exito INTEGER NOT NULL,
        detalles TEXT,
        executed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ejecuciones_trigger ON trigger_ejecuciones(tenant_id, trigger_id);
    `);
  }

  crear(
    tenantId: string,
    reg: {
      readonly nombre: string;
      readonly actorId: string;
      readonly condicion: CondicionTrigger;
      readonly accion: AccionTrigger;
    },
  ): string {
    const id = `trigger-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.db
      .prepare(
        `INSERT INTO triggers (id, tenant_id, nombre, actor_id, condicion, accion, activo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        id,
        tenantId,
        reg.nombre,
        reg.actorId,
        JSON.stringify(reg.condicion),
        JSON.stringify(reg.accion),
        new Date().toISOString(),
      );
    return id;
  }

  lista(tenantId: string, activos?: boolean): readonly TriggerRegistro[] {
    const query = activos !== undefined
      ? `SELECT id, nombre, actor_id, condicion, accion, activo, ultima_ejecucion, created_at
         FROM triggers
         WHERE tenant_id = ? AND activo = ?
         ORDER BY created_at DESC`
      : `SELECT id, nombre, actor_id, condicion, accion, activo, ultima_ejecucion, created_at
         FROM triggers
         WHERE tenant_id = ?
         ORDER BY created_at DESC`;

    const params = activos !== undefined ? [tenantId, activos ? 1 : 0] : [tenantId];
    const rows = this.db.prepare(query).all(...params) as {
      id: string;
      nombre: string;
      actor_id: string;
      condicion: string;
      accion: string;
      activo: number;
      ultima_ejecucion: string | null;
      created_at: string;
    }[];

    return rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      actorId: r.actor_id,
      condicion: JSON.parse(r.condicion) as CondicionTrigger,
      accion: JSON.parse(r.accion) as AccionTrigger,
      activo: r.activo === 1,
      ...(r.ultima_ejecucion ? { ultimaEjecucion: r.ultima_ejecucion } : {}),
      createdAt: r.created_at,
    }));
  }

  obtener(tenantId: string, triggerId: string): TriggerRegistro | undefined {
    const row = this.db
      .prepare(
        `SELECT id, nombre, actor_id, condicion, accion, activo, ultima_ejecucion, created_at
         FROM triggers
         WHERE tenant_id = ? AND id = ?`,
      )
      .get(tenantId, triggerId) as {
      id: string;
      nombre: string;
      actor_id: string;
      condicion: string;
      accion: string;
      activo: number;
      ultima_ejecucion: string | null;
      created_at: string;
    } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      nombre: row.nombre,
      actorId: row.actor_id,
      condicion: JSON.parse(row.condicion) as CondicionTrigger,
      accion: JSON.parse(row.accion) as AccionTrigger,
      activo: row.activo === 1,
      ...(row.ultima_ejecucion ? { ultimaEjecucion: row.ultima_ejecucion } : {}),
      createdAt: row.created_at,
    };
  }

  activar(tenantId: string, triggerId: string, activo: boolean): void {
    this.db
      .prepare(`UPDATE triggers SET activo = ? WHERE tenant_id = ? AND id = ?`)
      .run(activo ? 1 : 0, tenantId, triggerId);
  }

  registrarEjecucion(
    tenantId: string,
    triggerId: string,
    eventoTipo: string,
    exito: boolean,
    detalles?: string,
  ): void {
    const id = `ejecucion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO trigger_ejecuciones (id, tenant_id, trigger_id, evento_tipo, exito, detalles, executed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, tenantId, triggerId, eventoTipo, exito ? 1 : 0, detalles ?? null, now);

    // Actualizar última ejecución en trigger
    this.db
      .prepare(`UPDATE triggers SET ultima_ejecucion = ? WHERE tenant_id = ? AND id = ?`)
      .run(now, tenantId, triggerId);
  }

  ejecuciones(tenantId: string, triggerId: string): readonly {
    readonly id: string;
    readonly eventoTipo: string;
    readonly exito: boolean;
    readonly detalles?: string;
    readonly executedAt: string;
  }[] {
    const rows = this.db
      .prepare(
        `SELECT id, evento_tipo, exito, detalles, executed_at
         FROM trigger_ejecuciones
         WHERE tenant_id = ? AND trigger_id = ?
         ORDER BY executed_at DESC`,
      )
      .all(tenantId, triggerId) as {
      id: string;
      evento_tipo: string;
      exito: number;
      detalles: string | null;
      executed_at: string;
    }[];

    return rows.map((r) => ({
      id: r.id,
      eventoTipo: r.evento_tipo,
      exito: r.exito === 1,
      ...(r.detalles ? { detalles: r.detalles } : {}),
      executedAt: r.executed_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}
