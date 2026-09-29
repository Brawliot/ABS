/**
 * Criterios Registrador de respuesta MVP:
 * - Recomendación aceptada vinculada a transición y resultado
 * - Visto y no atendido en plazo → ignorado
 * - Dos variantes → tasa de aceptación por variante
 */

import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "../core/event-store.js";
import {
  InsightResponseStore,
  assertNoBusinessStoreMutation,
  assertResponseReadOnlyPort,
  linkTransitionResult,
  openResponseReader,
  recordAccepted,
  recordShown,
  sweepIgnored,
} from "../response-registrar/index.js";

describe("Registrador de respuesta MVP", () => {
  it("una recomendación aceptada queda vinculada a su transición y a su resultado", () => {
    const store = new InsightResponseStore();
    const business = new InMemoryEventStore();

    assertNoBusinessStoreMutation(business, () => {
      recordShown(store, {
        responseId: "resp-1",
        insightId: "ins.reco.aceptar",
        insightType: "recomendacion",
        shownAt: "2026-06-01T12:00:00.000Z",
        audienceKey: "parte-ana",
        subjectId: "tx-reco-1",
        tenantId: "acme",
        correlationId: "corr-reco-1",
        experimentId: "exp.reco",
        experimentVariant: "A",
      });
    });
    expect(business.all()).toHaveLength(0);

    const accepted = recordAccepted(store, {
      responseId: "resp-1",
      at: "2026-06-01T12:05:00.000Z",
      transitionId: "t_aceptar",
      transitionEventId: "evt-trans-99",
    });
    expect(accepted.outcome).toBe("aceptado");
    expect(accepted.transitionId).toBe("t_aceptar");
    expect(accepted.transitionEventId).toBe("evt-trans-99");
    expect(accepted.transitionResult).toBeNull();

    const linked = linkTransitionResult(store, {
      responseId: "resp-1",
      at: "2026-06-01T12:05:01.000Z",
      transitionResult: "exito",
    });
    expect(linked.transitionResult).toBe("exito");
    expect(linked.transitionId).toBe("t_aceptar");
    expect(linked.transitionEventId).toBe("evt-trans-99");

    // Seudónimo: audiencia en claro no aparece
    expect(JSON.stringify(linked)).not.toContain("parte-ana");

    const reader = openResponseReader(store);
    assertResponseReadOnlyPort(reader);
    const views = reader.byInsight("ins.reco.aceptar");
    expect(views).toHaveLength(1);
    expect(views[0]!.outcome).toBe("aceptado");
    expect(views[0]!.transitionResult).toBe("exito");
    expect(reader.byCorrelation("corr-reco-1")).toHaveLength(1);
  });

  it("un Insight visto y no atendido en el plazo se registra como ignorado", () => {
    const store = new InsightResponseStore();
    recordShown(store, {
      responseId: "resp-ignore",
      insightId: "ins.alerta.x",
      insightType: "alerta",
      shownAt: "2026-06-01T10:00:00.000Z",
      ignoreDeadlineAt: "2026-06-01T12:00:00.000Z",
      audienceKey: "u-vend",
      subjectId: "tx-1",
      tenantId: "acme",
    });

    const beforeDeadline = sweepIgnored(store, "2026-06-01T11:59:00.000Z");
    expect(beforeDeadline).toHaveLength(0);
    expect(store.get("resp-ignore")!.outcome).toBe("pendiente");

    const marked = sweepIgnored(store, "2026-06-01T12:00:00.000Z");
    expect(marked).toHaveLength(1);
    expect(marked[0]!.outcome).toBe("ignorado");
    expect(store.get("resp-ignore")!.outcome).toBe("ignorado");
  });

  it("con dos variantes simuladas se calcula la tasa de aceptación de cada una", () => {
    const store = new InsightResponseStore();
    const exp = "exp.banner.ab";

    // Variante A: 4 mostradas, 3 aceptadas → 0.75
    for (let i = 0; i < 4; i++) {
      recordShown(store, {
        responseId: `a-show-${i}`,
        insightId: `ins.a.${i}`,
        insightType: "recomendacion",
        shownAt: "2026-06-01T12:00:00.000Z",
        audienceKey: `aud-a-${i}`,
        subjectId: `tx-a-${i}`,
        tenantId: "acme",
        experimentId: exp,
        experimentVariant: "A",
      });
    }
    for (let i = 0; i < 3; i++) {
      recordAccepted(store, {
        responseId: `a-show-${i}`,
        at: "2026-06-01T12:10:00.000Z",
        transitionId: "t_aceptar",
        transitionEventId: `evt-a-${i}`,
        transitionResult: "exito",
      });
    }

    // Variante B: 4 mostradas, 1 aceptada → 0.25
    for (let i = 0; i < 4; i++) {
      recordShown(store, {
        responseId: `b-show-${i}`,
        insightId: `ins.b.${i}`,
        insightType: "recomendacion",
        shownAt: "2026-06-01T12:00:00.000Z",
        audienceKey: `aud-b-${i}`,
        subjectId: `tx-b-${i}`,
        tenantId: "acme",
        experimentId: exp,
        experimentVariant: "B",
      });
    }
    recordAccepted(store, {
      responseId: "b-show-0",
      at: "2026-06-01T12:10:00.000Z",
      transitionId: "t_aceptar",
      transitionEventId: "evt-b-0",
      transitionResult: "excepcion",
    });

    const reader = openResponseReader(store);
    assertResponseReadOnlyPort(reader);
    expect("append" in reader).toBe(false);

    const rates = reader.acceptanceRateByVariant(exp);
    expect(rates).toHaveLength(2);
    const rateA = rates.find((r) => r.variant === "A")!;
    const rateB = rates.find((r) => r.variant === "B")!;
    expect(rateA.shown).toBe(4);
    expect(rateA.accepted).toBe(3);
    expect(rateA.acceptanceRate).toBe(0.75);
    expect(rateB.shown).toBe(4);
    expect(rateB.accepted).toBe(1);
    expect(rateB.acceptanceRate).toBe(0.25);
  });
});
