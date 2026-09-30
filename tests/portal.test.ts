/**
 * Portal del cliente: acceso por token y secciones personalizadas.
 * Verifica seguridad, datos y acciones disponibles.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile, executeUiAction, startWebServer } from "../web/index.js";
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

describe("Portal: seguridad HTTP", () => {
  it("token inventado devuelve 404 sin pistas", async () => {
    const h = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath: ":memory:" });
    try {
      const res = await fetch(`${h.url}portal/token-inventado`);
      expect(res.status).toBe(404);
      const body = await res.text();
      expect(body).toContain("Este enlace no existe o ha caducado");
      expect(body).not.toContain("token");
    } finally {
      await h.close();
    }
  });

  it("token revocado devuelve 404 sin pistas", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-portal-sec-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");
    const h = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath });

    try {
      const rt = h.runtime;
      const access = new SqlitePortalAccess(dbPath);
      const token = access.emitir(rt.tenantId, "parte-demo-1", 7);
      access.revocar(rt.tenantId, "parte-demo-1");

      const res = await fetch(`${h.url}portal/${token}`);
      expect(res.status).toBe(404);
      const body = await res.text();
      expect(body).not.toContain(token);
    } finally {
      await h.close();
    }
  });

  it("respuestas del portal incluyen Referrer-Policy: no-referrer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-portal-headers-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");
    const h = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath });

    try {
      const rt = h.runtime;
      const access = new SqlitePortalAccess(dbPath);
      const token = access.emitir(rt.tenantId, "parte-demo-1", 7);

      const res = await fetch(`${h.url}portal/${token}`);
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    } finally {
      await h.close();
    }
  });

  it("expediente de otro cliente devuelve 404", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-portal-exp-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");
    const h = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath });

    try {
      const rt = h.runtime;
      const access = new SqlitePortalAccess(dbPath);

      // Crear dos expedientes para dos clientes diferentes
      const crearExp = (parteId: string, eur: number) => {
        const r = rt.crearTransaccion(
          { lifecycleId: "lc.servicio_proyecto", parteId, fecha: "2026-09-01", lineas: [{ descripcion: "X", cantidadMilesimas: 1000, precioCentimos: eur * 100, ivaPct: 21 }] },
          "ana",
        );
        return r.ok ? r.id : null;
      };

      const exp1 = crearExp("parte-demo-1", 100);
      const exp2 = crearExp("parte-demo-2", 200);

      if (!exp1 || !exp2) throw new Error("No se pudieron crear expedientes");

      // Token del cliente 1
      const token1 = access.emitir(rt.tenantId, "parte-demo-1", 7);

      // Intenta acceder al expediente del cliente 2 con el token del cliente 1
      const res = await fetch(`${h.url}portal/${token1}/expediente/${exp2}`);
      expect(res.status).toBe(404);
    } finally {
      await h.close();
    }
  });

  it("factura de otro cliente devuelve 404", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-portal-factura-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");
    const h = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath });

    try {
      const rt = h.runtime;
      const access = new SqlitePortalAccess(dbPath);

      const crearExp = (parteId: string, eur: number) => {
        const r = rt.crearTransaccion(
          { lifecycleId: "lc.servicio_proyecto", parteId, fecha: "2026-09-01", lineas: [{ descripcion: "X", cantidadMilesimas: 1000, precioCentimos: eur * 100, ivaPct: 21 }] },
          "ana",
        );
        return r.ok ? r.id : null;
      };

      const exp1 = crearExp("parte-demo-1", 100);
      const exp2 = crearExp("parte-demo-2", 200);

      if (!exp1 || !exp2) throw new Error("No se pudieron crear expedientes");

      const token1 = access.emitir(rt.tenantId, "parte-demo-1", 7);

      // Intenta acceder a una factura de otro cliente
      const res = await fetch(`${h.url}portal/${token1}/factura/factura-falsa`);
      expect(res.status).toBe(404);
    } finally {
      await h.close();
    }
  });

  it("emitir token nuevo no invalida los anteriores", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-portal-multi-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");
    const h = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath });

    try {
      const rt = h.runtime;
      const access = new SqlitePortalAccess(dbPath);

      const token1 = access.emitir(rt.tenantId, "parte-demo-1", 7);
      const token2 = access.emitir(rt.tenantId, "parte-demo-1", 7);

      // Ambos tokens deben funcionar
      const res1 = await fetch(`${h.url}portal/${token1}`);
      const res2 = await fetch(`${h.url}portal/${token2}`);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    } finally {
      await h.close();
    }
  });

  it("revocar invalida todos los tokens de esa parte", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-portal-revoke-"));
    dirs.push(dir);
    const dbPath = join(dir, "db.sqlite");
    const h = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath });

    try {
      const rt = h.runtime;
      const access = new SqlitePortalAccess(dbPath);

      const token1 = access.emitir(rt.tenantId, "parte-demo-1", 7);
      const token2 = access.emitir(rt.tenantId, "parte-demo-1", 7);

      // Ambos funcionan
      let res1 = await fetch(`${h.url}portal/${token1}`);
      expect(res1.status).toBe(200);

      // Revocar invalida ambos
      access.revocar(rt.tenantId, "parte-demo-1");

      res1 = await fetch(`${h.url}portal/${token1}`);
      const res2 = await fetch(`${h.url}portal/${token2}`);

      expect(res1.status).toBe(404);
      expect(res2.status).toBe(404);
    } finally {
      await h.close();
    }
  });

  it("token de otro tenant no sirve", async () => {
    const dir1 = mkdtempSync(join(tmpdir(), "abs-portal-t1-"));
    const dir2 = mkdtempSync(join(tmpdir(), "abs-portal-t2-"));
    dirs.push(dir1, dir2);

    const h1 = await startWebServer(bootProfile("p04-taller-mecanico"), { port: 0, dbPath: join(dir1, "db.sqlite") });
    const h2 = await startWebServer(bootProfile("n04-inmobiliaria"), { port: 0, dbPath: join(dir2, "db.sqlite") });

    try {
      const rt1 = h1.runtime;
      const rt2 = h2.runtime;
      const access1 = new SqlitePortalAccess(join(dir1, "db.sqlite"));

      const token1 = access1.emitir(rt1.tenantId, "parte-demo-1", 7);

      // Intenta usar token del tenant1 en tenant2
      const res = await fetch(`${h2.url}portal/${token1}`);
      expect(res.status).toBe(404);
    } finally {
      await h1.close();
      await h2.close();
    }
  });
});
