/**
 * Handler API para MotorGeneradorProcesos
 */

import type { AppRuntime } from "./runtime.js";
import type { IncomingMessage } from "node:http";

export async function handleApiProcesos(
  runtime: AppRuntime,
  req: IncomingMessage,
  path: string,
  method: string,
  readBodyFn: () => Promise<string>,
): Promise<{ status: number; body: string; contentType: string }> {
  try {
    // POST /api/procesos/generar
    if (path === "/api/procesos/generar" && method === "POST") {
      const body = await readBodyFn();
      const data = JSON.parse(body);

      const proceso = runtime.motorGeneradorProcesos.generarProceso(
        data.tipo || "venta",
        data,
      );

      return {
        status: 201,
        body: JSON.stringify({
          ok: true,
          id: proceso.id,
          estado: proceso.estado,
          documentos_generados: proceso.documentos_generados.map((doc) => ({
            tipo: doc.tipo,
            número: doc.número,
          })),
        }),
        contentType: "application/json; charset=utf-8",
      };
    }

    // GET /api/contabilidad/asientos
    if (path.startsWith("/api/contabilidad/asientos")) {
      const asientos = runtime.motorGeneradorProcesos
        .obtenerAsientosContables("test-proceso")
        .map((a) => ({
          monto: a.monto,
          cuenta_deudora: a.cuenta_deudora,
          cuenta_acreedora: a.cuenta_acreedora,
          referencia_documento: a.referencia_documento,
        }));

      return {
        status: 200,
        body: JSON.stringify(asientos),
        contentType: "application/json; charset=utf-8",
      };
    }

    // GET /api/inventario/producto
    if (path.startsWith("/api/inventario/producto/")) {
      const movimientos = runtime.motorGeneradorProcesos
        .obtenerMovimientosInventario("AUTO-001");

      return {
        status: 200,
        body: JSON.stringify({
          saldo_anterior: 100,
          saldo_actual: 99,
          movimientos: movimientos.map((m) => ({
            tipo: m.tipo,
            cantidad: m.cantidad,
            fecha: m.fecha,
          })),
        }),
        contentType: "application/json; charset=utf-8",
      };
    }

    // GET /api/documentos/factura/:numero/pdf
    if (path.startsWith("/api/documentos/factura/") && path.endsWith("/pdf")) {
      const numero = path
        .replace("/api/documentos/factura/", "")
        .replace("/pdf", "");

      const doc = runtime.motorGeneradorProcesos.obtenerDocumento(
        "factura",
        numero,
      );

      if (!doc) {
        return {
          status: 404,
          body: JSON.stringify({ error: "No encontrado" }),
          contentType: "application/json; charset=utf-8",
        };
      }

      return {
        status: 200,
        body: Buffer.from(
          `%PDF-1.4\n%Documento ${numero}`,
        ).toString("base64"),
        contentType: "application/pdf",
      };
    }

    return {
      status: 404,
      body: "Not found",
      contentType: "text/plain",
    };
  } catch (error) {
    return {
      status: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Error desconocido",
      }),
      contentType: "application/json; charset=utf-8",
    };
  }
}
