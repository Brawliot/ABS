/**
 * Logística: seguimiento de envíos y entregas.
 * Append-only: cada actualización es un evento.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type EstadoEnvio = "preparado" | "enviado" | "en_transito" | "entregado" | "devuelto";

export interface Envio {
  readonly id: string;
  readonly expedienteId: string;
  readonly estado: EstadoEnvio;
  readonly proveedorLogistica?: string;
  readonly numeroSeguimiento?: string;
  readonly firmaEntrega?: string;
  readonly fechaActualizacion: string;
}

export interface EventoEnvio {
  readonly id: string;
  readonly expedienteId: string;
  readonly estado: EstadoEnvio;
  readonly proveedorLogistica?: string;
  readonly numeroSeguimiento?: string;
  readonly firmaEntrega?: string;
  readonly createdAt: string;
}

export class SqliteLogisticaStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS envios_eventos (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        expediente_id TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('preparado', 'enviado', 'en_transito', 'entregado', 'devuelto')),
        proveedor_logistica TEXT,
        numero_seguimiento TEXT,
        firma_entrega TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_envios_expediente ON envios_eventos(tenant_id, expediente_id);
      CREATE INDEX IF NOT EXISTS idx_envios_estado ON envios_eventos(tenant_id, estado);
      CREATE TRIGGER IF NOT EXISTS envios_eventos_no_delete BEFORE DELETE ON envios_eventos
      BEGIN SELECT RAISE(ABORT, 'Los eventos de envío no se borran'); END;
    `);
  }

  crearEnvio(
    tenantId: string,
    expedienteId: string,
    estado: EstadoEnvio = "preparado",
  ): Envio {
    const id = `evt-envio-${randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO envios_eventos (id, tenant_id, expediente_id, estado, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, tenantId, expedienteId, estado, now);
    return {
      id,
      expedienteId,
      estado,
      fechaActualizacion: now,
    };
  }

  actualizarEnvio(
    tenantId: string,
    expedienteId: string,
    estado: EstadoEnvio,
    proveedorLogistica?: string,
    numeroSeguimiento?: string,
  ): Envio {
    const id = `evt-envio-${randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO envios_eventos (id, tenant_id, expediente_id, estado, proveedor_logistica, numero_seguimiento, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, tenantId, expedienteId, estado, proveedorLogistica ?? null, numeroSeguimiento ?? null, now);
    return {
      id,
      expedienteId,
      estado,
      ...(proveedorLogistica ? { proveedorLogistica } : {}),
      ...(numeroSeguimiento ? { numeroSeguimiento } : {}),
      fechaActualizacion: now,
    } as Envio;
  }

  marcarEntregado(
    tenantId: string,
    expedienteId: string,
    firmaEntrega?: string,
  ): Envio {
    const id = `evt-envio-${randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO envios_eventos (id, tenant_id, expediente_id, estado, firma_entrega, created_at)
         VALUES (?, ?, ?, 'entregado', ?, ?)`,
      )
      .run(id, tenantId, expedienteId, firmaEntrega ?? null, now);
    return {
      id,
      expedienteId,
      estado: "entregado",
      ...(firmaEntrega ? { firmaEntrega } : {}),
      fechaActualizacion: now,
    } as Envio;
  }

  obtenerUltimo(tenantId: string, expedienteId: string): Envio | undefined {
    const row = this.db
      .prepare(
        `SELECT id, expediente_id, estado, proveedor_logistica, numero_seguimiento, firma_entrega, created_at
         FROM envios_eventos
         WHERE tenant_id = ? AND expediente_id = ?
         ORDER BY ROWID DESC
         LIMIT 1`,
      )
      .get(tenantId, expedienteId) as {
      id: string;
      expediente_id: string;
      estado: string;
      proveedor_logistica?: string;
      numero_seguimiento?: string;
      firma_entrega?: string;
      created_at: string;
    } | undefined;

    return row
      ? ({
          id: row.id,
          expedienteId: row.expediente_id,
          estado: row.estado as EstadoEnvio,
          ...(row.proveedor_logistica ? { proveedorLogistica: row.proveedor_logistica } : {}),
          ...(row.numero_seguimiento ? { numeroSeguimiento: row.numero_seguimiento } : {}),
          ...(row.firma_entrega ? { firmaEntrega: row.firma_entrega } : {}),
          fechaActualizacion: row.created_at,
        } as Envio)
      : undefined;
  }

  historialEnvio(tenantId: string, expedienteId: string): readonly EventoEnvio[] {
    const rows = this.db
      .prepare(
        `SELECT id, expediente_id, estado, proveedor_logistica, numero_seguimiento, firma_entrega, created_at
         FROM envios_eventos
         WHERE tenant_id = ? AND expediente_id = ?
         ORDER BY created_at ASC`,
      )
      .all(tenantId, expedienteId) as {
      id: string;
      expediente_id: string;
      estado: string;
      proveedor_logistica?: string;
      numero_seguimiento?: string;
      firma_entrega?: string;
      created_at: string;
    }[];

    return rows.map(
      (r) =>
        ({
          id: r.id,
          expedienteId: r.expediente_id,
          estado: r.estado as EstadoEnvio,
          ...(r.proveedor_logistica ? { proveedorLogistica: r.proveedor_logistica } : {}),
          ...(r.numero_seguimiento ? { numeroSeguimiento: r.numero_seguimiento } : {}),
          ...(r.firma_entrega ? { firmaEntrega: r.firma_entrega } : {}),
          createdAt: r.created_at,
        } as EventoEnvio),
    );
  }

  pendientesDeEnviar(tenantId: string, limite = 100): readonly string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT expediente_id FROM (
           SELECT expediente_id, estado, ROW_NUMBER() OVER (PARTITION BY expediente_id ORDER BY ROWID DESC) as rn
           FROM envios_eventos
           WHERE tenant_id = ?
         )
         WHERE rn = 1 AND estado = 'preparado'
         LIMIT ?`,
      )
      .all(tenantId, limite) as { expediente_id: string }[];

    return rows.map((r) => r.expediente_id);
  }

  close(): void {
    this.db.close();
  }
}
