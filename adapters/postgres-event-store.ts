/**
 * EventStore PostgreSQL (async) — misma semántica append-only que InMemory/SQLite.
 * Append en lote (multi-VALUES) para throughput; sin cliente sticky (evita fugas de pool).
 */

import type { Pool, PoolClient } from "pg";
import type { AppendOnlyEvent, DomainEvent } from "../core/events.js";
import {
  EventStoreError,
  type AsyncEventStore,
  type EventStoreListener,
} from "../core/event-store.js";
import { deepFreeze } from "../core/deep-freeze.js";
import { validateCompanyId } from "../core/validation.js";

export interface PostgresEventStoreOptions {
  readonly pool: Pool;
  readonly companyId: string;
}

export class PostgresEventStore implements AsyncEventStore {
  private readonly pool: Pool;
  readonly companyId: string;
  private readonly listeners = new Set<EventStoreListener>();
  private readonly streamVersions = new Map<string, { version: number; timestamp: number }>();
  private readonly streamVersionCacheTtlMs = 30_000;
  /**
   * Atajo en memoria SOLO para rechazar rápido duplicados de la MISMA instancia.
   * La garantía real de unicidad la da la base de datos (UNIQUE / PK company_id,id).
   * Nunca es la fuente de verdad: cada append escribe en la BD antes de resolver.
   */
  private readonly knownIds = new Set<string>();

  constructor(opts: PostgresEventStoreOptions) {
    validateCompanyId(opts.companyId);
    this.pool = opts.pool;
    this.companyId = opts.companyId;
  }

  private async withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('abs.company_id', $1, false)`, [
        this.companyId,
      ]);
      // synchronous_commit = OFF: avoid fsync wait, faster writes but lower durability.
      // Trade-off: in case of unplanned DB restart, last ~50ms of writes may be lost.
      // Acceptable for event sourcing + outbox pattern (retryable effects).
      // For stricter durability requirements, set to ON or LOCAL.
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
    const now = Date.now();
    const cached = this.streamVersions.get(subjectId);
    if (cached !== undefined && (now - cached.timestamp) < this.streamVersionCacheTtlMs) {
      const next = cached.version + 1;
      this.streamVersions.set(subjectId, { version: next, timestamp: now });
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
    this.streamVersions.set(subjectId, { version: next, timestamp: now });
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
        const next = await this.nextVersion(client, event.subjectId);

        await client.query(
          `INSERT INTO abs_events.events
             (id, company_id, subject_id, stream_version, payload)
           VALUES ($1, $2, $3, $4, $5)`,
          [event.id, this.companyId, event.subjectId, next, payload],
        );

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");

        const pgErr = err as any;
        if (pgErr?.code === "23505") {  // PostgreSQL unique_violation
          if (pgErr?.constraint?.includes("stream_version")) {
            // stream_version conflict: invalidate cache for this subject
            this.streamVersions.delete(event.subjectId);
          }
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
      try {
        return deepFreeze(JSON.parse(row) as AppendOnlyEvent);
      } catch (err) {
        throw new EventStoreError(
          `Payload corrupto para evento ${id}: ${(err as Error).message}`,
        );
      }
    });
  }

  async getBySubject(
    subjectId: string,
  ): Promise<readonly AppendOnlyEvent[]> {
    return this.withClient(async (client) => {
      const res = await client.query<{ payload: string }>(
        `SELECT payload FROM abs_events.events
         WHERE company_id = $1 AND subject_id = $2
         ORDER BY stream_version ASC`,
        [this.companyId, subjectId],
      );
      return res.rows.map((r) => {
        try {
          return JSON.parse(r.payload) as AppendOnlyEvent;
        } catch (err) {
          throw new EventStoreError(
            `Payload corrupto para subject ${subjectId}: ${(err as Error).message}`,
          );
        }
      });
    });
  }

  async all(): Promise<readonly AppendOnlyEvent[]> {
    return this.withClient(async (client) => {
      const res = await client.query<{ payload: string }>(
        `SELECT payload FROM abs_events.events
         WHERE company_id = $1
         ORDER BY seq ASC`,
        [this.companyId],
      );
      return res.rows.map((r) => {
        try {
          return JSON.parse(r.payload) as AppendOnlyEvent;
        } catch (err) {
          throw new EventStoreError(
            `Payload corrupto en stream global: ${(err as Error).message}`,
          );
        }
      });
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
}

