/**
 * Stock (Recurso consumible, derivado): existencias de los productos del
 * catálogo marcados con «controlar stock».
 *
 *   stock      = ajustes manuales + compras recibidas − ventas entregadas
 *   reservado  = ventas aceptadas y aún sin entregar
 *   en camino  = compras aceptadas y aún sin recibir
 *   disponible = stock − reservado
 *
 * La mercancía se mueve en el paso que entrega (cumple c_entregar) o, en
 * ciclos sin entrega explícita (servicio por proyecto), al cerrar con éxito.
 * Solo venta y servicio por proyecto mueven stock: en alquileres el bien
 * vuelve y en suscripciones no hay mercancía.
 * Nunca bloquea: avisa (el stock negativo es habitual hasta que se apunta
 * una compra).
 */

import type { DomainEvent, LineaDatos } from "../core/events.js";
import type { Lifecycle, Transition } from "../core/lifecycle.js";
import type { Direccion } from "./movimientos.js";

const ARQUETIPOS_CON_STOCK = new Set(["venta", "servicio_proyecto"]);

export interface MovimientoStock {
  readonly ofertaId: string;
  /** Milésimas: positivo entra, negativo sale. */
  readonly delta: number;
  readonly at: string;
  readonly origen: "expediente" | "ajuste";
  readonly expedienteId?: string;
  readonly motivo?: string;
  readonly actorId?: string;
}

export function mueveStock(
  archetypeId: string,
  lifecycle: Lifecycle,
  t: Transition,
): boolean {
  if (!ARQUETIPOS_CON_STOCK.has(archetypeId)) return false;
  const conEntrega = lifecycle.commitments.some((c) => c.id === "c_entregar");
  if (conEntrega) return t.fulfills.includes("c_entregar");
  return lifecycle.states.find((s) => s.id === t.to)?.kind === "terminal_exito";
}

/** Cantidad por producto controlado en unas líneas. */
export function cantidadesPorOferta(
  lineas: readonly LineaDatos[],
  controlados: ReadonlySet<string>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lineas) {
    if (!l.ofertaId || !controlados.has(l.ofertaId)) continue;
    out.set(l.ofertaId, (out.get(l.ofertaId) ?? 0) + l.cantidadMilesimas);
  }
  return out;
}

/** Movimientos de stock de un expediente (al entregar / recibir). */
export function movimientosStockDe(params: {
  readonly expedienteId: string;
  readonly archetypeId: string;
  readonly lifecycle: Lifecycle;
  readonly direccion: Direccion;
  readonly lineas: readonly LineaDatos[];
  readonly events: readonly DomainEvent[];
  readonly controlados: ReadonlySet<string>;
}): MovimientoStock[] {
  const cantidades = cantidadesPorOferta(params.lineas, params.controlados);
  if (cantidades.size === 0) return [];
  const signo = params.direccion === "sale" ? 1 : -1; // compra suma, venta resta
  const out: MovimientoStock[] = [];
  for (const e of params.events) {
    if (e.kind !== "transicion") continue;
    const t = params.lifecycle.transitions.find((x) => x.id === e.transitionId);
    if (!t || !mueveStock(params.archetypeId, params.lifecycle, t)) continue;
    for (const [ofertaId, q] of cantidades) {
      out.push({
        ofertaId,
        delta: signo * q,
        at: e.occurredAt,
        origen: "expediente",
        expedienteId: params.expedienteId,
        actorId: e.actorId,
      });
    }
    break; // la mercancía se mueve una sola vez por expediente
  }
  return out;
}

export type EstadoStock = "ok" | "bajo" | "agotado";

export interface ResumenProducto {
  readonly ofertaId: string;
  readonly stock: number;
  readonly reservado: number;
  readonly enCamino: number;
  readonly disponible: number;
  readonly minimo: number;
  readonly estado: EstadoStock;
}

export function estadoStock(disponible: number, minimo: number): EstadoStock {
  if (disponible <= 0) return "agotado";
  if (disponible <= minimo) return "bajo";
  return "ok";
}

/**
 * Resumen por producto. `pendientes` son las líneas de expedientes aceptados
 * sin entregar (ventas → reservado; compras → en camino).
 */
export function resumenStock(params: {
  readonly controlados: ReadonlyMap<string, { readonly minimo: number }>;
  readonly movimientos: readonly MovimientoStock[];
  readonly pendientes: readonly { readonly direccion: Direccion; readonly lineas: readonly LineaDatos[] }[];
}): ResumenProducto[] {
  const ids = new Set(params.controlados.keys());
  const stock = new Map<string, number>();
  for (const m of params.movimientos) {
    if (ids.has(m.ofertaId)) stock.set(m.ofertaId, (stock.get(m.ofertaId) ?? 0) + m.delta);
  }
  const reservado = new Map<string, number>();
  const enCamino = new Map<string, number>();
  for (const p of params.pendientes) {
    const target = p.direccion === "entra" ? reservado : enCamino;
    for (const [id, q] of cantidadesPorOferta(p.lineas, ids)) {
      target.set(id, (target.get(id) ?? 0) + q);
    }
  }
  return [...ids].map((ofertaId) => {
    const s = stock.get(ofertaId) ?? 0;
    const r = reservado.get(ofertaId) ?? 0;
    const minimo = params.controlados.get(ofertaId)!.minimo;
    const disponible = s - r;
    return {
      ofertaId,
      stock: s,
      reservado: r,
      enCamino: enCamino.get(ofertaId) ?? 0,
      disponible,
      minimo,
      estado: estadoStock(disponible, minimo),
    };
  });
}
