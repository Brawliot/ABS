/**
 * Negocios que el generador no había visto (negocios-nuevos.json): decide
 * bien el tipo de negocio, los módulos y el sector del diseño.
 */

import { describe, expect, it } from "vitest";
import { detectarSector } from "../design/generative.js";
import { decidirModulos } from "../generator/rules/modules.js";
import { bootProfile, loadSampleProfile } from "../web/boot-profile.js";

const ESPERADO: Record<string, { procesos: string[]; si: string[]; no: string[]; sector: string }> = {
  "n01-fisioterapia": { procesos: ["servicio_proyecto", "uso_temporal", "venta"], si: ["agenda", "facturas", "portal"], no: ["fianzas", "cuotas", "credito"], sector: "salud" },
  "n02-panaderia": { procesos: ["venta", "venta"], si: ["stock", "credito", "facturas"], no: ["agenda", "cuotas", "portal"], sector: "alimentacion" },
  "n03-autoescuela": { procesos: ["servicio_proyecto", "financiera"], si: ["agenda", "credito", "portal"], no: ["cuotas", "stock"], sector: "educacion" },
  "n04-inmobiliaria": { procesos: ["intermediacion"], si: ["fianzas", "agenda", "facturas"], no: ["stock", "cuotas"], sector: "inmobiliaria" },
  "n05-agencia-viajes": { procesos: ["venta", "venta"], si: ["portal", "facturas"], no: ["stock", "agenda", "cuotas"], sector: "turismo" },
  "n06-carpinteria": { procesos: ["servicio_proyecto", "venta"], si: ["stock", "agenda", "facturas"], no: ["cuotas", "credito", "portal"], sector: "construccion" },
};

describe("Negocios nuevos", () => {
  for (const [id, e] of Object.entries(ESPERADO)) {
    it(`${id}: procesos, módulos y sector`, () => {
      const boot = bootProfile(id);
      expect(boot.input.lifecycles.map((l) => l.archetypeId).sort()).toEqual([...e.procesos].sort());
      const activos = new Set(decidirModulos(boot.input).filter((m) => m.activo).map((m) => m.id));
      for (const m of e.si) expect(activos.has(m as never), `${id} debería tener ${m}`).toBe(true);
      for (const m of e.no) expect(activos.has(m as never), `${id} no debería tener ${m}`).toBe(false);
      const s = loadSampleProfile(id);
      expect(detectarSector(s.nombre, s.descripcion)).toBe(e.sector);
    });
  }

  it("las palabras no se confunden por trozos", () => {
    expect(detectarSector("Horno San Anton", "panaderia con obrador propio")).toBe("alimentacion");
    expect(detectarSector("Carpinteria Soto", "cocinas y armarios a medida")).toBe("construccion");
    expect(detectarSector("Viajes Brujula", "vuelos y hotel")).toBe("turismo");
  });
});
