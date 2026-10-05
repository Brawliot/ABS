/**
 * Runtime Compras: Gestión de órdenes de compra y recepciones
 * Métodos delegados desde AppRuntime
 */

import { randomUUID } from "node:crypto";
import type { AppRuntime } from "./runtime.js";

export interface ComprasRuntimeFunctions {
  crearCompra(
    proveedor: string,
    productoId: string,
    cantidad: number,
    precioUnitarioCentimos: number,
    fechaPedido: string,
  ): { ok: true; id: string } | { ok: false; error: string };
  recibirCompra(compraId: string, cantidadRecibida: number): { ok: true } | { ok: false; error: string };
  listarCompras(filtros?: { proveedor?: string; estado?: "pendiente" | "recibida" | "cancelada" }): readonly any[];
  deudaConProveedor(proveedor: string): number;
}

export function createComprasFunctions(runtime: AppRuntime): ComprasRuntimeFunctions {
  return {
    crearCompra(
      proveedor: string,
      productoId: string,
      cantidad: number,
      precioUnitarioCentimos: number,
      fechaPedido: string,
    ): { ok: true; id: string } | { ok: false; error: string } {
      if (!proveedor || !productoId || cantidad <= 0 || precioUnitarioCentimos <= 0) {
        return { ok: false, error: "Datos de compra inválidos" };
      }
      const id = `compra-${randomUUID()}`;
      runtime.compras.crearCompra(
        runtime.tenantId,
        id,
        proveedor,
        productoId,
        cantidad,
        precioUnitarioCentimos,
        fechaPedido,
      );
      return { ok: true, id };
    },

    recibirCompra(compraId: string, cantidadRecibida: number): { ok: true } | { ok: false; error: string } {
      if (cantidadRecibida <= 0) {
        return { ok: false, error: "Cantidad inválida" };
      }
      const compra = runtime.compras.obtener(runtime.tenantId, compraId);
      if (!compra) {
        return { ok: false, error: "Compra no encontrada" };
      }
      if (cantidadRecibida > compra.cantidad) {
        return { ok: false, error: "Cantidad recibida mayor que la pedida" };
      }
      runtime.compras.recibirCompra(runtime.tenantId, compraId, cantidadRecibida);

      // Agregar stock
      runtime.stockFunctions.ajustarStock(
        compra.productoId,
        "entrada",
        cantidadRecibida * 1000,
        `Recepción compra ${compraId}`,
        "sistema",
      );

      return { ok: true };
    },

    listarCompras(filtros?: { proveedor?: string; estado?: "pendiente" | "recibida" | "cancelada" }): readonly any[] {
      return runtime.compras.listar(runtime.tenantId, filtros);
    },

    deudaConProveedor(proveedor: string): number {
      return runtime.compras.deudaConProveedor(runtime.tenantId, proveedor);
    },
  };
}
