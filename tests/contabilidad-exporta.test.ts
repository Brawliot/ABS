/**
 * PASO D: Exportación contable
 * Verifica que se pueden exportar asientos en CSV y JSON para importar en otros sistemas.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";

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

describe("Exportación contable (PASO D)", () => {
  it("exporta asientos a CSV válido", () => {
    const boot = bootProfile("p01-peluqueria");
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    // Registrar asientos
    rt.registrarAsiento("2026-09-01", "1000", "4000", 10000, "Venta", "v1");
    rt.registrarAsiento("2026-09-02", "1100", "1000", 5000, "Depósito", "d1");

    const csv = rt.exportarAsientosCSV();

    // Validar que es CSV válido
    expect(csv).toContain("fecha,asiento,cuenta_deudora,cuenta_acreedora,debe,haber,concepto,referencia");
    expect(csv).toContain("2026-09-01");
    expect(csv).toContain("1000");
    expect(csv).toContain("4000");
    expect(csv).toContain("100"); // €100 (puede ser 100 o 100.00)

    // Validar que tiene 3 líneas: encabezado + 2 asientos
    const lineas = csv.split("\n");
    expect(lineas.length).toBe(3);

    rt.close();
  });

  it("escapa comillas en CSV", () => {
    const boot = bootProfile("p01-peluqueria");
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    // Registrar asiento con comillas en concepto
    rt.registrarAsiento(
      "2026-09-01",
      "1000",
      "4000",
      10000,
      'Venta especial "Premium"',
      "ref"
    );

    const csv = rt.exportarAsientosCSV();

    // Las comillas deben escaparse como ""
    expect(csv).toContain('Venta especial ""Premium""');

    rt.close();
  });

  it("filtra exportación por fechas", () => {
    const boot = bootProfile("p01-peluqueria");
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    // Registrar asientos en diferentes fechas
    rt.registrarAsiento("2026-08-15", "1000", "4000", 10000, "Venta ago", "v1");
    rt.registrarAsiento("2026-09-05", "1000", "4000", 20000, "Venta sep", "v2");
    rt.registrarAsiento("2026-09-10", "1000", "4000", 30000, "Venta sep 2", "v3");

    // Exportar solo septiembre
    const csv = rt.exportarAsientosCSV("2026-09-01", "2026-09-30");

    expect(csv).toContain("2026-09-05");
    expect(csv).toContain("2026-09-10");
    expect(csv).not.toContain("2026-08-15");

    const lineas = csv.split("\n");
    // Encabezado + 2 asientos
    expect(lineas.length).toBe(3);

    rt.close();
  });

  it("exporta asientos a JSON válido", () => {
    const boot = bootProfile("p01-peluqueria");
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    // Registrar asientos
    rt.registrarAsiento("2026-09-01", "1000", "4000", 10000, "Venta", "v1");
    rt.registrarAsiento("2026-09-02", "1100", "1000", 5000, "Depósito", "d1");

    const json = rt.exportarAsientosJSON();
    const data = JSON.parse(json);

    expect(data.tenant).toBe(rt.tenantId);
    expect(data.exportedAt).toBeTruthy();
    expect(data.asientos.length).toBe(2);
    expect(data.asientos[0]?.concepto).toBe("Venta");
    expect(data.asientos[0]?.importe_eur).toBe(100);

    rt.close();
  });

  it("JSON es válido y reimportable", () => {
    const boot = bootProfile("p01-peluqueria");
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    rt.registrarAsiento("2026-09-01", "1000", "4000", 10000, "Venta", "v1");

    const json = rt.exportarAsientosJSON();

    // Verificar que es JSON válido
    expect(() => JSON.parse(json)).not.toThrow();

    // Verificar estructura
    const data = JSON.parse(json);
    expect(data).toHaveProperty("tenant");
    expect(data).toHaveProperty("exportedAt");
    expect(data).toHaveProperty("periodo");
    expect(data).toHaveProperty("asientos");
    expect(Array.isArray(data.asientos)).toBe(true);

    rt.close();
  });
});
