/**
 * Tests para exportación y programación de reportes.
 */

import { describe, expect, it } from "vitest";
import {
  exportarCSV,
  validarCSV,
  nombreArchivoReporte,
  RepositorioReportesProgramados,
} from "../generator/reportes-export.js";

describe("Exportación de Reportes", () => {
  it("exporta reporte de ventas a CSV válido", () => {
    const datos = {
      fechaDesde: "2026-09-01",
      fechaHasta: "2026-09-30",
      ventas: {
        totalVendido: 50000,
        numeroExpedientes: 25,
        promedioVenta: 2000,
        expedientesCreados: 20,
        expedientesCerrados: 18,
      },
    };

    const csv = exportarCSV("ventas", datos);

    expect(csv).toContain("Reporte de Ventas");
    expect(csv).toContain("50000");
    expect(csv).toContain("25");
    expect(validarCSV(csv)).toBe(true);
  });

  it("exporta reporte de cobros a CSV con desglose por medio", () => {
    const datos = {
      fechaDesde: "2026-09-01",
      fechaHasta: "2026-09-30",
      cobros: {
        totalCobrado: 45000,
        numeroCobros: 20,
        tasaCobro: 90.0,
        pormedioDePago: {
          efectivo: 15000,
          transferencia: 30000,
        },
        porCliente: [
          { cliente: "cliente-1", total: 15000 },
          { cliente: "cliente-2", total: 12000 },
        ],
      },
    };

    const csv = exportarCSV("cobros", datos);

    expect(csv).toContain("Reporte de Cobros");
    expect(csv).toContain("Por Medio de Pago");
    expect(csv).toContain("efectivo");
    expect(csv).toContain("Top 10 Clientes");
    expect(csv).toContain("cliente-1");
    expect(validarCSV(csv)).toBe(true);
  });

  it("exporta reporte de impagos a CSV", () => {
    const datos = {
      fechaDesde: "2026-09-01",
      fechaHasta: "2026-09-30",
      impagos: {
        importeTotal: 5000,
        tasaImpago: 10.0,
        clientesConDeuda: [
          { cliente: "cliente-moroso", importe: 5000, diasAtraso: 30 },
        ],
      },
    };

    const csv = exportarCSV("impagos", datos);

    expect(csv).toContain("Reporte de Impagos");
    expect(csv).toContain("Clientes con Deuda");
    expect(csv).toContain("cliente-moroso");
    expect(csv).toContain("30");
    expect(validarCSV(csv)).toBe(true);
  });

  it("exporta P&L a CSV con desglose completo", () => {
    const pl = {
      periodo: {
        desde: "2026-09-01T00:00:00.000Z",
        hasta: "2026-09-30T23:59:59.999Z",
      },
      ingresos: [{ concepto: "Venta - transicion", valor: 50000 }],
      ingresoTotal: 50000,
      costos: [{ concepto: "Costo - transicion", valor: 20000 }],
      costoTotal: 20000,
      gastos: [{ concepto: "Gasto - operacion", valor: 5000 }],
      gastoTotal: 5000,
      margenNeto: 25000,
      margenPorcentaje: 50,
      rentabilidadPorCliente: [
        { cliente: "cliente-1", ingresos: 30000, costos: 12000, margen: 18000 },
      ],
      rentabilidadPorProducto: [],
      comparativaMes: [],
    };

    const csv = exportarCSV("pl", pl);

    expect(csv).toContain("Reporte P&L");
    expect(csv).toContain("INGRESOS");
    expect(csv).toContain("COSTOS");
    expect(csv).toContain("GASTOS");
    expect(csv).toContain("Margen Neto");
    expect(csv).toContain("25000");
    expect(validarCSV(csv)).toBe(true);
  });

  it("genera nombre de archivo con timestamp", () => {
    const nombre = nombreArchivoReporte("ventas", "csv");
    expect(nombre).toMatch(/^reporte-ventas-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.csv$/);
  });

  it("valida CSV correcto y rechaza mal formado", () => {
    const csvValido = "Header1,Header2\nValor1,Valor2\nValor3,Valor4";
    const csvInvalido = 'Header1,"Valor con comilla mal escapada\nValor2,Valor3';

    expect(validarCSV(csvValido)).toBe(true);
    expect(validarCSV(csvInvalido)).toBe(false);
  });

  it("gestiona programación de reportes automáticos", () => {
    const repo = new RepositorioReportesProgramados();

    const reporte1 = {
      id: "prog-ventas-semanal",
      tipo: "ventas" as const,
      frecuencia: "semanal" as const,
      destinatario: "gerente@empresa.com",
      activo: true,
      creadoEn: new Date().toISOString(),
    };

    const reporte2 = {
      id: "prog-cobros-mensual",
      tipo: "cobros" as const,
      frecuencia: "mensual" as const,
      destinatario: "finanzas@empresa.com",
      activo: false,
      creadoEn: new Date().toISOString(),
    };

    repo.crear(reporte1);
    repo.crear(reporte2);

    expect(repo.obtener("prog-ventas-semanal")).toEqual(reporte1);
    expect(repo.listar()).toHaveLength(2);

    const activos = repo.obtenerActivos();
    expect(activos).toHaveLength(1);
    expect(activos[0].id).toBe("prog-ventas-semanal");

    const semanales = repo.proximosAEnviar("semanal");
    expect(semanales).toHaveLength(1);
    expect(semanales[0].id).toBe("prog-ventas-semanal");

    repo.actualizar("prog-ventas-semanal", { destinatario: "nuevo@empresa.com" });
    expect(repo.obtener("prog-ventas-semanal")?.destinatario).toBe(
      "nuevo@empresa.com"
    );

    repo.eliminar("prog-cobros-mensual");
    expect(repo.listar()).toHaveLength(1);
  });
});
