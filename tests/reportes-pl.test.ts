/**
 * Tests para reporte P&L y márgenes.
 */

import { describe, expect, it } from "vitest";
import { AppRuntime } from "../web/runtime.js";
import { generarReporteP_L, rentabilidadCliente } from "../generator/reportes-pl.js";
import { buildConcesionariaGeneratorInputWithComposition } from "../generator/packs/concesionaria.js";
import { generateUiSpec } from "../generator/generate.js";
import type { TransitionEvent } from "../core/events.js";

describe("Reportes P&L", () => {
  it("genera reporte P&L con márgenes correctos", () => {
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

    // Agregar eventos con ingresos y costos
    for (let i = 0; i < 3; i++) {
      const event: TransitionEvent = {
        id: `evt-pl-${i}`,
        kind: "transicion",
        subjectId: runtime.subjects[i]?.id || `tx-test-${i}`,
        occurredAt: new Date(
          mesAnterior.getFullYear(),
          mesAnterior.getMonth(),
          5 + i
        ).toISOString(),
        actorId: "user-test",
        actorKind: "usuario",
        transitionId: "t_vender",
        fromStateId: "inicial",
        toStateId: "vendido",
        evidence: {
          kind: "manual",
          reference: "test",
          recordedAt: new Date().toISOString(),
        },
        data: {
          monto: 1000,
          costo: 400,
          gasto: 100,
          producto: `producto-${i}`,
        },
      };
      runtime.store.append(event);
    }

    const reporte = generarReporteP_L(runtime, {
      desde: mesAnterior,
      hasta: hoy,
    });

    // Verificaciones
    expect(reporte.ingresoTotal).toBe(3000); // 3 * 1000
    expect(reporte.costoTotal).toBe(1200); // 3 * 400
    expect(reporte.gastoTotal).toBe(300); // 3 * 100
    expect(reporte.margenNeto).toBe(1500); // 3000 - 1200 - 300
    expect(reporte.margenPorcentaje).toBeCloseTo(50, 1);

    expect(reporte.rentabilidadPorCliente).toBeDefined();
    expect(reporte.rentabilidadPorProducto).toBeDefined();
    expect(reporte.comparativaMes).toBeDefined();

    runtime.close();
  });

  it("calcula rentabilidad por cliente", () => {
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
    const hace60Dias = new Date(hoy.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Agregar eventos para cliente específico
    if (runtime.subjects.length > 0) {
      const clienteId = runtime.subjects[0].parteId;
      const event: TransitionEvent = {
        id: `evt-cliente-${clienteId}`,
        kind: "transicion",
        subjectId: runtime.subjects[0].id,
        occurredAt: hoy.toISOString(),
        actorId: "user-test",
        actorKind: "usuario",
        transitionId: "t_vender",
        fromStateId: "inicial",
        toStateId: "vendido",
        evidence: {
          kind: "manual",
          reference: "test",
          recordedAt: new Date().toISOString(),
        },
        data: {
          monto: 5000,
          costo: 2000,
        },
      };
      runtime.store.append(event);

      const rentabilidad = rentabilidadCliente(runtime, clienteId, {
        desde: hace60Dias,
        hasta: hoy,
      });

      expect(rentabilidad.cliente).toBe(clienteId);
      expect(rentabilidad.ingresos).toBe(5000);
      expect(rentabilidad.costos).toBe(2000);
      expect(rentabilidad.margen).toBe(3000);
      expect(rentabilidad.margenPorcentaje).toBeCloseTo(60, 1);
    }

    runtime.close();
  });

  it("genera comparativa mensual de márgenes", () => {
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
    const hace60Dias = new Date(hoy.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Agregar eventos en diferentes meses
    for (let mes = 0; mes < 2; mes++) {
      for (let i = 0; i < 2; i++) {
        const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - mes, 15 + i);
        const subjectId =
          runtime.subjects[mes * 2 + i]?.id || `tx-test-${mes}-${i}`;

        const event: TransitionEvent = {
          id: `evt-mes-${mes}-${i}`,
          kind: "transicion",
          subjectId,
          occurredAt: fecha.toISOString(),
          actorId: "user-test",
          actorKind: "usuario",
          transitionId: "t_vender",
          fromStateId: "inicial",
          toStateId: "vendido",
          evidence: {
            kind: "manual",
            reference: "test",
            recordedAt: new Date().toISOString(),
          },
          data: {
            monto: 1000,
            costo: 300,
          },
        };
        runtime.store.append(event);
      }
    }

    const reporte = generarReporteP_L(runtime, {
      desde: hace60Dias,
      hasta: hoy,
    });

    expect(reporte.comparativaMes).toBeDefined();
    expect(reporte.comparativaMes.length).toBeGreaterThan(0);

    runtime.close();
  });
});
