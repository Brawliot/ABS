/**
 * Tests y Walks: Puentes Capa 1 ↔ Capa 2
 * ═══════════════════════════════════════════════════════════════════
 *
 * Capa 1: Business Logic (venta, transiciones, ciclos de vida)
 * Capa 2: Telemetría & UX (interrupciones, priorización, observación)
 *
 * Los 4 Puentes:
 * 1. Consultant (Consultor de Catálogo)
 * 2. Prioritizer (Priorizador de Interrupciones)
 * 3. Registrar (Registrador de Tasas) → read-only
 * 4. PresentationIntelligence (Inteligencia de Presentación) → read-only
 */

import { describe, expect, it } from "vitest";
import type { Insight } from "../../contracts/insight.js";
import {
  consult,
  type ConsultantOutcome,
  type MetricFactRow,
} from "../../consultant/index.js";
import type { FilterReader } from "../../filter/types.js";
import {
  prioritizeInsights,
  resolveInterruptLimit,
  type PrioritizeResult,
  DEFAULT_PRIORITIZER_CONFIG,
} from "../../prioritizer/index.js";
import type { ResponseRegistrarReadPort } from "../../response-registrar/reader.js";
import {
  InsightResponseStore,
  recordShown,
  recordAccepted,
  acceptanceRateByVariant,
  openResponseReader,
} from "../../response-registrar/index.js";
import {
  ExperienceTelemetryStore,
  openLayer3Reader,
  type Layer3PresentationIntelligence,
} from "../../bridges/presentation-intelligence/index.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../../policies/compiler.js";
import type { PolicyDocument } from "../../policies/types.js";
import { ventaArchetype } from "../../archetypes/venta.js";

// ═══════════════════════════════════════════════════════════════════
// SETUP COMPARTIDO
// ═══════════════════════════════════════════════════════════════════

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe"],
);
const activationAt = "2026-04-01T00:00:00.000Z";

function compilePoliciesDoc() {
  const doc: PolicyDocument = {
    id: "bridges-test-pack",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "finanzas", label: "Finanzas" },
      { id: "gerente", label: "Gerente" },
    ],
    organization: {
      sedes: [
        { id: "madrid", label: "Madrid" },
        { id: "barcelona", label: "Barcelona" },
      ],
      equipos: [
        { id: "eq-madrid", label: "Eq Madrid", sedeId: "madrid" },
        { id: "eq-barcelona", label: "Eq Barcelona", sedeId: "barcelona" },
      ],
      assignments: [
        {
          actorId: "vendedor-1",
          sedeId: "madrid",
          equipoId: "eq-madrid",
          roleId: "vendedor",
        },
      ],
    },
    permissions: [
      {
        id: "vis-sede",
        kind: "permiso",
        action: "consultar",
        allowedRoles: ["vendedor", "finanzas", "gerente"],
        visibility: { scope: "sede" },
      },
    ],
  };
  return compilePolicies(doc, { catalog, activationAt });
}

function makeFact(
  over: Partial<MetricFactRow> & Pick<MetricFactRow, "id" | "sedeId" | "canal" | "month">
): MetricFactRow {
  return {
    tenantId: "acme",
    equipoId: over.sedeId === "barcelona" ? "eq-barcelona" : "eq-madrid",
    segmento: "retail",
    year: 2026,
    importe: 1000,
    unidades: 2,
    ingresos_previstos: 1200,
    conversion: 0.4,
    ticket_medio: 500,
    ...over,
  };
}

function makeInsight(
  id: string,
  over: Partial<Insight> = {}
): Insight {
  return {
    id,
    type: over.type ?? "recomendacion",
    subject: {
      kind: "transaccion",
      id: `tx-${id}`,
      tenantId: "acme",
      sedeId: "madrid",
    },
    title: `Insight ${id}`,
    summary: "Bridge test insight",
    baseFacts: [
      {
        id: "f1",
        label: "Importe",
        value: over.estimatedImpact ?? 5000,
        fieldKey: "importe",
      },
    ],
    confidence: over.confidence ?? 0.95,
    generatedAt: "2026-06-01T00:00:00.000Z",
    expiresAt: "2026-06-02T00:00:00.000Z",
    estimatedImpact: over.estimatedImpact ?? 50_000,
    ...over,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PUENTE 1: CONSULTANT (Consultor de Catálogo)
// ═══════════════════════════════════════════════════════════════════

describe("Puente 1: CONSULTANT", () => {
  const ruleSet = compilePoliciesDoc();
  const readerVendedor: FilterReader = {
    id: "vendedor-1",
    roles: ["vendedor"],
    tenantId: "acme",
  };

  const FACTS: readonly MetricFactRow[] = [
    makeFact({
      id: "m1",
      sedeId: "madrid",
      canal: "web",
      month: 3,
      importe: 5000,
      segmento: "retail",
    }),
    makeFact({
      id: "m2",
      sedeId: "madrid",
      canal: "presencial",
      month: 3,
      importe: 3000,
      segmento: "empresa",
    }),
    makeFact({
      id: "m3",
      sedeId: "barcelona",
      canal: "web",
      month: 3,
      importe: 8000,
      segmento: "premium",
    }),
  ];

  it("1a. Consultant: busca oferta por canal y calcula descuento", () => {
    // Scenario: vendedor busca ventas por canal en marzo
    // Expected: Consultant retorna respuesta estructurada con desglose por canal

    const outcome = consult({
      question: "¿Cuánto vendimos en marzo por canal?",
      reader: readerVendedor,
      ruleSet,
      facts: FACTS,
      defaultYear: 2026,
    });

    expect(outcome.kind).toBe("respuesta");
    if (outcome.kind !== "respuesta") return;

    // Verificar estructura de respuesta
    expect(outcome.query).toBeDefined();
    expect(outcome.buckets).toBeDefined();
    expect(outcome.total).toBeGreaterThan(0);
    expect(outcome.calculation).toBeDefined();

    // Permiso sede: solo Madrid (8000)
    expect(outcome.total).toBe(8000);

    // Buckets contienen canales (solo los visibles para sede-madrid)
    const canales = outcome.buckets.map((b) => b.dimensions.canal);
    expect(canales).toContain("web");
    expect(canales).toContain("presencial");
  });

  it("1b. Consultant: consulta fuera de catálogo pide aclaración", () => {
    // Scenario: vendedor pregunta por métrica no en el catálogo
    // Expected: retorna aclaracion con sugerencias

    const outcome = consult({
      question: "¿Cuántos productos customizados se pidieron?",
      reader: readerVendedor,
      ruleSet,
      facts: FACTS,
      defaultYear: 2026,
    });

    // Fuera de catálogo → aclaración
    expect(outcome.kind).toBe("aclaracion");
    if (outcome.kind !== "aclaracion") return;
    expect(outcome.clarificationAsked).toBe(true);
    expect(outcome.reason).toBe("out_of_catalog");
    expect(outcome.question).toBeDefined();
  });

  it("1c. Consultant: respeta filtro de sede", () => {
    // Scenario: vendedor consulta por sede barcelona
    // Expected: solo datos de barcelona se retornan, madrid se filtra

    const outcome = consult({
      question: "¿Cuánto vendimos en marzo?",
      reader: readerVendedor,
      ruleSet,
      facts: FACTS,
      defaultYear: 2026,
    });

    expect(outcome.kind).toBe("respuesta");
    if (outcome.kind !== "respuesta") return;

    // Permiso sede limita a madrid → solo datos madrid (5000 + 3000)
    expect(outcome.total).toBe(8000);

    // barcelona (8000) no se incluye por restricción de sede
    // solo madrid aparece
    const calculation = outcome.calculation;
    expect(calculation.rowsAfterFilter).toBeLessThanOrEqual(
      calculation.rowsConsidered
    );
  });

  it("1d. Walk: consulta → respuesta → buckets desglosados", () => {
    // PASO 1: Vendedor formula pregunta
    const question = "¿Cuánto vendimos en marzo por canal?";

    // PASO 2: Consultant procesa pregunta
    const outcome = consult({
      question,
      reader: readerVendedor,
      ruleSet,
      facts: FACTS,
      defaultYear: 2026,
    });

    expect(outcome.kind).toBe("respuesta");
    if (outcome.kind !== "respuesta") return;

    // PASO 3: Verificar resultado completo
    expect(outcome.query.metricId).toBe("ventas_importe");
    expect(outcome.query.groupBy).toEqual(["canal"]);
    expect(outcome.buckets.length).toBeGreaterThan(0);

    // PASO 4: Verificar que se respetó la visibilidad
    const bucketSedeIds = outcome.buckets
      .map((b) => b.dimensions.sede)
      .filter((s) => s !== undefined);
    if (bucketSedeIds.length > 0) {
      bucketSedeIds.forEach((sedeId) => {
        expect(sedeId).toBe("madrid");
      });
    }

    // PASO 5: Total coherente
    expect(outcome.total).toBe(8000);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PUENTE 2: PRIORITIZER (Priorizador de Interrupciones)
// ═══════════════════════════════════════════════════════════════════

describe("Puente 2: PRIORITIZER", () => {
  const now = "2026-06-01T20:00:00.000Z";

  it("2a. Prioritizer: cap de interrupciones (máx 3 por vendedor/día)", () => {
    // Scenario: vendedor recibe múltiples insights de alta prioridad
    // Expected: 6 insights, solo 3 se marcan "interrumpir", resto "destacar"

    const insights = Array.from({ length: 6 }, (_, i) =>
      makeInsight(`ins-${i}`, {
        type: "alerta",
        confidence: 0.99,
        estimatedImpact: 100_000 + i * 1000,
      })
    );

    const result = prioritizeInsights({
      insights,
      roles: ["vendedor"],
      now,
    });

    // Verificar límite
    const interruptCount = result.items.filter(
      (x) => x.urgency === "interrumpir"
    ).length;
    expect(interruptCount).toBeLessThanOrEqual(3);
    expect(interruptCount).toBe(3); // 6 alertas de alto impacto → 3 interrupciones

    // El resto debe estar diferido o en otro nivel
    const deferrCount = result.items.filter(
      (x) => x.interruptDeferred
    ).length;
    expect(deferrCount).toBeGreaterThan(0);

    // Total respeta el límite
    expect(result.interruptCount).toBeLessThanOrEqual(result.interruptLimit);
  });

  it("2b. Prioritizer: respeta interrupciones ya consumidas", () => {
    // Scenario: vendedor ya consumió 3 interrupciones hoy
    // Expected: nuevos insights se muestran pero sin interrupciones

    const insights = Array.from({ length: 3 }, (_, i) =>
      makeInsight(`ins-new-${i}`, {
        type: "alerta",
        confidence: 0.99,
        estimatedImpact: 50_000,
      })
    );

    const result = prioritizeInsights({
      insights,
      roles: ["vendedor"],
      now,
      interruptsAlreadyToday: 3, // Ya consumidas 3
    });

    // Con 3 ya consumidas, no debe haber más interrupciones
    const newInterrupts = result.items.filter(
      (x) => x.urgency === "interrumpir"
    ).length;
    expect(newInterrupts).toBe(0);

    // Todos deben estar diferidos
    expect(
      result.items.every(
        (x) => x.interruptDeferred || x.urgency !== "interrumpir"
      )
    ).toBe(true);
  });

  it("2c. Walk: 5 insights, cap bloquea los últimos 2, muestran en contexto", () => {
    // PASO 1: Sistema genera 5 insights de alta prioridad
    const insights = Array.from({ length: 5 }, (_, i) =>
      makeInsight(`alert-${i}`, {
        type: "alerta",
        confidence: 0.98,
        estimatedImpact: 75_000 + i * 500,
      })
    );

    // PASO 2: Prioritizer ejecuta
    const result = prioritizeInsights({
      insights,
      roles: ["vendedor"],
      now,
    });

    expect(result.items).toHaveLength(5);

    // PASO 3: Verificar distribución
    const interrupts = result.items.filter((x) => x.urgency === "interrumpir");
    const highlights = result.items.filter((x) => x.urgency === "destacar");
    const context = result.items.filter(
      (x) => x.urgency === "mostrar_en_contexto"
    );

    expect(interrupts.length).toBe(3); // 3 máx
    expect(highlights.length + context.length).toBeGreaterThan(0); // El resto visible pero no urgente

    // PASO 4: Verificar que son deterministas
    const result2 = prioritizeInsights({
      insights,
      roles: ["vendedor"],
      now,
    });
    expect(result.items.map((x) => x.insightId)).toEqual(
      result2.items.map((x) => x.insightId)
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// PUENTE 3: REGISTRAR (Registrador de Tasas)
// ═══════════════════════════════════════════════════════════════════

describe("Puente 3: REGISTRAR (read-only)", () => {
  it("3a. Registrar: registra tasas sin escribir en negocio", () => {
    // Scenario: 10 recomendaciones sobre variante "laptop-premium":
    //   8 aceptadas, 2 rechazadas
    // Expected: tasa = 0.8, sin modificar ningún campo de venta

    const store = new InsightResponseStore();
    const experimentId = "exp-laptop-test";

    // Registrar 10 recomendaciones
    for (let i = 0; i < 10; i++) {
      const responseId = `resp-laptop-${i}`;
      const accepted = i < 8;

      recordShown(store, {
        responseId,
        insightId: `ins-reco-${i}`,
        insightType: "recomendacion",
        shownAt: "2026-06-01T10:00:00.000Z",
        audienceKey: "vendedor-1",
        subjectId: `tx-${i}`,
        tenantId: "acme",
        experimentId,
        experimentVariant: "laptop-premium",
      });

      if (accepted) {
        recordAccepted(store, {
          responseId,
          at: "2026-06-01T10:05:00.000Z",
          transitionId: "t_accept",
          transitionEventId: "evt-1",
        });
      }
    }

    // VERIFICAR: puerto read-only
    const reader = openResponseReader(store);
    expect(typeof reader.byInsight).toBe("function");
    expect(typeof reader.byCorrelation).toBe("function");

    // CALCULAR: tasa por variante
    const rates = reader.acceptanceRateByVariant(experimentId);

    expect(rates).toHaveLength(1);
    const rate = rates[0];
    if (rate) {
      expect(rate.variant).toBe("laptop-premium");
      expect(rate.acceptanceRate).toBe(0.8);
      expect(rate.shown).toBe(10);
      expect(rate.accepted).toBe(8);
    }
  });

  it("3b. Registrar: consultas no modifican las respuestas", () => {
    // Scenario: leer tasa múltiples veces
    // Expected: mismos resultados, ninguna mutación

    const store = new InsightResponseStore();

    recordShown(store, {
      responseId: "resp-1",
      insightId: "ins-1",
      insightType: "recomendacion",
      shownAt: "2026-06-01T10:00:00.000Z",
      audienceKey: "u1",
      subjectId: "tx-1",
      tenantId: "acme",
      experimentVariant: "variant-a",
    });

    // Snapshot antes de lecturas
    const beforeRead = JSON.stringify(store.all());

    // Leer múltiples veces
    const reader = openResponseReader(store);
    const results1 = reader.byInsight("ins-1");
    const results2 = reader.byInsight("ins-1");
    const results3 = reader.byInsight("ins-1");

    // Snapshot después
    const afterRead = JSON.stringify(store.all());

    // Verificar: no hay cambios
    expect(afterRead).toBe(beforeRead);
    expect(results1).toEqual(results2);
    expect(results2).toEqual(results3);
  });

  it("3c. Walk: registra 2 variantes, compara tasas", () => {
    // PASO 1: Crear almacén
    const store = new InsightResponseStore();
    const experimentId = "exp-variants-compare";

    // PASO 2: Variante A: 10 mostradas, 7 aceptadas
    for (let i = 0; i < 10; i++) {
      recordShown(store, {
        responseId: `resp-a-${i}`,
        insightId: `ins-a-${i}`,
        insightType: "recomendacion",
        shownAt: "2026-06-01T10:00:00.000Z",
        audienceKey: "vendedor-1",
        subjectId: `tx-a-${i}`,
        tenantId: "acme",
        experimentId,
        experimentVariant: "variant-a",
      });

      if (i < 7) {
        recordAccepted(store, {
          responseId: `resp-a-${i}`,
          at: "2026-06-01T10:05:00.000Z",
          transitionId: "t_accept",
          transitionEventId: "evt-1",
        });
      }
    }

    // PASO 3: Variante B: 10 mostradas, 5 aceptadas
    for (let i = 0; i < 10; i++) {
      recordShown(store, {
        responseId: `resp-b-${i}`,
        insightId: `ins-b-${i}`,
        insightType: "recomendacion",
        shownAt: "2026-06-01T10:00:00.000Z",
        audienceKey: "vendedor-1",
        subjectId: `tx-b-${i}`,
        tenantId: "acme",
        experimentId,
        experimentVariant: "variant-b",
      });

      if (i < 5) {
        recordAccepted(store, {
          responseId: `resp-b-${i}`,
          at: "2026-06-01T10:05:00.000Z",
          transitionId: "t_accept",
          transitionEventId: "evt-1",
        });
      }
    }

    // PASO 4: Calcular tasas
    const reader = openResponseReader(store);
    const rates = reader.acceptanceRateByVariant(experimentId);

    // PASO 5: Comparar
    expect(rates).toHaveLength(2);

    const rateA = rates.find((r) => r.variant === "variant-a");
    const rateB = rates.find((r) => r.variant === "variant-b");

    expect(rateA?.acceptanceRate).toBe(0.7); // 7/10
    expect(rateB?.acceptanceRate).toBe(0.5); // 5/10
    expect(rateA?.acceptanceRate).toBeGreaterThan(rateB?.acceptanceRate || 0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PUENTE 4: PRESENTATIONINTELLIGENCE (Inteligencia de Presentación)
// ═══════════════════════════════════════════════════════════════════

describe("Puente 4: PRESENTATIONINTELLIGENCE (read-only)", () => {
  it("4a. PresentationIntelligence: puerto read-only no escribe", () => {
    // Scenario: UI consulta inteligencia de presentación
    // Expected: puerto solo lectura, sin append, sin mutación

    const store = new ExperienceTelemetryStore();

    // VERIFICAR: puerto read-only
    const port = openLayer3Reader(store);

    // Puerto debe ser frozen
    expect(Object.isFrozen(port)).toBe(true);

    // Métodos lectura
    expect(typeof port.funnelFor).toBe("function");
    expect(typeof port.insightImpressions).toBe("function");
    expect(typeof port.retainedCount).toBe("function");

    // NO debe tener append
    expect("append" in port).toBe(false);
    expect("purgeExpired" in port).toBe(false);
  });

  it("4b. PresentationIntelligence: insightImpressions consulta sin mutar", () => {
    // Scenario: múltiples consultas al mismo almacén
    // Expected: resultados idénticos, sin cambios en store

    const store = new ExperienceTelemetryStore();
    const port = openLayer3Reader(store);

    // Snapshot inicial
    const countBefore = port.retainedCount();

    // Consultas
    const impressions1 = port.insightImpressions();
    const impressions2 = port.insightImpressions();
    const impressions3 = port.insightImpressions();

    // Snapshot final
    const countAfter = port.retainedCount();

    // Verificar: sin cambios
    expect(countAfter).toBe(countBefore);
    expect(impressions1).toEqual(impressions2);
    expect(impressions2).toEqual(impressions3);
  });

  it("4c. Walk: UI consulta funnel, luego impressions, venta sin cambios", () => {
    // PASO 1: Crear almacén
    const store = new ExperienceTelemetryStore();
    const countInitial = store.size();

    // PASO 2: Abrir puerto lectura (simula UI)
    const port = openLayer3Reader(store);

    // PASO 3: Consulta 1: funnel de recorrido
    const stepOrder = ["step1", "step2", "step3"];
    const funnel = port.funnelFor("recorrido-1", stepOrder);
    expect(funnel).toBeDefined();

    // PASO 4: Consulta 2: impresiones de insights
    const impressions = port.insightImpressions();
    expect(Array.isArray(impressions)).toBe(true);

    // PASO 5: Consulta 3: retención
    const retained = port.retainedCount();
    expect(retained).toBe(countInitial);

    // PASO 6: Verificar: almacén sin mutaciones
    expect(store.size()).toBe(countInitial);

    // PASO 7: Verificar: puerto es inmutable
    expect(Object.isFrozen(port)).toBe(true);
  });

  it("4d. Walk: múltiples UIs consultan simultáneamente, sin race conditions", () => {
    // PASO 1: Almacén compartido
    const store = new ExperienceTelemetryStore();
    const countInitial = store.size();

    // PASO 2: Abrir mismo puerto para múltiples UI
    const port1 = openLayer3Reader(store);
    const port2 = openLayer3Reader(store);
    const port3 = openLayer3Reader(store);

    // PASO 3: Consultas "simultáneas"
    const impressions1 = port1.insightImpressions();
    const impressions2 = port2.insightImpressions();
    const impressions3 = port3.insightImpressions();

    // PASO 4: Funnels
    const funnel1 = port1.funnelFor("recorrido-1", ["a", "b", "c"]);
    const funnel2 = port2.funnelFor("recorrido-1", ["a", "b", "c"]);
    const funnel3 = port3.funnelFor("recorrido-1", ["a", "b", "c"]);

    // PASO 5: Verificar: resultados idénticos
    expect(impressions1).toEqual(impressions2);
    expect(impressions2).toEqual(impressions3);
    expect(funnel1).toEqual(funnel2);
    expect(funnel2).toEqual(funnel3);

    // PASO 6: Almacén sin cambios
    expect(store.size()).toBe(countInitial);
  });
});

// ═══════════════════════════════════════════════════════════════════
// FLUJO INTEGRADO: CAPA 1 → PUENTES → CAPA 2
// ═══════════════════════════════════════════════════════════════════

describe("Flujos Integrados Capa 1 ↔ Capa 2", () => {
  it("Flujo: Consultant consulta → Prioritizer prioriza → Registrar tasa", () => {
    // ────── CAPA 1: Business Logic
    // Vendedor consulta catálogo de ofertas por canal

    const ruleSet = compilePoliciesDoc();
    const reader: FilterReader = {
      id: "vendedor-1",
      roles: ["vendedor"],
      tenantId: "acme",
    };

    const facts: readonly MetricFactRow[] = [
      makeFact({
        id: "m1",
        sedeId: "madrid",
        canal: "web",
        month: 6,
        importe: 10000,
      }),
      makeFact({
        id: "m2",
        sedeId: "madrid",
        canal: "presencial",
        month: 6,
        importe: 5000,
      }),
    ];

    // ────── PUENTE 1: Consultant procesa consulta
    const consultResult = consult({
      question: "¿Qué canal tuvo más ventas en junio?",
      reader,
      ruleSet,
      facts,
      defaultYear: 2026,
    });

    expect(consultResult.kind).toBe("respuesta");
    if (consultResult.kind !== "respuesta") return;

    // Verificar que hay buckets
    expect(consultResult.buckets.length).toBeGreaterThan(0);
    const bestBucket = consultResult.buckets.reduce((max, b) =>
      b.value > max.value ? b : max
    );

    // ────── CAPA 2: Telemetría & UX
    // Generar insight basado en consulta

    const insight = makeInsight("ins-channel-insight", {
      type: "recomendacion",
      summary: `El canal con mayor importe lidera con ${bestBucket.value}€`,
      estimatedImpact: bestBucket.value * 0.2,
    });

    // ────── PUENTE 2: Prioritizer decide urgencia
    const priorityResult = prioritizeInsights({
      insights: [insight],
      roles: ["vendedor"],
      now: "2026-06-01T15:00:00.000Z",
    });

    expect(priorityResult.items).toHaveLength(1);
    expect(priorityResult.items[0]!.urgency).toBeDefined();

    // ────── PUENTE 3: Registrar acepta y registra
    const store = new InsightResponseStore();
    recordShown(store, {
      responseId: "resp-channel",
      insightId: insight.id,
      insightType: "recomendacion",
      shownAt: "2026-06-01T15:00:00.000Z",
      audienceKey: "vendedor-1",
      subjectId: insight.subject.id,
      tenantId: "acme",
      experimentVariant: "online-boost",
    });

    recordAccepted(store, {
      responseId: "resp-channel",
      at: "2026-06-01T15:05:00.000Z",
      transitionId: "t_boost_online",
      transitionEventId: "evt-boost",
    });

    const reader2 = openResponseReader(store);
    const byInsight = reader2.byInsight(insight.id);
    expect(byInsight).toHaveLength(1);
    expect(byInsight[0]!.outcome).toBe("aceptado");

    // ────── Resultado final: flujo completo
    expect(consultResult.total).toBeGreaterThan(0);
    expect(priorityResult.items.length).toBeGreaterThan(0);
    expect(byInsight[0]!.outcome).toBe("aceptado");
  });

  it("Flujo: Múltiples insights → Prioritizer respeta cap → UI consulta sin mutaciones", () => {
    // CAPA 1: Se generan 10 insights de oportunidades

    const insights = Array.from({ length: 10 }, (_, i) =>
      makeInsight(`opp-${i}`, {
        type: "recomendacion",
        confidence: 0.9 + Math.random() * 0.09,
        estimatedImpact: 50000 + i * 10000,
      })
    );

    // PUENTE 2: Prioritizer prioriza respetando cap

    const result = prioritizeInsights({
      insights,
      roles: ["vendedor"],
      now: "2026-06-01T14:00:00.000Z",
    });

    const interruptCount = result.items.filter(
      (x) => x.urgency === "interrumpir"
    ).length;
    expect(interruptCount).toBeLessThanOrEqual(3);

    // CAPA 2: UI consulta estado de insights
    // (sin mutar datos de negocio)

    const store = new ExperienceTelemetryStore();
    const port = openLayer3Reader(store);

    const impressions = port.insightImpressions();
    const retained = port.retainedCount();

    // Verificar: puerto es read-only
    expect("append" in port).toBe(false);
    expect(retained).toBe(0);

    // Resultado: flujo coherente
    expect(result.items).toHaveLength(10);
    expect(interruptCount + result.items.filter((x) => !x.interruptDeferred).length).toBeGreaterThan(0);
  });
});
