import { describe, expect, it } from "vitest";
import {
  assertCanAdvance,
  deriveState,
  DerivationError,
} from "../core/derivation.js";
import { InMemoryEventStore } from "../core/event-store.js";
import type { TransitionEvent } from "../core/events.js";
import { MetaObjectRegistry } from "../core/metaobject.js";
import {
  InvariantEngine,
  structuralPredicateEvaluator,
} from "../core/invariants-engine.js";
import {
  minimalExampleLifecycle,
  minimalExampleSpec,
} from "../archetypes/minimal-example.js";

function transitionEvent(
  partial: Partial<TransitionEvent> &
    Pick<TransitionEvent, "id" | "transitionId" | "fromStateId" | "toStateId">,
): TransitionEvent {
  return {
    kind: "transicion",
    subjectId: "meta-example-minimal",
    occurredAt: "2026-01-01T00:00:00.000Z",
    actorId: "u1",
    actorKind: "humano",
    evidence: {
      kind: "aceptacion",
      reference: "ref-1",
      recordedAt: "2026-01-01T00:00:00.000Z",
    },
    ...partial,
  };
}

describe("Derivación de estado e invariantes", () => {
  it("rechaza registrar una máquina inválida", () => {
    const registry = new MetaObjectRegistry();
    const invalidLifecycle = {
      ...minimalExampleLifecycle,
      transitions: [
        ...minimalExampleLifecycle.transitions,
        {
          id: "t_reabrir",
          from: "cerrado",
          to: "activo",
          condition: "x",
          requiredEvidence: "aceptacion" as const,
          allowedActor: "humano" as const,
          fulfills: [] as string[],
        },
      ],
    };
    const invalid = { ...minimalExampleSpec, lifecycle: invalidLifecycle };

    expect(() =>
      registry.register(invalid, { codigo: "X" }),
    ).toThrow(/inválida/);
  });

  it("registra la máquina de ejemplo válida", () => {
    const registry = new MetaObjectRegistry();
    const mo = registry.register(minimalExampleSpec, { codigo: "EX-1" });
    expect(mo.identity.id).toBe("meta-example-minimal");
  });

  it("es imposible avanzar sin la evidencia exigida", () => {
    const derived = deriveState(minimalExampleLifecycle, []);
    expect(() =>
      assertCanAdvance(minimalExampleLifecycle, derived, {
        transitionId: "t_aceptar",
        eventId: "e1",
        actorId: "u1",
        actorKind: "humano",
        occurredAt: "2026-01-01T00:00:00.000Z",
        evidence: {
          kind: "sistema",
          reference: "wrong",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toThrow(DerivationError);
  });

  it("es imposible avanzar sin referencia de evidencia", () => {
    const derived = deriveState(minimalExampleLifecycle, []);
    expect(() =>
      assertCanAdvance(minimalExampleLifecycle, derived, {
        transitionId: "t_aceptar",
        eventId: "e1",
        actorId: "u1",
        actorKind: "humano",
        occurredAt: "2026-01-01T00:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toThrow(/referencia/);
  });

  it("un terminal nunca se reabre", () => {
    const events = [
      transitionEvent({
        id: "e1",
        transitionId: "t_aceptar",
        fromStateId: "borrador",
        toStateId: "activo",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "a1",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      transitionEvent({
        id: "e2",
        transitionId: "t_cerrar",
        fromStateId: "activo",
        toStateId: "cerrado",
        actorKind: "sistema",
        evidence: {
          kind: "sistema",
          reference: "s1",
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
      }),
    ];
    const derived = deriveState(minimalExampleLifecycle, events);
    expect(derived.currentStateId).toBe("cerrado");

    expect(() =>
      assertCanAdvance(minimalExampleLifecycle, derived, {
        transitionId: "t_aceptar",
        eventId: "e3",
        actorId: "u1",
        actorKind: "humano",
        occurredAt: "2026-01-03T00:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "a2",
          recordedAt: "2026-01-03T00:00:00.000Z",
        },
      }),
    ).toThrow(/terminal nunca se reabre/);
  });

  it("reconstruye el estado idéntico reproduciendo eventos desde cero", () => {
    const store = new InMemoryEventStore();
    const e1 = transitionEvent({
      id: "e1",
      transitionId: "t_aceptar",
      fromStateId: "borrador",
      toStateId: "activo",
    });
    const e2 = transitionEvent({
      id: "e2",
      transitionId: "t_cerrar",
      fromStateId: "activo",
      toStateId: "cerrado",
      actorKind: "sistema",
      evidence: {
        kind: "sistema",
        reference: "s1",
        recordedAt: "2026-01-02T00:00:00.000Z",
      },
    });
    store.append(e1);
    store.append(e2);

    const first = deriveState(minimalExampleLifecycle, store.all());
    const second = deriveState(minimalExampleLifecycle, store.all());

    expect(first.currentStateId).toBe("cerrado");
    expect(second.currentStateId).toBe(first.currentStateId);
    expect([...second.fulfilledCommitmentIds].sort()).toEqual(
      [...first.fulfilledCommitmentIds].sort(),
    );
    expect([...second.pendingCommitmentIds].sort()).toEqual(
      [...first.pendingCommitmentIds].sort(),
    );
    expect(second.eventCount).toBe(first.eventCount);
  });

  it("el motor de invariantes pasa en el ejemplo cerrado", () => {
    const events = [
      transitionEvent({
        id: "e1",
        transitionId: "t_aceptar",
        fromStateId: "borrador",
        toStateId: "activo",
      }),
      transitionEvent({
        id: "e2",
        transitionId: "t_cerrar",
        fromStateId: "activo",
        toStateId: "cerrado",
        actorKind: "sistema",
        evidence: {
          kind: "sistema",
          reference: "s1",
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
      }),
    ];
    const derived = deriveState(minimalExampleLifecycle, events);
    const engine = new InvariantEngine(
      minimalExampleSpec.invariants,
      structuralPredicateEvaluator,
    );

    expect(() =>
      engine.assertAll({
        currentStateId: derived.currentStateId,
        fulfilledCommitmentIds: derived.fulfilledCommitmentIds,
        pendingCommitmentIds: derived.pendingCommitmentIds,
        fieldValues: { codigo: "EX-1" },
      }),
    ).not.toThrow();
  });

  it("guarda eventos de modificación sin cambiar el estado", () => {
    const store = new InMemoryEventStore();
    store.append(
      transitionEvent({
        id: "e1",
        transitionId: "t_aceptar",
        fromStateId: "borrador",
        toStateId: "activo",
      }),
    );
    store.append({
      id: "e-mod",
      kind: "modificacion",
      subjectId: "meta-example-minimal",
      occurredAt: "2026-01-01T12:00:00.000Z",
      actorId: "u1",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "nota-1",
        recordedAt: "2026-01-01T12:00:00.000Z",
      },
      freeText: "caso no cubierto por el modelo",
    });

    const derived = deriveState(minimalExampleLifecycle, store.all());
    expect(derived.currentStateId).toBe("activo");
    expect(store.getById("e-mod")?.kind).toBe("modificacion");
  });

  it("falla al cerrar con saldo ≠ 0", () => {
    const events = [
      transitionEvent({
        id: "e1",
        transitionId: "t_aceptar",
        fromStateId: "borrador",
        toStateId: "activo",
      }),
      transitionEvent({
        id: "e2",
        transitionId: "t_cerrar",
        fromStateId: "activo",
        toStateId: "cerrado",
        actorKind: "sistema",
        evidence: {
          kind: "sistema",
          reference: "s1",
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
      }),
    ];
    expect(() =>
      deriveState(minimalExampleLifecycle, events, {
        balance: 999,
        resourcesSettled: true,
        evidenceComplete: true,
      }),
    ).toThrow(/saldo/);
  });

  it("falla al cerrar con evidencia incompleta", () => {
    const events = [
      transitionEvent({
        id: "e1",
        transitionId: "t_aceptar",
        fromStateId: "borrador",
        toStateId: "activo",
      }),
      transitionEvent({
        id: "e2",
        transitionId: "t_cerrar",
        fromStateId: "activo",
        toStateId: "cerrado",
        actorKind: "sistema",
        evidence: {
          kind: "sistema",
          reference: "s1",
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
      }),
    ];
    expect(() =>
      deriveState(minimalExampleLifecycle, events, {
        balance: 0,
        resourcesSettled: true,
        evidenceComplete: false,
      }),
    ).toThrow(/evidencia incompleta/);
  });

  it("una excepción desde un estado no declarado falla", () => {
    expect(() =>
      deriveState(minimalExampleLifecycle, [
        {
          id: "ex1",
          kind: "excepcion",
          subjectId: "meta-example-minimal",
          occurredAt: "2026-01-01T00:00:00.000Z",
          actorId: "u1",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "x",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
          fromStateId: "borrador",
          toStateId: "anulado",
          reason: "salto ilegal",
        },
      ]),
    ).toThrow(/no declarada/);
  });

  it("pasar una máquina inválida a deriveState falla", () => {
    const invalid = {
      ...minimalExampleLifecycle,
      transitions: [
        ...minimalExampleLifecycle.transitions,
        {
          id: "t_reabrir",
          from: "cerrado",
          to: "activo",
          condition: "x",
          requiredEvidence: "aceptacion" as const,
          allowedActor: "humano" as const,
          fulfills: [] as string[],
        },
      ],
    };
    expect(() => deriveState(invalid, [])).toThrow(/Máquina inválida/);
  });
});
