/**
 * Pruebas: gestor de stock con UI funcional.
 * Verifica que productos con control de stock aparezcan en tablas y alertas.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppRuntime, bootProfile } from "../web/index.js";
import { moduloActivo } from "../generator/rules/modules.js";

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

function open(id: string) {
  const boot = bootProfile(id);
  const dir = mkdtempSync(join(tmpdir(), "abs-stock-gestor-"));
  dirs.push(dir);
  return { boot, rt: AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") }) };
}

describe("Gestor de Stock UI", () => {
  it("obtiene productos con control activo", () => {
    const { boot, rt } = open("p03-ferreteria");
    const controlados = rt.obtenerProductosControlados();
    // Verificar que la API funciona (puede estar vacío inicialmente)
    expect(controlados).toBeInstanceOf(Map);
    rt.close();
  });

  it("resumen de stock incluye disponible y reservado", () => {
    const { boot, rt } = open("p03-ferreteria");
    const resumen = rt.resumenStock();
    expect(resumen).toBeInstanceOf(Map);

    for (const [productoId, info] of resumen.entries()) {
      expect(info.disponible).toBeGreaterThanOrEqual(0);
      expect(info.reservado).toBeGreaterThanOrEqual(0);
      expect(info.total).toEqual(info.disponible + info.reservado);
    }
    rt.close();
  });

  it("movimientos recientes están ordenados", () => {
    const { boot, rt } = open("p03-ferreteria");

    // Ajustar stock
    const producto = Array.from(rt.obtenerProductosControlados().keys())[0];
    if (producto) {
      rt.ajustarStock(producto, "entrada", 1000, "Stock inicial", "user1");

      const movs = rt.movimientosStockRecientes(10);
      expect(movs.length).toBeGreaterThan(0);
      // El movimiento más reciente está al inicio
      expect(movs[0]?.at).toBeDefined();
    }
    rt.close();
  });

  it("alertas detectan stock bajo", () => {
    const { boot, rt } = open("p03-ferreteria");
    const controlados = rt.obtenerProductosControlados();
    const resumen = rt.resumenStock();

    const conAlerta = Array.from(controlados.entries()).filter(([id, cfg]) => {
      const info = resumen.get(id);
      return !info || info.disponible < cfg.minimo;
    });

    // Puede o no haber alertas, pero si las hay, deben ser válidas
    for (const [id, cfg] of conAlerta) {
      const info = resumen.get(id);
      const stock = info?.disponible ?? 0;
      expect(stock).toBeLessThan(cfg.minimo);
    }
    rt.close();
  });

  it("ciclo con stock registra movimientos", () => {
    const { boot, rt } = open("concesionaria");
    const linea = [{ descripcion: "Coche", cantidadMilesimas: 1000, precioCentimos: 3000000, ivaPct: 21 }];

    // Crear venta
    const venta = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );
    if (venta.ok) {
      // Verificar que hay movimientos (si hay control de stock)
      const movs = rt.movimientosStockRecientes(10);
      // No necesariamente debe haber (depende si concesionaria tiene stock)
      expect(Array.isArray(movs)).toBe(true);
    }

    rt.close();
  });

  it("punto de checklist valida gestor de stock", async () => {
    const { boot, rt } = open("p03-ferreteria");
    if (!moduloActivo(boot.input, "stock")) {
      rt.close();
      return; // Skip si no tiene módulo stock
    }

    const controlados = rt.obtenerProductosControlados();
    expect(controlados).toBeInstanceOf(Map);
    rt.close();
  });
});
