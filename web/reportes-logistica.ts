/**
 * Generación de reportes de logística (HTML y CSV).
 */

import type { MotorLogistica } from "../policies/logistica.js";

export function generarReporteLogistica(
  logistica: MotorLogistica,
  desde: Date,
  hasta: Date
): {
  readonly html: string;
  readonly csv: string;
} {
  const reporte = logistica.generarReporteLogistica(desde, hasta);
  const envios = logistica.listarEnvios().filter(
    (e) => e.createdAt >= desde && e.createdAt <= hasta
  );

  // HTML
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Reporte de Logística</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
        .metric { background: #f0f0f0; padding: 15px; border-radius: 5px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #0066cc; }
        .metric-label { font-size: 12px; color: #666; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #f0f0f0; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>Reporte de Logística</h1>
      <p>Período: ${desde.toLocaleDateString()} - ${hasta.toLocaleDateString()}</p>

      <div class="metrics">
        <div class="metric">
          <div class="metric-value">${reporte.enviosTotal}</div>
          <div class="metric-label">Envíos Totales</div>
        </div>
        <div class="metric">
          <div class="metric-value">${reporte.tasaEntrega.toFixed(1)}%</div>
          <div class="metric-label">Tasa de Entrega</div>
        </div>
        <div class="metric">
          <div class="metric-value">$${Math.round(reporte.costoPromedio).toLocaleString()}</div>
          <div class="metric-label">Costo Promedio</div>
        </div>
        <div class="metric">
          <div class="metric-value">${reporte.demora_promedio_dias.toFixed(1)}</div>
          <div class="metric-label">Demora Promedio (días)</div>
        </div>
      </div>

      <h2>Detalle de Envíos</h2>
      <table>
        <thead>
          <tr>
            <th>ID Envío</th>
            <th>Expediente</th>
            <th>Proveedor</th>
            <th>Estado</th>
            <th>Costo</th>
            <th>Destino</th>
          </tr>
        </thead>
        <tbody>
          ${envios
            .map(
              (e) => `
            <tr>
              <td>${e.id}</td>
              <td>${e.expedienteId}</td>
              <td>${e.proveedor}</td>
              <td>${e.estado}</td>
              <td>$${e.costo.toLocaleString()}</td>
              <td>${e.destino}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </body>
    </html>
  `;

  // CSV
  const csvHead = "ID Envío,Expediente,Proveedor,Estado,Costo,Destino,Zona\n";
  const csvRows = envios
    .map(
      (e) =>
        `${e.id},${e.expedienteId},${e.proveedor},${e.estado},${e.costo},${e.destino},${e.zona}`
    )
    .join("\n");
  const csv = csvHead + csvRows;

  return { html, csv };
}
