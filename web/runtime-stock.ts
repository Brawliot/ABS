/**
 * Runtime Stock: Gestión de inventario y control de stock
 * Métodos delegados desde AppRuntime
 */

import type { AppRuntime } from "./runtime.js";
import {
  cantidadesPorOferta,
  resumenStock,
  type ResumenProducto,
  type MovimientoStock,
} from "../elements/stock.js";
import { proyectarTransaccion } from "../elements/transaccion.js";
import { movimientosStockDe } from "../elements/stock.js";

export interface StockRuntimeFunctions {
  obtenerProductosControlados(): ReadonlyMap<string, { readonly minimo: number }>;
  resumenStock(): ReadonlyMap<string, { readonly disponible: number; readonly reservado: number; readonly total: number }>;
  movimientosStockRecientes(limit: number): readonly MovimientoStock[];
  reservasDelExpediente(expedienteId: string): readonly { readonly ofertaId: string; readonly cantidadMilesimas: number }[];
  confirmarReservasDelExpediente(expedienteId: string): void;
  cancelarReservasDelExpediente(expedienteId: string): void;
  faltasStock(expedienteId: string): { readonly ofertaId: string; readonly necesita: number; readonly disponible: number }[];
  configurarStock(ofertaId: string, control: boolean, minimoMilesimas: number): { ok: true } | { ok: false; error: string };
  ajustarStock(
    ofertaId: string,
    tipo: "entrada" | "salida" | "recuento",
    cantidadMilesimas: number,
    motivo: string,
    actorId: string,
  ): { ok: true; delta: number } | { ok: false; error: string };
  stock(): { readonly productos: readonly ResumenProducto[]; readonly movimientos: readonly MovimientoStock[] };
}

export function createStockFunctions(runtime: AppRuntime): StockRuntimeFunctions {
  function stock(): { readonly productos: readonly ResumenProducto[]; readonly movimientos: readonly MovimientoStock[] } {
    const controlados = runtime.stockStore.controlados(runtime.tenantId);
    const ids = new Set(controlados.keys());
    const movimientos: MovimientoStock[] = [...runtime.stockStore.ajustes(runtime.tenantId)];
    const pendientes: { direccion: any; lineas: readonly any[] }[] = [];
    if (ids.size > 0) {
      for (const e of runtime.expedientesDinero()) {
        const slice = runtime.boot.input.lifecycles.find((l) => l.id === e.lifecycleId)!;
        const events = runtime.store.getBySubject(e.id);
        const lineas = proyectarTransaccion(events)!.datos.lineas;
        movimientos.push(
          ...movimientosStockDe({
            expedienteId: e.id,
            archetypeId: slice.archetypeId,
            lifecycle: slice.lifecycle,
            direccion: e.direccion,
            lineas,
            events,
            controlados: ids,
          }),
        );
        if (e.situacion === "pendiente" && ["venta", "servicio_proyecto"].includes(slice.archetypeId)) {
          pendientes.push({ direccion: e.direccion, lineas });
        }
      }
    }
    movimientos.sort((a, b) => a.at.localeCompare(b.at));
    return { productos: resumenStock({ controlados, movimientos, pendientes }), movimientos };
  }

  return {
    obtenerProductosControlados(): ReadonlyMap<string, { readonly minimo: number }> {
      return runtime.stockStore.controlados(runtime.tenantId);
    },

    resumenStock(): ReadonlyMap<string, { readonly disponible: number; readonly reservado: number; readonly total: number }> {
      const { productos } = stock();
      return new Map(
        productos.map((p) => [
          p.ofertaId,
          {
            disponible: p.disponible,
            reservado: (p as any).pendientes ?? 0,
            total: p.disponible + ((p as any).pendientes ?? 0),
          },
        ]),
      );
    },

    movimientosStockRecientes(limit: number): readonly MovimientoStock[] {
      const { movimientos } = stock();
      return movimientos.slice(-limit).reverse();
    },

    reservasDelExpediente(expedienteId: string): readonly { readonly ofertaId: string; readonly cantidadMilesimas: number }[] {
      return runtime.stockStore.reservasDelExpediente(runtime.tenantId, expedienteId);
    },

    confirmarReservasDelExpediente(expedienteId: string): void {
      runtime.stockStore.confirmarReservas(runtime.tenantId, expedienteId);
    },

    cancelarReservasDelExpediente(expedienteId: string): void {
      runtime.stockStore.cancelarReservas(runtime.tenantId, expedienteId);
    },

    faltasStock(expedienteId: string): { readonly ofertaId: string; readonly necesita: number; readonly disponible: number }[] {
      const e = runtime.expedientesDinero().find((x) => x.id === expedienteId);
      if (!e || e.direccion !== "entra" || (e.situacion !== "presupuesto" && e.situacion !== "pendiente")) return [];
      const productos = stock().productos;
      if (productos.length === 0) return [];
      const lineas = runtime.datosDe(expedienteId)!.datos.lineas;
      const ids = new Set(productos.map((p) => p.ofertaId));
      const out: { ofertaId: string; necesita: number; disponible: number }[] = [];
      for (const [ofertaId, q] of cantidadesPorOferta(lineas, ids)) {
        const p = productos.find((x) => x.ofertaId === ofertaId)!;
        const disponible = p.disponible + (e.situacion === "pendiente" ? q : 0);
        if (q > disponible) out.push({ ofertaId, necesita: q, disponible });
      }
      return out;
    },

    configurarStock(
      ofertaId: string,
      control: boolean,
      minimoMilesimas: number,
    ): { ok: true } | { ok: false; error: string } {
      if (!runtime.ofertas.get(runtime.tenantId, ofertaId)) return { ok: false, error: "Ese producto no existe." };
      if (!Number.isSafeInteger(minimoMilesimas) || minimoMilesimas < 0) {
        return { ok: false, error: "El mínimo no es válido." };
      }
      runtime.stockStore.configurar(
        runtime.tenantId,
        { ofertaId, control, minimo: minimoMilesimas },
        new Date().toISOString(),
      );
      return { ok: true };
    },

    ajustarStock(
      ofertaId: string,
      tipo: "entrada" | "salida" | "recuento",
      cantidadMilesimas: number,
      motivo: string,
      actorId: string,
    ): { ok: true; delta: number } | { ok: false; error: string } {
      if (!runtime.stockStore.controlados(runtime.tenantId).has(ofertaId)) {
        return { ok: false, error: "Ese producto no tiene activado el control de stock." };
      }
      const m = motivo.trim();
      if (!m) return { ok: false, error: "Indica el motivo del ajuste." };
      if (m.length > 200) return { ok: false, error: "El motivo es demasiado largo." };
      if (!Number.isSafeInteger(cantidadMilesimas) || cantidadMilesimas < 0 || (tipo !== "recuento" && cantidadMilesimas === 0)) {
        return { ok: false, error: "La cantidad no es válida." };
      }
      const actual = stock().productos.find((p) => p.ofertaId === ofertaId)?.stock ?? 0;
      const delta =
        tipo === "entrada" ? cantidadMilesimas : tipo === "salida" ? -cantidadMilesimas : cantidadMilesimas - actual;
      if (delta === 0) return { ok: true, delta: 0 };
      runtime.stockStore.ajustar(runtime.tenantId, {
        ofertaId,
        delta,
        motivo: m,
        actorId,
        at: new Date().toISOString(),
      });
      return { ok: true, delta };
    },

    stock(): { readonly productos: readonly ResumenProducto[]; readonly movimientos: readonly MovimientoStock[] } {
      return stock();
    },
  };
}
