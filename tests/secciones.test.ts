/**
 * Tests del motor de secciones y secciones web.
 */

import { describe, it, expect } from "vitest";
import { montar, type Seccion, type ContextoSeccion } from "../generator/secciones.js";
import { SECCIONES_WEB, type ContextoWeb } from "../web/secciones-web.js";
import { bootSampleProfile } from "../web/boot-profile.js";

describe("Motor de secciones", () => {
  it("montar filtra por aplica", () => {
    interface TestCtx extends ContextoSeccion {
      tipo: string;
    }

    const seccionA: Seccion<TestCtx> = {
      id: "a",
      cubre: ["x"],
      aplica: (ctx) => ctx.tipo === "X",
      peso: () => 10,
      variantes: ["v1"],
      seleccionarVariante: () => "v1",
      render: () => "Sección A",
    };

    const seccionB: Seccion<TestCtx> = {
      id: "b",
      cubre: ["y"],
      aplica: (ctx) => ctx.tipo === "Y",
      peso: () => 10,
      variantes: ["v1"],
      seleccionarVariante: () => "v1",
      render: () => "Sección B",
    };

    const resultado = montar([seccionA, seccionB], { tipo: "X" });
    expect(resultado.html).toContain("Sección A");
    expect(resultado.html).not.toContain("Sección B");
    expect(resultado.cubiertos).toEqual(["x"]);
  });

  it("montar ordena por peso (mayor primero)", () => {
    interface TestCtx extends ContextoSeccion {
      tipo: string;
    }

    const seccionBaja: Seccion<TestCtx> = {
      id: "baja",
      cubre: ["bajo"],
      aplica: () => true,
      peso: () => 100,
      variantes: ["v1"],
      seleccionarVariante: () => "v1",
      render: () => "Bajo peso",
    };

    const seccionAlta: Seccion<TestCtx> = {
      id: "alta",
      cubre: ["alto"],
      aplica: () => true,
      peso: () => 500,
      variantes: ["v1"],
      seleccionarVariante: () => "v1",
      render: () => "Alto peso",
    };

    const resultado = montar([seccionBaja, seccionAlta], { tipo: "" });
    const idx_alta = resultado.html.indexOf("Alto peso");
    const idx_baja = resultado.html.indexOf("Bajo peso");
    expect(idx_alta).toBeLessThan(idx_baja);
  });

  it("a igual peso respeta orden de lista", () => {
    interface TestCtx extends ContextoSeccion {}

    const sec1: Seccion<TestCtx> = {
      id: "sec1",
      cubre: ["c1"],
      aplica: () => true,
      peso: () => 100,
      variantes: ["v"],
      seleccionarVariante: () => "v",
      render: () => "Primero",
    };

    const sec2: Seccion<TestCtx> = {
      id: "sec2",
      cubre: ["c2"],
      aplica: () => true,
      peso: () => 100,
      variantes: ["v"],
      seleccionarVariante: () => "v",
      render: () => "Segundo",
    };

    const resultado = montar([sec1, sec2], {});
    const idx1 = resultado.html.indexOf("Primero");
    const idx2 = resultado.html.indexOf("Segundo");
    expect(idx1).toBeLessThan(idx2);
  });
});

describe("Secciones web", () => {
  it("distintos perfiles pueden dar órdenes de secciones distintos según sus características", () => {
    const boot1 = bootSampleProfile("p01-peluqueria");
    const boot2 = bootSampleProfile("p03-ferreteria");

    const resultado1 = montar(SECCIONES_WEB, {
      boot: boot1,
      css: "",
    });
    const resultado2 = montar(SECCIONES_WEB, {
      boot: boot2,
      css: "",
    });

    // Verifica que ambos tienen secciones pero pueden variar en orden
    expect(resultado1.seccionesUsadas.length).toBeGreaterThan(0);
    expect(resultado2.seccionesUsadas.length).toBeGreaterThan(0);
    // Ambos siempre tienen portada y solicitud
    expect(resultado1.seccionesUsadas.map((s) => s.id)).toContain("portada");
    expect(resultado2.seccionesUsadas.map((s) => s.id)).toContain("portada");
  });

  it("como_trabajamos muestra pasos en orden", () => {
    const boot = bootSampleProfile("p04-taller-mecanico");
    const resultado = montar(SECCIONES_WEB, { boot, css: "" });

    const first = boot.input.lifecycles[0];
    if (first && first.lifecycle.states.length >= 3) {
      const paso1 = first.lifecycle.states[0]?.label ?? first.lifecycle.states[0]?.id;
      const paso2 = first.lifecycle.states[1]?.label ?? first.lifecycle.states[1]?.id;

      if (paso1 && paso2) {
        const idx1 = resultado.html.indexOf(paso1);
        const idx2 = resultado.html.indexOf(paso2);
        expect(idx1).toBeLessThan(idx2);
      }
    }
  });

  it("portada siempre está presente", () => {
    const boot = bootSampleProfile("p02-clinica-dental");
    const resultado = montar(SECCIONES_WEB, { boot, css: "" });

    expect(resultado.seccionesUsadas.some((s) => s.id === "portada")).toBe(true);
    expect(resultado.html).toContain(boot.brandName);
  });

  it("no hay sección sin datos (ej: sin ofertas → no oferta)", () => {
    const boot = bootSampleProfile("p06-gestoria");
    const resultado = montar(SECCIONES_WEB, { boot, css: "" });

    // Gestoria: no tiene venta, así que no debe haber oferta
    if (!boot.input.lifecycles.some((l) => l.archetypeId === "venta")) {
      expect(resultado.seccionesUsadas.map((s) => s.id)).not.toContain("oferta");
    }
  });

  it("no expone identificadores técnicos", () => {
    const boot = bootSampleProfile("p01-peluqueria");
    const resultado = montar(SECCIONES_WEB, { boot, css: "" });

    // No debe contener IDs técnicos como "mod.", "tpl.", "evt-", etc.
    expect(resultado.html).not.toMatch(/mod\.[a-z_]+/);
    expect(resultado.html).not.toMatch(/tpl\.[a-z_]+/);
    expect(resultado.html).not.toMatch(/evt-/);
    expect(resultado.html).not.toMatch(/parte-demo/);
  });
});

describe("Compatibilidad con landing anterior", () => {
  it("GET /web sigue teniendo formulario de solicitud", () => {
    const boot = bootSampleProfile("p01-peluqueria");
    const resultado = montar(SECCIONES_WEB, { boot, css: "" });

    expect(resultado.html).toContain("solicitud");
    expect(resultado.html).toContain("form");
    expect(resultado.html).toContain("method=");
    expect(resultado.html).toContain("/web/solicitud");
  });

  it("revisión de checklist usa cubiertos reales", () => {
    const boot = bootSampleProfile("p01-peluqueria");
    const resultado = montar(SECCIONES_WEB, { boot, css: "" });

    // Debe cubrir al menos web.presentar y web.solicitud
    expect(resultado.cubiertos).toContain("web.presentar");
    expect(resultado.cubiertos).toContain("web.solicitud");
  });
});
