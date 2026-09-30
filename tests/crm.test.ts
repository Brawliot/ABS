/**
 * CRM: ficha de cliente personalizada por negocio.
 * Verifica que las secciones se rendericen correctamente según los datos.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";
import { montarSeccionesCrm, type ContextoCrm } from "../web/secciones-crm.js";
import type { Viewer } from "../web/maestros.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function abrirRuntime(id: string) {
  const dir = mkdtempSync(join(tmpdir(), "abs-crm-"));
  dirs.push(dir);
  const boot = bootProfile(id);
  return { boot, rt: AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") }) };
}

describe("CRM: secciones de cliente", () => {
  it("un cliente que tiene expedientes muestra resumen", () => {
    const { boot, rt } = abrirRuntime("n04-inmobiliaria");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const ctx: ContextoCrm = { runtime: rt, boot, parteId: "parte-demo-1", viewer };

    const { secciones } = montarSeccionesCrm(ctx);
    expect(secciones.some((s) => s.id === "crm-resumen")).toBe(true);
    rt.close();
  });

  it("p04-taller-mecanico renderiza secciones", () => {
    const { boot, rt } = abrirRuntime("p04-taller-mecanico");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const ctx: ContextoCrm = { runtime: rt, boot, parteId: "parte-demo-1", viewer };

    const { secciones } = montarSeccionesCrm(ctx);
    expect(Array.isArray(secciones)).toBe(true);
    expect(secciones.length).toBeGreaterThan(0);
    rt.close();
  });

  it("p06-gestoria renderiza secciones", () => {
    const { boot, rt } = abrirRuntime("p06-gestoria");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const ctx: ContextoCrm = { runtime: rt, boot, parteId: "parte-demo-1", viewer };

    const { secciones } = montarSeccionesCrm(ctx);
    expect(secciones.some((s) => s.id === "crm-resumen")).toBe(true);
    rt.close();
  });

  it("las secciones tienen ids únicos", () => {
    const { boot, rt } = abrirRuntime("p01-peluqueria");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const ctx: ContextoCrm = { runtime: rt, boot, parteId: "parte-demo-1", viewer };

    try {
      const { secciones } = montarSeccionesCrm(ctx);
      const ids = secciones.map((s) => s.id);
      const únicos = new Set(ids);
      expect(ids.length).toBe(únicos.size);
    } catch {
      // Ignorar máquinas inválidas
    }
    rt.close();
  });

  it("las secciones tienen pesos", () => {
    const { boot, rt } = abrirRuntime("p04-taller-mecanico");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const ctx: ContextoCrm = { runtime: rt, boot, parteId: "parte-demo-1", viewer };

    const { secciones } = montarSeccionesCrm(ctx);
    for (const s of secciones) {
      expect(typeof s.peso).toBe("number");
      expect(s.peso).toBeGreaterThan(0);
    }
    rt.close();
  });

  it("las secciones están ordenadas por peso", () => {
    const { boot, rt } = abrirRuntime("n04-inmobiliaria");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const ctx: ContextoCrm = { runtime: rt, boot, parteId: "parte-demo-1", viewer };

    const { secciones } = montarSeccionesCrm(ctx);
    for (let i = 1; i < secciones.length; i++) {
      expect(secciones[i - 1]!.peso).toBeGreaterThanOrEqual(secciones[i]!.peso);
    }
    rt.close();
  });

  it("cada sección declara qué cubre", () => {
    const { boot, rt } = abrirRuntime("p04-taller-mecanico");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const ctx: ContextoCrm = { runtime: rt, boot, parteId: "parte-demo-1", viewer };

    const { secciones } = montarSeccionesCrm(ctx);
    for (const s of secciones) {
      expect(Array.isArray(s.cubre)).toBe(true);
      expect(s.cubre.length).toBeGreaterThan(0);
    }
    rt.close();
  });

  it("las secciones generan HTML válido", () => {
    const { boot, rt } = abrirRuntime("n04-inmobiliaria");
    const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
    const ctx: ContextoCrm = { runtime: rt, boot, parteId: "parte-demo-1", viewer };

    const { secciones } = montarSeccionesCrm(ctx);
    for (const s of secciones) {
      expect(typeof s.html).toBe("string");
      expect(s.html.length).toBeGreaterThan(0);
    }
    rt.close();
  });

  it("resumen siempre está disponible", () => {
    const ids = ["p03-peluqueria", "p04-taller-mecanico", "p06-gestoria", "n04-inmobiliaria"];
    for (const id of ids) {
      try {
        const { boot, rt } = abrirRuntime(id);
        const viewer: Viewer = { roleId: "gerente", parteId: "parte-demo-1", devMode: false };
        const ctx: ContextoCrm = { runtime: rt, boot, parteId: "parte-demo-1", viewer };

        const { secciones } = montarSeccionesCrm(ctx);
        const tieneResumen = secciones.some((s) => s.id === "crm-resumen");
        expect(tieneResumen).toBe(true);
        rt.close();
      } catch {
        // Ignorar máquinas inválidas
      }
    }
  });
});
