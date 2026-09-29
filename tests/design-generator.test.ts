/**
 * Conexión Diseñador ↔ Generador:
 * misma estructura, diseño propio, independencia mutua.
 */

import { describe, expect, it } from "vitest";
import {
  buildConcesionariaGeneratorInput,
  generateUiSpec,
  structuralHash,
  validateUiWithDesignSystem,
  assertSpecHasNoLiteralDesignValues,
} from "../generator/index.js";
import type { GeneratorInput } from "../generator/types.js";
import {
  proposeDesignSystems,
  hashDesignSystem,
} from "../design/index.js";
import type { DesignSystem } from "../design/index.js";
import {
  bindDesignToUiSpec,
  renderModuleDesignComparison,
  renderUiSpecHtml,
} from "../presentation/index.js";

function sharedBusinessInput(): GeneratorInput {
  const base = buildConcesionariaGeneratorInput("2026-06-01T00:00:00.000Z");
  return {
    ...base,
    caseId: "negocio-compartido",
    // Inventario + agenda: mismos módulos estructurales para ambas empresas
    resourceSubtypes: ["capacidad_temporal"],
    naturalezaBienes: ["propios_por_cantidad"],
    hasCalendar: true,
    channels: ["backoffice", "taller", "web"],
    roles: [
      ...base.roles,
      { id: "almacen", label: "Almacén" },
      { id: "oficina", label: "Oficina" },
    ],
  };
}

describe("Diseñador ↔ Generador", () => {
  it("inventario ferretería y agenda clínica se ven distintos pero comparten estructura", () => {
    const input = sharedBusinessInput();
    const spec = generateUiSpec(input, {
      overlay: { version: "1", identity: { brandName: "Demo" } },
    });

    expect(spec.modules.map((m) => m.id)).toEqual(
      expect.arrayContaining(["mod.inventario", "mod.agenda"]),
    );

    const ferre = proposeDesignSystems({
      companyId: "ferre-norte",
      businessDescription: "Ferretería y bricolaje con herramientas",
      identity: { brandName: "Ferre Norte" },
    }).proposals[0]!;
    const clinic = proposeDesignSystems({
      companyId: "clinica-aurora",
      businessDescription: "Clínica estética premium",
      identity: { brandName: "Aurora" },
    }).proposals[0]!;

    expect(ferre.tokens.colors.primary).not.toBe(
      clinic.tokens.colors.primary,
    );

    const htmlInv = renderUiSpecHtml(spec, {
      designSystem: ferre,
      roleId: "almacen",
      channel: "taller",
    });
    const htmlAg = renderUiSpecHtml(spec, {
      designSystem: clinic,
      roleId: "oficina",
      channel: "backoffice",
    });

    expect(htmlInv).toContain("mod.inventario");
    expect(htmlAg).toContain("mod.agenda");
    expect(htmlInv).toContain(ferre.tokens.colors.primary);
    expect(htmlAg).toContain(clinic.tokens.colors.primary);
    expect(htmlInv).not.toContain(clinic.tokens.colors.primary);

    // Misma estructura de vistas/acciones
    const viewIds = spec.views.map((v) => v.id).sort();
    const actionIds = spec.actions.map((a) => a.id).sort();
    expect(viewIds.length).toBeGreaterThan(0);
    expect(actionIds.length).toBeGreaterThan(0);

    const cmp = renderModuleDesignComparison({
      spec,
      moduleId: "mod.inventario",
      designA: ferre,
      designB: clinic,
      roleId: "almacen",
      channel: "taller",
    });
    expect(cmp).toContain(ferre.label);
    expect(cmp).toContain(clinic.label);
    expect(cmp).toContain("mod.inventario");
  });

  it("cambiar el sistema de diseño no altera el hash de la estructura", () => {
    const input = sharedBusinessInput();
    const spec = generateUiSpec(input);
    const h1 = structuralHash(spec);

    const dsA = proposeDesignSystems({
      companyId: "a",
      businessDescription: "Ferretería",
      identity: {},
    }).proposals[0]!;
    const dsB = proposeDesignSystems({
      companyId: "b",
      businessDescription: "Clínica premium",
      identity: {},
    }).proposals[0]!;

    // Binding / render no mutan spec
    bindDesignToUiSpec({
      spec,
      designSystem: dsA,
      designContentHash: hashDesignSystem(dsA),
      roleId: "oficina",
      channel: "backoffice",
    });
    bindDesignToUiSpec({
      spec,
      designSystem: dsB,
      designContentHash: hashDesignSystem(dsB),
      roleId: "oficina",
      channel: "backoffice",
    });

    expect(structuralHash(spec)).toBe(h1);

    // Regenerar con overlay que solo cambia designSystem → misma estructura
    const spec2 = generateUiSpec(input, {
      overlay: {
        version: "ds-x",
        identity: { brandName: "X" },
        designSystem: {
          version: "1",
          approvedAt: "2026-01-01T00:00:00.000Z",
          contentHash: hashDesignSystem(dsB),
          companyId: "b",
          proposalId: dsB.id,
          system: dsB,
        },
      },
    });
    expect(structuralHash(spec2)).toBe(h1);
  });

  it("la especificación de interfaz no contiene ningún color ni medida literal", () => {
    const spec = generateUiSpec(sharedBusinessInput(), {
      overlay: {
        version: "1",
        identity: {
          brandName: "Demo",
          logoUrl: "/logo.svg",
          primaryColor: "#FF0000", // se descarta al fusionar
        },
      },
    });
    expect(spec.identity.primaryColor).toBeUndefined();
    expect(spec.styleTokenRefs.colorPrimario).toBe("color.primario");
    expect(spec.styleTokenRefs.espaciadoM).toBe("espaciado.m");
    const issues = assertSpecHasNoLiteralDesignValues(spec);
    expect(issues).toHaveLength(0);
  });

  it("un patrón incompatible cae al patrón por defecto y genera un aviso", () => {
    const spec = generateUiSpec(sharedBusinessInput());
    // Tablero no admite "tabla" en listados
    const ds: DesignSystem = {
      ...proposeDesignSystems({
        companyId: "x",
        businessDescription: "Ferretería",
        identity: {},
      }).proposals[0]!,
      patterns: {
        listados: "tabla",
        navegacion: "lateral",
        formularios: "dos_columnas",
        tableros: "lista_agrupada",
      },
    };
    const tablero = spec.views.find((v) => v.kind === "tablero")!;
    expect(tablero.admittedPatterns.listados).not.toContain("tabla");

    const binding = bindDesignToUiSpec({
      spec,
      designSystem: ds,
      designContentHash: hashDesignSystem(ds),
      roleId: "oficina",
      channel: "backoffice",
    });
    const warn = binding.warnings.find(
      (w) => w.viewId === tablero.id && w.slot === "listados",
    );
    expect(warn).toBeDefined();
    expect(warn!.fallback).toBe("lista");
    const chosen = binding.views.find((v) => v.viewId === tablero.id)!;
    expect(chosen.chosen.listados).toBe("lista");
  });

  it("validación aplicada comprueba accesibilidad con tokens resueltos", () => {
    const spec = generateUiSpec(sharedBusinessInput());
    const ds = proposeDesignSystems({
      companyId: "ok",
      businessDescription: "Ferretería",
      identity: {},
    }).proposals[0]!;
    const result = validateUiWithDesignSystem({
      spec,
      designSystem: ds,
      roleId: "oficina",
      channel: "backoffice",
    });
    expect(result.ok).toBe(true);
  });
});
