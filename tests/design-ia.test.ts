/**
 * Criterios Arquitecto de información MVP:
 * - Inicio almacenero: "Recibir mercancía" + recepciones pendientes
 * - Vendedor no ve acciones de compras en menú
 * - Ningún menú > 7 entradas principales
 * - Misma entrada → misma salida
 */

import { describe, expect, it } from "vitest";
import {
  MAX_MAIN_MENU_ENTRIES,
  PRIMARY_LIST_FIELDS,
  applyInformationArchitectureToOverlay,
  buildInformationArchitecture,
  InformationArchitectureProposalStore,
  proposeFromExperience,
  roleArchitecture,
} from "../design/ia/index.js";
import { buildRecorridoFunnel } from "../bridges/presentation-intelligence/funnel.js";
import {
  ExperienceTelemetryStore,
  buildTelemetryRecord,
  openLayer3Reader,
} from "../bridges/presentation-intelligence/index.js";
import type { UiSpec } from "../presentation/types.js";
import { PRESENTATION_SCHEMA_VERSION } from "../presentation/types.js";
import { DEFAULT_STYLE_TOKEN_REFS } from "../presentation/tokens.js";
import { admittedPatternsForView } from "../presentation/patterns.js";

function demoSpec(): UiSpec {
  return {
    id: "ui-ia-demo",
    version: PRESENTATION_SCHEMA_VERSION,
    generatedAt: "2026-06-01T00:00:00.000Z",
    sourceCaseId: "case-ia",
    sourceCaseVersion: "1",
    sourcePolicyHash: "ph",
    contentHash: "ch-ia",
    modules: [
      {
        id: "mod.inventario",
        labelKey: "module.inventario",
        ruleId: "rule.inventario",
        channel: "taller",
        roleIds: ["almacenero", "almacen"],
        viewIds: ["view.recepcion", "view.stock"],
        actionIds: ["action.recibir", "action.inventariar"],
        recorridoIds: [],
      },
      {
        id: "mod.ventas",
        labelKey: "module.ventas",
        ruleId: "rule.crm",
        channel: "backoffice",
        roleIds: ["vendedor", "comercial"],
        viewIds: ["view.propuesta"],
        actionIds: ["action.aceptar", "action.comprar"],
        recorridoIds: [],
      },
      {
        id: "mod.compras",
        labelKey: "module.compras",
        ruleId: "rule.compras",
        channel: "backoffice",
        roleIds: ["compras", "gerente"],
        viewIds: ["view.orden_compra"],
        actionIds: ["action.comprar"],
        recorridoIds: [],
      },
    ],
    views: [
      {
        id: "view.recepcion",
        kind: "lista",
        labelKey: "view.recepcion",
        stateId: "pendiente_recepcion",
        lifecycleId: "lc.stock",
        actionIds: ["action.recibir"],
        admittedPatterns: admittedPatternsForView("lista"),
      },
      {
        id: "view.stock",
        kind: "lista",
        labelKey: "view.stock",
        stateId: null,
        lifecycleId: "lc.stock",
        actionIds: ["action.inventariar"],
        admittedPatterns: admittedPatternsForView("lista"),
      },
      {
        id: "view.propuesta",
        kind: "tablero",
        labelKey: "view.propuesta",
        stateId: "propuesta",
        lifecycleId: "lc.venta",
        actionIds: ["action.aceptar"],
        admittedPatterns: admittedPatternsForView("tablero"),
      },
      {
        id: "view.orden_compra",
        kind: "formulario",
        labelKey: "view.orden_compra",
        stateId: null,
        lifecycleId: "lc.compra",
        actionIds: ["action.comprar"],
        admittedPatterns: admittedPatternsForView("formulario"),
      },
    ],
    actions: [
      {
        id: "action.recibir",
        transitionId: "t_recibir",
        lifecycleId: "lc.stock",
        labelKey: "action.recibir_mercancia",
        visibleRoles: ["almacenero", "almacen"],
        requiredEvidenceKind: "fisica",
        evidenceFields: [],
      },
      {
        id: "action.inventariar",
        transitionId: "t_inventariar",
        lifecycleId: "lc.stock",
        labelKey: "action.inventario",
        visibleRoles: ["almacenero", "almacen"],
        requiredEvidenceKind: "sistema",
        evidenceFields: [],
      },
      {
        id: "action.aceptar",
        transitionId: "t_aceptar",
        lifecycleId: "lc.venta",
        labelKey: "action.aceptar",
        visibleRoles: ["vendedor", "comercial"],
        requiredEvidenceKind: "aceptacion",
        evidenceFields: [],
      },
      {
        id: "action.comprar",
        transitionId: "t_comprar",
        lifecycleId: "lc.compra",
        labelKey: "action.compra_proveedor",
        visibleRoles: ["vendedor", "compras", "gerente"],
        requiredEvidenceKind: "aceptacion",
        evidenceFields: [],
      },
    ],
    forms: [],
    recorridos: [],
    identity: { brandName: "Demo IA" },
    localization: [
      {
        locale: "es-ES",
        strings: {
          "action.recibir_mercancia": "Recibir mercancía",
          "action.inventario": "Inventariar",
          "action.aceptar": "Aceptar propuesta",
          "action.compra_proveedor": "Crear orden de compra",
          "module.inventario": "Inventario",
          "module.ventas": "Ventas",
          "module.compras": "Compras",
        },
      },
    ],
    content: {
      "action.recibir": { title: "Recibir mercancía" },
    },
    styleTokenRefs: DEFAULT_STYLE_TOKEN_REFS,
  };
}

describe("Arquitecto de información MVP", () => {
  it('el inicio del almacenero muestra "Recibir mercancía" y las recepciones pendientes', () => {
    const spec = demoSpec();
    const ia = buildInformationArchitecture({
      spec,
      roleIds: ["almacenero"],
      pendingByRole: {
        almacenero: [
          {
            id: "task-rec-1",
            label: "Recepción pendiente #1",
            actionId: "action.recibir",
            transitionId: "t_recibir",
            subjectId: "tx-rec-1",
          },
          {
            id: "task-rec-2",
            label: "Recepción pendiente #2",
            actionId: "action.recibir",
            transitionId: "t_recibir",
            subjectId: "tx-rec-2",
          },
        ],
      },
      generatedAt: "2026-06-01T12:00:00.000Z",
    });

    const role = roleArchitecture(ia, "almacenero")!;
    expect(role.home.labels).toContain("Recibir mercancía");
    expect(role.home.pendingTaskIds).toEqual(["task-rec-1", "task-rec-2"]);
    expect(role.home.actionIds).toContain("action.recibir");
    expect(role.viewHierarchies[0]!.primaryFields).toEqual([
      ...PRIMARY_LIST_FIELDS,
    ]);

    const overlay = applyInformationArchitectureToOverlay(undefined, ia);
    expect(overlay.informationArchitecture?.contentHash).toBe(ia.contentHash);
  });

  it("el vendedor no ve acciones de compras en su menú", () => {
    const ia = buildInformationArchitecture({
      spec: demoSpec(),
      roleIds: ["vendedor"],
      pendingByRole: { vendedor: [] },
      generatedAt: "2026-06-01T12:00:00.000Z",
    });
    const menu = roleArchitecture(ia, "vendedor")!.menu;
    const labels = [
      ...menu.primaryEntries.map((e) => e.label),
      ...menu.groups.flatMap((g) => g.entryIds),
    ];
    // Entradas primarias no incluyen compra
    expect(
      menu.primaryEntries.every(
        (e) => !/compra|t_comprar/i.test(e.label + e.refId),
      ),
    ).toBe(true);
    expect(menu.primaryEntries.some((e) => e.refId === "action.comprar")).toBe(
      false,
    );
    expect(labels.join(" ")).not.toMatch(/orden de compra/i);
  });

  it("ningún menú supera las 7 entradas principales", () => {
    const spec = demoSpec();
    // Muchas acciones visibles para forzar recorte
    const fat: UiSpec = {
      ...spec,
      actions: [
        ...spec.actions,
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `action.extra.${i}`,
          transitionId: `t_extra_${i}`,
          lifecycleId: "lc.venta",
          labelKey: `action.extra.${i}`,
          visibleRoles: ["vendedor"] as const,
          requiredEvidenceKind: "aceptacion" as const,
          evidenceFields: [],
        })),
      ],
    };
    const ia = buildInformationArchitecture({
      spec: fat,
      roleIds: ["vendedor", "almacenero"],
      pendingByRole: {
        vendedor: [],
        almacenero: Array.from({ length: 3 }, (_, i) => ({
          id: `p${i}`,
          label: `Pendiente ${i}`,
          actionId: "action.recibir",
          transitionId: "t_recibir",
        })),
      },
      generatedAt: "2026-06-01T12:00:00.000Z",
    });
    for (const role of ia.byRole) {
      expect(role.menu.primaryEntries.length).toBeLessThanOrEqual(
        MAX_MAIN_MENU_ENTRIES,
      );
      expect(role.menu.primaryEntries.length).toBeLessThanOrEqual(7);
    }
  });

  it("misma entrada, misma salida", () => {
    const input = {
      spec: demoSpec(),
      roleIds: ["almacenero", "vendedor"] as const,
      pendingByRole: {
        almacenero: [
          {
            id: "task-rec-1",
            label: "Recepción pendiente #1",
            actionId: "action.recibir",
            transitionId: "t_recibir",
          },
        ],
        vendedor: [],
      },
      generatedAt: "2026-06-01T12:00:00.000Z",
    };
    const a = buildInformationArchitecture({ ...input, roleIds: [...input.roleIds] });
    const b = buildInformationArchitecture({ ...input, roleIds: [...input.roleIds] });
    expect(a.contentHash).toBe(b.contentHash);
    expect(JSON.stringify(a.byRole)).toBe(JSON.stringify(b.byRole));
  });

  it("el Observador solo genera propuestas; no reordena solo", () => {
    const store = new InformationArchitectureProposalStore();
    const telemetry = new ExperienceTelemetryStore();
    for (let i = 0; i < 5; i++) {
      telemetry.append(
        buildTelemetryRecord({
          id: `ab-${i}`,
          kind: "abandon",
          at: "2026-06-01T12:00:00.000Z",
          sessionId: `s${i}`,
          actorOrParteId: `u${i}`,
          tenantId: "acme",
          recorridoId: "r1",
          stepId: "pago",
        }),
      );
    }
    const funnel = buildRecorridoFunnel("r1", telemetry.all(), ["datos", "pago", "ok"]);
    const before = buildInformationArchitecture({
      spec: demoSpec(),
      roleIds: ["vendedor"],
      pendingByRole: { vendedor: [] },
      generatedAt: "2026-06-01T12:00:00.000Z",
    });

    const proposals = proposeFromExperience({
      roleId: "vendedor",
      signals: { funnels: [funnel], experienceReader: openLayer3Reader(telemetry) },
      at: "2026-06-01T13:00:00.000Z",
      store,
    });
    expect(proposals.length).toBeGreaterThan(0);
    expect(store.pending().every((p) => p.status === "pending")).toBe(true);

    const after = buildInformationArchitecture({
      spec: demoSpec(),
      roleIds: ["vendedor"],
      pendingByRole: { vendedor: [] },
      generatedAt: "2026-06-01T12:00:00.000Z",
    });
    // Sin aprobación, la IA no cambia
    expect(after.contentHash).toBe(before.contentHash);
  });
});
