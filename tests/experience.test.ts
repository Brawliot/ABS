/**
 * Criterios MVP Observador de experiencia (puente presentation-intelligence):
 * - Abandonar formulario ≠ evento de negocio
 * - Embudo identifica paso con más abandonos
 * - Ningún registro con PII en claro
 * - Capa 3 solo lee vía Layer3PresentationIntelligence
 */

import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "../core/event-store.js";
import {
  ExperiencePrivacyError,
  ExperienceTelemetryStore,
  TELEMETRY_RETENTION_DAYS,
  asReadOnlyView,
  assertLayer3ReadOnlyPort,
  assertTelemetryPrivacy,
  buildInsightShownRecord,
  buildRecorridoFunnel,
  buildTelemetryRecord,
  openLayer3Reader,
  recordAbandonWithoutBusinessEvent,
  topAbandonmentPoints,
} from "../bridges/presentation-intelligence/index.js";

const STEPS = ["datos", "pago", "confirmacion"] as const;
const RECORRIDO = "venta_cliente_web";

function rec(
  partial: Parameters<typeof buildTelemetryRecord>[0],
) {
  return buildTelemetryRecord(partial);
}

describe("Observador de experiencia MVP", () => {
  it("abandonar un formulario no genera ningún evento de negocio", () => {
    const business = new InMemoryEventStore();
    const telemetry = new ExperienceTelemetryStore();
    const abandon = rec({
      id: "ux-abandon-1",
      kind: "abandon",
      at: "2026-06-01T12:00:00.000Z",
      sessionId: "sess-form-99",
      actorOrParteId: "parte-clara-maria@ejemplo.com",
      tenantId: "acme",
      recorridoId: RECORRIDO,
      stepId: "pago",
    });

    const { businessEventCount } = recordAbandonWithoutBusinessEvent({
      telemetry,
      businessStore: business,
      record: abandon,
    });

    expect(businessEventCount).toBe(0);
    expect(business.all()).toHaveLength(0);
    expect(telemetry.size()).toBe(1);
    expect(telemetry.all()[0]!.kind).toBe("abandon");
    // Seudónimo: el email en claro no aparece en el registro
    expect(JSON.stringify(telemetry.all()[0])).not.toContain(
      "maria@ejemplo.com",
    );
  });

  it("el embudo identifica el paso con más abandonos en un recorrido de prueba", () => {
    const telemetry = new ExperienceTelemetryStore();
    const base = {
      at: "2026-06-01T12:00:00.000Z",
      actorOrParteId: "actor-x",
      tenantId: "acme",
      recorridoId: RECORRIDO,
    };

    // Embudo: todos ven datos; muchos abandonan en pago
    for (let i = 0; i < 10; i++) {
      telemetry.append(
        rec({
          ...base,
          id: `v-datos-${i}`,
          kind: "step_view",
          sessionId: `s-${i}`,
          stepId: "datos",
        }),
      );
      telemetry.append(
        rec({
          ...base,
          id: `d-datos-${i}`,
          kind: "step_dwell",
          sessionId: `s-${i}`,
          stepId: "datos",
          dwellMs: 1200,
        }),
      );
      telemetry.append(
        rec({
          ...base,
          id: `v-pago-${i}`,
          kind: "step_view",
          sessionId: `s-${i}`,
          stepId: "pago",
        }),
      );
    }
    for (let i = 0; i < 7; i++) {
      telemetry.append(
        rec({
          ...base,
          id: `ab-pago-${i}`,
          kind: "abandon",
          sessionId: `s-${i}`,
          stepId: "pago",
        }),
      );
    }
    for (let i = 7; i < 10; i++) {
      telemetry.append(
        rec({
          ...base,
          id: `v-conf-${i}`,
          kind: "step_view",
          sessionId: `s-${i}`,
          stepId: "confirmacion",
        }),
      );
    }
    telemetry.append(
      rec({
        ...base,
        id: "ab-datos-extra",
        kind: "abandon",
        sessionId: "s-extra",
        stepId: "datos",
      }),
    );
    telemetry.append(
      rec({
        ...base,
        id: "err-pago",
        kind: "error",
        sessionId: "s-err",
        stepId: "pago",
        errorCode: "timeout_gateway",
      }),
    );
    telemetry.append(
      rec({
        ...base,
        id: "judge-pago",
        kind: "judge_rejection_shown",
        sessionId: "s-judge",
        stepId: "pago",
        judgeRejectionCode: "permiso_denegado",
      }),
    );

    const funnel = buildRecorridoFunnel(
      RECORRIDO,
      telemetry.all(),
      STEPS,
    );
    expect(funnel.topAbandonStepId).toBe("pago");
    expect(topAbandonmentPoints(funnel)[0]!.stepId).toBe("pago");
    expect(funnel.steps.find((s) => s.stepId === "pago")!.abandons).toBe(7);
    expect(funnel.steps.find((s) => s.stepId === "datos")!.abandons).toBe(1);
  });

  it("ningún registro de telemetría contiene datos personales en claro", () => {
    const ok = rec({
      id: "ux-ok",
      kind: "step_view",
      at: "2026-06-01T12:00:00.000Z",
      sessionId: "sess-1",
      actorOrParteId: "Ana García <ana.garcia@corp.es>",
      tenantId: "tenant-acme",
      recorridoId: RECORRIDO,
      stepId: "datos",
    });
    expect(ok.subjectPseudoId).not.toContain("@");
    expect(ok.subjectPseudoId).not.toContain("Ana");
    expect(JSON.stringify(ok)).not.toMatch(/ana\.garcia/i);
    expect(() => assertTelemetryPrivacy(ok)).not.toThrow();

    expect(() =>
      assertTelemetryPrivacy({
        ...ok,
        meta: { email: "filtrado@corp.es" },
      }),
    ).toThrow(ExperiencePrivacyError);

    expect(() =>
      assertTelemetryPrivacy({
        ...ok,
        meta: { note: "contactar filtrado@corp.es" },
      }),
    ).toThrow(ExperiencePrivacyError);
  });

  it("retención 90 días y vista solo lectura", () => {
    const store = new ExperienceTelemetryStore();
    store.append(
      rec({
        id: "old",
        kind: "step_view",
        at: "2026-01-01T00:00:00.000Z",
        sessionId: "s1",
        actorOrParteId: "a1",
        tenantId: "t1",
        recorridoId: RECORRIDO,
        stepId: "datos",
      }),
    );
    store.append(
      rec({
        id: "new",
        kind: "step_view",
        at: "2026-06-01T00:00:00.000Z",
        sessionId: "s2",
        actorOrParteId: "a2",
        tenantId: "t1",
        recorridoId: RECORRIDO,
        stepId: "datos",
      }),
    );
    expect(TELEMETRY_RETENTION_DAYS).toBe(90);
    const removed = store.purgeExpired("2026-06-15T00:00:00.000Z", 90);
    expect(removed).toBe(1);
    expect(store.size()).toBe(1);
    expect(store.all()[0]!.id).toBe("new");

    const view = asReadOnlyView(store);
    expect(view.size()).toBe(1);
    expect(view.all()).toHaveLength(1);
    // Sin método append en la vista
    expect("append" in view).toBe(false);
  });

  it("capa 3 solo lee a través de la interfaz (sin almacén)", () => {
    const store = new ExperienceTelemetryStore();
    store.append(
      rec({
        id: "v1",
        kind: "step_view",
        at: "2026-06-01T12:00:00.000Z",
        sessionId: "s1",
        actorOrParteId: "actor-1",
        tenantId: "acme",
        recorridoId: RECORRIDO,
        stepId: "pago",
      }),
    );
    store.append(
      rec({
        id: "ab1",
        kind: "abandon",
        at: "2026-06-01T12:01:00.000Z",
        sessionId: "s1",
        actorOrParteId: "actor-1",
        tenantId: "acme",
        recorridoId: RECORRIDO,
        stepId: "pago",
      }),
    );
    store.append(
      buildInsightShownRecord({
        id: "ins-1",
        at: "2026-06-01T12:00:30.000Z",
        sessionId: "s1",
        actorOrParteId: "actor-1",
        tenantId: "acme",
        recorridoId: RECORRIDO,
        stepId: "pago",
        insightId: "insight.descuento_segmento",
        insightSurfaceId: "modulo.pago.panel",
        insightPlacement: "banner_superior",
        correlationId: "resp-corr-99",
      }),
    );

    const layer3 = openLayer3Reader(store);
    assertLayer3ReadOnlyPort(layer3);
    expect("append" in layer3).toBe(false);
    expect("all" in layer3).toBe(false);
    expect("purgeExpired" in layer3).toBe(false);

    const funnel = layer3.funnelFor(RECORRIDO, STEPS);
    expect(funnel.topAbandonStepId).toBe("pago");
    expect(layer3.topAbandonments(RECORRIDO, STEPS)[0]!.stepId).toBe("pago");

    const impressions = layer3.insightImpressions();
    expect(impressions).toHaveLength(1);
    expect(impressions[0]!.insightId).toBe("insight.descuento_segmento");
    expect(impressions[0]!.surfaceId).toBe("modulo.pago.panel");
    expect(impressions[0]!.subjectPseudoId).not.toBe("actor-1");
    expect(JSON.stringify(impressions[0])).not.toContain("actor-1");

    const related = layer3.impressionsForCorrelation("resp-corr-99");
    expect(related).toHaveLength(1);
    expect(related[0]!.recordId).toBe("ins-1");
    expect(layer3.impressionsForCorrelation("otro")).toHaveLength(0);
  });
});
