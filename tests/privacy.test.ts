import { describe, expect, it } from "vitest";
import type { TransitionEvent } from "../core/events.js";
import { BayesianTypeLearner } from "../learning/bayesian.js";
import {
  AGGREGATE_MIN_COMPANIES,
  AggregatedProfileLayer,
  MultiTenantVault,
  TenantIsolationError,
  aggregateCannotReconstructEvent,
} from "../learning/privacy.js";

function sampleEvent(id: string, subjectId: string): TransitionEvent {
  return {
    id,
    kind: "transicion",
    subjectId,
    occurredAt: "2026-01-01T00:00:00.000Z",
    actorId: "actor-1",
    actorKind: "humano",
    evidence: {
      kind: "aceptacion",
      reference: "ref-1",
      recordedAt: "2026-01-01T00:00:00.000Z",
    },
    transitionId: "t_aceptar",
    fromStateId: "propuesta",
    toStateId: "aceptada",
  };
}

function makeContributorLearner(): BayesianTypeLearner {
  const learner = new BayesianTypeLearner("transaccion:venta", {
    tasa_cierre: 0.5,
  });
  learner.observe({
    at: "2026-01-01T00:00:00.000Z",
    signal: "tasa_cierre",
    payload: { success: true },
  });
  return learner;
}

describe("Aislamiento multiempresa", () => {
  it("una empresa no puede leer eventos ni perfiles propios de otra", () => {
    const vault = new MultiTenantVault();
    vault.registerCompany("acme");
    vault.registerCompany("globex");

    vault.appendEvent("acme", sampleEvent("e-acme-1", "tx-1"));
    const acmeLearner = vault.getOrCreateLearner("acme", "transaccion:venta", {
      tasa_cierre: 0.55,
    });
    acmeLearner.observe({
      at: "2026-01-01T00:00:00.000Z",
      signal: "tasa_cierre",
      payload: { success: true },
    });

    vault.putSpec("acme", "spec-1", { subtype: "venta" });

    expect(vault.readEvents("acme", "acme")).toHaveLength(1);
    expect(
      vault.readProfile("acme", "acme", "transaccion:venta")?.version,
    ).toBeGreaterThan(0);
    expect(vault.getSpec("acme", "acme", "spec-1")?.id).toBe("spec-1");

    expect(() => vault.readEvents("globex", "acme")).toThrow(TenantIsolationError);
    expect(() => vault.getEventById("globex", "acme", "e-acme-1")).toThrow(
      TenantIsolationError,
    );
    expect(() =>
      vault.readProfile("globex", "acme", "transaccion:venta"),
    ).toThrow(TenantIsolationError);
    expect(() => vault.getSpec("globex", "acme", "spec-1")).toThrow(
      TenantIsolationError,
    );

    expect(vault.eventStore("globex").all()).toHaveLength(0);
    expect(vault.eventStore("globex").getById("e-acme-1")).toBeUndefined();
  });
});

describe("Capa agregada", () => {
  it("un agregado con menos empresas que el umbral no se publica", () => {
    const layer = new AggregatedProfileLayer();
    expect(AGGREGATE_MIN_COMPANIES).toBe(5);

    for (let i = 1; i <= 4; i++) {
      layer.contribute(
        `co-${i}`,
        makeContributorLearner().exportSufficientStats(),
      );
    }

    expect(layer.contributorCount("transaccion:venta")).toBe(4);
    expect(layer.tryPublish("transaccion:venta")).toBeNull();
    expect(layer.getPublished("transaccion:venta")).toBeUndefined();

    layer.contribute("co-5", makeContributorLearner().exportSufficientStats());
    const pub = layer.tryPublish(
      "transaccion:venta",
      "2026-03-01T00:00:00.000Z",
    );
    expect(pub).not.toBeNull();
    expect(pub!.companyCount).toBe(5);
    expect(layer.getPublished("transaccion:venta")?.companyCount).toBe(5);
  });

  it("ningún campo de un agregado permite reconstruir un evento individual", () => {
    const layer = new AggregatedProfileLayer();
    for (let i = 1; i <= 5; i++) {
      const learner = makeContributorLearner();
      learner.observe({
        at: "2026-01-01T00:00:00.000Z",
        signal: "tasa_cierre",
        payload: { success: i % 2 === 0 },
      });
      layer.contribute(`corp-${i}`, learner.exportSufficientStats());
    }

    const pub = layer.tryPublish("transaccion:venta");
    expect(pub).not.toBeNull();
    expect(aggregateCannotReconstructEvent(pub!)).toBe(true);

    expect(pub).not.toHaveProperty("companyIds");
    expect(pub).not.toHaveProperty("events");
    expect(pub).not.toHaveProperty("parties");
    expect(typeof pub!.features.tasa_cierre).toBe("number");
    expect(pub!.sufficient.binary.tasa_cierre).toMatchObject({
      alpha: expect.any(Number),
      beta: expect.any(Number),
    });
  });

  it("empresa nueva hereda priors del agregado publicado, no de un vecino", () => {
    const vault = new MultiTenantVault();
    const layer = new AggregatedProfileLayer();

    for (let i = 1; i <= 5; i++) {
      const id = `donor-${i}`;
      vault.registerCompany(id);
      const learner = vault.getOrCreateLearner(id, "transaccion:venta", {
        tasa_cierre: 0.7,
      });
      for (let j = 0; j < 10; j++) {
        learner.observe({
          at: "2026-01-01T00:00:00.000Z",
          signal: "tasa_cierre",
          payload: { success: true },
        });
      }
      layer.contribute(id, learner.exportSufficientStats()!);
    }
    layer.tryPublish("transaccion:venta");

    const priors = layer.inheritPriors("transaccion:venta");
    vault.registerCompany("startup");
    const startup = vault.getOrCreateLearner(
      "startup",
      "transaccion:venta",
      priors,
    );
    expect(startup.snapshot().features.tasa_cierre).toBeGreaterThan(0.6);

    expect(() =>
      vault.readProfile("startup", "donor-1", "transaccion:venta"),
    ).toThrow(TenantIsolationError);
  });
});
