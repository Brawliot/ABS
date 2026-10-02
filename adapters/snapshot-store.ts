/**
 * SnapshotStore: Almacenamiento de snapshots (proyecciones precalculadas).
 * Permite fast-path replay: en lugar de iterar 100K eventos,
 * empezar desde snapshot + iterar últimos N eventos.
 */

import type { Pool, PoolClient } from "pg";
import { withCompanyContext } from "../db/migrate.js";

export interface Snapshot {
  readonly companyId: string;
  readonly subjectId: string;
  readonly streamVersion: number;
  readonly stateJson: unknown;
  readonly createdAt: string;
}

export class SnapshotStore {
  constructor(
    private readonly pool: Pool,
    private readonly companyId: string
  ) {}

  /**
   * Guardar snapshot de estado en una versión específica.
   * Usado después de procesar N eventos para acelerar futuras lecturas.
   */
  async save(
    subjectId: string,
    streamVersion: number,
    stateJson: unknown
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await withCompanyContext(client, this.companyId, async (c) => {
        await c.query(
          `INSERT INTO abs_events.snapshots
             (company_id, subject_id, stream_version, state_json)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (company_id, subject_id, stream_version) DO NOTHING`,
          [
            this.companyId,
            subjectId,
            streamVersion,
            JSON.stringify(stateJson),
          ]
        );
      });
    } finally {
      client.release();
    }
  }

  /**
   * Obtener el snapshot más reciente anterior a una versión.
   * Retorna: { snapshot, fromVersion } o null si no existe.
   */
  async getLatestBefore(
    subjectId: string,
    beforeStreamVersion: number
  ): Promise<(Snapshot & { fromVersion: number }) | null> {
    const client = await this.pool.connect();
    try {
      return await withCompanyContext(client, this.companyId, async (c) => {
        const res = await c.query<{
          stream_version: number;
          state_json: string;
          created_at: string;
        }>(
          `SELECT stream_version, state_json, created_at
           FROM abs_events.snapshots
           WHERE company_id = $1 AND subject_id = $2 AND stream_version < $3
           ORDER BY stream_version DESC
           LIMIT 1`,
          [this.companyId, subjectId, beforeStreamVersion]
        );

        const row = res.rows[0];
        if (!row) return null;

        return {
          companyId: this.companyId,
          subjectId,
          streamVersion: row.stream_version,
          stateJson: JSON.parse(row.state_json),
          createdAt: row.created_at,
          fromVersion: row.stream_version + 1, // Próxima versión a procesar
        };
      });
    } finally {
      client.release();
    }
  }

  /**
   * Limpiar snapshots antiguos (mantener solo los últimos N por subject).
   * Llamado periódicamente para evitar tabla infinita de snapshots.
   */
  async pruneOldSnapshots(
    subjectId: string,
    keepCount: number = 5
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      return await withCompanyContext(client, this.companyId, async (c) => {
        const res = await c.query<{ count: string }>(
          `DELETE FROM abs_events.snapshots
           WHERE (company_id, subject_id, stream_version) IN (
             SELECT company_id, subject_id, stream_version
             FROM abs_events.snapshots
             WHERE company_id = $1 AND subject_id = $2
             ORDER BY stream_version DESC
             OFFSET $3
           )
           RETURNING COUNT(*) as count`,
          [this.companyId, subjectId, keepCount]
        );
        return parseInt(res.rows[0]?.count ?? "0");
      });
    } finally {
      client.release();
    }
  }

  /**
   * Contar snapshots para un sujeto.
   * Usado para decidir si crear nuevo snapshot.
   */
  async countSnapshots(subjectId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      return await withCompanyContext(client, this.companyId, async (c) => {
        const res = await c.query<{ count: string }>(
          `SELECT COUNT(*)::text as count
           FROM abs_events.snapshots
           WHERE company_id = $1 AND subject_id = $2`,
          [this.companyId, subjectId]
        );
        return parseInt(res.rows[0]?.count ?? "0");
      });
    } finally {
      client.release();
    }
  }
}
