/**
 * Almacén de eventos: solo añadir. Nunca modificar ni borrar.
 */

import type { AppendOnlyEvent, DomainEvent } from "./events.js";
import { deepFreeze } from "./deep-freeze.js";

export class EventStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventStoreError";
  }
}

/** Suscriptor del flujo append-only (principio 7 / proyección). */
export type EventStoreListener = (event: AppendOnlyEvent) => void;

export interface EventStore {
  append(event: DomainEvent): void;
  getById(id: string): AppendOnlyEvent | undefined;
  getBySubject(subjectId: string): readonly AppendOnlyEvent[];
  all(): readonly AppendOnlyEvent[];
  /** Se notifica tras cada append exitoso. Devuelve unsubscribe. */
  subscribe(listener: EventStoreListener): () => void;
  /** Intento explícito de mutación — siempre falla (invariante del almacén). */
  replace(id: string, event: DomainEvent): never;
  /** Intento explícito de borrado — siempre falla. */
  remove(id: string): never;
}

export interface AsyncEventStore {
  append(event: DomainEvent): Promise<void>;
  getById(id: string): Promise<AppendOnlyEvent | undefined>;
  getBySubject(subjectId: string): Promise<readonly AppendOnlyEvent[]>;
  all(): Promise<readonly AppendOnlyEvent[]>;
  /** Se notifica tras cada append exitoso. Devuelve unsubscribe. */
  subscribe(listener: EventStoreListener): () => void;
  /** Intento explícito de mutación — siempre falla (invariante del almacén). */
  replace(id: string, event: DomainEvent): Promise<never>;
  /** Intento explícito de borrado — siempre falla. */
  remove(id: string): Promise<never>;
}

export class InMemoryEventStore implements EventStore {
  private readonly events: AppendOnlyEvent[] = [];
  private readonly byId = new Map<string, AppendOnlyEvent>();
  private readonly listeners = new Set<EventStoreListener>();

  append(event: DomainEvent): void {
    if (this.byId.has(event.id)) {
      throw new EventStoreError(
        `No se puede añadir: ya existe un evento con id ${event.id}`,
      );
    }
    const frozen = deepFreeze(structuredClone(event)) as AppendOnlyEvent;
    this.events.push(frozen);
    this.byId.set(frozen.id, frozen);
    for (const listener of this.listeners) {
      listener(frozen);
    }
  }

  subscribe(listener: EventStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getById(id: string): AppendOnlyEvent | undefined {
    return this.byId.get(id);
  }

  getBySubject(subjectId: string): readonly AppendOnlyEvent[] {
    return this.events.filter((e) => e.subjectId === subjectId);
  }

  all(): readonly AppendOnlyEvent[] {
    return [...this.events];
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
