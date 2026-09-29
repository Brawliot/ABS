/**
 * Decisor de módulos: del perfil a qué partes lleva cada app, con motivo.
 * Lo no decidido no aparece (menú) ni se puede abrir (rutas).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decidirModulos } from "../generator/rules/modules.js";
import { allBootableIds, bootProfile, startWebServer } from "../web/index.js";

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

const activos = (id: string) =>
  decidirModulos(bootProfile(id).input)
    .filter((m) => m.activo)
    .map((m) => m.id);

describe("Decisor de módulos", () => {
  it("decide con sentido de negocio", () => {
    expect(activos("p06-gestoria")).not.toContain("stock"); // no vende productos
    expect(activos("p03-ferreteria")).toContain("stock");
    expect(activos("p08-alquiler-maquinaria")).toContain("fianzas");
    expect(activos("p08-alquiler-maquinaria")).not.toContain("stock"); // el bien vuelve
    expect(activos("p09-academia-idiomas")).toContain("cuotas");
    expect(activos("p01-peluqueria")).toContain("agenda");
    expect(activos("p03-ferreteria")).not.toContain("agenda");
    expect(activos("p10-reformas")).not.toContain("portal");
  });

  it("todo módulo lleva motivo y la base está siempre", () => {
    for (const id of allBootableIds()) {
      const d = decidirModulos(bootProfile(id).input);
      for (const m of d) expect(m.motivo.length, `${id}/${m.id}`).toBeGreaterThan(5);
      expect(d.filter((m) => ["clientes", "catalogo", "dinero"].includes(m.id)).every((m) => m.activo)).toBe(true);
    }
  });

  it("coincide con los paneles que genera el plano", () => {
    const panel = { agenda: "panel_agenda", cuotas: "panel_periodos", fianzas: "panel_retencion", credito: "panel_credito", portal: "portal_filtro" } as const;
    for (const id of allBootableIds()) {
      const boot = bootProfile(id);
      const kinds = new Set(boot.spec.views.map((v) => v.kind));
      for (const m of decidirModulos(boot.input)) {
        const k = panel[m.id as keyof typeof panel];
        if (k) expect(m.activo, `${id}/${m.id}`).toBe(kinds.has(k));
      }
    }
  });

  it("hay variedad: los 12 negocios no reciben la misma app", () => {
    const formas = new Set(
      allBootableIds().map((id) => {
        const b = bootProfile(id);
        return `${activos(id).join(",")}|${b.input.lifecycles.map((l) => `${l.archetypeId}:${l.exchangeDirection ?? ""}`).sort().join(",")}`;
      }),
    );
    expect(formas.size).toBeGreaterThanOrEqual(10);
  });
});

describe("Lo no decidido no existe en la app", () => {
  it("gestoría: sin stock ni facturas en menú ni rutas; técnico muestra motivos", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-mod-"));
    dirs.push(dir);
    const h = await startWebServer(bootProfile("p06-gestoria"), { port: 0, dbPath: join(dir, "db.sqlite") });
    try {
      const role = h.boot.roles[0]!.id;
      const home = await (await fetch(`${h.url}?role=${role}`)).text();
      expect(home).not.toContain('data-maestros="stock"');
      expect(home).not.toContain('data-maestros="facturas"');
      expect(home).toContain('data-maestros="dinero"');
      expect((await fetch(`${h.url}stock?role=${role}`)).status).toBe(404);
      expect((await fetch(`${h.url}facturas?role=${role}`)).status).toBe(404);
      expect((await fetch(`${h.url}empresa?role=${role}`)).status).toBe(404);
      const tec = await (await fetch(`${h.url}?role=${role}&tecnico=1`)).text();
      expect(tec).toContain('data-modulo="stock" data-activo="0"');
      expect(tec).toContain("No trabaja con productos propios que se cuenten.");
    } finally {
      await h.close();
    }
  });
});

describe("Inicio", () => {
  async function inicio(profile: string) {
    const dir = mkdtempSync(join(tmpdir(), "abs-ini-"));
    dirs.push(dir);
    const h = await startWebServer(bootProfile(profile), { port: 0, dbPath: join(dir, "db.sqlite") });
    const role = h.boot.roles[0]!.id;
    const body = await (await fetch(`${h.url}inicio?role=${role}`)).text();
    const cliente = (await fetch(`${h.url}inicio?role=cliente`)).status;
    await h.close();
    return { body, cliente };
  }
  it("cada negocio ve solo sus partes, con datos vivos", async () => {
    const taller = await inicio("p04-taller-mecanico");
    for (const k of ["clientes", "catalogo", "dinero", "facturas", "stock", "agenda"]) {
      expect(taller.body).toContain(`data-tarjeta="${k}"`);
    }
    expect(taller.body).toContain("Recepcion del vehiculo");
    expect(taller.body).toContain("por cobrar");
    expect(taller.cliente).toBe(403);
    const gestoria = await inicio("p06-gestoria");
    expect(gestoria.body).not.toContain('data-tarjeta="stock"');
    expect(gestoria.body).not.toContain('data-tarjeta="facturas"');
    expect(gestoria.body).toContain('data-tarjeta="cuotas"');
  });
});
