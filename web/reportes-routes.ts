/**
 * Rutas HTTP para reportes BI.
 * GET /reportes?tipo=<tipo>&desde=fecha&hasta=fecha&formato=json|csv
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppRuntime } from "./runtime.js";
import {
  generarReporteVentas,
  generarReporteCobros,
  generarReporteImpagos,
  generarReporteCiclos,
  generarReporteResumen,
} from "../generator/reportes.js";
import { generarReporteP_L } from "../generator/reportes-pl.js";
import {
  generarReporteSegmentoPorCliente,
  generarReporteSegmentoPorProducto,
  generarReporteSegmentoPorCiclo,
} from "../generator/reportes-segmento.js";
import { exportarCSV, nombreArchivoReporte } from "../generator/reportes-export.js";

function parseQuery(url: string): Record<string, string> {
  const i = url.indexOf("?");
  if (i < 0) return {};
  const out: Record<string, string> = {};
  new URLSearchParams(url.slice(i + 1)).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  type: string,
  headers?: Record<string, string | string[]>
): void {
  const merged: Record<string, string | string[]> = {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...(headers ?? {}),
  };
  res.statusCode = status;
  for (const [k, v] of Object.entries(merged)) {
    if (k === "Content-Disposition" && typeof v === "string") {
      res.setHeader(k, v);
    } else if (typeof v === "string") {
      res.setHeader(k, v);
    }
  }
  res.end(body);
}

export function manejarRutasReportes(
  path: string,
  url: string,
  runtime: AppRuntime,
  res: ServerResponse
): boolean {
  // GET /reportes — reporte general
  if (path === "/reportes") {
    const query = parseQuery(url);
    const tipo = query.tipo || "resumen";
    const formato = (query.formato || "json") as "json" | "csv";

    try {
      const desde = query.desde
        ? new Date(query.desde)
        : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const hasta = query.hasta ? new Date(query.hasta) : new Date();

      let datos: any;

      switch (tipo) {
        case "ventas":
          datos = generarReporteVentas(runtime, { desde, hasta });
          break;
        case "cobros":
          datos = generarReporteCobros(runtime, { desde, hasta });
          break;
        case "impagos":
          datos = generarReporteImpagos(runtime, { desde, hasta });
          break;
        case "ciclos":
          datos = generarReporteCiclos(runtime, { desde, hasta });
          break;
        case "resumen":
        default:
          datos = generarReporteResumen(runtime, { desde, hasta });
      }

      if (formato === "csv") {
        const csv = exportarCSV(
          tipo as "ventas" | "cobros" | "impagos" | "ciclos" | "pl",
          tipo === "resumen" ? datos : { [tipo]: datos }
        );
        const filename = nombreArchivoReporte(tipo, "csv");
        return send(res, 200, csv, "text/csv; charset=utf-8", {
          "Content-Disposition": `attachment; filename="${filename}"`,
        });
      } else {
        return send(
          res,
          200,
          JSON.stringify(datos, null, 2),
          "application/json; charset=utf-8"
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      return send(
        res,
        500,
        JSON.stringify({ error: msg }),
        "application/json; charset=utf-8"
      );
    }
  }

  // GET /reportes/pl — reporte de P&L
  if (path === "/reportes/pl") {
    const query = parseQuery(url);
    const formato = (query.formato || "json") as "json" | "csv";

    try {
      const desde = query.desde
        ? new Date(query.desde)
        : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const hasta = query.hasta ? new Date(query.hasta) : new Date();

      const datos = generarReporteP_L(runtime, { desde, hasta });

      if (formato === "csv") {
        const csv = exportarCSV("pl", datos);
        const filename = nombreArchivoReporte("pl", "csv");
        return send(res, 200, csv, "text/csv; charset=utf-8", {
          "Content-Disposition": `attachment; filename="${filename}"`,
        });
      } else {
        return send(
          res,
          200,
          JSON.stringify(datos, null, 2),
          "application/json; charset=utf-8"
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      return send(
        res,
        500,
        JSON.stringify({ error: msg }),
        "application/json; charset=utf-8"
      );
    }
  }

  // GET /reportes/segmento — reportes por segmento
  if (path === "/reportes/segmento") {
    const query = parseQuery(url);
    const tipoSegmento = query.tipo || "cliente";
    const formato = (query.formato || "json") as "json" | "csv";

    try {
      const desde = query.desde
        ? new Date(query.desde)
        : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const hasta = query.hasta ? new Date(query.hasta) : new Date();

      let datos: any;

      switch (tipoSegmento) {
        case "cliente":
          datos = generarReporteSegmentoPorCliente(runtime, { desde, hasta });
          break;
        case "producto":
          datos = generarReporteSegmentoPorProducto(runtime, { desde, hasta });
          break;
        case "ciclo":
          datos = generarReporteSegmentoPorCiclo(runtime, { desde, hasta });
          break;
        default:
          return send(
            res,
            400,
            JSON.stringify({ error: "Tipo de segmento no válido" }),
            "application/json; charset=utf-8"
          );
      }

      if (formato === "csv") {
        const csv = exportarCSV("pl", datos); // Reutiliza formato CSV genérico
        const filename = nombreArchivoReporte(`segmento-${tipoSegmento}`, "csv");
        return send(res, 200, csv, "text/csv; charset=utf-8", {
          "Content-Disposition": `attachment; filename="${filename}"`,
        });
      } else {
        return send(
          res,
          200,
          JSON.stringify(datos, null, 2),
          "application/json; charset=utf-8"
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      return send(
        res,
        500,
        JSON.stringify({ error: msg }),
        "application/json; charset=utf-8"
      );
    }
  }

  // GET /reportes/descargar — descarga de reportes
  if (path === "/reportes/descargar") {
    const query = parseQuery(url);
    const tipo = query.tipo || "resumen";
    const formato = (query.formato || "csv") as "csv" | "excel" | "pdf";

    try {
      const desde = query.desde
        ? new Date(query.desde)
        : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const hasta = query.hasta ? new Date(query.hasta) : new Date();

      let datos: any;

      switch (tipo) {
        case "ventas":
          datos = generarReporteVentas(runtime, { desde, hasta });
          break;
        case "cobros":
          datos = generarReporteCobros(runtime, { desde, hasta });
          break;
        case "impagos":
          datos = generarReporteImpagos(runtime, { desde, hasta });
          break;
        case "ciclos":
          datos = generarReporteCiclos(runtime, { desde, hasta });
          break;
        case "pl":
          datos = generarReporteP_L(runtime, { desde, hasta });
          break;
        case "resumen":
        default:
          datos = generarReporteResumen(runtime, { desde, hasta });
      }

      if (formato === "csv") {
        const csv = exportarCSV(
          tipo as "ventas" | "cobros" | "impagos" | "ciclos" | "pl",
          tipo === "resumen" ? datos : { [tipo]: datos }
        );
        const filename = nombreArchivoReporte(tipo, "csv");
        return send(res, 200, csv, "text/csv; charset=utf-8", {
          "Content-Disposition": `attachment; filename="${filename}"`,
        });
      } else if (formato === "excel") {
        // TODO: Implementar exportación a Excel (usar librería como 'xlsx')
        return send(
          res,
          501,
          JSON.stringify({ error: "Excel export not yet implemented" }),
          "application/json; charset=utf-8"
        );
      } else if (formato === "pdf") {
        // TODO: Implementar exportación a PDF (usar librería como 'pdfkit')
        return send(
          res,
          501,
          JSON.stringify({ error: "PDF export not yet implemented" }),
          "application/json; charset=utf-8"
        );
      }

      return send(
        res,
        400,
        JSON.stringify({ error: "Formato no válido" }),
        "application/json; charset=utf-8"
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      return send(
        res,
        500,
        JSON.stringify({ error: msg }),
        "application/json; charset=utf-8"
      );
    }
  }

  return false;
}
