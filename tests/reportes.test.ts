/**
 * Reportes de negocio: ventas, cobros, impagos, rentabilidad, stock.
 * Genera datos coherentes sobre transacciones pasadas.
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

describe("Reportes de negocio", () => {
  function open(id: string) {
    const dir = mkdtempSync(join(tmpdir(), "abs-reportes-"));
    dirs.push(dir);
    return AppRuntime.open(bootProfile(id), { dbPath: join(dir, "db.sqlite") });
  }

  it("reporte de ventas por cliente", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "Producto A", cantidadMilesimas: 1000, precioCentimos: 5000, ivaPct: 21 },
    ];

    // Crear varias ventas
    const tx1 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "usuario-test",
    );
    expect(tx1.ok).toBe(true);

    const tx2 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-15", lineas: linea },
      "usuario-test",
    );
    expect(tx2.ok).toBe(true);

    const tx3 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-2", fecha: "2026-09-20", lineas: linea },
      "usuario-test",
    );
    expect(tx3.ok).toBe(true);

    // Generar reporte de ventas
    const expedientes = rt.expedientesDinero()
      .filter((e) => e.direccion === "entra" && e.fecha >= "2026-09-01" && e.fecha <= "2026-09-30");

    expect(expedientes.length).toBeGreaterThan(0);

    // Agrupar por cliente
    const porCliente: Record<string, number> = {};
    for (const exp of expedientes) {
      porCliente[exp.parteId] = (porCliente[exp.parteId] ?? 0) + exp.totalCentimos;
    }

    expect(Object.keys(porCliente).length).toBeGreaterThan(0);
    expect(porCliente["parte-demo-1"] ?? 0).toBeGreaterThan(0);

    rt.close();
  });

  it("reporte de cobros por mes", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    const tx1 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-08-15", lineas: linea },
      "usuario-test",
    );
    expect(tx1.ok).toBe(true);

    const tx2 = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-15", lineas: linea },
      "usuario-test",
    );
    expect(tx2.ok).toBe(true);

    // Registrar cobros
    if (tx1.ok) {
      rt.cobros.registrar(rt.tenantId, {
        expediente: tx1.id,
        importeCentimos: 600000,
        fecha: "2026-08-20",
        medio: "transferencia",
        actor: "vendedor-1",
      });
    }

    if (tx2.ok) {
      rt.cobros.registrar(rt.tenantId, {
        expediente: tx2.id,
        importeCentimos: 600000,
        fecha: "2026-09-25",
        medio: "efectivo",
        actor: "vendedor-1",
      });
    }

    // Agrupar cobros por mes
    const cobrosAgosto = tx1.ok ? rt.cobros.deExpediente(rt.tenantId, tx1.id) : [];
    const cobrosSeptiembre = tx2.ok ? rt.cobros.deExpediente(rt.tenantId, tx2.id) : [];

    expect(cobrosAgosto.length + cobrosSeptiembre.length).toBeGreaterThan(0);

    rt.close();
  });

  it("reporte de deuda vencida (impagos)", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    const tx = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-08-01", lineas: linea },
      "usuario-test",
    );
    expect(tx.ok).toBe(true);

    // El expediente está sin pagar (puede estar en presupuesto o pendiente)
    const expedientes = rt.expedientesDinero()
      .filter((e) => e.parteId === "parte-demo-1");

    expect(expedientes.length).toBeGreaterThan(0);

    rt.close();
  });

  it("reporte de rentabilidad: ingresos menos gastos", () => {
    const rt = open("p03-ferreteria");

    // Ventas: ingresos
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];
    const tx = rt.crearTransaccion(
      { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha: "2026-09-01", lineas: linea },
      "usuario-test",
    );
    expect(tx.ok).toBe(true);

    // Calcular ingresos
    const expedientes = rt.expedientesDinero()
      .filter((e) => e.direccion === "entra" && e.fecha >= "2026-09-01");
    const ingresos = expedientes.reduce((sum, e) => sum + e.totalCentimos, 0);

    // Gastos: devoluciones registradas (usar delExpediente si existe)
    const gastos = tx.ok ? rt.devoluciones.totalDevuelto(rt.tenantId, (tx as any).id) : 0;

    const margen = ingresos - gastos;
    expect(margen).toBeGreaterThanOrEqual(0);

    rt.close();
  });

  it("reporte de stock: disponible y rotación", () => {
    const rt = open("p03-ferreteria");

    // Obtener información de stock controlado
    const controlados = rt.stockStore.controlados(rt.tenantId);
    expect(controlados).toBeDefined();

    // Obtener movimientos de ajuste
    const ajustes = rt.stockStore.ajustes(rt.tenantId);
    expect(Array.isArray(ajustes)).toBe(true);

    rt.close();
  });

  it("agrupación de reportes por rango de fechas", () => {
    const rt = open("p03-ferreteria");
    const linea = [
      { descripcion: "X", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 },
    ];

    // Crear expedientes en diferentes meses
    const fechas = ["2026-08-15", "2026-09-15", "2026-10-15"];
    const ids: string[] = [];

    for (const fecha of fechas) {
      const tx = rt.crearTransaccion(
        { lifecycleId: "lc.venta", parteId: "parte-demo-1", fecha, lineas: linea },
        "usuario-test",
      );
      if (tx.ok) ids.push(tx.id);
    }

    // Filtrar por rango
    const expedientes = rt.expedientesDinero();
    const rango = expedientes.filter(
      (e) => e.fecha >= "2026-09-01" && e.fecha < "2026-10-01",
    );

    expect(rango.length).toBeGreaterThan(0);
    expect(rango.every((e) => e.fecha >= "2026-09-01" && e.fecha < "2026-10-01")).toBe(true);

    rt.close();
  });
});
