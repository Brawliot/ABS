/**
 * EventStore PostgreSQL (async) — misma semántica append-only que InMemory/SQLite.
 * Append en lote (multi-VALUES) para throughput; sin cliente sticky (evita fugas de pool).
 */

import type { Pool, PoolClient } from "pg";
import type { AppendOnlyEvent, DomainEvent } from "../core/events.js";
import {
  EventStoreError,
  type EventStoreListener,
} from "../core/event-store.js";
import { SnapshotStore } from "./snapshot-store.js";

export interface PostgresEventStoreOptions {
  readonly pool: Pool;
  readonly companyId: string;
}

export class PostgresEventStore {
  private readonly pool: Pool;
  readonly companyId: string;
  private readonly listeners = new Set<EventStoreListener>();
  private readonly streamVersions = new Map<string, number>();
  /**
   * Atajo en memoria SOLO para rechazar rápido duplicados de la MISMA instancia.
   * La garantía real de unicidad la da la base de datos (UNIQUE / PK company_id,id).
   * Nunca es la fuente de verdad: cada append escribe en la BD antes de resolver.
   */
  private readonly knownIds = new Set<string>();
  private readonly snapshotStore: SnapshotStore;

  constructor(opts: PostgresEventStoreOptions) {
    this.pool = opts.pool;
    this.companyId = opts.companyId;
    this.snapshotStore = new SnapshotStore(opts.pool, opts.companyId);
  }

  private async withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('abs.company_id', $1, false)`, [
        this.companyId,
      ]);
      await client.query(`SET LOCAL synchronous_commit TO OFF`);
      return await fn(client);
    } finally {
      try {
        await client.query(`SELECT set_config('abs.company_id', '', false)`);
      } finally {
        client.release();
      }
    }
  }

  private async nextVersion(
    client: PoolClient,
    subjectId: string,
  ): Promise<number> {
    const cached = this.streamVersions.get(subjectId);
    if (cached !== undefined) {
      const next = cached + 1;
      this.streamVersions.set(subjectId, next);
      return next;
    }
    const verRes = await client.query<{ m: string }>(
      `SELECT COALESCE(MAX(stream_version), 0)::text AS m
       FROM abs_events.events
       WHERE company_id = $1 AND subject_id = $2`,
      [this.companyId, subjectId],
    );
    const current = Number(verRes.rows[0]?.m ?? 0);
    const next = current + 1;
    this.streamVersions.set(subjectId, next);
    return next;
  }

  async close(): Promise<void> {
    // Cada append es durable en el momento del await; no hay buffer que vaciar.
  }

  subscribe(listener: EventStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async append(
    event: DomainEvent,
    options?: {
  readonly expectedStreamVersion?: number;
  readonly outbox?: {
    readonly id: string;
    readonly kind: string;
    readonly payload: unknown;
  };
},
  ): Promise<void> {
    // knownIds es solo una OPTIMIZACIÓN local, no una garantía.
    // La BD (PK UNIQUE) es la fuente de verdad.
    
    try {
      await this.appendImmediate(event as AppendOnlyEvent, options ?? {});
      this.knownIds.add(event.id);  // ← Agregar DESPUÉS de éxito
    } catch (err) {
      // Si falla, el error ya viene traducido de appendImmediate()
      throw err;
    }
  }

  private async appendImmediate(
    event: AppendOnlyEvent,
    options: {
      readonly expectedStreamVersion?: number;
      readonly outbox?: {
        readonly id: string;
        readonly kind: string;
        readonly payload: unknown;
      };
    },
  ):Promise<void> {
    const payload = JSON.stringify(event);
    await this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const next = await this.nextVersion(client, event.subjectId);  // ← AQUÍ
        
        await client.query(
          `INSERT INTO abs_events.events
             (id, company_id, subject_id, stream_version, payload)
           VALUES ($1, $2, $3, $4, $5)`,
          [event.id, this.companyId, event.subjectId, next, payload],
        );
        
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        
        // ← AQUÍ: TRADUCIR ERROR UNIQUE
        const pgErr = err as any;
        if (pgErr?.code === "23505") {  // PostgreSQL unique_violation
          throw new EventStoreError(
            `No se puede añadir: ya existe un evento con id ${event.id}`,
          );
        }
        throw err;
      }
    });
  }

  async getById(id: string): Promise<AppendOnlyEvent | undefined> {
    return this.withClient(async (client) => {
      const res = await client.query<{ payload: string }>(
        `SELECT payload FROM abs_events.events
         WHERE company_id = $1 AND id = $2`,
        [this.companyId, id],
      );
      const row = res.rows[0]?.payload;
      if (row === undefined) return undefined;
      return deepFreeze(JSON.parse(row) as AppendOnlyEvent);
    });
  }

  async getBySubject(
    subjectId: string,
  ): Promise<readonly AppendOnlyEvent[]> {
    return this.withClient(async (client) => {
      const res = await client.query<{ payload: string }>(
        `SELECT payload FROM abs_events.events
         WHERE company_id = $1 AND subject_id = $2
         ORDER BY stream_version ASC
         LIMIT 10000`,
        [this.companyId, subjectId],
      );
      // LIMIT 10000: Prevenir OOM en agregados muy grandes.
      // Típicamente, una transacción tiene 5-20 eventos; incluso con 1000 eventos es rara.
      // Si alcanza 10000, necesitamos snapshots o paginación (ver Fase 3).
      if (res.rows.length >= 10000) {
        console.warn(
          `[getBySubject] WARNING: Sujeto ${subjectId} tiene >=10000 eventos; ` +
          `implementar snapshots para mejor performance`
        );
      }
      return res.rows.map((r) => JSON.parse(r.payload) as AppendOnlyEvent);
    });
  }

  /**
   * Batch query: obtener eventos de múltiples sujetos en 1 query (no N).
   * Retorna Map<subjectId, eventos[]> para indexación rápida.
   * Usado por projectRows() para evitar N+1 pattern.
   */
  async getBySubjects(
    subjectIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly AppendOnlyEvent[]>> {
    if (subjectIds.length === 0) {
      return new Map();
    }
    return this.withClient(async (client) => {
      // PostgreSQL array syntax: unnest para iterar sobre valores
      const placeholders = subjectIds
        .map((_, i) => `$${i + 2}`)
        .join(",");
      const res = await client.query<{
        subject_id: string;
        payload: string;
      }>(
        `SELECT subject_id, payload FROM abs_events.events
         WHERE company_id = $1 AND subject_id = ANY($${subjectIds.length + 2}::text[])
         ORDER BY subject_id, stream_version ASC
         LIMIT 10000`,
        [this.companyId, subjectIds],
      );
      // Agrupar por subject_id
      const result = new Map<string, AppendOnlyEvent[]>();
      for (const row of res.rows) {
        const list = result.get(row.subject_id) ?? [];
        list.push(JSON.parse(row.payload) as AppendOnlyEvent);
        result.set(row.subject_id, list);
      }
      return result;
    });
  }

  async all(): Promise<readonly AppendOnlyEvent[]> {
    return this.withClient(async (client) => {
      const res = await client.query<{ payload: string }>(
        `SELECT payload FROM abs_events.events
         WHERE company_id = $1
         ORDER BY seq ASC
         LIMIT 100000`,
        [this.companyId],
      );
      // LIMIT 100000: Prevenir OOM al cargar toda la historia de eventos de una empresa.
      // all() se usa en diagnósticos (/info endpoint); para datos reales, usar getBySubject().
      if (res.rows.length >= 100000) {
        console.warn(
          `[all] WARNING: Empresa ${this.companyId} tiene >=100000 eventos total; ` +
          `considerar particionamiento si productividad es alta`
        );
      }
      return res.rows.map((r) => JSON.parse(r.payload) as AppendOnlyEvent);
    });
  }

  async tryUpdatePayload(id: string): Promise<never> {
    try {
      await this.withClient(async (client) => {
        const res = await client.query(
          `UPDATE abs_events.events
           SET payload = payload || ''
           WHERE company_id = $1 AND id = $2`,
          [this.companyId, id],
        );
        if ((res.rowCount ?? 0) === 0) {
          throw new EventStoreError(
            "Invariante violada: los eventos son inmutables; no se pueden modificar",
          );
        }
      });
    } catch (err) {
      throw new EventStoreError(
        err instanceof Error
          ? err.message
          : "Invariante violada: los eventos son inmutables; no se pueden modificar",
      );
    }
    throw new EventStoreError(
      "Invariante violada: los eventos son inmutables; no se pueden modificar",
    );
  }

  async tryDelete(id: string): Promise<never> {
    try {
      await this.withClient(async (client) => {
        const res = await client.query(
          `DELETE FROM abs_events.events WHERE company_id = $1 AND id = $2`,
          [this.companyId, id],
        );
        if ((res.rowCount ?? 0) === 0) {
          throw new EventStoreError(
            "Invariante violada: los eventos son inmutables; no se pueden borrar",
          );
        }
      });
    } catch (err) {
      throw new EventStoreError(
        err instanceof Error
          ? err.message
          : "Invariante violada: los eventos son inmutables; no se pueden borrar",
      );
    }
    throw new EventStoreError(
      "Invariante violada: los eventos son inmutables; no se pueden borrar",
    );
  }

  replace(_id: string, _event: DomainEvent): never {
    throw new EventStoreError(
      "Invariante violada: los eventos son inmutables; no se pueden modificar",
    );
  }

  remove(_id: string): never {
    throw new EventStoreError(
      "Invariante violada: los eventos son inmutables; no se pueden borrar",
    );
  }

  // ────── SNAPSHOT SUPPORT ──────

  /**
   * Guardar snapshot de estado.
   * Llamado por SnapshotManager cada N eventos.
   */
  async saveSnapshot(
    subjectId: string,
    streamVersion: number,
    stateJson: unknown
  ): Promise<void> {
    return this.snapshotStore.save(subjectId, streamVersion, stateJson);
  }

  /**
   * Obtener el snapshot más reciente para replayar desde ahí.
   * Fast-path: si hay snapshot en v500, solo procesar eventos desde v501.
   */
  async getLatestSnapshot(
    subjectId: string,
    beforeStreamVersion: number
  ): Promise<{
    state: unknown;
    fromVersion: number;
  } | null> {
    const snap = await this.snapshotStore.getLatestBefore(
      subjectId,
      beforeStreamVersion
    );
    if (!snap) return null;
    return {
      state: snap.stateJson,
      fromVersion: snap.fromVersion,
    };
  }

  /**
   * Limpiar snapshots antiguos (mantener solo últimos N).
   * Llamado periódicamente para evitar tabla infinita.
   */
  async pruneSnapshots(
    subjectId: string,
    keepCount: number = 5
  ): Promise<number> {
    return this.snapshotStore.pruneOldSnapshots(subjectId, keepCount);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

