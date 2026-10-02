/**
 * Capa 2 — Walks de Telemetría (Capa 1 → Capa 2)
 *
 * Walks que demuestran cómo eventos de Capa 1 (transiciones)
 * se transforman en telemetría de Capa 2, sin afectar EventStore.
 *
 * Flujo: Evento de negocio → Bridge → Telemetría UX → Funnel
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore } from "../../core/event-store.js";
import { ExperienceTelemetryStore } from "../../bridges/presentation-intelligence/store.js";
import {
  buildTelemetryRecord,
  pseudonymize,
} from "../../bridges/presentation-intelligence/privacy.js";
import {
  buildRecorridoFunnel,
  topAbandonmentPoints,
} from "../../bridges/presentation-intelligence/funnel.js";
import type {
  ExperienceTelemetryRecord,
  RecorridoFunnel,
} from "../../bridges/presentation-intelligence/types.js";

// ═══════════════════════════════════════════════════════════════
// HELPERS: Simular bridge de Capa 1 → Capa 2
// ═══════════════════════════════════════════════════════════════

/**
 * Simula la telemetrización de un evento de transición de Capa 1.
 * En realidad, esto iría en un bridge/middleware que transforma
 * eventos de negocio en telemetría UX.
 */
function telemetrizarTransicion(input: {
  ventaId: string;
  transitionId: string;
  fromState: string;
  toState: string;
  timestamp: string;
  sessionId: string;
  usuarioId: string;
  durationSinceStart?: number;
  tenantId?: string;
}): ExperienceTelemetryRecord {
  // Mapear transición → paso de experiencia
  const pasoMap: Record<string, string> = {
    t_aceptar: "aceptacion",
    t_iniciar_entrega: "entrega",
    t_cerrar: "cierre",
    t_crear: "creacion",
    t_rechazar: "rechazo",
  };

  const paso = pasoMap[input.transitionId] ?? input.transitionId;

  return buildTelemetryRecord({
    id: `transicion-${input.ventaId}-${Date.now()}`,
    kind: "step_view",
    at: input.timestamp,
    sessionId: input.sessionId,
    actorOrParteId: input.usuarioId,
    tenantId: input.tenantId ?? "default-tenant",
    recorridoId: input.ventaId,
    stepId: paso,
    meta: {
      fromState: input.fromState,
      toState: input.toState,
      durationSinceStart: input.durationSinceStart ?? 0,
    },
  });
}

/**
 * Simula abandono de paso (usuario sale sin continuar).
 */
function telemetrizarAbandon(input: {
  ventaId: string;
  pasoId: string;
  sessionId: string;
  usuarioId: string;
  duracionSegundos: number;
  timestamp: string;
  tenantId?: string;
}): ExperienceTelemetryRecord {
  return buildTelemetryRecord({
    id: `abandon-${input.ventaId}-${input.pasoId}-${Date.now()}`,
    kind: "abandon",
    at: input.timestamp,
    sessionId: input.sessionId,
    actorOrParteId: input.usuarioId,
    tenantId: input.tenantId ?? "default-tenant",
    recorridoId: input.ventaId,
    stepId: input.pasoId,
    dwellMs: input.duracionSegundos * 1000,
  });
}

describe("Capa 2 — Walks de Telemetría (Capa 1 → Capa 2)", () => {
  let eventStore: InMemoryEventStore;
  let telemetryStore: ExperienceTelemetryStore;

  beforeEach(() => {
    eventStore = new InMemoryEventStore();
    telemetryStore = new ExperienceTelemetryStore();
  });

  // ═══════════════════════════════════════════════════════════════
  // WALK 1: Venta Completa → Telemetría por Paso
  // ═══════════════════════════════════════════════════════════════

  it("Walk 1: evento de venta → telemetrización en Capa 2", () => {
    /**
     * Flujo:
     * 1. Transición ACEPTAR → Telemetría
     * 2. Transición ENTREGA → Telemetría
     * 3. Transición CIERRE → Telemetría
     * 4. Verificar que todos se registraron en telemetría
     * 5. Verificar que EventStore se mantiene independiente
     */

    const ventaId = "venta-1";
    const sessionId = "session-user-123";
    const usuarioId = "vendedor-1";
    const now = "2026-10-02T10:00:00.000Z";

    // EVENTO 1: Aceptar (Capa 1 → Capa 2)
    const acceptTelemetry = telemetrizarTransicion({
      ventaId,
      transitionId: "t_aceptar",
      fromState: "propuesta",
      toState: "aceptada",
      timestamp: now,
      sessionId,
      usuarioId,
      durationSinceStart: 300, // 5 minutos
    });

    telemetryStore.append(acceptTelemetry);
    expect(eventStore.all().length).toBe(0); // EventStore sigue vacío

    // EVENTO 2: Entrega
    const entregaTelemetry = telemetrizarTransicion({
      ventaId,
      transitionId: "t_iniciar_entrega",
      fromState: "aceptada",
      toState: "en_entrega",
      timestamp: "2026-10-02T14:00:00.000Z",
      sessionId,
      usuarioId,
      durationSinceStart: 14400, // 4 horas
    });

    telemetryStore.append(entregaTelemetry);

    // EVENTO 3: Cierre
    const cierreTelemetry = telemetrizarTransicion({
      ventaId,
      transitionId: "t_cerrar",
      fromState: "en_entrega",
      toState: "cerrada",
      timestamp: "2026-10-02T17:00:00.000Z",
      sessionId,
      usuarioId,
      durationSinceStart: 25200, // 7 horas
    });

    telemetryStore.append(cierreTelemetry);

    // Verificación: todos los eventos telemetrizados
    const ventaTelemetry = telemetryStore.byRecorrido(ventaId);
    expect(ventaTelemetry).toHaveLength(3);

    // Validar orden y contenido
    expect(ventaTelemetry[0]!.stepId).toBe("aceptacion");
    expect(ventaTelemetry[0]!.kind).toBe("step_view");
    expect(ventaTelemetry[0]!.meta?.fromState).toBe("propuesta");
    expect(ventaTelemetry[0]!.meta?.toState).toBe("aceptada");

    expect(ventaTelemetry[1]!.stepId).toBe("entrega");
    expect(ventaTelemetry[1]!.meta?.fromState).toBe("aceptada");

    expect(ventaTelemetry[2]!.stepId).toBe("cierre");
    expect(ventaTelemetry[2]!.meta?.fromState).toBe("en_entrega");
    expect(ventaTelemetry[2]!.meta?.toState).toBe("cerrada");

    // EventStore sigue independiente
    expect(eventStore.all().length).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════
  // WALK 2: Abandono → Telemetría (SIN afectar EventStore)
  // ═══════════════════════════════════════════════════════════════

  it("Walk 2: usuario abandona → registra en telemetría, NO en eventos", () => {
    /**
     * Flujo operacional:
     * 1. Usuario navega a un paso
     * 2. Usuario abandona (sale sin continuar)
     * 3. Registrar abandono en telemetría
     * 4. Verificar que EventStore NO cambió
     */

    const ventaId = "venta-456";
    const sessionId = "session-user-456";
    const usuarioId = "user-456";

    const eventCountBefore = eventStore.all().length;

    // Usuario abre paso de aceptación
    const step1 = telemetrizarTransicion({
      ventaId,
      transitionId: "t_aceptar",
      fromState: "propuesta",
      toState: "propuesta", // No cambió de estado
      timestamp: "2026-10-02T10:00:00.000Z",
      sessionId,
      usuarioId,
      durationSinceStart: 0,
    });

    telemetryStore.append(step1);

    // Usuario se va después de 45 segundos
    const abandonRecord = telemetrizarAbandon({
      ventaId,
      pasoId: "aceptacion",
      sessionId,
      usuarioId,
      duracionSegundos: 45,
      timestamp: "2026-10-02T10:00:45.000Z",
    });

    telemetryStore.append(abandonRecord);

    // EventStore NO cambió
    expect(eventStore.all().length).toBe(eventCountBefore);

    // TelemetryStore SÍ tiene registros
    const telemetry = telemetryStore.byRecorrido(ventaId);
    expect(telemetry).toHaveLength(2);

    const abandons = telemetry.filter((r) => r.kind === "abandon");
    expect(abandons).toHaveLength(1);
    expect(abandons[0]!.stepId).toBe("aceptacion");
    expect(abandons[0]!.dwellMs).toBe(45000);
  });

  // ═══════════════════════════════════════════════════════════════
  // WALK 3: Funnel Analysis (identifica paso problemático)
  // ═══════════════════════════════════════════════════════════════

  it("Walk 3: funnel identifica que 60% abandona en paso 2", () => {
    /**
     * Flujo operacional:
     * 1. Simular 100 usuarios navegando
     * 2. 60 abandonan en paso-2
     * 3. 30 abandonan en paso-3
     * 4. 10 completan (no registrar abandono)
     * 5. Análisis: identificar paso problemático
     */

    const recorridoId = "venta-funnel-test";
    const stepOrder = ["paso-1", "paso-2", "paso-3", "paso-4"];
    const now = "2026-10-02T10:00:00.000Z";

    // Simular 100 usuarios
    for (let i = 1; i <= 100; i++) {
      const sessionId = `session-user-${i}`;
      const usuarioId = `user-${i}`;

      // Todos pasan por paso-1
      const step1 = buildTelemetryRecord({
        id: `view-paso1-${i}`,
        kind: "step_view",
        at: now,
        sessionId,
        actorOrParteId: usuarioId,
        tenantId: "tenant-1",
        recorridoId,
        stepId: "paso-1",
      });
      telemetryStore.append(step1);

      if (i <= 60) {
        // 60 abandonan en paso-2
        const abandon = buildTelemetryRecord({
          id: `abandon-paso2-${i}`,
          kind: "abandon",
          at: "2026-10-02T10:05:00.000Z",
          sessionId,
          actorOrParteId: usuarioId,
          tenantId: "tenant-1",
          recorridoId,
          stepId: "paso-2",
          dwellMs: Math.random() * 60000, // 0-60 segundos
        });
        telemetryStore.append(abandon);
      } else if (i <= 90) {
        // 30 pasan paso-2 y abandonan en paso-3
        const step2 = buildTelemetryRecord({
          id: `view-paso2-${i}`,
          kind: "step_view",
          at: "2026-10-02T10:05:00.000Z",
          sessionId,
          actorOrParteId: usuarioId,
          tenantId: "tenant-1",
          recorridoId,
          stepId: "paso-2",
        });
        telemetryStore.append(step2);

        const abandon = buildTelemetryRecord({
          id: `abandon-paso3-${i}`,
          kind: "abandon",
          at: "2026-10-02T10:10:00.000Z",
          sessionId,
          actorOrParteId: usuarioId,
          tenantId: "tenant-1",
          recorridoId,
          stepId: "paso-3",
          dwellMs: Math.random() * 120000,
        });
        telemetryStore.append(abandon);
      }
      // 10 últimos completan (no registrar abandono)
    }

    // Construir funnel
    const funnel: RecorridoFunnel = buildRecorridoFunnel(
      recorridoId,
      telemetryStore.all(),
      stepOrder,
    );

    // Análisis: paso-2 es el problema
    expect(funnel.topAbandonStepId).toBe("paso-2");

    const paso2Stats = funnel.steps.find((s) => s.stepId === "paso-2");
    expect(paso2Stats).toBeDefined();
    expect(paso2Stats!.abandons).toBe(60); // 60 abandonos

    const paso3Stats = funnel.steps.find((s) => s.stepId === "paso-3");
    expect(paso3Stats!.abandons).toBe(30); // 30 abandonos

    const paso4Stats = funnel.steps.find((s) => s.stepId === "paso-4");
    expect(paso4Stats!.abandons).toBe(0); // Nadie llega a paso-4

    // Top abandonment points (ranking)
    const topPoints = topAbandonmentPoints(funnel, 5);
    expect(topPoints).toHaveLength(2); // Solo paso-2 y paso-3 tienen abandonos
    expect(topPoints[0]!.stepId).toBe("paso-2"); // Mayor abandono
    expect(topPoints[0]!.abandons).toBe(60);
    expect(topPoints[1]!.stepId).toBe("paso-3");
    expect(topPoints[1]!.abandons).toBe(30);

    // Información de sesiones
    expect(funnel.totalSessionsApprox).toBe(100);
  });

  // ═══════════════════════════════════════════════════════════════
  // WALK 4: Seudonimización End-to-End
  // ═══════════════════════════════════════════════════════════════

  it("Walk 4: seudonimización mantiene privacidad end-to-end", () => {
    /**
     * Validar que:
     * 1. IDs originales se transforman en hashes
     * 2. Múltiples eventos del mismo usuario → mismo pseudoId
     * 3. Diferentes usuarios → diferentes pseudoIds
     * 4. JSON de telemetría no contiene IDs en claro
     */

    const usuarioId1 = "user-secret-123";
    const usuarioId2 = "user-secret-456";
    const sessionId1 = "session-secret-abc";
    const sessionId2 = "session-secret-xyz";
    const tenantId = "tenant-secret-1";

    // Evento 1: usuario 1, sesión 1
    const record1 = buildTelemetryRecord({
      id: "event-1",
      kind: "step_view",
      at: "2026-10-02T10:00:00.000Z",
      sessionId: sessionId1,
      actorOrParteId: usuarioId1,
      tenantId,
      recorridoId: "venta-1",
      stepId: "paso-1",
    });

    // Evento 2: mismo usuario 1, pero sesión diferente
    const record2 = buildTelemetryRecord({
      id: "event-2",
      kind: "step_view",
      at: "2026-10-02T10:05:00.000Z",
      sessionId: sessionId2, // Sesión diferente
      actorOrParteId: usuarioId1, // Mismo usuario
      tenantId,
      recorridoId: "venta-2",
      stepId: "paso-2",
    });

    // Evento 3: usuario diferente
    const record3 = buildTelemetryRecord({
      id: "event-3",
      kind: "step_view",
      at: "2026-10-02T10:10:00.000Z",
      sessionId: sessionId1,
      actorOrParteId: usuarioId2, // Usuario diferente
      tenantId,
      recorridoId: "venta-1",
      stepId: "paso-2",
    });

    telemetryStore.append(record1);
    telemetryStore.append(record2);
    telemetryStore.append(record3);

    // Verificar seudonimización determinista
    expect(record1.subjectPseudoId).toBe(record2.subjectPseudoId); // Mismo usuario
    expect(record1.sessionPseudoId).not.toBe(record2.sessionPseudoId); // Sesiones diferentes
    expect(record1.subjectPseudoId).not.toBe(record3.subjectPseudoId); // Usuarios diferentes
    expect(record1.tenantPseudoId).toBe(record3.tenantPseudoId); // Mismo tenant

    // JSON no contiene IDs en claro
    const json = JSON.stringify([record1, record2, record3]);
    expect(json).not.toContain(usuarioId1);
    expect(json).not.toContain(usuarioId2);
    expect(json).not.toContain(sessionId1);
    expect(json).not.toContain(sessionId2);
    expect(json).not.toContain(tenantId);

    // Los pseudoIds son hashes válidos
    expect(record1.subjectPseudoId).toMatch(/^[a-f0-9]{32}$/);
    expect(record1.sessionPseudoId).toMatch(/^[a-f0-9]{32}$/);
    expect(record1.tenantPseudoId).toMatch(/^[a-f0-9]{32}$/);
  });

  // ═══════════════════════════════════════════════════════════════
  // WALK 5: Múltiples Recorridos en Paralelo
  // ═══════════════════════════════════════════════════════════════

  it("Walk 5: múltiples recorridos se rastrean independientemente", () => {
    /**
     * Validar que:
     * 1. Dos recorridos paralelos no se interfieren
     * 2. Cada uno mantiene su historial independiente
     * 3. Funnel por recorrido es correcto
     */

    const recorrido1 = "venta-A";
    const recorrido2 = "venta-B";

    // Recorrido 1: 3 eventos
    for (let i = 0; i < 3; i++) {
      const record = buildTelemetryRecord({
        id: `event-rec1-${i}`,
        kind: "step_view",
        at: "2026-10-02T10:00:00.000Z",
        sessionId: `session-rec1-${i}`,
        actorOrParteId: `user-rec1-${i}`,
        tenantId: "tenant-1",
        recorridoId: recorrido1,
        stepId: `paso-${i + 1}`,
      });
      telemetryStore.append(record);
    }

    // Recorrido 2: 2 eventos
    for (let i = 0; i < 2; i++) {
      const record = buildTelemetryRecord({
        id: `event-rec2-${i}`,
        kind: "step_view",
        at: "2026-10-02T10:00:00.000Z",
        sessionId: `session-rec2-${i}`,
        actorOrParteId: `user-rec2-${i}`,
        tenantId: "tenant-1",
        recorridoId: recorrido2,
        stepId: `paso-${i + 1}`,
      });
      telemetryStore.append(record);
    }

    // Verificar independencia
    const rec1Data = telemetryStore.byRecorrido(recorrido1);
    const rec2Data = telemetryStore.byRecorrido(recorrido2);

    expect(rec1Data).toHaveLength(3);
    expect(rec2Data).toHaveLength(2);
    expect(telemetryStore.size()).toBe(5);

    // Funnel de cada recorrido
    const funnel1 = buildRecorridoFunnel(recorrido1, telemetryStore.all(), [
      "paso-1",
      "paso-2",
      "paso-3",
    ]);
    const funnel2 = buildRecorridoFunnel(recorrido2, telemetryStore.all(), [
      "paso-1",
      "paso-2",
      "paso-3",
    ]);

    expect(funnel1.steps.length).toBeGreaterThan(0);
    expect(funnel2.steps.length).toBeGreaterThan(0);
    expect(funnel1.recorridoId).toBe(recorrido1);
    expect(funnel2.recorridoId).toBe(recorrido2);
  });
});
