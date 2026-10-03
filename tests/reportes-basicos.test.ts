/**
 * Tests para reportes básicos: ventas, cobros, impagos, ciclos.
 */

import { describe, expect, it } from "vitest";
import { AppRuntime } from "../web/runtime.js";
import {
  generarReporteVentas,
  generarReporteCobros,
  generarReporteImpagos,
  generarReporteCiclos,
} from "../generator/reportes.js";
import { buildConcesionariaGeneratorInputWithComposition } from "../generator/packs/concesionaria.js";
import { generateUiSpec } from "../generator/generate.js";
import type { TransitionEvent } from "../core/events.js";

describe("Reportes Básicos", () => {
  it("genera reporte de ventas correctamente", () => {
    // Crear un AppRuntime mock con datos de prueba
    const input = buildConcesionariaGeneratorInputWithComposition();
    const spec = generateUiSpec(input);
    const boot = {
      profileId: "test-profile",
      spec,
      input,
    };

    const runtime = AppRuntime.open(boot as any, {
      dbPath: ":memory:",
      tenantId: "test",
    });

    // Agregar eventos simulados de ventas
    const hoy = new Date();
    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1);

    for (let i = 0; i < 5; i++) {
      const event: TransitionEvent = {
        id: `evt-venta-${i}`,
        kind: "transicion",
        subjectId: runtime.subjects[i]?.id || `tx-test-${i}`,
        occurredAt: new Date(
          mesAnterior.getFullYear(),
          mesAnterior.getMonth(),
          1 + i
        ).toISOString(),
        actorId: "user-test",
        actorKind: "humano",
        transitionId: "t_crear",
        fromStateId: "inicial",
        toStateId: "creado",
        evidence: {
          kind: "aceptacion",
          reference: "test",
          recordedAt: new Date().toISOString(),
        },
        data: {
          monto: 1000 + i * 100,
          cliente: `cliente-${i}`,
        },
      };
      runtime.store.append(event);
    }

    // Generar reporte
    const reporte = generarReporteVentas(runtime, {
      desde: mesAnterior,
      hasta: hoy,
    });

    // Verificaciones
    expect(reporte.totalVendido).toBeGreaterThan(0);
    expect(reporte.numeroExpedientes).toBeGreaterThan(0);
    expect(reporte.promedioVenta).toBeGreaterThan(0);
    expect(reporte.expedientesCreados).toBeGreaterThanOrEqual(0);

    runtime.close();
  });

  it("genera reporte de cobros correctamente", () => {
    const input = buildConcesionariaGeneratorInputWithComposition();
    const spec = generateUiSpec(input);
    const boot = {
      profileId: "test-profile",
      spec,
      input,
    };

    const runtime = AppRuntime.open(boot as any, {
      dbPath: ":memory:",
      tenantId: "test",
    });

    const hoy = new Date();
    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1);

    // Agregar eventos de cobros
    for (let i = 0; i < 3; i++) {
      const event: TransitionEvent = {
        id: `evt-cobro-${i}`,
        kind: "transicion",
        subjectId: runtime.subjects[i]?.id || `tx-test-${i}`,
        occurredAt: new Date(
          mesAnterior.getFullYear(),
          mesAnterior.getMonth(),
          5 + i
        ).toISOString(),
        actorId: "user-test",
        actorKind: "humano",
        transitionId: "t_cobrar",
        fromStateId: "creado",
        toStateId: "cobrado",
        evidence: {
          kind: "aceptacion",
          reference: "test",
          recordedAt: new Date().toISOString(),
        },
        data: {
          monto: 500 + i * 100,
          medioDePago: i % 2 === 0 ? "efectivo" : "transferencia",
        },
      };
      runtime.store.append(event);
    }

    const reporte = generarReporteCobros(runtime, {
      desde: mesAnterior,
      hasta: hoy,
    });

    expect(reporte.totalCobrado).toBeGreaterThan(0);
    expect(reporte.numeroCobros).toBeGreaterThan(0);
    expect(Object.keys(reporte.pormedioDePago).length).toBeGreaterThan(0);

    runtime.close();
  });

  it("genera reporte de ciclos correctamente", () => {
    const input = buildConcesionariaGeneratorInputWithComposition();
    const spec = generateUiSpec(input);
    const boot = {
      profileId: "test-profile",
      spec,
      input,
    };

    const runtime = AppRuntime.open(boot as any, {
      dbPath: ":memory:",
      tenantId: "test",
    });

    const hoy = new Date();
    const hace30Dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);

    const reporte = generarReporteCiclos(runtime, {
      desde: hace30Dias,
      hasta: hoy,
    });

    expect(reporte.porTipo).toBeDefined();
    expect(typeof reporte.porTipo === "object").toBe(true);

    runtime.close();
  });
});
