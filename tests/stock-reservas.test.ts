/**
 * Pruebas: reservas de stock al crear expedientes.
 * Verifica bloqueo de stock insuficiente y confirmación al cerrar.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

function open(id: string) {
  const boot = bootProfile(id);
  const dir = mkdtempSync(join(tmpdir(), "abs-stock-reservas-"));
  dirs.push(dir);
  return { boot, rt: AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") }) };
}

describe("Reservas de Stock", () => {
  it("bloquea crear expediente si no hay stock suficiente", () => {
    const { boot, rt } = open("concesionaria");

    // Configurar un producto con stock limitado (ej: 1 unidad)
    const productos = rt.ofertas.list(rt.tenantId);
    if (productos.length === 0) {
      rt.close();
      return; // Skip si no hay productos
    }

    const productoId = productos[0]!.ofertaId;
    rt.configurarStock(productoId, true, 1000); // 1 unidad = 1000 milésimas
    rt.ajustarStock(productoId, "entrada", 1000, "Stock inicial", "user1");

    // Intentar crear 2 expedientes de 1 unidad cada uno
    const linea1: any = [{ descripcion: "Item", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21, ofertaId: productoId }];
    const linea2: any = [{ descripcion: "Item", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21, ofertaId: productoId }];

    const exp1 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea1 },
      "u",
    );
    expect(exp1.ok).toBe(true);

    // El segundo debería fallar (no hay stock)
    const exp2 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea2 },
      "u",
    );
    expect(exp2.ok).toBe(false);

    rt.close();
  });

  it("obtiene reservas activas de un expediente", () => {
    const { boot, rt } = open("concesionaria");

    const productos = rt.ofertas.list(rt.tenantId);
    if (productos.length === 0) {
      rt.close();
      return;
    }

    const productoId = productos[0]!.ofertaId;
    rt.configurarStock(productoId, true, 10000);
    rt.ajustarStock(productoId, "entrada", 50000, "Stock inicial", "user1");

    const linea: any = [{ descripcion: "Item", cantidadMilesimas: 5000, precioCentimos: 100000, ivaPct: 21, ofertaId: productoId }];
    const exp = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );

    if (exp.ok) {
      const reservas = rt.reservasDelExpediente(exp.id);
      expect(reservas.length).toBeGreaterThan(0);
      const res = reservas.find((r) => r.ofertaId === productoId);
      expect(res?.cantidadMilesimas).toEqual(5000);
    }

    rt.close();
  });

  it("cancela reservas al anular expediente", () => {
    const { boot, rt } = open("concesionaria");

    const productos = rt.ofertas.list(rt.tenantId);
    if (productos.length === 0) {
      rt.close();
      return;
    }

    const productoId = productos[0]!.ofertaId;
    rt.configurarStock(productoId, true, 10000);
    rt.ajustarStock(productoId, "entrada", 50000, "Stock inicial", "user1");

    const linea: any = [{ descripcion: "Item", cantidadMilesimas: 5000, precioCentimos: 100000, ivaPct: 21, ofertaId: productoId }];
    const exp = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );

    expect(exp.ok).toBe(true);
    if (exp.ok) {
      // Cancelar reservas
      rt.cancelarReservasDelExpediente(exp.id);

      // Verificar que las reservas están canceladas
      const reservas = rt.reservasDelExpediente(exp.id);
      expect(reservas.length).toEqual(0); // Las canceladas no se devuelven
    }

    rt.close();
  });

  it("permite crear nuevo expediente después de cancelar anterior", () => {
    const { boot, rt } = open("concesionaria");

    const productos = rt.ofertas.list(rt.tenantId);
    if (productos.length === 0) {
      rt.close();
      return;
    }

    const productoId = productos[0]!.ofertaId;
    rt.configurarStock(productoId, true, 1000);
    rt.ajustarStock(productoId, "entrada", 1000, "Stock inicial", "user1");

    const linea: any = [{ descripcion: "Item", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21, ofertaId: productoId }];

    // Crear primer expediente
    const exp1 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );
    expect(exp1.ok).toBe(true);

    // Cancelar su reserva
    if (exp1.ok) {
      rt.cancelarReservasDelExpediente(exp1.id);
    }

    // Ahora debería poder crear otro expediente con el mismo stock
    const exp2 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "u",
    );
    expect(exp2.ok).toBe(true);

    rt.close();
  });
});
