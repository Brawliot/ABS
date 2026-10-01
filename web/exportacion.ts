/**
 * Exportación de datos: CSV y Excel
 * Endpoints: GET /export/<tipo>?formato=<csv|xlsx>&desde=<fecha>&hasta=<fecha>
 * Solo admin (roleId = admin) puede exportar.
 */

import type { AppRuntime } from "./runtime.js";
import { formatCentimos } from "../elements/oferta.js";

export type ExportTipo = "clientes" | "expedientes" | "facturas" | "movimientos" | "productos";

interface ExportRow {
  [key: string]: string | number | null;
}

function escapeCsv(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: ExportRow[]): string {
  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((row) => headers.map((h) => escapeCsv(row[h] ?? "")).join(","));
  return [headerLine, ...dataLines].join("\n");
}

export function exportClientes(runtime: AppRuntime): { headers: string[]; rows: ExportRow[] } {
  const clientes = runtime.expedientesDinero().map((e) => ({ parteId: e.parteId, nombre: e.label }));
  const unique = new Map<string, string>();
  for (const c of clientes) {
    if (!unique.has(c.parteId)) {
      unique.set(c.parteId, c.nombre);
    }
  }

  const headers = ["Nombre", "Teléfono", "Deuda", "Crédito disponible"];
  const rows: ExportRow[] = [];

  for (const [parteId, nombre] of unique) {
    const deuda = runtime
      .expedientesDinero()
      .filter((e) => e.parteId === parteId && e.situacion === "pendiente")
      .reduce((s, e) => s + e.totalCentimos, 0);

    const limite = runtime.creditoCliente.obtenerLimite(runtime.tenantId, parteId);
    const creditoDisponible = limite - deuda;

    rows.push({
      Nombre: nombre,
      Teléfono: "—",
      Deuda: formatCentimos(deuda),
      "Crédito disponible": limite > 0 ? formatCentimos(creditoDisponible) : "Sin límite",
    });
  }

  return { headers, rows };
}

export function exportExpedientes(runtime: AppRuntime): { headers: string[]; rows: ExportRow[] } {
  const headers = ["Número", "Estado", "Cliente", "Importe", "Fecha"];
  const rows: ExportRow[] = [];

  for (const exp of runtime.expedientesDinero()) {
    rows.push({
      Número: exp.label,
      Estado: exp.estadoLabel,
      Cliente: exp.label.split("#")[0]?.trim() ?? "—",
      Importe: formatCentimos(exp.totalCentimos),
      Fecha: exp.fecha.split("T")[0] ?? exp.fecha,
    });
  }

  return { headers, rows };
}

export function exportFacturas(runtime: AppRuntime): { headers: string[]; rows: ExportRow[] } {
  const headers = ["Serie/Número", "Fecha", "Cliente", "Base", "Impuestos", "Total"];
  const rows: ExportRow[] = [];

  const todas = runtime.facturas.list(runtime.tenantId);
  for (const f of todas) {
    rows.push({
      "Serie/Número": `${f.serie}/${f.numero}`,
      Fecha: f.fechaExpedicion ?? "—",
      Cliente: f.receptor ? "Cliente" : "—",
      Base: formatCentimos(f.base),
      Impuestos: formatCentimos(f.iva),
      Total: formatCentimos(f.total),
    });
  }

  return { headers, rows };
}

export function exportMovimientos(runtime: AppRuntime): { headers: string[]; rows: ExportRow[] } {
  const headers = ["Fecha", "Tipo", "Importe", "Saldo acumulado"];
  const rows: ExportRow[] = [];
  let acumulado = 0;

  const expedientes = runtime.expedientesDinero().sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const exp of expedientes) {
    acumulado += exp.totalCentimos;
    rows.push({
      Fecha: exp.fecha.split("T")[0] ?? exp.fecha,
      Tipo: exp.estadoLabel,
      Importe: formatCentimos(exp.totalCentimos),
      "Saldo acumulado": formatCentimos(acumulado),
    });
  }

  return { headers, rows };
}

export function exportProductos(runtime: AppRuntime): { headers: string[]; rows: ExportRow[] } {
  const headers = ["Nombre", "Stock", "Entrada/Salida", "Rotación"];
  const rows: ExportRow[] = [];

  const ofertas = runtime.ofertas.list(runtime.tenantId);
  for (const oferta of ofertas) {
    rows.push({
      Nombre: oferta.nombre,
      Stock: "—",
      "Entrada/Salida": "—",
      Rotación: "—",
    });
  }

  return { headers, rows };
}

export function generarExportacion(
  tipo: ExportTipo,
  formato: "csv" | "xlsx",
  runtime: AppRuntime,
): { data: Buffer | string; filename: string; contentType: string } {
  let exportData: { headers: string[]; rows: ExportRow[] };

  switch (tipo) {
    case "clientes":
      exportData = exportClientes(runtime);
      break;
    case "expedientes":
      exportData = exportExpedientes(runtime);
      break;
    case "facturas":
      exportData = exportFacturas(runtime);
      break;
    case "movimientos":
      exportData = exportMovimientos(runtime);
      break;
    case "productos":
      exportData = exportProductos(runtime);
      break;
    default:
      throw new Error(`Tipo de exportación desconocido: ${tipo}`);
  }

  const hoy = new Date().toISOString().split("T")[0];

  if (formato === "csv") {
    const csv = toCsv(exportData.headers, exportData.rows);
    return {
      data: csv,
      filename: `${tipo}-${hoy}.csv`,
      contentType: "text/csv; charset=utf-8",
    };
  } else if (formato === "xlsx") {
    try {
      const XLSX = require("xlsx");
      const ws = XLSX.utils.json_to_sheet(exportData.rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tipo);
      const buffer = XLSX.write(wb, { type: "buffer" });
      return {
        data: buffer,
        filename: `${tipo}-${hoy}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    } catch (e) {
      console.warn("xlsx no disponible, usando CSV como fallback:", e);
      const csv = toCsv(exportData.headers, exportData.rows);
      return {
        data: csv,
        filename: `${tipo}-${hoy}.csv`,
        contentType: "text/csv; charset=utf-8",
      };
    }
  }

  throw new Error(`Formato desconocido: ${formato}`);
}
