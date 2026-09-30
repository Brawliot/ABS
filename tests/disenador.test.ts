/**
 * Diseñador generativo: cada negocio recibe su propio diseño, deducido de su
 * sector y señales, accesible (WCAG AA) y aplicado a las páginas.
 */

import { describe, expect, it } from "vitest";
import { contrastRatio } from "../design/contrast.js";
import { SECTORES, detectarSector, disenarNegocio } from "../design/generative.js";
import { validateDesignSystem } from "../design/validate.js";
import { allBootableIds, bootProfile } from "../web/index.js";

describe("Diseñador generativo", () => {
  it("detecta el sector: el nombre manda sobre la descripción", () => {
    expect(detectarSector("Ferreteria con venta a profesionales", "fontaneros y electricistas")).toBe("industrial");
    expect(detectarSector("Taller mecanico", "unas piezas y el coche")).toBe("motor");
    expect(detectarSector("Mi negocio", "Somos una peluqueria de barrio")).toBe("belleza");
    expect(detectarSector("Algo", "sin pistas")).toBe("general");
  });

  it("los 12 negocios de ejemplo reciben 12 diseños distintos", () => {
    const firmas = new Set(
      allBootableIds().map((id) => {
        const t = bootProfile(id).designSystem.tokens;
        return `${t.colors.primary}|${t.typography.headingFamily}|${t.radii.md}`;
      }),
    );
    expect(firmas.size).toBe(allBootableIds().length);
  });

  it("mismo sector, negocios distintos → colores distintos; mismo negocio → mismo diseño", () => {
    const a = disenarNegocio({ companyId: "taller-a", descripcion: "", sector: "motor" }).propuestas[0]!;
    const b = disenarNegocio({ companyId: "taller-b", descripcion: "", sector: "motor" }).propuestas[0]!;
    const a2 = disenarNegocio({ companyId: "taller-a", descripcion: "", sector: "motor" }).propuestas[0]!;
    expect(a.tokens.colors.primary).not.toBe(b.tokens.colors.primary);
    expect(a2).toEqual(a);
  });

  it("todo diseño es accesible y válido (13 sectores × 40 negocios × 3 variantes)", () => {
    for (const sector of SECTORES) {
      for (let i = 0; i < 40; i++) {
        const { propuestas } = disenarNegocio({ companyId: `n${i}`, descripcion: "", sector, senales: { sedes: 1 + (i % 4) } });
        for (const d of propuestas) {
          const v = validateDesignSystem(d);
          expect(v.ok, `${sector}/${d.id}: ${v.issues.map((x) => x.message).join("; ")}`).toBe(true);
          const c = d.tokens.colors;
          if (!d.id.endsWith(".b")) expect(contrastRatio("#FFFFFF", c.primary)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(c.neutrals.muted, c.neutrals.surface)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("respeta el color de marca del negocio si lo tiene", () => {
    const d = disenarNegocio({ companyId: "x", descripcion: "", colorMarca: "#123456" }).propuestas[0]!;
    expect(d.tokens.colors.primary).toBe("#123456");
  });

  it("muchas sedes o roles → interfaz más compacta", () => {
    const una = disenarNegocio({ companyId: "x", descripcion: "", sector: "salud", senales: { sedes: 1 } }).propuestas[0]!;
    const tres = disenarNegocio({ companyId: "x", descripcion: "", sector: "salud", senales: { sedes: 3 } }).propuestas[0]!;
    expect(una.density).toBe("espaciosa");
    expect(tres.density).toBe("normal");
  });
});
