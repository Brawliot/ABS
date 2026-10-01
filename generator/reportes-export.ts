/**
 * Exportación de reportes: CSV, Excel, PDF.
 * Programación automática de reportes.
 */

import type { ReporteResumen } from "./reportes.js";
import type { ReporteP_L } from "./reportes-pl.js";
import type {
  ReporteSegmentoPorCliente,
  ReporteSegmentoPorProducto,
  ReporteSegmentoPorCiclo,
} from "./reportes-segmento.js";

/**
 * Exporta reporte a CSV (formato plano).
 */
export function exportarCSV(
  tipo: "ventas" | "cobros" | "impagos" | "ciclos" | "pl",
  datos: any
): string {
  let csv = "";

  if (tipo === "ventas" && datos.ventas) {
    csv = "Reporte de Ventas\n";
    csv += `Período,${datos.fechaDesde},${datos.fechaHasta}\n\n`;
    csv += "Total Vendido,Número de Expedientes,Promedio por Venta\n";
    csv += `${datos.ventas.totalVendido},${datos.ventas.numeroExpedientes},${datos.ventas.promedioVenta}\n`;
  } else if (tipo === "cobros" && datos.cobros) {
    csv = "Reporte de Cobros\n";
    csv += `Período,${datos.fechaDesde},${datos.fechaHasta}\n\n`;
    csv += "Total Cobrado,Número de Cobros,Tasa de Cobro (%)\n";
    csv += `${datos.cobros.totalCobrado},${datos.cobros.numeroCobros},${datos.cobros.tasaCobro.toFixed(2)}\n\n`;
    csv += "Por Medio de Pago\n";
    csv += "Medio,Monto\n";
    for (const [medio, monto] of Object.entries(datos.cobros.pormedioDePago)) {
      csv += `${medio},${monto}\n`;
    }
    csv += "\nTop 10 Clientes\n";
    csv += "Cliente,Total\n";
    for (const cliente of datos.cobros.porCliente) {
      csv += `${cliente.cliente},${cliente.total}\n`;
    }
  } else if (tipo === "impagos" && datos.impagos) {
    csv = "Reporte de Impagos\n";
    csv += `Período,${datos.fechaDesde},${datos.fechaHasta}\n\n`;
    csv += "Total Impagado,Tasa de Impago (%)\n";
    csv += `${datos.impagos.importeTotal},${datos.impagos.tasaImpago.toFixed(2)}\n\n`;
    csv += "Clientes con Deuda\n";
    csv += "Cliente,Importe,Días de Atraso\n";
    for (const deuda of datos.impagos.clientesConDeuda) {
      csv += `${deuda.cliente},${deuda.importe},${deuda.diasAtraso}\n`;
    }
  } else if (tipo === "ciclos" && datos.ciclos) {
    csv = "Reporte de Ciclos\n";
    csv += `Período,${datos.fechaDesde},${datos.fechaHasta}\n\n`;
    csv += "Tipo de Ciclo,Total,Tiempo Promedio (días),Tasa de Cierre (%)\n";
    for (const [tipo, ciclo] of Object.entries(datos.ciclos.porTipo)) {
      csv += `${tipo},${(ciclo as any).total},${(ciclo as any).promedioDias.toFixed(1)},${(ciclo as any).tasaCierre.toFixed(2)}\n`;
    }
  } else if (tipo === "pl" && datos.ingresoTotal !== undefined) {
    const pl = datos as ReporteP_L;
    csv = "Reporte P&L (Profit & Loss)\n";
    csv += `Período,${pl.periodo.desde},${pl.periodo.hasta}\n\n`;
    csv += "INGRESOS\n";
    csv += "Concepto,Valor\n";
    for (const linea of pl.ingresos) {
      csv += `${linea.concepto},${linea.valor}\n`;
    }
    csv += `Total Ingresos,${pl.ingresoTotal}\n\n`;
    csv += "COSTOS\n";
    csv += "Concepto,Valor\n";
    for (const linea of pl.costos) {
      csv += `${linea.concepto},${linea.valor}\n`;
    }
    csv += `Total Costos,${pl.costoTotal}\n\n`;
    csv += "GASTOS\n";
    csv += "Concepto,Valor\n";
    for (const linea of pl.gastos) {
      csv += `${linea.concepto},${linea.valor}\n`;
    }
    csv += `Total Gastos,${pl.gastoTotal}\n\n`;
    csv += `Margen Neto,${pl.margenNeto}\n`;
    csv += `Margen (%),${pl.margenPorcentaje.toFixed(2)}\n\n`;
    csv += "Rentabilidad por Cliente\n";
    csv += "Cliente,Ingresos,Costos,Margen\n";
    for (const c of pl.rentabilidadPorCliente) {
      csv += `${c.cliente},${c.ingresos},${c.costos},${c.margen}\n`;
    }
  }

  return csv;
}

/**
 * Interfaz para programación de reportes automáticos.
 */
export interface ReporteProgramado {
  readonly id: string;
  readonly tipo: "ventas" | "cobros" | "impagos" | "ciclos" | "pl";
  readonly frecuencia: "diaria" | "semanal" | "mensual";
  readonly destinatario: string; // email
  readonly activo: boolean;
  readonly creadoEn: string;
  readonly ultimoEnvio?: string;
}

/**
 * Almacenamiento de reglas de programación (se vincula con Comunicación).
 */
export class RepositorioReportesProgramados {
  private reportes: Map<string, ReporteProgramado> = new Map();

  crear(reporte: ReporteProgramado): void {
    this.reportes.set(reporte.id, reporte);
  }

  obtener(id: string): ReporteProgramado | undefined {
    return this.reportes.get(id);
  }

  listar(): ReporteProgramado[] {
    return Array.from(this.reportes.values());
  }

  actualizar(id: string, cambios: Partial<ReporteProgramado>): void {
    const reporte = this.reportes.get(id);
    if (reporte) {
      this.reportes.set(id, { ...reporte, ...cambios });
    }
  }

  eliminar(id: string): boolean {
    return this.reportes.delete(id);
  }

  obtenerActivos(): ReporteProgramado[] {
    return this.listar().filter((r) => r.activo);
  }

  proximosAEnviar(
    frecuencia: ReporteProgramado["frecuencia"]
  ): ReporteProgramado[] {
    return this.obtenerActivos().filter((r) => r.frecuencia === frecuencia);
  }
}

/**
 * Genera un reporte en formato de tabla JSON.
 */
export function generarReporteJSON(tipo: string, datos: any): string {
  return JSON.stringify(datos, null, 2);
}

/**
 * Crea un nombre de archivo con timestamp.
 */
export function nombreArchivoReporte(
  tipo: string,
  formato: "csv" | "json" | "pdf" | "xlsx"
): string {
  const ahora = new Date();
  const fecha = ahora.toISOString().substring(0, 10);
  const hora = ahora.toISOString().substring(11, 19).replace(/:/g, "-");
  return `reporte-${tipo}-${fecha}-${hora}.${formato}`;
}

/**
 * Valida que un CSV sea válido (sin errores de formato).
 */
export function validarCSV(csv: string): boolean {
  try {
    const lineas = csv.split("\n");
    if (lineas.length < 2) return false;
    // Verificar que no hay comillas mal escapadas
    for (const linea of lineas) {
      const conteo = (linea.match(/"/g) || []).length;
      if (conteo % 2 !== 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}
