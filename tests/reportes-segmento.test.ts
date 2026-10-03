/**
 * Tests para reportes por segmento.
 */

import { describe, expect, it } from "vitest";
import { AppRuntime } from "../web/runtime.js";
import {
  generarReporteSegmentoPorCliente,
  generarReporteSegmentoPorProducto,
  generarReporteSegmentoPorCiclo,
} from "../generator/reportes-segmento.js";
import { buildConcesionariaGeneratorInputWithComposition } from "../generator/packs/concesionaria.js";
import { generateUiSpec } from "../generator/generate.js";
import type { TransitionEvent } from "../core/events.js";

describe("Reportes por Segmento", () => {
  it("genera reporte por cliente ordenado por volumen", () => {
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

    // Agregar eventos para diferentes clientes
    if (runtime.subjects.length >= 3) {
      // Cliente 1: 3000
      for (let i = 0; i < 3; i++) {
        const event: TransitionEvent = {
          id: `evt-c1-${i}`,
          kind: "transicion",
          subjectId: runtime.subjects[0]?.id || 'tx-test-default',
          occurredAt: hoy.toISOString(),
          actorId: "user-test",
          actorKind: "humano",
          transitionId: "t_vender",
          fromStateId: "inicial",
          toStateId: "vendido",
          evidence: {
            kind: "aceptacion",
            reference: "test",
            recordedAt: new Date().toISOString(),
          },
          data: {
            monto: 1000,
            costo: 400,
          },
        };
        runtime.store.append(event);
      }

      // Cliente 2: 2000
      for (let i = 0; i < 2; i++) {
        const event: TransitionEvent = {
          id: `evt-c2-${i}`,
          kind: "transicion",
          subjectId: runtime.subjects[1]?.id || 'tx-test-default',
          occurredAt: hoy.toISOString(),
          actorId: "user-test",
          actorKind: "humano",
          transitionId: "t_vender",
          fromStateId: "inicial",
          toStateId: "vendido",
          evidence: {
            kind: "aceptacion",
            reference: "test",
            recordedAt: new Date().toISOString(),
          },
          data: {
            monto: 1000,
            costo: 400,
          },
        };
        runtime.store.append(event);
      }

      // Cliente 3: 1000
      const event: TransitionEvent = {
        id: `evt-c3-0`,
        kind: "transicion",
        subjectId: runtime.subjects[2]?.id || 'tx-test-default',
        occurredAt: hoy.toISOString(),
        actorId: "user-test",
        actorKind: "humano",
        transitionId: "t_vender",
        fromStateId: "inicial",
        toStateId: "vendido",
        evidence: {
          kind: "aceptacion",
          reference: "test",
          recordedAt: new Date().toISOString(),
        },
        data: {
          monto: 1000,
          costo: 400,
        },
      };
      runtime.store.append(event);
    }

    const reporte = generarReporteSegmentoPorCliente(runtime, {
      desde: hace60Dias,
      hasta: hoy,
    });

    expect(reporte.clientes).toBeDefined();
    expect(reporte.topClientes).toBeDefined();
    expect(reporte.topClientes.length).toBeGreaterThan(0);

    // Verificar que están ordenados por volumen
    for (let i = 0; i < reporte.topClientes.length - 1; i++) {
      const actual = reporte.topClientes[i];
      const siguiente = reporte.topClientes[i + 1];
      if (actual && siguiente) {
        expect(actual.totalVendido).toBeGreaterThanOrEqual(siguiente.totalVendido);
      }
    }

    runtime.close();
  });

  it("genera reporte por producto con rotación", () => {
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

    // Agregar eventos con productos
    if (runtime.subjects.length > 0) {
      for (let i = 0; i < 5; i++) {
        const event: TransitionEvent = {
          id: `evt-prod-${i}`,
          kind: "transicion",
          subjectId: runtime.subjects[0]?.id || 'tx-test-default',
          occurredAt: hoy.toISOString(),
          actorId: "user-test",
          actorKind: "humano",
          transitionId: "t_vender",
          fromStateId: "inicial",
          toStateId: "vendido",
          evidence: {
            kind: "aceptacion",
            reference: "test",
            recordedAt: new Date().toISOString(),
          },
          data: {
            monto: 500,
            costo: 200,
            producto: `producto-${i % 2}`,
          },
        };
        runtime.store.append(event);
      }
    }

    const reporte = generarReporteSegmentoPorProducto(runtime, {
      desde: hace30Dias,
      hasta: hoy,
    });

    expect(reporte.productos).toBeDefined();
    expect(reporte.topProductos).toBeDefined();

    // Verificar que la rotación se cuenta correctamente
    for (const producto of reporte.productos) {
      expect(producto.rotacion).toBe(producto.numeroVentas);
    }

    runtime.close();
  });

  it("genera reporte por ciclo con tasa de cierre", () => {
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
    const hace90Dias = new Date(hoy.getTime() - 90 * 24 * 60 * 60 * 1000);

    const reporte = generarReporteSegmentoPorCiclo(runtime, {
      desde: hace90Dias,
      hasta: hoy,
    });

    expect(reporte.ciclos).toBeDefined();
    expect(typeof reporte.ciclos === "object").toBe(true);

    // Verificar estructura de ciclos
    for (const ciclo of reporte.ciclos) {
      expect(ciclo.tipo).toBeDefined();
      expect(ciclo.totalExpedientes).toBeGreaterThanOrEqual(0);
      expect(ciclo.tasaCierre).toBeGreaterThanOrEqual(0);
      expect(ciclo.tasaCierre).toBeLessThanOrEqual(100);
    }

    runtime.close();
  });
});
