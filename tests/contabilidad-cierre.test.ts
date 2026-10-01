/**
 * PASO E: Cierre de período
 * Verifica que se pueden cerrar períodos y que no se pueden editar después.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { SqlitePeriodsStore } from "../adapters/sqlite-periodos-store.js";

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

describe("Cierre de período (PASO E)", () => {
  it("cierra un período correctamente", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-cierre-"));
    dirs.push(dir);
    const periodos = new SqlitePeriodsStore(join(dir, "db.sqlite"));

    const resultado = periodos.cerrarPeriodo("tenant1", "2026-09-30", "CIERRE-2026-09");
    expect(resultado.ok).toBe(true);

    periodos.close();
  });

  it("previene cerrar el mismo período dos veces", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-cierre-"));
    dirs.push(dir);
    const periodos = new SqlitePeriodsStore(join(dir, "db.sqlite"));

    // Primer cierre
    let resultado = periodos.cerrarPeriodo("tenant1", "2026-09-30", "CIERRE-1");
    expect(resultado.ok).toBe(true);

    // Segundo intento
    resultado = periodos.cerrarPeriodo("tenant1", "2026-09-30", "CIERRE-2");
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toContain("ya cerrado");
    }

    periodos.close();
  });

  it("obtiene lista de períodos cerrados", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-cierre-"));
    dirs.push(dir);
    const periodos = new SqlitePeriodsStore(join(dir, "db.sqlite"));

    // Cerrar varios períodos
    periodos.cerrarPeriodo("tenant1", "2026-08-31", "CIERRE-08");
    periodos.cerrarPeriodo("tenant1", "2026-09-30", "CIERRE-09");
    periodos.cerrarPeriodo("tenant1", "2026-07-31", "CIERRE-07");

    const lista = periodos.obtenerPeriodos("tenant1");

    expect(lista.length).toBe(3);
    // Debe estar ordenado descendente por fecha
    expect(lista[0]?.fecha_cierre).toBe("2026-09-30");
    expect(lista[1]?.fecha_cierre).toBe("2026-08-31");
    expect(lista[2]?.fecha_cierre).toBe("2026-07-31");

    periodos.close();
  });

  it("verifica si una fecha está cerrada", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-cierre-"));
    dirs.push(dir);
    const periodos = new SqlitePeriodsStore(join(dir, "db.sqlite"));

    // Cerrar septiembre
    periodos.cerrarPeriodo("tenant1", "2026-09-30", "CIERRE-09");

    // Fechas anteriores a cierre no están cerradas
    expect(periodos.estaCerrado("tenant1", "2026-09-15")).toBe(false);
    expect(periodos.estaCerrado("tenant1", "2026-08-31")).toBe(false);

    // Fechas posteriores al cierre están cerradas
    expect(periodos.estaCerrado("tenant1", "2026-10-01")).toBe(true);

    periodos.close();
  });

  it("mantiene períodos cerrados por tenant", () => {
    const dir = mkdtempSync(join(tmpdir(), "abs-cierre-"));
    dirs.push(dir);
    const periodos = new SqlitePeriodsStore(join(dir, "db.sqlite"));

    // Cerrar períodos para diferentes tenants
    periodos.cerrarPeriodo("tenant1", "2026-09-30", "CIERRE-09");
    periodos.cerrarPeriodo("tenant2", "2026-09-30", "CIERRE-09");

    const lista1 = periodos.obtenerPeriodos("tenant1");
    const lista2 = periodos.obtenerPeriodos("tenant2");

    expect(lista1.length).toBe(1);
    expect(lista2.length).toBe(1);

    periodos.close();
  });
});
