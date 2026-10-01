/**
 * EventStore respaldado por SQLite (BD real, no InMemory).
 */

import Database from "better-sqlite3";
import type { AppendOnlyEvent, DomainEvent } from "../core/events.js";
import {
  EventStoreError,
  type EventStore,
  type EventStoreListener,
} from "../core/event-store.js";
import { deepFreeze } from "../core/deep-freeze.js";

export class SqliteEventStore implements EventStore {
  private readonly db: Database.Database;
  private readonly listeners = new Set<EventStoreListener>();
  private readonly insertStmt: Database.Statement;
  private readonly byIdStmt: Database.Statement;
  private readonly bySubjectStmt: Database.Statement;
  private readonly allStmt: Database.Statement;
  private readonly maxSeqStmt: Database.Statement;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") {
      this.db.pragma("journal_mode = WAL");
    }
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY NOT NULL,
        subject_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        seq INTEGER NOT NULL UNIQUE
      );
      CREATE INDEX IF NOT EXISTS idx_events_subject ON events(subject_id);
    `);
    this.insertStmt = this.db.prepare(
      `INSERT INTO events (id, subject_id, payload, seq) VALUES (?, ?, ?, ?)`,
    );
    this.byIdStmt = this.db.prepare(`SELECT payload FROM events WHERE id = ?`);
    this.bySubjectStmt = this.db.prepare(
      `SELECT payload FROM events WHERE subject_id = ? ORDER BY seq ASC`,
    );
    this.allStmt = this.db.prepare(
      `SELECT payload FROM events ORDER BY seq ASC`,
    );
    this.maxSeqStmt = this.db.prepare(
      `SELECT COALESCE(MAX(seq), 0) AS m FROM events`,
    );
  }

  append(event: DomainEvent): void {
    const frozen = deepFreeze(structuredClone(event)) as AppendOnlyEvent;

    try {
      this.db.transaction(() => {
        const row = this.maxSeqStmt.get() as { m: number };
        const seq = row.m + 1;

        this.insertStmt.run(
          frozen.id,
          frozen.subjectId,
          JSON.stringify(frozen),
          seq,
        );
      })();
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code === "SQLITE_CONSTRAINT_PRIMARYKEY" || code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new EventStoreError(
          `No se puede añadir: ya existe un evento con id ${event.id}`,
        );
      }
      throw err;
    }

    for (const listener of this.listeners) listener(frozen);
  }

  subscribe(listener: EventStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getById(id: string): AppendOnlyEvent | undefined {
    const row = this.byIdStmt.get(id) as { payload: string } | undefined;
    if (!row) return undefined;
    try {
      return deepFreeze(JSON.parse(row.payload)) as AppendOnlyEvent;
    } catch (err) {
      throw new EventStoreError(
        `Payload corrupto para evento ${id}: ${(err as Error).message}`,
      );
    }
  }

  getBySubject(subjectId: string): readonly AppendOnlyEvent[] {
    const rows = this.bySubjectStmt.all(subjectId) as { payload: string }[];
    return rows.map((r) => {
      try {
        return deepFreeze(JSON.parse(r.payload)) as AppendOnlyEvent;
      } catch (err) {
        throw new EventStoreError(
          `Payload corrupto para subject ${subjectId}: ${(err as Error).message}`,
        );
      }
    });
  }

  all(): readonly AppendOnlyEvent[] {
    const rows = this.allStmt.all() as { payload: string }[];
    return rows.map((r) => {
      try {
        return deepFreeze(JSON.parse(r.payload)) as AppendOnlyEvent;
      } catch (err) {
        throw new EventStoreError(
          `Payload corrupto en stream global: ${(err as Error).message}`,
        );
      }
    });
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

  close(): void {
    this.db.close();
  }
}
