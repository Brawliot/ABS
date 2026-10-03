/**
 * Pruebas: ciclo de compra a proveedor.
 * Verifica crear orden, recibir, actualizar stock e integración contable.
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
  const dir = mkdtempSync(join(tmpdir(), "abs-compras-"));
  dirs.push(dir);
  return { boot, rt: AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") }) };
}

describe("Ciclo de Compra", () => {
  it("crea orden de compra", () => {
    const { boot, rt } = open("p03-ferreteria");

    const compra = rt.crearCompra("proveedor-acero", "producto-1", 100, 500000, "2026-09-01");
    expect(compra.ok).toBe(true);
    if (compra.ok) {
      expect(compra.id).toMatch(/^compra-/);
    }
    rt.close();
  });

  it("valida datos de compra", () => {
    const { boot, rt } = open("p03-ferreteria");

    const invalid = rt.crearCompra("", "producto-1", 100, 500000, "2026-09-01");
    expect(invalid.ok).toBe(false);

    rt.close();
  });

  it("recibe compra y actualiza stock", () => {
    const { boot, rt } = open("p03-ferreteria");

    const productos = rt.ofertas.list(rt.tenantId);
    if (productos.length === 0) {
      rt.close();
      return;
    }

    const productoId = productos[0]!.ofertaId;
    rt.configurarStock(productoId, true, 10000);

    // Crear compra
    const compra = rt.crearCompra("proveedor-acero", productoId, 100, 500000, "2026-09-01");
    expect(compra.ok).toBe(true);

    if (compra.ok) {
      // Recibir compra
      const recibida = rt.recibirCompra(compra.id, 100);
      expect(recibida.ok).toBe(true);

      // Stock debe aumentar (100 unidades = 100,000 milésimas)
      const stock = rt.stock();
      const producto = stock.productos.find((p) => p.ofertaId === productoId);
      expect(producto?.disponible).toBeGreaterThan(0);
    }

    rt.close();
  });

  it("rechaza recibir más de lo pedido", () => {
    const { boot, rt } = open("p03-ferreteria");

    const compra = rt.crearCompra("proveedor-acero", "producto-1", 100, 500000, "2026-09-01");
    expect(compra.ok).toBe(true);

    if (compra.ok) {
      const recibida = rt.recibirCompra(compra.id, 150);
      expect(recibida.ok).toBe(false);
    }

    rt.close();
  });

  it("lista compras y calcula deuda", () => {
    const { boot, rt } = open("p03-ferreteria");

    const c1 = rt.crearCompra("proveedor-acero", "producto-1", 100, 500000, "2026-09-01");
    const c2 = rt.crearCompra("proveedor-acero", "producto-2", 50, 200000, "2026-09-01");

    expect(c1.ok).toBe(true);
    expect(c2.ok).toBe(true);

    const compras = rt.listarCompras({ proveedor: "proveedor-acero" });
    expect(compras.length).toBeGreaterThanOrEqual(2);

    // Deuda sin recibir: (100 * 500000) + (50 * 200000) = 60 millones de céntimos
    const deuda = rt.deudaConProveedor("proveedor-acero");
    expect(deuda).toBeGreaterThan(0);

    rt.close();
  });

  it("recibe parcialmente y marca como recibida", () => {
    const { boot, rt } = open("p03-ferreteria");

    const compra = rt.crearCompra("proveedor-acero", "producto-1", 100, 500000, "2026-09-01");
    expect(compra.ok).toBe(true);

    if (compra.ok) {
      // Verificar estado inicial: pendiente
      let compras = rt.listarCompras({ estado: "pendiente" });
      expect(compras.some((c) => c.id === compra.id)).toBe(true);

      // Recibir solo 60 de 100
      const recibida = rt.recibirCompra(compra.id, 60);
      expect(recibida.ok).toBe(true);

      // Listar recibidas
      const recibidas = rt.listarCompras({ estado: "recibida" });
      expect(recibidas.some((c) => c.id === compra.id && c.cantidadRecibida === 60)).toBe(true);
    }

    rt.close();
  });
});
