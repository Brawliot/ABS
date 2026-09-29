import { describe, expect, it } from "vitest";
import { InMemoryEventStore, EventStoreError } from "../core/event-store.js";
import type { TransitionEvent } from "../core/events.js";

function sampleEvent(id: string): TransitionEvent {
  return {
    id,
    kind: "transicion",
    subjectId: "subj-1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    actorId: "actor-1",
    actorKind: "humano",
    evidence: {
      kind: "aceptacion",
      reference: "ev-ref-1",
      recordedAt: "2026-01-01T00:00:00.000Z",
    },
    transitionId: "t_aceptar",
    fromStateId: "borrador",
    toStateId: "activo",
  };
}

describe("EventStore append-only", () => {
  it("añade eventos y los recupera", () => {
    const store = new InMemoryEventStore();
    store.append(sampleEvent("e1"));
    expect(store.getById("e1")?.id).toBe("e1");
    expect(store.all()).toHaveLength(1);
  });

  it("falla si se intenta modificar un evento existente", () => {
    const store = new InMemoryEventStore();
    store.append(sampleEvent("e1"));

    expect(() =>
      store.replace("e1", sampleEvent("e1-mutated")),
    ).toThrow(EventStoreError);

    expect(() =>
      store.replace("e1", sampleEvent("e1-mutated")),
    ).toThrow(/inmutables/);

    expect(store.getById("e1")?.id).toBe("e1");
  });

  it("falla si se intenta borrar un evento existente", () => {
    const store = new InMemoryEventStore();
    store.append(sampleEvent("e1"));

    expect(() => store.remove("e1")).toThrow(EventStoreError);
    expect(store.all()).toHaveLength(1);
  });

  it("rechaza reutilización de id (no sobrescribe)", () => {
    const store = new InMemoryEventStore();
    store.append(sampleEvent("e1"));
    expect(() => store.append(sampleEvent("e1"))).toThrow(EventStoreError);
  });

  it("congela el evento almacenado frente a mutaciones externas", () => {
    const store = new InMemoryEventStore();
    const event = sampleEvent("e1");
    store.append(event);

    const stored = store.getById("e1") as TransitionEvent;
    expect(() => {
      (stored as { transitionId: string }).transitionId = "hack";
    }).toThrow();
  });
});
