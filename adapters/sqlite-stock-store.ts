/**
 * Stock (SQLite): qué productos controlan existencias (con su mínimo) y los
 * ajustes manuales (stock inicial, recuento, roturas…).
 * Los ajustes son solo-añadir: disparadores impiden modificarlos o borrarlos;
 * un error se corrige con otro ajuste.
 */

import Database from "better-sqlite3";
import type { MovimientoStock } from "../elements/stock.js";

export interface ConfigStock {
  readonly ofertaId: string;
  readonly control: boolean;
  /** Milésimas. */
  readonly minimo: number;
}

export class SqliteStockStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stock_config (
        tenant_id TEXT NOT NULL,
        oferta_id TEXT NOT NULL,
        control INTEGER NOT NULL,
        minimo INTEGER NOT NULL CHECK (minimo >= 0),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, oferta_id)
      );
      CREATE TABLE IF NOT EXISTS stock_ajustes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        oferta_id TEXT NOT NULL,
        delta INTEGER NOT NULL,
        motivo TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_stock_ajustes ON stock_ajustes(tenant_id, oferta_id);
      CREATE TRIGGER IF NOT EXISTS stock_ajustes_no_update BEFORE UPDATE ON stock_ajustes
      BEGIN SELECT RAISE(ABORT, 'Los ajustes de stock no se modifican: haga otro ajuste'); END;
      CREATE TRIGGER IF NOT EXISTS stock_ajustes_no_delete BEFORE DELETE ON stock_ajustes
      BEGIN SELECT RAISE(ABORT, 'Los ajustes de stock no se borran: haga otro ajuste'); END;
      CREATE TABLE IF NOT EXISTS stock_reservas (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        oferta_id TEXT NOT NULL,
        expediente_id TEXT NOT NULL,
        cantidad_milesimas INTEGER NOT NULL CHECK (cantidad_milesimas > 0),
        estado TEXT NOT NULL DEFAULT 'reservada' CHECK (estado IN ('reservada', 'confirmada', 'cancelada')),
        creada_en TEXT NOT NULL,
        confirmada_en TEXT,
        cancelada_en TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_reservas_expediente ON stock_reservas(tenant_id, expediente_id);
      CREATE INDEX IF NOT EXISTS idx_reservas_estado ON stock_reservas(tenant_id, estado);
      CREATE TRIGGER IF NOT EXISTS stock_reservas_no_delete BEFORE DELETE ON stock_reservas
      BEGIN SELECT RAISE(ABORT, 'Las reservas no se borran: cancele con actualización'); END;
    `);
  }

  configurar(tenantId: string, c: ConfigStock, at: string): void {
    this.db
      .prepare(
        `INSERT INTO stock_config (tenant_id, oferta_id, control, minimo, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, oferta_id) DO UPDATE SET
           control = excluded.control, minimo = excluded.minimo, updated_at = excluded.updated_at`,
      )
      .run(tenantId, c.ofertaId, c.control ? 1 : 0, c.minimo, at);
  }

  config(tenantId: string, ofertaId: string): ConfigStock | undefined {
    const row = this.db
      .prepare(`SELECT oferta_id, control, minimo FROM stock_config WHERE tenant_id = ? AND oferta_id = ?`)
      .get(tenantId, ofertaId) as { oferta_id: string; control: number; minimo: number } | undefined;
    return row ? { ofertaId: row.oferta_id, control: row.control === 1, minimo: row.minimo } : undefined;
  }

  /** Productos con control de stock activo. */
  controlados(tenantId: string): ReadonlyMap<string, { readonly minimo: number }> {
    const rows = this.db
      .prepare(`SELECT oferta_id, minimo FROM stock_config WHERE tenant_id = ? AND control = 1`)
      .all(tenantId) as { oferta_id: string; minimo: number }[];
    return new Map(rows.map((r) => [r.oferta_id, { minimo: r.minimo }]));
  }

  ajustar(
    tenantId: string,
    a: { readonly ofertaId: string; readonly delta: number; readonly motivo: string; readonly actorId: string; readonly at: string },
  ): void {
    this.db
      .prepare(
        `INSERT INTO stock_ajustes (tenant_id, oferta_id, delta, motivo, actor_id, at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(tenantId, a.ofertaId, a.delta, a.motivo, a.actorId, a.at);
  }

  ajustes(tenantId: string): readonly MovimientoStock[] {
    const rows = this.db
      .prepare(
        `SELECT oferta_id, delta, motivo, actor_id, at FROM stock_ajustes WHERE tenant_id = ? ORDER BY seq ASC`,
      )
      .all(tenantId) as { oferta_id: string; delta: number; motivo: string; actor_id: string; at: string }[];
    return rows.map((r) => ({
      ofertaId: r.oferta_id,
      delta: r.delta,
      at: r.at,
      origen: "ajuste" as const,
      motivo: r.motivo,
      actorId: r.actor_id,
    }));
  }

  /** Reserva cantidad para un expediente. */
  reservar(
    tenantId: string,
    ofertaId: string,
    expedienteId: string,
    cantidadMilesimas: number,
  ): { ok: true } | { ok: false; error: string } {
    const config = this.config(tenantId, ofertaId);
    if (!config?.control) {
      return { ok: true }; // No hay control de stock
    }
    const disponible = this.disponibleTotal(tenantId, ofertaId);
    if (disponible < cantidadMilesimas) {
      return { ok: false, error: `Stock insuficiente: necesita ${cantidadMilesimas}, disponible ${disponible}` };
    }
    this.db
      .prepare(
        `INSERT INTO stock_reservas (tenant_id, oferta_id, expediente_id, cantidad_milesimas, creada_en)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(tenantId, ofertaId, expedienteId, cantidadMilesimas, new Date().toISOString());
    return { ok: true };
  }

  /** Calcula el total disponible (ajustes - reservas activas). */
  private disponibleTotal(tenantId: string, ofertaId: string): number {
    const ajustes = this.db
      .prepare(`SELECT COALESCE(SUM(delta), 0) as total FROM stock_ajustes WHERE tenant_id = ? AND oferta_id = ?`)
      .get(tenantId, ofertaId) as { total: number } | undefined;
    const reservadas = this.db
      .prepare(
        `SELECT COALESCE(SUM(cantidad_milesimas), 0) as total FROM stock_reservas
         WHERE tenant_id = ? AND oferta_id = ? AND estado IN ('reservada', 'confirmada')`,
      )
      .get(tenantId, ofertaId) as { total: number } | undefined;
    return (ajustes?.total ?? 0) - (reservadas?.total ?? 0);
  }

  /** Obtiene reservas activas de un expediente. */
  reservasDelExpediente(tenantId: string, expedienteId: string): readonly { readonly ofertaId: string; readonly cantidadMilesimas: number; readonly estado: "reservada" | "confirmada" | "cancelada" }[] {
    const rows = this.db
      .prepare(
        `SELECT oferta_id, cantidad_milesimas, estado FROM stock_reservas
         WHERE tenant_id = ? AND expediente_id = ? AND estado IN ('reservada', 'confirmada')
         ORDER BY seq ASC`,
      )
      .all(tenantId, expedienteId) as { oferta_id: string; cantidad_milesimas: number; estado: string }[];
    return rows.map((r) => ({
      ofertaId: r.oferta_id,
      cantidadMilesimas: r.cantidad_milesimas,
      estado: r.estado as "reservada" | "confirmada" | "cancelada",
    }));
  }

  /** Confirma todas las reservas de un expediente (se convierten en salidas). */
  confirmarReservas(tenantId: string, expedienteId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE stock_reservas SET estado = 'confirmada', confirmada_en = ?
         WHERE tenant_id = ? AND expediente_id = ? AND estado = 'reservada'`,
      )
      .run(now, tenantId, expedienteId);
  }

  /** Cancela todas las reservas de un expediente. */
  cancelarReservas(tenantId: string, expedienteId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE stock_reservas SET estado = 'cancelada', cancelada_en = ?
         WHERE tenant_id = ? AND expediente_id = ? AND estado IN ('reservada', 'confirmada')`,
      )
      .run(now, tenantId, expedienteId);
  }

  close(): void {
    this.db.close();
  }
}
