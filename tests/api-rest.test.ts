/**
 * API REST para terceros: autenticación, rate limit, y búsquedas.
 * Verifica tokens, rate limiting y resultados de API.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";
import { generarToken, crearToken, verificarRateLimit, buscarExpedientes, obtenerExpediente, buscarClientes, buscarFacturas } from "../web/api-rest.js";

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

describe("API REST para terceros", () => {
  it("genera token válido", () => {
    const token = generarToken();
    expect(token).toContain("token_");
    expect(token.length).toBeGreaterThan(10);
  });

  it("crea token en almacén", () => {
    const apiToken = crearToken();
    expect(apiToken.token).toContain("token_");
    expect(apiToken.createdAt).toBeDefined();
    expect(apiToken.requestCount).toBe(0);
  });

  it("verifica rate limit", () => {
    const token = generarToken();

    for (let i = 0; i < 100; i++) {
      expect(verificarRateLimit(token)).toBe(true);
    }

    expect(verificarRateLimit(token)).toBe(false);
  });

  it("busca expedientes sin filtros", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-api-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = buscarExpedientes(rt, {});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    rt.close();
  });

  it("busca expedientes por cliente", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-api-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = buscarExpedientes(rt, { cliente: "parte-demo-1" });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    rt.close();
  });

  it("obtiene expediente por ID", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-api-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const expedientes = rt.expedientesDinero();
    if (expedientes.length > 0) {
      const exp = expedientes[0];
      if (exp) {
        const result = obtenerExpediente(rt, exp.id);
        expect(result.ok).toBe(true);
        expect(result.data).toBeDefined();
        if (result.data && typeof result.data === "object") {
          expect("id" in result.data).toBe(true);
        }
      }
    }

    rt.close();
  });

  it("obtiene expediente inexistente retorna error", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-api-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = obtenerExpediente(rt, "no-existe");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no encontrado");

    rt.close();
  });

  it("busca clientes", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-api-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = buscarClientes(rt, {});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    rt.close();
  });

  it("busca facturas", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-api-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = buscarFacturas(rt, {});
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    rt.close();
  });

  it("busca facturas por rango de fechas", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-api-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = buscarFacturas(rt, { desde: "2026-01-01", hasta: "2026-12-31" });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    rt.close();
  });
});
