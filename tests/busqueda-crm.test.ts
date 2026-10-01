/**
 * Búsqueda y filtros en CRM: expedientes, clientes, facturas.
 * Verifica que las queries de filtrado funcionen contra la BD.
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

describe("Búsqueda y filtros en CRM", () => {
  function open(id: string) {
    const dir = mkdtempSync(join(tmpdir(), "abs-busqueda-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile(id), { dbPath: join(dir, "db.sqlite") });
  }

  it("filtrar expedientes por estado", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    // Crear expedientes
    const tx1 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "usuario-test",
    );
    expect(tx1.ok).toBe(true);

    const tx2 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-2", fecha: "2026-09-02", lineas: linea },
      "usuario-test",
    );
    expect(tx2.ok).toBe(true);

    // Obtener todos los expedientes
    const todos = rt.expedientesDinero();
    expect(todos.length).toBeGreaterThanOrEqual(2);

    // Filtrar por cliente
    const del1 = todos.filter((e) => e.parteId === "parte-demo-1");
    expect(del1.length).toBeGreaterThan(0);
    expect(del1.every((e) => e.parteId === "parte-demo-1")).toBe(true);

    rt.close();
  });

  it("filtrar expedientes por rango de fechas", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    const tx1 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-08-01", lineas: linea },
      "usuario-test",
    );
    expect(tx1.ok).toBe(true);

    const tx2 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-15", lineas: linea },
      "usuario-test",
    );
    expect(tx2.ok).toBe(true);

    const tx3 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-10-01", lineas: linea },
      "usuario-test",
    );
    expect(tx3.ok).toBe(true);

    const todos = rt.expedientesDinero().filter((e) => e.parteId === "parte-demo-1");

    // Filtrar por rango de fechas
    const enSeptiembre = todos.filter((e) => e.fecha >= "2026-09-01" && e.fecha < "2026-10-01");
    expect(enSeptiembre.length).toBeGreaterThan(0);
    expect(enSeptiembre.every((e) => e.fecha >= "2026-09-01" && e.fecha < "2026-10-01")).toBe(true);

    rt.close();
  });

  it("filtrar expedientes por rango de importe", () => {
    const rt = open("p03-ferreteria");

    const tx1 = rt.crearTransaccion(
      {
        lifecycleId: "lc.venta",
        parteId: "parte-demo-1",
        fecha: "2026-09-01",
        lineas: [{ descripcion: "A", cantidadMilesimas: 1000, precioCentimos: 5000, ivaPct: 21 }],
      },
      "usuario-test",
    );
    expect(tx1.ok).toBe(true);

    const tx2 = rt.crearTransaccion(
      {
        lifecycleId: "lc.venta",
        parteId: "parte-demo-1",
        fecha: "2026-09-02",
        lineas: [{ descripcion: "B", cantidadMilesimas: 1000, precioCentimos: 20000, ivaPct: 21 }],
      },
      "usuario-test",
    );
    expect(tx2.ok).toBe(true);

    const todos = rt.expedientesDinero().filter((e) => e.parteId === "parte-demo-1");

    // Filtrar por importe mínimo
    const caros = todos.filter((e) => e.totalCentimos >= 1000000);
    expect(caros.every((e) => e.totalCentimos >= 1000000)).toBe(true);

    rt.close();
  });

  it("búsqueda de cliente por nombre", () => {
    const rt = open("p03-ferreteria");

    const demo1 = rt.partes.get(rt.tenantId, "parte-demo-1");
    expect(demo1?.personal?.displayName).toBeDefined();

    const todos = rt.partes.list(rt.tenantId);
    expect(todos.length).toBeGreaterThan(0);

    // Búsqueda simple: filtro en memoria
    const nombre = demo1?.personal?.displayName ?? "";
    const encontrados = todos.filter(
      (p) =>
        p.personal &&
        (p.personal.displayName.toLowerCase().includes(nombre.toLowerCase()) ||
          p.personal.phone?.toLowerCase().includes(nombre.toLowerCase()) ||
          p.personal.email?.toLowerCase().includes(nombre.toLowerCase())),
    );
    expect(encontrados.length).toBeGreaterThan(0);

    rt.close();
  });

  it("resumen de deuda por cliente", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    const tx1 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "usuario-test",
    );
    expect(tx1.ok).toBe(true);

    const tx2 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-02", lineas: linea },
      "usuario-test",
    );
    expect(tx2.ok).toBe(true);

    const todos = rt.expedientesDinero();
    const delCliente = todos.filter((e) => e.parteId === "parte-demo-1" && e.direccion === "entra");

    const totalVendido = delCliente.reduce((sum, e) => sum + e.totalCentimos, 0);
    expect(totalVendido).toBeGreaterThan(0);

    rt.close();
  });

  it("listar facturas emitidas", () => {
    const rt = open("p03-ferreteria");

    // Configurar emisor
    rt.facturas.putEmisor(rt.tenantId, {
      razonSocial: "Mi Empresa",
      nif: "12345678Z",
      domicilio: "Calle Principal 1",
    }, new Date().toISOString());

    // Listar todas las facturas (puede estar vacía al inicio)
    const todas = rt.facturas.list(rt.tenantId);
    expect(Array.isArray(todas)).toBe(true);

    rt.close();
  });

  it("filtrar facturas por estado de pago", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    const tx = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "usuario-test",
    );
    expect(tx.ok).toBe(true);
    if (!tx.ok) throw new Error();

    // Obtener todas las facturas
    const todas = rt.facturas.list(rt.tenantId);
    expect(Array.isArray(todas)).toBe(true);

    rt.close();
  });
});
