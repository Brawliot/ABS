/**
 * Almacén append-only de reglas de notificación.
 * Tabla: negocioId, evento, canales (JSON array), destinatario, plantilla, condicion, activo, createdAt.
 */

import Database from "better-sqlite3";
import type { NotificationRule } from "../communication/types.js";

export class SqliteNotificationRulesStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializar();
  }

  private inicializar(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notification_rules (
        id TEXT PRIMARY KEY,
        negocio_id TEXT NOT NULL,
        evento TEXT NOT NULL,
        canales TEXT NOT NULL,
        destinatario TEXT NOT NULL,
        plantilla TEXT NOT NULL,
        condicion TEXT,
        activo INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        UNIQUE(negocio_id, evento, destinatario, plantilla)
      );
      CREATE INDEX IF NOT EXISTS idx_notification_rules_negocio_evento
        ON notification_rules(negocio_id, evento);
    `);
  }

  cargarReglasDe(negocioId: string): readonly NotificationRule[] {
    const stmt = this.db.prepare(`
      SELECT id, evento, canales, destinatario, plantilla, condicion
      FROM notification_rules
      WHERE negocio_id = ? AND activo = 1
      ORDER BY created_at ASC
    `);
    return stmt.all(negocioId).map((row: any) => {
      const rule: NotificationRule = {
        id: row.id,
        evento: row.evento,
        canales: JSON.parse(row.canales),
        destinatario: row.destinatario,
        plantilla: row.plantilla,
      };
      if (row.condicion) {
        rule.condicion = row.condicion;
      }
      return rule;
    });
  }

  crearRegla(
    negocioId: string,
    spec: Omit<NotificationRule, "id">
  ): NotificationRule {
    const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const stmt = this.db.prepare(`
      INSERT INTO notification_rules (
        id, negocio_id, evento, canales, destinatario, plantilla, condicion, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      negocioId,
      spec.evento,
      JSON.stringify(spec.canales),
      spec.destinatario,
      spec.plantilla,
      spec.condicion || null,
      new Date().toISOString()
    );

    const rule: NotificationRule = {
      id,
      evento: spec.evento,
      canales: spec.canales,
      destinatario: spec.destinatario,
      plantilla: spec.plantilla,
    };
    if (spec.condicion) {
      rule.condicion = spec.condicion;
    }
    return rule;
  }

  desactivarRegla(ruleId: string): void {
    const stmt = this.db.prepare(`
      UPDATE notification_rules SET activo = 0 WHERE id = ?
    `);
    stmt.run(ruleId);
  }

  close(): void {
    this.db.close();
  }
}
