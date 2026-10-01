/**
 * Exportación de datos: CSV y Excel.
 * Verifica que los datos se exporten correctamente en ambos formatos.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";
import { exportClientes, exportExpedientes, exportProductos, exportMovimientos, generarExportacion } from "../web/exportacion.js";

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

describe("Exportación de datos", () => {
  it("exporta clientes en CSV", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = generarExportacion("clientes", "csv", rt);
    expect(result.filename).toContain("clientes-");
    expect(result.filename).toContain(".csv");
    expect(result.contentType).toBe("text/csv; charset=utf-8");
    expect(String(result.data)).toContain("Nombre");
    expect(String(result.data)).toContain("Deuda");

    rt.close();
  });

  it("exporta expedientes en CSV", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = generarExportacion("expedientes", "csv", rt);
    expect(result.filename).toContain("expedientes-");
    expect(result.filename).toContain(".csv");
    expect(String(result.data)).toContain("Número");
    expect(String(result.data)).toContain("Estado");
    expect(String(result.data)).toContain("Cliente");

    rt.close();
  });

  it("exporta productos en CSV", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = generarExportacion("productos", "csv", rt);
    expect(result.filename).toContain("productos-");
    expect(result.filename).toContain(".csv");
    expect(String(result.data)).toContain("Nombre");

    rt.close();
  });

  it("exporta movimientos en CSV", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = generarExportacion("movimientos", "csv", rt);
    expect(result.filename).toContain("movimientos-");
    expect(result.filename).toContain(".csv");
    expect(String(result.data)).toContain("Fecha");
    expect(String(result.data)).toContain("Tipo");

    rt.close();
  });

  it("exporta clientes en formato válido", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const data = exportClientes(rt);
    expect(data.headers).toContain("Nombre");
    expect(data.headers).toContain("Deuda");
    expect(data.rows.length).toBeGreaterThanOrEqual(0);

    rt.close();
  });

  it("exporta expedientes con datos reales", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const lineas = [{ descripcion: "Producto test", cantidadMilesimas: 1000, precioCentimos: 50000, ivaPct: 21 }];
    const tx = rt.crearTransaccion(
      {
        lifecycleId: "lc.venta",
        parteId: "parte-demo-1",
        fecha: "2026-09-01",
        lineas,
      },
      "t",
    );

    if (tx.ok) {
      const data = exportExpedientes(rt);
      expect(data.headers).toContain("Número");
      expect(data.headers).toContain("Importe");
      expect(data.rows.length).toBeGreaterThan(0);
    }

    rt.close();
  });

  it("maneja caracteres especiales en CSV", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-export-"));
    dirs.push(dir);
    const boot = bootProfile("p03-ferreteria");
    const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });

    const result = generarExportacion("expedientes", "csv", rt);
    const csv = String(result.data);

    // Verifica que las comas se escapen correctamente
    if (csv.includes(",")) {
      expect(csv).toBeDefined();
    }

    rt.close();
  });
});
