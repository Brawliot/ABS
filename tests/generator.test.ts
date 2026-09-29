import { describe, expect, it } from "vitest";
import {
  actionsVisibleToRole,
  buildConcesionariaGeneratorInput,
  generateUiSpec,
  structuralHash,
  MODULE_RULES,
  deduceModules,
} from "../generator/index.js";
import { renderUiSpecHtml } from "../presentation/index.js";
import type { GeneratorInput } from "../generator/types.js";
import type { PresentationOverlay } from "../presentation/types.js";

describe("Generador MVP — capa 2", () => {
  it("concesionaria genera CRM, Facturación y Agenda del taller, sin TPV", () => {
    const input = buildConcesionariaGeneratorInput();
    const matches = deduceModules(input);
    const ids = matches.map((m) => m.moduleId).sort();

    expect(ids).toContain("mod.crm");
    expect(ids).toContain("mod.facturacion");
    expect(ids).toContain("mod.agenda");
    expect(ids).not.toContain("mod.tpv");
    expect(ids).not.toContain("mod.inventario");
    expect(ids).not.toContain("mod.portal_cliente");

    const agenda = matches.find((m) => m.moduleId === "mod.agenda");
    expect(agenda?.labelKey).toBe("module.agenda_taller");

    const spec = generateUiSpec(input);
    expect(spec.modules.map((m) => m.id).sort()).toEqual(ids);
  });

  it("ninguna Acción aparece para un rol sin permiso", () => {
    const spec = generateUiSpec(buildConcesionariaGeneratorInput());

    // cliente solo tiene consultar → cero acciones de ejecución
    expect(actionsVisibleToRole(spec, "cliente")).toHaveLength(0);

    // comercial solo t_aceptar
    const comercial = actionsVisibleToRole(spec, "comercial");
    expect(comercial.length).toBeGreaterThan(0);
    expect(comercial.every((a) => a.transitionId === "t_aceptar")).toBe(true);
    expect(comercial.every((a) => a.visibleRoles.includes("comercial"))).toBe(
      true,
    );

    // Toda acción en el spec tiene al menos un rol
    for (const a of spec.actions) {
      expect(a.visibleRoles.length).toBeGreaterThan(0);
    }
  });

  it("misma especificación de negocio produce la misma interfaz", () => {
    const a = generateUiSpec(buildConcesionariaGeneratorInput("2026-06-01T00:00:00.000Z"));
    const b = generateUiSpec(buildConcesionariaGeneratorInput("2026-06-01T00:00:00.000Z"));
    expect(a.contentHash).toBe(b.contentHash);
    expect(structuralHash(a)).toBe(structuralHash(b));
    expect(JSON.stringify(a.modules)).toBe(JSON.stringify(b.modules));
  });

  it("cambiar un estado y regenerar conserva logotipo y textos personalizados", () => {
    const overlay: PresentationOverlay = {
      version: "1",
      identity: {
        brandName: "Autos López",
        logoUrl: "https://cdn.example/logo-lopez.svg",
      },
      content: {
        brand: { title: "Autos López Concesionaria" },
        "view.lc.venta.propuesta": {
          title: "Pipeline comercial",
          subtitle: "Texto custom que debe sobrevivir",
        },
      },
    };

    const input1 = buildConcesionariaGeneratorInput();
    const spec1 = generateUiSpec(input1, { overlay });

    // Simular cambio de máquina: añadimos un estado fantasma clonando input
    // (nueva versión de caso) — regeneramos con mismos roles/señales
    const input2: GeneratorInput = {
      ...input1,
      caseVersion: "1.2.0",
      generatedAt: "2026-07-01T00:00:00.000Z",
      lifecycles: input1.lifecycles.map((lc) => {
        if (lc.id !== "lc.venta") return lc;
        return {
          ...lc,
          lifecycle: {
            ...lc.lifecycle,
            states: [
              ...lc.lifecycle.states,
              {
                id: "en_preparacion",
                kind: "intermedio" as const,
                label: "En preparación",
                situations: lc.lifecycle.states[0]!.situations,
              },
            ],
          },
        };
      }),
    };

    const spec2 = generateUiSpec(input2, { overlay });

    expect(spec2.identity.logoUrl).toBe(overlay.identity!.logoUrl);
    expect(spec2.identity.brandName).toBe("Autos López");
    expect(spec2.content["view.lc.venta.propuesta"]?.title).toBe(
      "Pipeline comercial",
    );
    expect(spec2.content["view.lc.venta.propuesta"]?.subtitle).toBe(
      "Texto custom que debe sobrevivir",
    );
    expect(spec2.content.brand?.title).toBe("Autos López Concesionaria");

    // La regeneración añade la nueva vista de estado
    expect(
      spec2.views.some((v) => v.stateId === "en_preparacion"),
    ).toBe(true);
    expect(
      spec1.views.some((v) => v.stateId === "en_preparacion"),
    ).toBe(false);

    // Estructura distinta ⇒ structural hash distinto, overlay intacto
    expect(structuralHash(spec1)).not.toBe(structuralHash(spec2));
  });

  it("añadir un módulo es solo añadir una regla (catálogo extensible)", () => {
    expect(MODULE_RULES.length).toBeGreaterThanOrEqual(6);
    expect(MODULE_RULES.every((r) => typeof r.match === "function")).toBe(
      true,
    );
  });

  it("renderizador web mínimo produce HTML con módulos y logo", () => {
    const spec = generateUiSpec(buildConcesionariaGeneratorInput(), {
      overlay: {
        version: "1",
        identity: { logoUrl: "/logo.svg", brandName: "Demo" },
      },
    });
    const html = renderUiSpecHtml(spec, { roleId: "comercial" });
    expect(html).toContain("mod.crm");
    expect(html).toContain("/logo.svg");
    expect(html).toContain("Demo");
    expect(html).not.toContain("mod.tpv");
  });
});
