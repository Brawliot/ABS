import type { ActivoFijo } from '../elements/activo-fijo.js';

export interface ActivoDepreciado {
  readonly activoId: string;
  readonly nombre: string;
  readonly depreciación: number;
  readonly tasaDepreciación: number;
}

export function generarReporteActivosFijos(
  activos: ActivoFijo[]
): {
  readonly html: string;
  readonly csv: string;
} {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Reporte de Activos Fijos</title>
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
  <h1>Reporte de Activos Fijos</h1>
  <p>Generado: ${new Date().toISOString()}</p>

  <h2>Resumen</h2>
  <p>Total de activos: ${activos.length}</p>
  <p>Valor total actual: ${calcularValorTotal(activos)}</p>

  <h2>Inventario Detallado</h2>
  <table>
    <tr>
      <th>ID</th>
      <th>Nombre</th>
      <th>Tipo</th>
      <th>Ubicación</th>
      <th>Responsable</th>
      <th>Costo</th>
      <th>Estado</th>
    </tr>
    ${activos
      .map(
        (a) => `
    <tr>
      <td>${a.id}</td>
      <td>${a.nombre}</td>
      <td>${a.tipo}</td>
      <td>${a.ubicación}</td>
      <td>${a.responsable || "N/A"}</td>
      <td>${a.costoAdquisición}</td>
      <td>${a.estado}</td>
    </tr>
    `
      )
      .join("")}
  </table>
</body>
</html>
  `;

  const csv = generarCSVActivos(activos);

  return { html, csv };
}

export function reporteDepreciación(
  activos: ActivoFijo[],
  año: number
): {
  readonly poractivo: ActivoDepreciado[];
  readonly totalDepreciación: number;
  readonly vidaÚtilPromedio: number;
} {
  const porActivo: ActivoDepreciado[] = activos.map((a) => {
    const últimoValor = a.valoresActuales[a.valoresActuales.length - 1];
    const depreciación = últimoValor ? últimoValor.depreciación : 0;
    const tasaDepreciación =
      a.costoAdquisición > 0 ? (depreciación / a.costoAdquisición) * 100 : 0;

    return {
      activoId: a.id,
      nombre: a.nombre,
      depreciación,
      tasaDepreciación,
    };
  });

  const totalDepreciación = porActivo.reduce((sum, a) => sum + a.depreciación, 0);
  const vidaÚtilPromedio =
    activos.reduce(
      (sum, a) =>
        sum +
        (a.valoresActuales[a.valoresActuales.length - 1]?.vidaÚtil || 5),
      0
    ) / Math.max(1, activos.length);

  return {
    poractivo: porActivo,
    totalDepreciación,
    vidaÚtilPromedio,
  };
}

function calcularValorTotal(activos: ActivoFijo[]): number {
  return activos.reduce((sum, a) => {
    const últimoValor = a.valoresActuales[a.valoresActuales.length - 1];
    return sum + (últimoValor ? últimoValor.valorLibros : a.costoAdquisición);
  }, 0);
}

function generarCSVActivos(activos: ActivoFijo[]): string {
  const headers = [
    "ID",
    "Nombre",
    "Tipo",
    "Ubicación",
    "Responsable",
    "Costo",
    "Estado",
    "Creado",
  ];

  const rows = activos.map((a) => [
    a.id,
    a.nombre,
    a.tipo,
    a.ubicación,
    a.responsable || "",
    a.costoAdquisición,
    a.estado,
    a.createdAt.toISOString(),
  ]);

  return (
    headers.join(",") +
    "\n" +
    rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n")
  );
}
