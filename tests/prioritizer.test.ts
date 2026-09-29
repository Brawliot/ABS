/**
 * Criterios Priorizador MVP:
 * - 20 Insights: nadie supera el límite de interrupciones
 * - Tipo ignorado al 90% baja de nivel tras mín. observaciones
 * - Alerta de Cumplimiento no pierde prioridad aunque se ignore
 */

import { describe, expect, it } from "vitest";
import type { Insight, InsightType } from "../contracts/insight.js";
import type { InsightTypeResponseStats } from "../response-registrar/type-stats.js";
import {
  DEFAULT_INTERRUPT_LIMIT_PER_DAY,
  DEFAULT_PRIORITIZER_CONFIG,
  URGENCY_RANK,
  applyLearningAndComplianceFloor,
  learningAdjustmentForType,
  prioritizeInsights,
  resolveInterruptLimit,
  scoreToUrgency,
} from "../prioritizer/index.js";

function makeInsight(
  id: string,
  over: Partial<Insight> & { type?: InsightType } = {},
): Insight {
  return {
    id,
    type: over.type ?? "recomendacion",
    subject: {
      kind: "transaccion",
      id: `tx-${id}`,
      tenantId: "acme",
      sedeId: "sede-a",
    },
    title: `Insight ${id}`,
    summary: "simulado",
    baseFacts: [
      { id: "f1", label: "Importe", value: over.estimatedImpact ?? 5000, fieldKey: "importe" },
    ],
    confidence: over.confidence ?? 0.95,
    generatedAt: "2026-06-01T00:00:00.000Z",
    expiresAt: "2026-06-02T00:00:00.000Z", // caduca pronto → urgencia alta
    estimatedImpact: over.estimatedImpact ?? 50_000,
    ...over,
  };
}

describe("Priorizador MVP", () => {
  const now = "2026-06-01T20:00:00.000Z";

  it("con 20 Insights simulados, nadie recibe más interrupciones que el límite", () => {
    // 20 alertas de alto impacto → puntuación de interrupción
    const insights = Array.from({ length: 20 }, (_, i) =>
      makeInsight(`ins-${i}`, {
        type: "alerta",
        confidence: 0.99,
        estimatedImpact: 100_000 + i * 1000,
      }),
    );

    const limit = resolveInterruptLimit(
      ["vendedor"],
      DEFAULT_PRIORITIZER_CONFIG,
    );
    expect(limit).toBe(DEFAULT_INTERRUPT_LIMIT_PER_DAY);
    expect(limit).toBe(3);

    const result = prioritizeInsights({
      insights,
      roles: ["vendedor"],
      now,
    });

    const interrupts = result.items.filter((x) => x.urgency === "interrumpir");
    expect(interrupts.length).toBeLessThanOrEqual(limit);
    expect(interrupts.length).toBe(3);
    expect(result.interruptCount).toBeLessThanOrEqual(result.interruptLimit);
    expect(result.items.filter((x) => x.interruptDeferred).length).toBe(
      20 - 3,
    );

    // Con interrupciones ya consumidas hoy
    const again = prioritizeInsights({
      insights,
      roles: ["vendedor"],
      now,
      interruptsAlreadyToday: 3,
    });
    expect(
      again.items.filter((x) => x.urgency === "interrumpir"),
    ).toHaveLength(0);
  });

  it("un tipo ignorado en el 90% baja de nivel tras un número mínimo de observaciones", () => {
    const config = DEFAULT_PRIORITIZER_CONFIG;
    const stats: InsightTypeResponseStats[] = [
      {
        insightType: "metrica",
        shown: config.minObservationsForLearning,
        accepted: 0,
        rejected: 1,
        ignored: 9,
        acceptanceRate: 0,
        ignoreRate: 0.9,
      },
    ];

    const learn = learningAdjustmentForType("metrica", stats, config);
    expect(learn.observations).toBeGreaterThanOrEqual(
      config.minObservationsForLearning,
    );
    expect(learn.demoteLevel).toBe(true);

    // Sin suficientes observaciones → no demota
    const early = learningAdjustmentForType(
      "metrica",
      [{ ...stats[0]!, shown: 5, ignored: 5, ignoreRate: 1 }],
      config,
    );
    expect(early.demoteLevel).toBe(false);

    const insight = makeInsight("m1", {
      type: "metrica",
      confidence: 0.5,
      estimatedImpact: 100,
      expiresAt: "2027-01-01T00:00:00.000Z",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    const without = prioritizeInsights({
      insights: [insight],
      roles: ["vendedor"],
      now: "2026-06-01T12:00:00.000Z",
      typeStats: [],
    });
    const withLearn = prioritizeInsights({
      insights: [insight],
      roles: ["vendedor"],
      now: "2026-06-01T12:00:00.000Z",
      typeStats: stats,
    });

    expect(withLearn.items[0]!.demotedByLearning).toBe(true);
    expect(URGENCY_RANK[withLearn.items[0]!.urgency]).toBeLessThan(
      URGENCY_RANK[without.items[0]!.urgency],
    );
  });

  it("una alerta de Cumplimiento no pierde prioridad aunque se ignore", () => {
    const config = DEFAULT_PRIORITIZER_CONFIG;
    const stats: InsightTypeResponseStats[] = [
      {
        insightType: "alerta",
        shown: 20,
        accepted: 0,
        rejected: 2,
        ignored: 18,
        acceptanceRate: 0,
        ignoreRate: 0.9,
      },
    ];

    // Score alto → interrumpir; aprendizaje demota; floor cumplimiento → destacar mínimo
    const compliance = makeInsight("comp-1", {
      type: "alerta",
      confidence: 0.99,
      estimatedImpact: 80_000,
      complianceDerived: true,
    });

    const result = prioritizeInsights({
      insights: [compliance],
      roles: ["vendedor"],
      now,
      typeStats: stats,
    });

    const item = result.items[0]!;
    expect(item.demotedByLearning).toBe(true);
    expect(item.complianceFloorApplied).toBe(true);
    expect(URGENCY_RANK[item.urgency]).toBeGreaterThanOrEqual(
      URGENCY_RANK.destacar,
    );

    // Floor explícito: democión desde destacar no baja de destacar
    const floored = applyLearningAndComplianceFloor({
      urgency: "destacar",
      demoteLevel: true,
      complianceDerived: true,
    });
    expect(floored.urgency).toBe("destacar");
    expect(floored.complianceFloorApplied).toBe(true);

    // Sin cumplimiento, sí baja
    const normal = applyLearningAndComplianceFloor({
      urgency: "destacar",
      demoteLevel: true,
      complianceDerived: false,
    });
    expect(normal.urgency).toBe("mostrar_en_contexto");
  });

  it("umbrales de score mapean a niveles cerrados", () => {
    expect(scoreToUrgency(0.9)).toBe("interrumpir");
    expect(scoreToUrgency(0.5)).toBe("destacar");
    expect(scoreToUrgency(0.3)).toBe("mostrar_en_contexto");
    expect(scoreToUrgency(0.1)).toBe("solo_bajo_consulta");
  });
});
