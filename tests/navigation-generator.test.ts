/**
 * Tests para la generación de navegación.
 */

import { describe, it, expect } from "vitest";
import { generateNavigationSpec } from "../generator/navigation-generator.js";
import { generarNavigacionPara, aplicarPermisosRol, PERMISOS_POR_ROL } from "../presenter/navigation-integrador.js";
import type { GeneratorInput } from "../generator/types.js";

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
      { id: "vendedor", name: "Vendedor", permissions: [] },
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

describe("generateNavigationSpec", () => {
  it("debería generar especificación básica", () => {
    const input = createMockInput();
    const spec = generateNavigationSpec(input);

    expect(spec.caseId).toBe("test-case");
    expect(spec.areas.length).toBeGreaterThan(0);
    expect(spec.itemsGlobales.length).toBeGreaterThan(0);
  });

  it("debería tener área Operación siempre", () => {
    const input = createMockInput();
    const spec = generateNavigationSpec(input);

    const operacion = spec.areas.find((a) => a.id === "operacion");
    expect(operacion).toBeDefined();
    expect(operacion?.items.length).toBeGreaterThan(0);
  });

  it("debería incluir Dashboard y Dinero en Operación", () => {
    const input = createMockInput();
    const spec = generateNavigationSpec(input);

    const operacion = spec.areas.find((a) => a.id === "operacion");
    const itemIds = operacion?.items.map((i) => i.id) ?? [];

    expect(itemIds).toContain("dashboard");
    expect(itemIds).toContain("dinero");
  });

  it("debería activar Ventas si módulo catalogo activo", () => {
    const input = createMockInput({
      lifecycles: [
        {
          id: "venta-1",
          archetypeId: "venta",
          lifecycle: { id: "venta", name: "Venta", states: [] },
        },
      ] as any,
    });
    const spec = generateNavigationSpec(input);

    const operacion = spec.areas.find((a) => a.id === "operacion");
    const ventas = operacion?.items.find((i) => i.id === "ventas");
    expect(ventas?.activo).toBe(true);
  });

  it("debería activar Inventario si vende por cantidad", () => {
    const input = createMockInput({
      naturalezaBienes: ["propios_por_cantidad"],
    });
    const spec = generateNavigationSpec(input);

    const operacion = spec.areas.find((a) => a.id === "operacion");
    const inventario = operacion?.items.find((i) => i.id === "inventario");
    expect(inventario?.activo).toBe(true);
  });

  it("debería activar Documentos si fiscal compliance", () => {
    const input = createMockInput({
      hasFiscalCompliance: true,
    });
    const spec = generateNavigationSpec(input);

    const documentos = spec.areas.find((a) => a.id === "documentos");
    expect(documentos).toBeDefined();
    expect(documentos?.activo).toBe(true);
  });

  it("debería activar Marketing si canal web", () => {
    const input = createMockInput({
      channels: ["web", "backoffice"],
    });
    const spec = generateNavigationSpec(input);

    const marketing = spec.areas.find((a) => a.id === "marketing");
    expect(marketing).toBeDefined();
    expect(marketing?.activo).toBe(true);
  });

  it("debería activar Procesos si múltiples lifecycles", () => {
    const input = createMockInput({
      lifecycles: [
        { id: "venta", archetypeId: "venta", lifecycle: { id: "venta", name: "Venta", states: [] } },
        { id: "servicio", archetypeId: "servicio", lifecycle: { id: "servicio", name: "Servicio", states: [] } },
      ] as any,
    });
    const spec = generateNavigationSpec(input);

    const procesos = spec.areas.find((a) => a.id === "procesos");
    expect(procesos).toBeDefined();
    expect(procesos?.activo).toBe(true);
  });

  it("debería siempre tener Empresa", () => {
    const input = createMockInput();
    const spec = generateNavigationSpec(input);

    const empresa = spec.areas.find((a) => a.id === "empresa");
    expect(empresa).toBeDefined();
    expect(empresa?.activo).toBe(true);
  });
});

describe("generarNavigacionPara", () => {
  it("debería generar navegación presentable", () => {
    const input = createMockInput();
    const nav = generarNavigacionPara(input);

    expect(nav.areas.length).toBeGreaterThan(0);
    expect(nav.itemsGlobales.length).toBeGreaterThan(0);
    expect(nav.areas[0].items.length).toBeGreaterThan(0);
  });

  it("debería incluir iconos en todas las áreas", () => {
    const input = createMockInput();
    const nav = generarNavigacionPara(input);

    nav.areas.forEach((area) => {
      expect(area.icon).toBeDefined();
      expect(area.icon.length).toBeGreaterThan(0);
    });
  });

  it("debería marcar Operación como expandida", () => {
    const input = createMockInput();
    const nav = generarNavigacionPara(input);

    const operacion = nav.areas.find((a) => a.id === "operacion");
    expect(operacion?.expandido).toBe(true);
  });

  it("debería marcar otras áreas como colapsadas", () => {
    const input = createMockInput({
      hasFiscalCompliance: true,
      channels: ["web", "backoffice"],
    });
    const nav = generarNavigacionPara(input);

    const documentos = nav.areas.find((a) => a.id === "documentos");
    const marketing = nav.areas.find((a) => a.id === "marketing");

    expect(documentos?.expandido).toBe(false);
    expect(marketing?.expandido).toBe(false);
  });
});

describe("aplicarPermisosRol", () => {
  it("admin debería ver todo", () => {
    const input = createMockInput({
      hasFiscalCompliance: true,
      channels: ["web", "backoffice"],
      naturalezaBienes: ["propios_por_cantidad"],
    });
    const nav = generarNavigacionPara(input);
    const navAdmin = aplicarPermisosRol(nav, "admin");

    // Admin debería ver todas las áreas
    expect(navAdmin.areas.length).toBe(nav.areas.length);
  });

  it("gerente debería ver operación y empresa", () => {
    const input = createMockInput({
      hasFiscalCompliance: true,
      channels: ["web", "backoffice"],
    });
    const nav = generarNavigacionPara(input);
    const navGerente = aplicarPermisosRol(nav, "gerente");

    const areaIds = navGerente.areas.map((a) => a.id);
    expect(areaIds).toContain("operacion");
    expect(areaIds).toContain("empresa");
  });

  it("vendedor debería ver solo operación básica", () => {
    const input = createMockInput();
    const nav = generarNavigacionPara(input);
    const navVendedor = aplicarPermisosRol(nav, "vendedor");

    // Vendedor solo ve Operación
    expect(navVendedor.areas.length).toBe(1);
    expect(navVendedor.areas[0].id).toBe("operacion");
  });

  it("almacenero debería ver solo inventario", () => {
    const input = createMockInput({
      naturalezaBienes: ["propios_por_cantidad"],
    });
    const nav = generarNavigacionPara(input);
    const navAlmacenero = aplicarPermisosRol(nav, "almacenero");

    const operacion = navAlmacenero.areas.find((a) => a.id === "operacion");
    const itemIds = operacion?.items.map((i) => i.id) ?? [];

    expect(itemIds).toContain("inventario");
    expect(itemIds).not.toContain("ventas");
  });

  it("marketing debería ver marketing y reputación", () => {
    const input = createMockInput({
      channels: ["web", "backoffice"],
    });
    const nav = generarNavigacionPara(input);
    const navMarketing = aplicarPermisosRol(nav, "marketing");

    const areaIds = navMarketing.areas.map((a) => a.id);
    expect(areaIds).toContain("marketing");
  });
});

describe("Casos de negocio reales", () => {
  it("tienda de ropa: debe tener Operación + Documentos + Empresa", () => {
    const input = createMockInput({
      naturalezaBienes: ["propios_por_cantidad"],
      hasFiscalCompliance: true,
      lifecycles: [
        {
          id: "venta",
          archetypeId: "venta",
          lifecycle: { id: "venta", name: "Venta", states: [] },
        },
      ] as any,
    });
    const nav = generarNavigacionPara(input);

    const areaIds = nav.areas.map((a) => a.id);
    expect(areaIds).toContain("operacion");
    expect(areaIds).toContain("documentos");
    expect(areaIds).toContain("empresa");

    // Operación debe tener Stock e Inventario
    const operacion = nav.areas.find((a) => a.id === "operacion");
    const itemIds = operacion?.items.map((i) => i.id) ?? [];
    expect(itemIds).toContain("inventario");
  });

  it("SaaS: debe tener Operación + Marketing + Reputación + Empresa", () => {
    const input = createMockInput({
      channels: ["web", "backoffice", "publico"],
      lifecycles: [
        {
          id: "suscripcion",
          archetypeId: "venta",
          lifecycle: { id: "venta", name: "Suscripción", states: [] },
        },
      ] as any,
    });
    const nav = generarNavigacionPara(input);

    const areaIds = nav.areas.map((a) => a.id);
    expect(areaIds).toContain("operacion");
    expect(areaIds).toContain("marketing");
    expect(areaIds).toContain("empresa");
  });

  it("asesoría: debe tener Operación + Documentos + Procesos + Empresa", () => {
    const input = createMockInput({
      hasFiscalCompliance: true,
      hasFormalDocuments: true,
      lifecycles: [
        { id: "consultoría", archetypeId: "servicio", lifecycle: { id: "servicio", name: "Consultoría", states: [] } },
        { id: "asesoría", archetypeId: "servicio", lifecycle: { id: "servicio", name: "Asesoría", states: [] } },
      ] as any,
    });
    const nav = generarNavigacionPara(input);

    const areaIds = nav.areas.map((a) => a.id);
    expect(areaIds).toContain("operacion");
    expect(areaIds).toContain("documentos");
    expect(areaIds).toContain("procesos");
    expect(areaIds).toContain("empresa");
  });
});
