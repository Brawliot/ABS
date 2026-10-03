/**
 * Tests para Hub de Inicio Handler
 * ────────────────────────────────
 * Verifica:
 * - Validación de roles
 * - Generación de tarjetas por rol
 * - Filtrado de acciones por permisos
 * - Cambio de rol actualiza procesos
 * - Widgets de resumen correctos
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { UiSpec, ProcessGroupSpec, ViewSpec, ActionSpec } from "../presentation/types.js";
import {
  bootHubDashboard,
  hasPermissionForProcess,
  hasPermissionForAction,
} from "../web/handlers/inicio-handler.js";

/**
 * Especificación de prueba mínima UiSpec.
 */
const createTestSpec = (): UiSpec => ({
  id: "test-spec",
  version: "1.0.0",
  generatedAt: new Date().toISOString(),
  sourceCaseId: "test-case",
  sourceCaseVersion: "1.0",
  sourcePolicyHash: "test-hash",
  contentHash: "test-content-hash",
  modules: [],
  views: [] as ViewSpec[],
  actions: [] as ActionSpec[],
  forms: [],
  recorridos: [],
  identity: {
    brandName: "Test Company",
  },
  localization: [
    {
      locale: "es",
      strings: {},
    },
  ],
  content: {},
  styleTokenRefs: {} as any,
  processGroups: [
    {
      id: "pg-pedidos",
      labelKey: "pedidos",
      lifecycleId: "pedidos",
      archetypeId: "pedidos",
      role: "dominant",
      viewIds: ["view-pedidos"],
      actionIds: ["action-pedidos"],
      panelIds: [],
      recorridoId: "rec-pedidos",
      channel: "backoffice",
      roleIds: ["gerente", "operario", "logistica"],
    } as ProcessGroupSpec,
    {
      id: "pg-inventario",
      labelKey: "inventario",
      lifecycleId: "inventario",
      archetypeId: "inventario",
      role: "dominant",
      viewIds: ["view-inventario"],
      actionIds: ["action-inventario"],
      panelIds: [],
      recorridoId: "rec-inventario",
      channel: "backoffice",
      roleIds: ["gerente", "logistica"],
    } as ProcessGroupSpec,
    {
      id: "pg-facturas",
      labelKey: "facturas",
      lifecycleId: "facturas",
      archetypeId: "facturas",
      role: "dominant",
      viewIds: ["view-facturas"],
      actionIds: ["action-facturas"],
      panelIds: [],
      recorridoId: "rec-facturas",
      channel: "backoffice",
      roleIds: ["gerente", "contabilidad"],
    } as ProcessGroupSpec,
    {
      id: "pg-agenda",
      labelKey: "agenda",
      lifecycleId: "agenda",
      archetypeId: "agenda",
      role: "dominant",
      viewIds: ["view-agenda"],
      actionIds: ["action-agenda"],
      panelIds: [],
      recorridoId: "rec-agenda",
      channel: "backoffice",
      roleIds: ["operario"],
    } as ProcessGroupSpec,
    {
      id: "pg-clientes",
      labelKey: "clientes",
      lifecycleId: "clientes",
      archetypeId: "clientes",
      role: "dominant",
      viewIds: ["view-clientes"],
      actionIds: ["action-clientes"],
      panelIds: [],
      recorridoId: "rec-clientes",
      channel: "backoffice",
      roleIds: ["atencion_cliente"],
    } as ProcessGroupSpec,
  ],
});

describe("bootHubDashboard", () => {
  let spec: UiSpec;

  beforeEach(() => {
    spec = createTestSpec();
  });

  it("debería generar HubDashboardSpec válido para gerente", () => {
    const hub = bootHubDashboard(spec, "user-123", "gerente", "session-456");

    expect(hub.userId).toBe("user-123");
    expect(hub.sessionId).toBe("session-456");
    expect(hub.currentRole.roleId).toBe("gerente");
    expect(hub.generatedAt).toBeDefined();
    expect(new Date(hub.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("debería validar que el rol existe", () => {
    expect(() => {
      bootHubDashboard(spec, "user-123", "rol-inexistente", "session-456");
    }).toThrow('Role "rol-inexistente" no disponible');
  });

  it("debería incluir todos los roles disponibles", () => {
    const hub = bootHubDashboard(spec, "user-123", "gerente", "session-456");

    const roleIds = hub.availableRoles.map((r) => r.roleId);
    expect(roleIds).toContain("gerente");
    expect(roleIds).toContain("operario");
    expect(roleIds).toContain("logistica");
    expect(roleIds).toContain("contabilidad");
  });

  it("debería mostrar todos los procesos para gerente", () => {
    const hub = bootHubDashboard(spec, "user-123", "gerente", "session-456");

    const processIds = hub.processCards.map((p) => p.lifecycleId);
    // Gerente tiene acceso a: pedidos, inventario, facturas (no agenda)
    expect(processIds).toContain("pedidos");
    expect(processIds).toContain("inventario");
    expect(processIds).toContain("facturas");
    expect(processIds).not.toContain("agenda");
  });

  it("debería mostrar solo procesos permitidos para operario", () => {
    const hub = bootHubDashboard(spec, "user-123", "operario", "session-456");

    const processIds = hub.processCards.map((p) => p.lifecycleId);
    // Operario solo tiene acceso a: pedidos, agenda
    expect(processIds).toContain("pedidos");
    expect(processIds).toContain("agenda");
    expect(processIds).not.toContain("inventario");
    expect(processIds).not.toContain("facturas");
  });

  it("debería mostrar solo procesos permitidos para logistica", () => {
    const hub = bootHubDashboard(spec, "user-123", "logistica", "session-456");

    const processIds = hub.processCards.map((p) => p.lifecycleId);
    // Logistica tiene acceso a: pedidos, inventario
    expect(processIds).toContain("pedidos");
    expect(processIds).toContain("inventario");
    expect(processIds).not.toContain("agenda");
    expect(processIds).not.toContain("facturas");
  });

  it("debería mostrar solo procesos permitidos para contabilidad", () => {
    const hub = bootHubDashboard(spec, "user-123", "contabilidad", "session-456");

    const processIds = hub.processCards.map((p) => p.lifecycleId);
    // Contabilidad tiene acceso a: facturas (y pedidos por permiso transitivo)
    expect(processIds).toContain("facturas");
    expect(processIds).not.toContain("agenda");
    expect(processIds).not.toContain("inventario");
  });

  it("debería ordenar procesos por prioridad", () => {
    const hub = bootHubDashboard(spec, "user-123", "gerente", "session-456");

    // Verificar que los procesos están ordenados por prioridad descendente
    if (hub.processCards.length > 1) {
      for (let i = 0; i < hub.processCards.length - 1; i++) {
        const current = hub.processCards[i];
        const next = hub.processCards[i + 1];
        if (current && next) {
          const currentPriority = current.priority ?? 0;
          const nextPriority = next.priority ?? 0;
          expect(currentPriority).toBeGreaterThanOrEqual(nextPriority);
        }
      }
    }
  });

  it("debería incluir quick actions solo para permisos válidos", () => {
    const hubGerente = bootHubDashboard(spec, "user-123", "gerente", "session-456");
    const hubOperario = bootHubDashboard(spec, "user-123", "operario", "session-456");

    // Gerente debería tener más acciones que operario
    expect(hubGerente.quickActions.length).toBeGreaterThan(
      hubOperario.quickActions.length
    );

    // Gerente debería tener "Nuevo Pedido"
    expect(hubGerente.quickActions.some((a) => a.id === "quick:nuevo-pedido")).toBe(
      true
    );

    // Operario no debería tener "Nuevo Pedido" (requiere permiso pedidos.crear)
    expect(hubOperario.quickActions.some((a) => a.id === "quick:nuevo-pedido")).toBe(
      false
    );
  });

  it("debería generar widgets de resumen por rol", () => {
    const hubGerente = bootHubDashboard(spec, "user-123", "gerente", "session-456");
    const hubOperario = bootHubDashboard(spec, "user-123", "operario", "session-456");

    // Ambos deberían tener widgets
    expect(hubGerente.summary.length).toBeGreaterThan(0);
    expect(hubOperario.summary.length).toBeGreaterThan(0);

    // Gerente debería ver más widgets
    expect(hubGerente.summary.length).toBeGreaterThanOrEqual(
      hubOperario.summary.length
    );
  });

  it("debería incluir widget de ventas si tiene permiso de facturas", () => {
    const hub = bootHubDashboard(spec, "user-123", "contabilidad", "session-456");

    // Contabilidad tiene permiso facturas.ver, que habilita el widget de ventas
    const ventasWidget = hub.summary.find((w) => w.id === "widget:ventas-hoy");
    expect(ventasWidget).toBeDefined();
  });

  it("debería incluir widget de pedidos pendientes si tiene permiso", () => {
    const hubGerente = bootHubDashboard(spec, "user-123", "gerente", "session-456");
    const hubOperario = bootHubDashboard(spec, "user-123", "operario", "session-456");

    const gerentePedidos = hubGerente.summary.find(
      (w) => w.id === "widget:pedidos-pendientes"
    );
    const operarioPedidos = hubOperario.summary.find(
      (w) => w.id === "widget:pedidos-pendientes"
    );

    // Ambos tienen permiso pedidos.ver
    expect(gerentePedidos).toBeDefined();
    expect(operarioPedidos).toBeDefined();
  });

  it("debería incluir widget de stock crítico solo para roles con permiso inventario.ver", () => {
    const hubGerente = bootHubDashboard(spec, "user-123", "gerente", "session-456");
    const hubAtencional = bootHubDashboard(spec, "user-123", "atencion_cliente", "session-456");

    const gerenteStock = hubGerente.summary.find(
      (w) => w.id === "widget:stock-critico"
    );
    const atencionalStock = hubAtencional.summary.find(
      (w) => w.id === "widget:stock-critico"
    );

    // Gerente tiene permiso inventario.ver, atencion_cliente no
    expect(gerenteStock).toBeDefined();
    expect(atencionalStock).toBeUndefined();
  });

  it("debería proporcionar enlaces auxiliares", () => {
    const hub = bootHubDashboard(spec, "user-123", "gerente", "session-456");

    expect(hub.auxiliaryLinks).toBeDefined();
    expect(hub.auxiliaryLinks!.length).toBeGreaterThan(0);

    const linkIds = hub.auxiliaryLinks!.map((l) => l.id);
    expect(linkIds).toContain("link:ayuda");
    expect(linkIds).toContain("link:documentacion");
    expect(linkIds).toContain("link:soporte");
  });

  it("debería permitir cambio de rol sin regenerar", () => {
    const hub1 = bootHubDashboard(spec, "user-123", "gerente", "session-456");
    const hub2 = bootHubDashboard(spec, "user-123", "operario", "session-456");

    // Mismo usuario, diferente rol
    expect(hub1.userId).toBe(hub2.userId);
    expect(hub1.sessionId).toBe(hub2.sessionId);
    expect(hub1.currentRole.roleId).not.toBe(hub2.currentRole.roleId);

    // Procesos visibles son diferentes
    const ids1 = hub1.processCards.map((p) => p.lifecycleId).sort();
    const ids2 = hub2.processCards.map((p) => p.lifecycleId).sort();
    expect(ids1).not.toEqual(ids2);
  });

  it("debería incluir meta de proceso (icono, descripción)", () => {
    const hub = bootHubDashboard(spec, "user-123", "gerente", "session-456");

    const pedidosCard = hub.processCards.find((p) => p.lifecycleId === "pedidos");
    expect(pedidosCard).toBeDefined();
    expect(pedidosCard!.icon).toBe("📦");
    expect(pedidosCard!.description).toContain("pedidos");
  });

  it("debería incluir href válido para cada proceso", () => {
    const hub = bootHubDashboard(spec, "user-123", "gerente", "session-456");

    for (const card of hub.processCards) {
      expect(card.href).toMatch(/^\/proceso\//);
      expect(card.href).toContain(card.lifecycleId);
    }
  });
});

describe("hasPermissionForProcess", () => {
  it("debería validar permisos para proceso pedidos", () => {
    const permisos = new Set(["pedidos.ver"]);
    expect(hasPermissionForProcess("pedidos", permisos)).toBe(true);
  });

  it("debería rechazar acceso sin permiso", () => {
    const permisos = new Set<string>();
    expect(hasPermissionForProcess("pedidos", permisos)).toBe(false);
  });

  it("debería validar permisos para proceso inventario", () => {
    const permisos = new Set(["inventario.ver"]);
    expect(hasPermissionForProcess("inventario", permisos)).toBe(true);
  });

  it("debería rechazar proceso inexistente", () => {
    const permisos = new Set(["proceso-inexistente.ver"]);
    expect(hasPermissionForProcess("proceso-inexistente", permisos)).toBe(false);
  });
});

describe("hasPermissionForAction", () => {
  it("debería validar permisos para quick:nuevo-pedido", () => {
    const permisos = new Set(["pedidos.crear"]);
    expect(hasPermissionForAction("quick:nuevo-pedido", permisos)).toBe(true);
  });

  it("debería rechazar acción sin permiso", () => {
    const permisos = new Set<string>();
    expect(hasPermissionForAction("quick:nuevo-pedido", permisos)).toBe(false);
  });

  it("debería validar permisos para quick:consultar-stock", () => {
    const permisos = new Set(["inventario.ver"]);
    expect(hasPermissionForAction("quick:consultar-stock", permisos)).toBe(true);
  });

  it("debería validar permisos para quick:gestionar-usuarios", () => {
    const permisos = new Set(["usuarios.editar"]);
    expect(hasPermissionForAction("quick:gestionar-usuarios", permisos)).toBe(true);
  });

  it("debería rechazar acción inexistente", () => {
    const permisos = new Set(["action-inexistente.crear"]);
    expect(hasPermissionForAction("quick:accion-inexistente", permisos)).toBe(false);
  });
});
