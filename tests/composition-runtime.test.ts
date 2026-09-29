/**
 * Composición en runtime: bloquea, ciclos DFS y traza.
 */

import { describe, expect, it } from "vitest";
import {
  validateComposition,
  findCycleDfs,
  buildStateDependencyGraph,
} from "../archetypes/composition.js";
import {
  ComposedTransactionSession,
  CompositionRuntimeError,
  attemptComposedAdvance,
  explainRejection,
  type TransitionTraceRecord,
} from "../archetypes/composed-runtime.js";
import { ventaArchetype } from "../archetypes/venta.js";
import { deriveState } from "../core/derivation.js";
import type { DomainEvent } from "../core/events.js";
import { concesionariaCase } from "../spec/cases.js";

const life = ventaArchetype.lifecycle;

function toAceptada(): DomainEvent[] {
  return [
    {
      id: "e1",
      kind: "transicion",
      subjectId: "tx-concesionaria",
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: "u",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "contrato-1",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      transitionId: "t_aceptar",
      fromStateId: "propuesta",
      toStateId: "aceptada",
    },
  ];
}

describe("Detector de ciclos DFS (cualquier longitud)", () => {
  it("detecta ciclo A→B→C→A al validar la máquina compuesta", () => {
    const result = validateComposition({
      dominant: "venta",
      secondaries: [
        {
          secondaryArchetypeId: "financiera",
          bornInDominantState: "aceptada",
          bloquea: "en_entrega",
        },
        {
          secondaryArchetypeId: "servicio_proyecto",
          bornInDominantState: "en_entrega",
          bloquea: "propuesta",
        },
        {
          secondaryArchetypeId: "suscripcion",
          bornInDominantState: "propuesta",
          bloquea: "aceptada",
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const circular = result.issues.filter((i) => i.code === "CIRCULAR_BLOCK");
      expect(circular.length).toBeGreaterThan(0);
      expect(
        circular.some(
          (i) =>
            i.message.includes("aceptada") ||
            i.message.includes("financiera") ||
            /3/.test(i.message),
        ),
      ).toBe(true);
    }
  });

  it("reconstruye el ciclo de estados con DFS", () => {
    const adj = buildStateDependencyGraph([
      {
        secondaryArchetypeId: "financiera",
        bornInDominantState: "aceptada",
        bloquea: "en_entrega",
      },
      {
        secondaryArchetypeId: "servicio_proyecto",
        bornInDominantState: "en_entrega",
        bloquea: "propuesta",
      },
      {
        secondaryArchetypeId: "suscripcion",
        bornInDominantState: "propuesta",
        bloquea: "aceptada",
      },
    ]);
    const cycle = findCycleDfs(adj);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThanOrEqual(4); // n1→n2→n3→n1
  });

  it("sigue detectando el par circular (control positivo)", () => {
    const result = validateComposition({
      dominant: "venta",
      secondaries: [
        {
          secondaryArchetypeId: "financiera",
          bornInDominantState: "propuesta",
          bloquea: "aceptada",
        },
        {
          secondaryArchetypeId: "uso_temporal",
          bornInDominantState: "aceptada",
          bloquea: "propuesta",
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("acepta la concesionaria (sin ciclo)", () => {
    expect(validateComposition(concesionariaCase.composition)).toEqual({
      ok: true,
    });
  });

  it("ComposedTransactionSession rechaza registrar composición cíclica", () => {
    expect(
      () =>
        new ComposedTransactionSession(
          "bad",
          {
            dominant: "venta",
            secondaries: [
              {
                secondaryArchetypeId: "financiera",
                bornInDominantState: "aceptada",
                bloquea: "en_entrega",
              },
              {
                secondaryArchetypeId: "servicio_proyecto",
                bornInDominantState: "en_entrega",
                bloquea: "propuesta",
              },
              {
                secondaryArchetypeId: "suscripcion",
                bornInDominantState: "propuesta",
                bloquea: "aceptada",
              },
            ],
          },
          life,
        ),
    ).toThrow(/circular|compuesta/i);
  });
});

describe("Runtime bloquea — concesionaria", () => {
  it("no puede pasar a en_entrega con la financiera abierta", () => {
    const session = new ComposedTransactionSession(
      "tx-concesionaria",
      concesionariaCase.composition,
      life,
    );
    const derived = deriveState(life, toAceptada());
    expect(derived.currentStateId).toBe("aceptada");

    expect(() =>
      session.attemptAdvance(
        derived,
        {
          transitionId: "t_iniciar_entrega",
          eventId: "e2",
          actorId: "s",
          actorKind: "sistema",
          occurredAt: "2026-01-02T00:00:00.000Z",
          evidence: {
            kind: "sistema",
            reference: "reserva-stock",
            recordedAt: "2026-01-02T00:00:00.000Z",
          },
        },
        [
          {
            instanceId: "fin-1",
            secondaryArchetypeId: "financiera",
            currentStateId: "aprobada",
            stateKind: "intermedio",
          },
        ],
      ),
    ).toThrow(CompositionRuntimeError);

    expect(session.traces.length).toBe(1);
    expect(session.traces[0]!.result).toBe("rejected");
    expect(session.traces[0]!.blocksEvaluated.some((b) => b.blocksTransition)).toBe(
      true,
    );
    const explanation = session.explainLastRejection("t_iniciar_entrega");
    expect(explanation).toMatch(/financiera/i);
    expect(explanation).toMatch(/bloquea|fin-1/i);
  });

  it("sí avanza a en_entrega si la financiera terminó con éxito", () => {
    const session = new ComposedTransactionSession(
      "tx-concesionaria",
      concesionariaCase.composition,
      life,
    );
    const derived = deriveState(life, toAceptada());

    const result = session.attemptAdvance(
      derived,
      {
        transitionId: "t_iniciar_entrega",
        eventId: "e2",
        actorId: "s",
        actorKind: "sistema",
        occurredAt: "2026-01-02T00:00:00.000Z",
        evidence: {
          kind: "sistema",
          reference: "reserva-stock",
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
      },
      [
        {
          instanceId: "fin-1",
          secondaryArchetypeId: "financiera",
          currentStateId: "cerrada",
          stateKind: "terminal_exito",
        },
      ],
    );

    expect(result.transition.to).toBe("en_entrega");
    expect(result.trace.result).toBe("accepted");
  });

  it("desde la traza se explica cualquier rechazo", () => {
    const traces: TransitionTraceRecord[] = [];
    const derived = deriveState(life, toAceptada());

    try {
      attemptComposedAdvance(
        {
          subjectId: "tx",
          composition: concesionariaCase.composition,
          dominantLifecycle: life,
          dominantDerived: derived,
          command: {
            transitionId: "t_iniciar_entrega",
            eventId: "e2",
            actorId: "s",
            actorKind: "sistema",
            occurredAt: "2026-01-02T00:00:00.000Z",
            evidence: {
              kind: "sistema",
              reference: "x",
              recordedAt: "2026-01-02T00:00:00.000Z",
            },
          },
          subTransactions: [
            {
              instanceId: "fin-open",
              secondaryArchetypeId: "financiera",
              currentStateId: "desembolsada",
              stateKind: "intermedio",
            },
          ],
        },
        traces,
      );
      expect.fail("debía rechazar");
    } catch (err) {
      expect(err).toBeInstanceOf(CompositionRuntimeError);
    }

    const text = explainRejection(traces);
    expect(text).not.toBe("No hay rechazo en la traza");
    expect(text.toLowerCase()).toContain("financiera");
    expect(traces[0]!.fromStateId).toBe("aceptada");
    expect(traces[0]!.toStateId).toBe("en_entrega");
    expect(traces[0]!.condition).toBeTruthy();
    expect(traces[0]!.evidence?.kind).toBe("sistema");
    expect(traces[0]!.blocksEvaluated.length).toBeGreaterThan(0);
    expect(traces[0]!.result).toBe("rejected");
  });
});
