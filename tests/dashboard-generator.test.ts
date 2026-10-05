/**
 * Tests para la generación de especificación de dashboard.
 */

import { describe, it, expect } from "vitest";
import { generateDashboardSpec } from "../generator/dashboard-generator.js";
import type { GeneratorInput } from "../generator/types.js";

/**
 * Crea un GeneratorInput mínimo para testing.
 */
function createMockInput(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    caseId: "test-case",
    caseVersion: "1.0",
    companyId: "test-company",
    generatedAt: new Date().toISOString(),
    lifecycles: [],
    ruleSet: { rules: [] } as any,
    roles: [
      { id: "gerente", name: "Gerente", permissions: [] },
      { id: "almacen", name: "Almacén", permissions: [] },
    ],
    channels: ["backoffice"],
    resourceSubtypes: [],
    naturalezaBienes: [],
    paymentMode: "inmediato",
    hasPartes: false,
    hasMovimientos: true,
    hasFormalDocuments: false,
    hasFiscalCompliance: false,
    hasCalendar: false,
    ...overrides,
  };
}

describe("generateDashboardSpec", () => {
  it("debería generar especificación básica para cualquier negocio", () => {
    const input = createMockInput();
    const spec = generateDashboardSpec(input);

    expect(spec.caseId).toBe("test-case");
    expect(spec.kpisOperacionales.length).toBeGreaterThan(0);
    expect(spec.seccionesVisibles.operacion).toBe(true);
  });

  it("debería activar KPIs de stock si vende por cantidad", () => {
    const input = createMockInput({
      naturalezaBienes: ["propios_por_cantidad"],
    });
    const spec = generateDashboardSpec(input);

    const stockKpis = spec.kpisOperacionales.filter(
      (k) => k.categoria === "inventario",
    );
    expect(stockKpis.length).toBeGreaterThan(0);
    expect(stockKpis.some((k) => k.id === "op.stock_critico")).toBe(true);
  });

  it("debería activar KPIs de compras si hay mercancía propia", () => {
    const input = createMockInput({
      naturalezaBienes: ["propios_por_cantidad"],
      lifecycles: [
        {
          id: "compra-1",
          archetypeId: "compra",
          lifecycle: {
            id: "compra",
            name: "Compra",
            states: [],
          },
        },
      ] as any,
    });
    const spec = generateDashboardSpec(input);

    const compraKpis = spec.kpisOperacionales.filter(
      (k) => k.categoria === "compras",
    );
    expect(compraKpis.length).toBeGreaterThan(0);
    expect(compraKpis.some((k) => k.id === "op.ordenes_compra_abiertas")).toBe(
      true,
    );
  });

  it("debería activar KPIs de documentos si hay fiscal compliance", () => {
    const input = createMockInput({
      hasFiscalCompliance: true,
    });
    const spec = generateDashboardSpec(input);

    const docKpis = spec.kpisEmpresariales.filter(
      (k) => k.categoria === "documentos",
    );
    expect(docKpis.length).toBeGreaterThan(0);
    expect(docKpis.some((k) => k.id === "emp.documentos_vencidos")).toBe(true);
  });

  it("debería activar KPIs de SLA si hay múltiples lifecycles", () => {
    const input = createMockInput({
      lifecycles: [
        {
          id: "venta-1",
          archetypeId: "venta",
          lifecycle: { id: "venta", name: "Venta", states: [] },
        },
        {
          id: "servicio-1",
          archetypeId: "servicio",
          lifecycle: { id: "servicio", name: "Servicio", states: [] },
        },
      ] as any,
    });
    const spec = generateDashboardSpec(input);

    const slaKpis = spec.kpisEmpresariales.filter(
      (k) => k.categoria === "sla",
    );
    expect(slaKpis.length).toBeGreaterThan(0);
    expect(slaKpis.some((k) => k.id === "emp.sla_incumplidos")).toBe(true);
  });

  it("debería siempre tener módulo dashboard activo", () => {
    const input = createMockInput();
    const spec = generateDashboardSpec(input);

    const dashboardModulo = spec.modulosActivos.find(
      (m) => m.id === "dashboard",
    );
    expect(dashboardModulo).toBeDefined();
    expect(dashboardModulo?.activo).toBe(true);
  });

  it("debería reflejar módulos activos en los KPIs", () => {
    const input = createMockInput({
      naturalezaBienes: ["propios_por_cantidad"],
      hasFiscalCompliance: true,
      channels: ["backoffice", "web"],
    });
    const spec = generateDashboardSpec(input);

    // Stock debe estar activo
    const stockKpis = spec.kpisOperacionales.filter(
      (k) => k.categoria === "inventario",
    );
    expect(stockKpis.length).toBeGreaterThan(0);

    // Documentos debe estar activo
    const docKpis = spec.kpisEmpresariales.filter(
      (k) => k.categoria === "documentos",
    );
    expect(docKpis.length).toBeGreaterThan(0);
  });

  it("debería marcar como activos solo los KPIs relevantes", () => {
    const input = createMockInput();
    const spec = generateDashboardSpec(input);

    // Todos los KPIs generados deben tener razón documentada
    spec.kpisOperacionales.forEach((kpi) => {
      expect(kpi.razon).toBeDefined();
      expect(kpi.razon.length).toBeGreaterThan(0);
    });

    spec.kpisEmpresariales.forEach((kpi) => {
      expect(kpi.razon).toBeDefined();
      expect(kpi.razon.length).toBeGreaterThan(0);
    });
  });

  it("debería tener ambas secciones visibles si hay KPIs", () => {
    const input = createMockInput({
      hasFiscalCompliance: true,
    });
    const spec = generateDashboardSpec(input);

    expect(spec.seccionesVisibles.operacion).toBe(true);
    expect(spec.seccionesVisibles.empresa).toBe(true);
  });
});

describe("Casos de negocio reales", () => {
  it("tienda de ropa: debe tener stock, dinero, documentos", () => {
    const input = createMockInput({
      naturalezaBienes: ["propios_por_cantidad"],
      hasFiscalCompliance: true,
      paymentMode: "mixto",
      lifecycles: [
        {
          id: "venta-presencial",
          archetypeId: "venta",
          label: "TPV",
          lifecycle: { id: "venta", name: "Venta", states: [] },
        },
      ] as any,
    });
    const spec = generateDashboardSpec(input);

    // Operación
    expect(spec.kpisOperacionales.some((k) => k.id === "op.ingresos_hoy")).toBe(
      true,
    );
    expect(spec.kpisOperacionales.some((k) => k.id === "op.stock_critico")).toBe(
      true,
    );

    // Empresa
    expect(
      spec.kpisEmpresariales.some((k) => k.id === "emp.documentos_vencidos"),
    ).toBe(true);
  });

  it("asesoría fiscal: debe tener dinero, documentos, procesos", () => {
    const input = createMockInput({
      hasFiscalCompliance: true,
      hasFormalDocuments: true,
      lifecycles: [
        {
          id: "consultoría-1",
          archetypeId: "servicio",
          lifecycle: { id: "servicio", name: "Consultoría", states: [] },
        },
      ] as any,
      resourceSubtypes: ["capacidad_temporal"],
    });
    const spec = generateDashboardSpec(input);

    // Operación
    expect(spec.kpisOperacionales.some((k) => k.id === "op.ingresos_hoy")).toBe(
      true,
    );

    // Empresa
    expect(
      spec.kpisEmpresariales.some((k) => k.id === "emp.documentos_vencidos"),
    ).toBe(true);
    expect(spec.kpisEmpresariales.some((k) => k.id === "emp.sla_incumplidos")).toBe(
      true,
    );
  });
});
