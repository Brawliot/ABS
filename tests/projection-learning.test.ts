import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "../core/event-store.js";
import type { ExceptionEvent, TransitionEvent } from "../core/events.js";
import {
  DerivedCycleMutationError,
  DerivedLifecycleProjection,
} from "../elements/projection.js";
import {
  BayesianTypeLearner,
  DriftDetector,
  createArchetypeLearnerRegistry,
} from "../learning/index.js";

function transition(partial: Omit<TransitionEvent, "evidence">): TransitionEvent {
  return {
    ...partial,
    evidence: {
      kind: "aceptacion",
      reference: "test",
      recordedAt: partial.occurredAt,
    },
  };
}

function exception(partial: Omit<ExceptionEvent, "evidence">): ExceptionEvent {
  return {
    ...partial,
    evidence: {
      kind: "aceptacion",
      reference: "test",
      recordedAt: partial.occurredAt,
    },
  };
}

describe("Proyección de ciclos derivados (principio 7)", () => {
  it("cancelar una venta en Acuerdo libera su Recurso automáticamente", () => {
    const store = new InMemoryEventStore();
    const projection = new DerivedLifecycleProjection();
    projection.attach(store);

    projection.registerRecurso("rec-1");
    projection.linkRecurso("tx-venta-1", "rec-1");

    expect(projection.stateOf("rec-1").currentStateId).toBe("disponible");

    // Acuerdo = aceptada → reserva
    store.append(
      transition({
        id: "e-aceptar",
        kind: "transicion",
        subjectId: "tx-venta-1",
        occurredAt: "2026-01-01T10:00:00.000Z",
        actorId: "u1",
        actorKind: "humano",
        transitionId: "t_aceptar",
        fromStateId: "propuesta",
        toStateId: "aceptada",
      }),
    );
    expect(projection.stateOf("rec-1").currentStateId).toBe("reservado");

    // Cancelada desde Acuerdo → libera (devolver)
    store.append(
      exception({
        id: "e-cancelar",
        kind: "excepcion",
        subjectId: "tx-venta-1",
        occurredAt: "2026-01-01T11:00:00.000Z",
        actorId: "u1",
        actorKind: "humano",
        fromStateId: "aceptada",
        toStateId: "cancelada",
        reason: "cancelacion",
      }),
    );
    expect(projection.stateOf("rec-1").currentStateId).toBe("consumido");
  });

  it("cobro / cierre liquida el Movimiento vinculado", () => {
    const store = new InMemoryEventStore();
    const projection = new DerivedLifecycleProjection();
    projection.attach(store);

    projection.registerMovimiento("mov-1");
    projection.linkMovimiento("tx-1", "mov-1");
    expect(projection.stateOf("mov-1").currentStateId).toBe("emitido");

    store.append(
      transition({
        id: "e-cerrar",
        kind: "transicion",
        subjectId: "tx-1",
        occurredAt: "2026-01-02T00:00:00.000Z",
        actorId: "sys",
        actorKind: "sistema",
        transitionId: "t_cerrar",
        fromStateId: "en_entrega",
        toStateId: "cerrada",
      }),
    );
    expect(projection.stateOf("mov-1").currentStateId).toBe("liquidado");
  });

  it("intentar modificar un ciclo derivado directamente falla", () => {
    const projection = new DerivedLifecycleProjection();
    projection.registerRecurso("rec-x");

    expect(() =>
      projection.applyDirectTransition("rec-x", "t_recurso_reservar"),
    ).toThrow(DerivedCycleMutationError);

    expect(() =>
      projection.appendDerivedEvent("rec-x", {
        id: "hack",
        kind: "transicion",
        subjectId: "rec-x",
        occurredAt: "2026-01-01T00:00:00.000Z",
        actorId: "x",
        actorKind: "sistema",
        evidence: {
          kind: "sistema",
          reference: "x",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        transitionId: "t_recurso_reservar",
        fromStateId: "disponible",
        toStateId: "reservado",
      }),
    ).toThrow(DerivedCycleMutationError);

    expect(projection.stateOf("rec-x").currentStateId).toBe("disponible");
  });
});

describe("Aprendices bayesianos + detector de deriva", () => {
  it("converge a la probabilidad real y alerta cuando cambia a mitad de serie", () => {
    const learner = new BayesianTypeLearner("transaccion:venta", {
      tasa_cierre: 0.5,
    });
    const detector = new DriftDetector({
      burnIn: 40,
      windowSize: 25,
      sigmaMultiplier: 2,
      minBand: 0.06,
      sustainCount: 8,
    });

    // Bernoulli determinista: 17/20 ≈ 0.85, luego 3/20 ≈ 0.15
    const phase1 = (i: number) => i % 20 < 17;
    const phase2 = (i: number) => i % 20 < 3;

    let alert: ReturnType<DriftDetector["observe"]> = null;

    for (let i = 0; i < 100; i++) {
      learner.observe({
        at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
        signal: "tasa_cierre",
        payload: { success: phase1(i) },
      });
      const mean = learner.snapshot().features.tasa_cierre!;
      alert = detector.observe("tasa_cierre", mean, `t1-${i}`) ?? alert;
    }

    const mid = learner.snapshot().features.tasa_cierre!;
    expect(mid).toBeGreaterThan(0.7);
    expect(mid).toBeLessThan(0.95);
    expect(alert).toBeNull();

    for (let i = 0; i < 400; i++) {
      learner.observe({
        at: `2026-02-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
        signal: "tasa_cierre",
        payload: { success: phase2(i) },
      });
      const mean = learner.snapshot().features.tasa_cierre!;
      const hit = detector.observe("tasa_cierre", mean, `t2-${i}`);
      if (hit) alert = hit;
    }

    const end = learner.snapshot().features.tasa_cierre!;
    expect(end).toBeLessThan(0.35);
    expect(end).toBeLessThan(mid);
    expect(alert).not.toBeNull();
    expect(alert!.signal).toBe("tasa_cierre");
    expect(alert!.currentMean).toBeLessThan(alert!.baselineMean);
  });

  it("ningún aprendiz escribe fuera del perfil", () => {
    const registry = createArchetypeLearnerRegistry();
    const venta = registry.getOrCreate("transaccion:venta");
    const servicio = registry.getOrCreate("transaccion:servicio_proyecto");
    const beforeServicio = structuredClone(servicio.snapshot());

    const frozenObs = Object.freeze({
      at: "2026-01-01T00:00:00.000Z",
      signal: "tasa_cierre",
      payload: Object.freeze({ success: true }),
    });

    venta.observe(frozenObs);

    expect(venta.writesOnlyToProfile()).toBe(true);
    expect(venta.writeTargets).toEqual(["profile"]);
    expect(servicio.snapshot()).toEqual(beforeServicio);

    const snap = venta.snapshot();
    expect(Object.isFrozen(snap.features)).toBe(true);
    expect(snap.version).toBeGreaterThan(0);
  });

  it("Dirichlet de salidas y Gamma de permanencia actualizan el perfil", () => {
    const learner = new BayesianTypeLearner(
      "transaccion:venta",
      {},
      {
        exitPriors: {
          "exit:aceptada": { en_entrega: 2, cancelada: 1 },
        },
        dwellPriors: {
          "dwell:aceptada": { shape: 2, rate: 10 },
        },
      },
    );

    learner.observe({
      at: "2026-01-01T00:00:00.000Z",
      signal: "exit:aceptada",
      payload: { to: "en_entrega" },
    });
    learner.observe({
      at: "2026-01-01T01:00:00.000Z",
      signal: "dwell:aceptada",
      payload: { duration: 5 },
    });

    const features = learner.snapshot().features;
    expect(features["exit:aceptada->en_entrega"]).toBeGreaterThan(
      features["exit:aceptada->cancelada"]!,
    );
    expect(features["dwell:aceptada"]).toBeGreaterThan(0);
  });
});
