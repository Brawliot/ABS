import type {
  Campaña,
  ContactoEmail,
  EstadísticasCampaña,
  Segmento,
} from '../elements/email-marketing.js';

export interface ResumenSegmento {
  readonly nombre: string;
  readonly contactos: number;
  readonly tasaAperturaPromedio: number;
  readonly tasaClickPromedio: number;
}

export interface ResumenCampaña {
  readonly nombre: string;
  readonly estado: string;
  readonly enviados: number;
  readonly abiertos: number;
  readonly clicks: number;
  readonly tasaApertura: number;
  readonly tasaClick: number;
}

export function generarReportesCampañas(
  campañas: Campaña[],
  _desde: Date,
  _hasta: Date
): {
  readonly html: string;
  readonly csv: string;
} {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Reporte de Campañas de Email</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f0f0f0; }
    .total { font-weight: bold; background-color: #e8f4f8; }
  </style>
</head>
<body>
  <h1>Reporte de Campañas de Email Marketing</h1>
  <p>Generado: ${new Date().toISOString()}</p>

  <h2>Resumen de Campañas</h2>
  <table>
    <tr>
      <th>Nombre</th>
      <th>Estado</th>
      <th>Enviados</th>
      <th>Abiertos</th>
      <th>Clicks</th>
      <th>Tasa Apertura</th>
      <th>Tasa Click</th>
    </tr>
    ${campañas
      .map(
        (c) => `
    <tr>
      <td>${c.nombre}</td>
      <td>${c.estado}</td>
      <td>${c.estadísticas?.enviados || 0}</td>
      <td>${c.estadísticas?.abiertos || 0}</td>
      <td>${c.estadísticas?.clicks || 0}</td>
      <td>${(c.estadísticas?.tasaApertura || 0).toFixed(2)}%</td>
      <td>${(c.estadísticas?.tasaClick || 0).toFixed(2)}%</td>
    </tr>
    `
      )
      .join("")}
  </table>
</body>
</html>
  `;

  const csv = generarCSVCampañas(campañas);

  return { html, csv };
}

export function reporteSegmentos(
  segmentos: Segmento[],
  _contactos: ContactoEmail[]
): {
  readonly segmentos: ResumenSegmento[];
} {
  return {
    segmentos: segmentos.map((s) => ({
      nombre: s.nombre,
      contactos: s.contactosCount,
      tasaAperturaPromedio: 0,
      tasaClickPromedio: 0,
    })),
  };
}

function generarCSVCampañas(campañas: Campaña[]): string {
  const headers = [
    "Nombre",
    "Estado",
    "Enviados",
    "Abiertos",
    "Clicks",
    "Tasa Apertura",
    "Tasa Click",
  ];

  const rows = campañas.map((c) => [
    c.nombre,
    c.estado,
    c.estadísticas?.enviados || 0,
    c.estadísticas?.abiertos || 0,
    c.estadísticas?.clicks || 0,
    (c.estadísticas?.tasaApertura || 0).toFixed(2),
    (c.estadísticas?.tasaClick || 0).toFixed(2),
  ]);

  return (
    headers.join(",") +
    "\n" +
    rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n")
  );
}
