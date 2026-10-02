/**
 * Capa 2 — Telemetría y Analítica (6 Checks)
 *
 * Tests unitarios para los 6 checks de Capa 2 auditados:
 * 1. Abandon NO escribe en EventStore
 * 2. Funnel identifica top abandon step
 * 3. Telemetría NO tiene PII en claro
 * 4. Retención 90 días
 * 5. Vista de inteligencia read-only
 * 6. TelemetryStore separado de EventStore
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore } from "../../core/event-store.js";
import { ExperienceTelemetryStore } from "../../bridges/presentation-intelligence/store.js";
import {
  buildTelemetryRecord,
  ExperiencePrivacyError,
} from "../../bridges/presentation-intelligence/privacy.js";
import { buildRecorridoFunnel } from "../../bridges/presentation-intelligence/funnel.js";
import type {
  ExperienceTelemetryRecord,
  RecorridoFunnel,
  FunnelStepStats,
} from "../../bridges/presentation-intelligence/types.js";

// ═══════════════════════════════════════════════════════════════
// TEST 1: Abandon NO escribe en EventStore
// ═══════════════════════════════════════════════════════════════

describe("Capa 2 — Telemetría y Analítica (6 Checks)", () => {
  let eventStore: InMemoryEventStore;
  let telemetryStore: ExperienceTelemetryStore;

  beforeEach(() => {
    eventStore = new InMemoryEventStore();
    telemetryStore = new ExperienceTelemetryStore();
  });

  it("1. Abandon NO escribe business events en EventStore", () => {
    const eventStoreSize = eventStore.all().length;

    // Usuario abandona flujo: registrar en telemetría, NO en EventStore
    const abandonRecord = buildTelemetryRecord({
      id: "abandon-1",
      kind: "abandon",
      at: "2026-10-02T10:00:45.000Z",
      sessionId: "session-123",
      actorOrParteId: "user-1",
      tenantId: "tenant-1",
      recorridoId: "venta-123",
      stepId: "paso-2",
      dwellMs: 45000,
    });

    telemetryStore.append(abandonRecord);

    // EventStore NO cambió
    expect(eventStore.all().length).toBe(eventStoreSize);

    // TelemetryStore SÍ tiene el registro
    const telemetry = telemetryStore.byRecorrido("venta-123");
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]!.kind).toBe("abandon");
    expect(telemetry[0]!.dwellMs).toBe(45000);
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST 2: Funnel identifica top abandon step
  // ═══════════════════════════════════════════════════════════════

  it("2. Funnel identifica en qué paso se abandona más", () => {
    const recorridoId = "venta-456";
    const stepOrder = ["paso-1", "paso-2", "paso-3", "paso-4"];

    // Simular 100 usuarios abandonando en diferentes pasos
    const records: ExperienceTelemetryRecord[] = [];

    // 60 abandonan en paso-2
    for (let i = 0; i < 60; i++) {
      records.push(
        buildTelemetryRecord({
          id: `abandon-paso2-${i}`,
          kind: "abandon",
          at: "2026-10-02T10:00:00.000Z",
          sessionId: `session-${i}`,
          actorOrParteId: `user-${i}`,
          tenantId: "tenant-1",
          recorridoId,
          stepId: "paso-2",
        }),
      );
    }

    // 30 abandonan en paso-3
    for (let i = 0; i < 30; i++) {
      records.push(
        buildTelemetryRecord({
          id: `abandon-paso3-${i}`,
          kind: "abandon",
          at: "2026-10-02T10:00:00.000Z",
          sessionId: `session-paso3-${i}`,
          actorOrParteId: `user-paso3-${i}`,
          tenantId: "tenant-1",
          recorridoId,
          stepId: "paso-3",
        }),
      );
    }

    // 10 abandonan en paso-4
    for (let i = 0; i < 10; i++) {
      records.push(
        buildTelemetryRecord({
          id: `abandon-paso4-${i}`,
          kind: "abandon",
          at: "2026-10-02T10:00:00.000Z",
          sessionId: `session-paso4-${i}`,
          actorOrParteId: `user-paso4-${i}`,
          tenantId: "tenant-1",
          recorridoId,
          stepId: "paso-4",
        }),
      );
    }

    // Agregar a store
    for (const record of records) {
      telemetryStore.append(record);
    }

    // Construir funnel
    const funnel: RecorridoFunnel = buildRecorridoFunnel(
      recorridoId,
      telemetryStore.all(),
      stepOrder,
    );

    // Verificar que paso-2 es el top abandon step
    expect(funnel.topAbandonStepId).toBe("paso-2");

    // Verificar estadísticas del paso
    const paso2Stats = funnel.steps.find((s) => s.stepId === "paso-2");
    expect(paso2Stats).toBeDefined();
    expect(paso2Stats!.abandons).toBe(60);

    const paso3Stats = funnel.steps.find((s) => s.stepId === "paso-3");
    expect(paso3Stats!.abandons).toBe(30);

    const paso4Stats = funnel.steps.find((s) => s.stepId === "paso-4");
    expect(paso4Stats!.abandons).toBe(10);
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST 3: Telemetría NO tiene PII en claro
  // ═══════════════════════════════════════════════════════════════

  it("3. Telemetría NO contiene PII en texto plano", () => {
    // buildTelemetryRecord seudonimiza automáticamente y valida privacidad
    const record = buildTelemetryRecord({
      id: "event-1",
      kind: "step_view",
      at: "2026-10-02T10:00:00.000Z",
      sessionId: "session-123", // Se seudonimizará
      actorOrParteId: "cli-123", // Se seudonimizará
      tenantId: "tenant-1", // Se seudonimizará
      recorridoId: "venta-456",
      stepId: "paso-1",
    });

    // JSON no debe contener IDs originales
    const jsonStr = JSON.stringify(record);

    // No debe contener el ID de cliente original
    expect(jsonStr).not.toContain("cli-123");
    expect(jsonStr).not.toContain("session-123");

    // Los pseudoIds deben ser hashes
    expect(record.subjectPseudoId).toBeDefined();
    expect(record.subjectPseudoId).toHaveLength(32); // SHA256 slice(0, 32)
    expect(record.sessionPseudoId).toBeDefined();
    expect(record.sessionPseudoId).toHaveLength(32);
  });

  // Test que intenta PII en claro → debe fallar
  it("3b. Reject PII en claro (email)", () => {
    // No se puede pasar un email directamente en meta
    // Si lo intentamos, la validación debe rechazarlo
    expect(() => {
      buildTelemetryRecord({
        id: "bad-pii-1",
        kind: "step_view",
        at: "2026-10-02T10:00:00.000Z",
        sessionId: "session-123",
        actorOrParteId: "user-1",
        tenantId: "tenant-1",
        recorridoId: "venta-1",
        stepId: "paso-1",
        meta: {
          email: "juan@example.com", // Esto causa error
        },
      });
    }).toThrow(ExperiencePrivacyError);
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST 4: Retención 90 días
  // ═══════════════════════════════════════════════════════════════

  it("4. Datos de telemetría se borran después de 90 días", () => {
    const now = "2026-10-02T10:00:00.000Z";

    // Registrar evento con fecha antigua (91 días atrás)
    const hace91Dias = new Date(Date.parse(now));
    hace91Dias.setDate(hace91Dias.getDate() - 91);

    const oldRecord = buildTelemetryRecord({
      id: "old-event",
      kind: "abandon",
      at: hace91Dias.toISOString(),
      sessionId: "session-old",
      actorOrParteId: "user-old",
      tenantId: "tenant-1",
      recorridoId: "venta-old",
      stepId: "paso-1",
    });

    telemetryStore.append(oldRecord);

    // Verificar que está en el store
    expect(telemetryStore.size()).toBe(1);

    // Ejecutar limpieza con retención de 90 días
    const removed = telemetryStore.purgeExpired(now, 90);

    // Evento debe estar borrado
    expect(removed).toBe(1);
    expect(telemetryStore.size()).toBe(0);
  });

  it("4b. Datos recientes NO se borran (< 90 días)", () => {
    const now = "2026-10-02T10:00:00.000Z";

    // Registrar evento con fecha reciente (30 días atrás)
    const hace30Dias = new Date(Date.parse(now));
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    const recentRecord = buildTelemetryRecord({
      id: "recent-event",
      kind: "step_view",
      at: hace30Dias.toISOString(),
      sessionId: "session-recent",
      actorOrParteId: "user-recent",
      tenantId: "tenant-1",
      recorridoId: "venta-recent",
      stepId: "paso-1",
    });

    telemetryStore.append(recentRecord);

    // Ejecutar limpieza con retención de 90 días
    const removed = telemetryStore.purgeExpired(now, 90);

    // Evento debe permanecer
    expect(removed).toBe(0);
    expect(telemetryStore.size()).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST 5: Vista de inteligencia read-only
  // ═══════════════════════════════════════════════════════════════

  it("5. Vista de inteligencia (BI) es read-only", () => {
    const recorridoId = "venta-100";

    // Registrar algunos eventos
    for (let i = 0; i < 3; i++) {
      const record = buildTelemetryRecord({
        id: `event-${i}`,
        kind: "step_view",
        at: "2026-10-02T10:00:00.000Z",
        sessionId: `session-${i}`,
        actorOrParteId: `user-${i}`,
        tenantId: "tenant-1",
        recorridoId,
        stepId: "paso-1",
      });
      telemetryStore.append(record);
    }

    // Capturar snapshot de datos
    const allBefore = telemetryStore.all();
    const byRecorridoBefore = telemetryStore.byRecorrido(recorridoId);
    const sizeBefore = telemetryStore.size();

    // Simular múltiples consultas de inteligencia (read-only)
    for (let i = 0; i < 5; i++) {
      const insights = telemetryStore.all();
      expect(insights).toBeDefined();

      const recData = telemetryStore.byRecorrido(recorridoId);
      expect(recData).toBeDefined();
    }

    // Verificar que nada cambió
    expect(telemetryStore.all()).toEqual(allBefore);
    expect(telemetryStore.byRecorrido(recorridoId)).toEqual(byRecorridoBefore);
    expect(telemetryStore.size()).toBe(sizeBefore);
  });

  // ═══════════════════════════════════════════════════════════════
  // TEST 6: TelemetryStore separado de EventStore
  // ═══════════════════════════════════════════════════════════════

  it("6. TelemetryStore y EventStore son independientes", () => {
    // Ambos stores inician vacíos
    expect(eventStore.all().length).toBe(0);
    expect(telemetryStore.size()).toBe(0);

    // Escribir telemetría
    const telemetryRecord = buildTelemetryRecord({
      id: "telemetry-1",
      kind: "abandon",
      at: "2026-10-02T10:00:00.000Z",
      sessionId: "session-1",
      actorOrParteId: "user-1",
      tenantId: "tenant-1",
      recorridoId: "venta-1",
      stepId: "paso-2",
      dwellMs: 30000,
    });

    telemetryStore.append(telemetryRecord);

    // Verificar independencia
    expect(eventStore.all().length).toBe(0); // EventStore sigue vacío
    expect(telemetryStore.size()).toBe(1); // TelemetryStore tiene el registro

    // Verificar que la lectura de telemetría no afecta EventStore
    const readTelemetry = telemetryStore.byRecorrido("venta-1");
    expect(readTelemetry).toHaveLength(1);
    expect(eventStore.all().length).toBe(0); // EventStore sigue intacto
  });

  it("6b. Borrar en TelemetryStore no afecta EventStore", () => {
    // Registrar telemetría
    const record = buildTelemetryRecord({
      id: "telemetry-2",
      kind: "step_view",
      at: "2026-10-02T10:00:00.000Z",
      sessionId: "session-2",
      actorOrParteId: "user-2",
      tenantId: "tenant-1",
      recorridoId: "venta-2",
      stepId: "paso-1",
    });

    telemetryStore.append(record);
    expect(telemetryStore.size()).toBe(1);

    // Limpiar telemetría antigua (aunque este es reciente, simular limpieza)
    const removed = telemetryStore.purgeExpired("2200-01-01T00:00:00.000Z", 0);
    expect(removed).toBe(1);
    expect(telemetryStore.size()).toBe(0);

    // EventStore sigue siendo independiente
    expect(eventStore.all().length).toBe(0);
  });
});
