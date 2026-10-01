/**
 * Reportes de negocio: ventas, cobros, impagos, rentabilidad, stock.
 * GET /reportes?tipo=<tipo>&desde=<fecha>&hasta=<fecha>
 * Formato: JSON o tabla HTML
 */

import type { IncomingMessage } from "node:http";
import { formatCentimos } from "../elements/oferta.js";
import {
  errorList,
  esc,
  fecha,
  html,
  identifyGet,
  page,
  text,
  withDev,
  type MaestrosContext,
  type MaestrosResponse,
  type Viewer,
} from "./maestros.js";

export function isReportesPath(path: string): boolean {
  return path === "/reportes";
}

export async function handleReportes(
  ctx: MaestrosContext,
  req: IncomingMessage,
): Promise<MaestrosResponse> {
  const url = new URL(req.url ?? "/", "http://local");
  const query = Object.fromEntries(url.searchParams.entries());

  const who = identifyGet(ctx, req, query);
  if ("response" in who) return who.response;

  const tipo = query.tipo ?? "ventas";
  const desde = query.desde ?? "2026-01-01";
  const hasta = query.hasta ?? "2026-12-31";
  const formato = query.formato ?? "html";

  const datos = generarReporte(ctx, tipo, desde, hasta);

  if (formato === "json") {
    return {
      status: 200,
      body: JSON.stringify(datos),
      contentType: "application/json",
      headers: {
        "Content-Disposition": `attachment; filename="reporte-${tipo}.json"`,
      },
    };
  }

  // HTML
  const html_body = reporteHtml(who.viewer, ctx, tipo, desde, hasta, datos);
  return html(200, page(ctx, who.viewer, `Reporte: ${tipo}`, html_body));
}

interface ReporteData {
  readonly tipo: string;
  readonly desde: string;
  readonly hasta: string;
  readonly filas: readonly Record<string, unknown>[];
  readonly totales?: Record<string, number | string>;
}

function generarReporte(
  ctx: MaestrosContext,
  tipo: string,
  desde: string,
  hasta: string,
): ReporteData {
  const { runtime } = ctx;

  switch (tipo) {
    case "ventas":
      return reporteVentas(runtime, desde, hasta);
    case "cobros":
      return reporteCobros(runtime, desde, hasta);
    case "impagos":
      return reporteImpagos(runtime, desde, hasta);
    case "rentabilidad":
      return reporteRentabilidad(runtime, desde, hasta);
    case "stock":
      return reporteStock(runtime);
    default:
      return { tipo, desde, hasta, filas: [] };
  }
}

function reporteVentas(
  runtime: typeof import("./runtime.js").AppRuntime.prototype,
  desde: string,
  hasta: string,
) {
  const expedientes = runtime.expedientesDinero()
    .filter((e) => e.direccion === "entra" && e.fecha >= desde && e.fecha <= hasta);

  const porCliente: Record<string, { nombre: string; total: number; cantidad: number }> = {};
  let totalGeneral = 0;

  for (const exp of expedientes) {
    const nombre = runtime.nombreParte(exp.parteId);
    if (!porCliente[exp.parteId]) {
      porCliente[exp.parteId] = { nombre, total: 0, cantidad: 0 };
    }
    const entry = porCliente[exp.parteId]!;
    entry.total += exp.totalCentimos;
    entry.cantidad += 1;
    totalGeneral += exp.totalCentimos;
  }

  const filas = Object.entries(porCliente).map(([_id, data]) => ({
    cliente: data?.nombre ?? "",
    cantidad: data?.cantidad ?? 0,
    importe: formatCentimos(data?.total ?? 0),
    importeCentimos: data?.total ?? 0,
  }));

  return {
    tipo: "ventas",
    desde,
    hasta,
    filas,
    totales: {
      "Total vendido": formatCentimos(totalGeneral),
      "Expedientes": expedientes.length,
    },
  };
}

function reporteCobros(
  runtime: typeof import("./runtime.js").AppRuntime.prototype,
  desde: string,
  hasta: string,
) {
  const expedientes = runtime.expedientesDinero()
    .filter((e) => e.fecha >= desde && e.fecha <= hasta);

  const filas: Record<string, unknown>[] = [];
  let totalCobros = 0;

  for (const exp of expedientes) {
    const cobros = runtime.cobros.deExpediente(runtime.tenantId, exp.id);
    for (const cobro of cobros) {
      if (cobro.fecha >= desde && cobro.fecha <= hasta) {
        filas.push({
          expediente: exp.label,
          cliente: runtime.nombreParte(exp.parteId),
          fecha: cobro.fecha,
          medio: cobro.medio,
          importe: formatCentimos(cobro.importeCentimos),
          importeCentimos: cobro.importeCentimos,
        });
        totalCobros += cobro.importeCentimos;
      }
    }
  }

  return {
    tipo: "cobros",
    desde,
    hasta,
    filas,
    totales: {
      "Total cobrado": formatCentimos(totalCobros),
      "Transacciones": filas.length,
    },
  };
}

function reporteImpagos(
  runtime: typeof import("./runtime.js").AppRuntime.prototype,
  desde: string,
  hasta: string,
) {
  const expedientes = runtime.expedientesDinero()
    .filter((e) => e.direccion === "entra" && e.situacion === "pendiente");

  const filas = expedientes.map((exp) => ({
    expediente: exp.label,
    cliente: runtime.nombreParte(exp.parteId),
    fecha: exp.fecha,
    importe: formatCentimos(exp.totalCentimos),
    importeCentimos: exp.totalCentimos,
    estado: exp.estadoLabel,
  }));

  const totalDeuda = filas.reduce((sum, f) => sum + (f.importeCentimos as number), 0);

  return {
    tipo: "impagos",
    desde,
    hasta,
    filas,
    totales: {
      "Total deuda": formatCentimos(totalDeuda),
      "Expedientes sin pagar": filas.length,
    },
  };
}

function reporteRentabilidad(
  runtime: typeof import("./runtime.js").AppRuntime.prototype,
  desde: string,
  hasta: string,
) {
  const expedientes = runtime.expedientesDinero()
    .filter((e) => e.direccion === "entra" && e.fecha >= desde && e.fecha <= hasta);

  const ingresos = expedientes.reduce((sum, e) => sum + e.totalCentimos, 0);

  // Gastos: devoluciones (aproximado)
  let gastos = 0;
  for (const exp of expedientes) {
    gastos += runtime.devoluciones.totalDevuelto(runtime.tenantId, exp.id);
  }

  const margen = ingresos - gastos;
  const margenPct = ingresos > 0 ? (margen / ingresos) * 100 : 0;

  const filas = [
    {
      concepto: "Ingresos",
      importe: formatCentimos(ingresos),
      importeCentimos: ingresos,
    },
    {
      concepto: "Gastos (devoluciones)",
      importe: formatCentimos(gastos),
      importeCentimos: gastos,
    },
    {
      concepto: "Margen neto",
      importe: formatCentimos(margen),
      importeCentimos: margen,
    },
  ];

  return {
    tipo: "rentabilidad",
    desde,
    hasta,
    filas,
    totales: {
      "Margen %": margenPct.toFixed(2),
    },
  };
}

function reporteStock(
  runtime: typeof import("./runtime.js").AppRuntime.prototype,
) {
  const controlados = runtime.stockStore.controlados(runtime.tenantId);
  const ajustes = runtime.stockStore.ajustes(runtime.tenantId);

  const filas: Record<string, unknown>[] = [];

  for (const [ofertaId, config] of controlados) {
    const oferta = runtime.ofertas.get(runtime.tenantId, ofertaId);
    const ajustesPorProducto = ajustes.filter((a) => a.ofertaId === ofertaId);

    const entrada = ajustesPorProducto
      .filter((a) => a.delta > 0)
      .reduce((sum, a) => sum + a.delta, 0);

    const salida = ajustesPorProducto
      .filter((a) => a.delta < 0)
      .reduce((sum, a) => sum + Math.abs(a.delta), 0);

    const disponible = entrada - salida;

    filas.push({
      producto: oferta?.nombre ?? ofertaId,
      entrada,
      salida,
      disponible,
      minimo: config.minimo,
    });
  }

  return {
    tipo: "stock",
    desde: "N/A",
    hasta: "N/A",
    filas,
  };
}

function reporteHtml(
  viewer: Viewer,
  ctx: MaestrosContext,
  tipo: string,
  desde: string,
  hasta: string,
  datos: ReporteData,
): string {
  const tiposDisponibles = ["ventas", "cobros", "impagos", "rentabilidad", "stock"];

  const selectorTipo = tiposDisponibles
    .map(
      (t) =>
        `<option value="${t}"${tipo === t ? " selected" : ""}>${esc(t)}</option>`,
    )
    .join("");

  const tabla =
    datos.filas.length === 0
      ? `<p class="empty">Sin datos para este período.</p>`
      : `<table data-reporte-tabla><thead><tr>` +
        Object.keys(datos.filas[0] ?? {})
          .filter((k) => !k.includes("Centimos"))
          .map((k) => `<th>${esc(k)}</th>`)
          .join("") +
        `</tr></thead><tbody>` +
        datos.filas
          .map((fila) => {
            const valores = Object.entries(fila)
              .filter(([k]) => !k.includes("Centimos"))
              .map(([_, v]) => `<td>${esc(String(v))}</td>`)
              .join("");
            return `<tr>${valores}</tr>`;
          })
          .join("") +
        `</tbody></table>`;

  const totales =
    datos.totales && Object.keys(datos.totales).length > 0
      ? `<div class="reporte-totales"><strong>Totales:</strong><dl>` +
        Object.entries(datos.totales)
          .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`)
          .join("") +
        `</dl></div>`
      : "";

  return (
    `<form method="get" action="/reportes" data-reporte-form>` +
    `<div style="display:grid; grid-template-columns: auto auto auto auto; gap:12px; margin-bottom:16px">` +
    `<label>Tipo <select name="tipo">${selectorTipo}</select></label>` +
    `<label>Desde <input type="date" name="desde" value="${esc(desde)}" /></label>` +
    `<label>Hasta <input type="date" name="hasta" value="${esc(hasta)}" /></label>` +
    `<button type="submit">Generar reporte</button>` +
    `</div>` +
    `</form>` +
    `<div style="margin-top:24px">` +
    tabla +
    totales +
    `</div>`
  );
}
