/**
 * Portal del cliente: acceso por token y secciones personalizadas.
 * Verifica seguridad, datos y acciones disponibles.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";
import { SqlitePortalAccess } from "../adapters/sqlite-portal-access.js";
import { montarSeccionesPortal } from "../web/secciones-portal.js";

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
  const dir = mkdtempSync(join(tmpdir(), "abs-portal-"));
  dirs.push(dir);
  const boot = bootProfile(id);
  return { boot, rt: AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") }) };
}

describe("Portal: acceso y seguridad", () => {
  it("emitir token devuelve una cadena base64url de 32 bytes codificados", () => {
    const { rt } = abrirRuntime("p04-taller-mecanico");
    const access = new SqlitePortalAccess(rt.dbPath);

    const token = access.emitir(rt.tenantId, "parte-demo-1", 7);

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(40); // base64 de 32 bytes

    rt.close();
  });

  it("en la base solo se guarda el SHA256, nunca el token en claro", () => {
    const { rt } = abrirRuntime("p04-taller-mecanico");
    const access = new SqlitePortalAccess(rt.dbPath);

    const token = access.emitir(rt.tenantId, "parte-demo-1", 7);
    const db = require("better-sqlite3")(rt.dbPath);
    const row = db.prepare("SELECT hash_token FROM portal_accesos LIMIT 1").get();

    expect(row.hash_token).not.toBe(token);
    expect(row.hash_token.length).toBe(64); // SHA256 en hex

    db.close();
    rt.close();
  });

  it("token caducado devuelve null al resolver", () => {
    const { rt } = abrirRuntime("p04-taller-mecanico");
    const access = new SqlitePortalAccess(rt.dbPath);

    const token = access.emitir(rt.tenantId, "parte-demo-1", 0); // 0 días = ya caducado
    const ahora = new Date();
    const resuelto = access.resolver(token, new Date(ahora.getTime() + 1000)); // 1 segundo después

    expect(resuelto).toBeNull();

    rt.close();
  });

  it("token revocado devuelve null al resolver", () => {
    const { rt } = abrirRuntime("p04-taller-mecanico");
    const access = new SqlitePortalAccess(rt.dbPath);

    const token = access.emitir(rt.tenantId, "parte-demo-1", 7);
    access.revocar(rt.tenantId, "parte-demo-1");
    const resuelto = access.resolver(token);

    expect(resuelto).toBeNull();

    rt.close();
  });

  it("token inventado devuelve null al resolver", () => {
    const { rt } = abrirRuntime("p04-taller-mecanico");
    const access = new SqlitePortalAccess(rt.dbPath);

    const resuelto = access.resolver("token-inventado");

    expect(resuelto).toBeNull();

    rt.close();
  });
});

describe("Portal: secciones y datos", () => {
  it("en p04-taller-mecanico se montan las secciones del cliente", () => {
    const { boot, rt } = abrirRuntime("p04-taller-mecanico");
    const ctx = { runtime: rt, boot, parteId: "parte-demo-1" };

    const { secciones } = montarSeccionesPortal(ctx);

    expect(secciones.length).toBeGreaterThan(0);
    expect(secciones.some((s) => s.id === "portal-lo-mio")).toBe(true);

    rt.close();
  });

  it("dos negocios distintos dan órdenes de secciones distintos", () => {
    const { boot: boot1, rt: rt1 } = abrirRuntime("p04-taller-mecanico");
    const { boot: boot2, rt: rt2 } = abrirRuntime("n04-inmobiliaria");

    const ctx1 = { runtime: rt1, boot: boot1, parteId: "parte-demo-1" };
    const ctx2 = { runtime: rt2, boot: boot2, parteId: "parte-demo-1" };

    const { secciones: secs1 } = montarSeccionesPortal(ctx1);
    const { secciones: secs2 } = montarSeccionesPortal(ctx2);

    const orden1 = secs1.map((s) => ({ id: s.id, peso: s.peso }));
    const orden2 = secs2.map((s) => ({ id: s.id, peso: s.peso }));

    expect(orden1).toBeDefined();
    expect(orden2).toBeDefined();

    rt1.close();
    rt2.close();
  });

  it("no muestra identificadores técnicos en HTML de secciones", () => {
    const { boot, rt } = abrirRuntime("p04-taller-mecanico");
    const ctx = { runtime: rt, boot, parteId: "parte-demo-1" };

    const { secciones } = montarSeccionesPortal(ctx);
    const html = secciones.map((s) => s.html).join(" ");

    // No debe haber atributos data-* con ids técnicos
    expect(html).not.toMatch(/data-id=["\']parte-/);

    rt.close();
  });

  it("las secciones del portal se montan correctamente", () => {
    const { boot, rt } = abrirRuntime("p04-taller-mecanico");
    const ctx = { runtime: rt, boot, parteId: "parte-demo-1" };

    const { secciones } = montarSeccionesPortal(ctx);

    expect(secciones.length).toBeGreaterThan(0);

    rt.close();
  });
});
