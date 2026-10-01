/**
 * Reportes por segmento: cliente, producto, ciclo.
 */

import type { AppRuntime } from "../web/runtime.js";
import type { TransitionEvent } from "../core/events.js";
import { deriveState } from "../core/derivation.js";
import { findState } from "../core/lifecycle.js";

export interface ClienteSegmento {
  cliente: string;
  totalVendido: number;
  numeroCompras: number;
  margen: number;
  tiempoPromedioDias: number;
}

export interface ProductoSegmento {
  producto: string;
  totalVendido: number;
  numeroVentas: number;
  margen: number;
  rotacion: number; // veces vendido en el período
}

export interface CicloSegmento {
  tipo: string;
  totalExpedientes: number;
  totalVendido: number;
  margen: number;
  tiempoPromedioDias: number;
  tasaCierre: number;
}

export interface ReporteSegmentoPorCliente {
  periodo: {
    desde: string;
    hasta: string;
  };
  clientes: ClienteSegmento[];
  topClientes: ClienteSegmento[];
}

export interface ReporteSegmentoPorProducto {
  periodo: {
    desde: string;
    hasta: string;
  };
  productos: ProductoSegmento[];
  topProductos: ProductoSegmento[];
}

export interface ReporteSegmentoPorCiclo {
  periodo: {
    desde: string;
    hasta: string;
  };
  ciclos: CicloSegmento[];
}

function extraerDatos(event: TransitionEvent): {
  monto: number;
  costo: number;
  producto?: string;
} {
  if (!event.data || typeof event.data !== "object") {
    return { monto: 0, costo: 0 };
  }
  const data = event.data as Record<string, unknown>;
  return {
    monto: typeof data.monto === "number" ? data.monto : 0,
    costo: typeof data.costo === "number" ? data.costo : 0,
    producto: typeof data.producto === "string" ? data.producto : undefined,
  };
}

/**
 * Genera reporte por cliente.
 */
export function generarReporteSegmentoPorCliente(
  runtime: AppRuntime,
  opciones: {
    desde: Date;
    hasta: Date;
  }
): ReporteSegmentoPorCliente {
  const { desde, hasta } = opciones;
  const clientesMap: Map<
    string,
    {
      totalVendido: number;
      numeroCompras: number;
      totalCosto: number;
      tiempos: number[];
    }
  > = new Map();

  for (const subject of runtime.subjects) {
    const cliente = subject.parteId;
    if (!clientesMap.has(cliente)) {
      clientesMap.set(cliente, {
        totalVendido: 0,
        numeroCompras: 0,
        totalCosto: 0,
        tiempos: [],
      });
    }

    const events = runtime.store.getBySubject(subject.id) as TransitionEvent[];
    const primeraFecha = events.length > 0 ? new Date(events[0].occurredAt) : null;

    for (const evt of events) {
      const fecha = new Date(evt.occurredAt);
      if (fecha >= desde && fecha <= hasta) {
        const { monto, costo } = extraerDatos(evt);
        if (monto > 0) {
          const data = clientesMap.get(cliente)!;
          data.totalVendido += monto;
          data.numeroCompras++;
          data.totalCosto += costo;
        }
      }
    }

    // Calcular tiempo promedio
    if (events.length > 0 && primeraFecha) {
      const ultimaFecha = new Date(events[events.length - 1].occurredAt);
      const dias = Math.floor(
        (ultimaFecha.getTime() - primeraFecha.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (dias >= 0) {
        clientesMap.get(cliente)!.tiempos.push(dias);
      }
    }
  }

  const clientes: ClienteSegmento[] = Array.from(clientesMap.entries()).map(
    ([cliente, data]) => ({
      cliente,
      totalVendido: data.totalVendido,
      numeroCompras: data.numeroCompras,
      margen: data.totalVendido - data.totalCosto,
      tiempoPromedioDias:
        data.tiempos.length > 0
          ? Math.round(data.tiempos.reduce((a, b) => a + b, 0) / data.tiempos.length)
          : 0,
    })
  );

  const topClientes = clientes
    .sort((a, b) => b.totalVendido - a.totalVendido)
    .slice(0, 10);

  return {
    periodo: {
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
    },
    clientes,
    topClientes,
  };
}

/**
 * Genera reporte por producto.
 */
export function generarReporteSegmentoPorProducto(
  runtime: AppRuntime,
  opciones: {
    desde: Date;
    hasta: Date;
  }
): ReporteSegmentoPorProducto {
  const { desde, hasta } = opciones;
  const productosMap: Map<
    string,
    {
      totalVendido: number;
      numeroVentas: number;
      totalCosto: number;
    }
  > = new Map();

  for (const subject of runtime.subjects) {
    const events = runtime.store.getBySubject(subject.id) as TransitionEvent[];
    for (const evt of events) {
      const fecha = new Date(evt.occurredAt);
      if (fecha >= desde && fecha <= hasta) {
        const { monto, costo, producto } = extraerDatos(evt);
        if (monto > 0 && producto) {
          if (!productosMap.has(producto)) {
            productosMap.set(producto, {
              totalVendido: 0,
              numeroVentas: 0,
              totalCosto: 0,
            });
          }
          const data = productosMap.get(producto)!;
          data.totalVendido += monto;
          data.numeroVentas++;
          data.totalCosto += costo;
        }
      }
    }
  }

  const productos: ProductoSegmento[] = Array.from(
    productosMap.entries()
  ).map(([producto, data]) => ({
    producto,
    totalVendido: data.totalVendido,
    numeroVentas: data.numeroVentas,
    margen: data.totalVendido - data.totalCosto,
    rotacion: data.numeroVentas,
  }));

  const topProductos = productos
    .sort((a, b) => b.totalVendido - a.totalVendido)
    .slice(0, 10);

  return {
    periodo: {
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
    },
    productos,
    topProductos,
  };
}

/**
 * Genera reporte por ciclo (tipo de archetype).
 */
export function generarReporteSegmentoPorCiclo(
  runtime: AppRuntime,
  opciones: {
    desde: Date;
    hasta: Date;
  }
): ReporteSegmentoPorCiclo {
  const { desde, hasta } = opciones;
  const ciclosMap: Map<
    string,
    {
      totalExpedientes: number;
      totalVendido: number;
      totalCosto: number;
      tiempos: number[];
      completados: number;
    }
  > = new Map();

  for (const subject of runtime.subjects) {
    const lifecycle = runtime.lifecycleForSubject(subject.id);
    if (!lifecycle) continue;

    const tipo = lifecycle.archetypeId;
    if (!ciclosMap.has(tipo)) {
      ciclosMap.set(tipo, {
        totalExpedientes: 0,
        totalVendido: 0,
        totalCosto: 0,
        tiempos: [],
        completados: 0,
      });
    }

    const events = runtime.store.getBySubject(subject.id) as TransitionEvent[];
    if (events.length === 0) continue;

    const primeraFecha = new Date(events[0].occurredAt);
    if (primeraFecha >= desde && primeraFecha <= hasta) {
      const data = ciclosMap.get(tipo)!;
      data.totalExpedientes++;

      for (const evt of events) {
        const { monto, costo } = extraerDatos(evt);
        data.totalVendido += monto;
        data.totalCosto += costo;
      }

      // Calcular tiempo
      const ultimaFecha = new Date(events[events.length - 1].occurredAt);
      const dias = Math.floor(
        (ultimaFecha.getTime() - primeraFecha.getTime()) / (1000 * 60 * 60 * 24)
      );
      data.tiempos.push(dias);

      // Verificar si está completo
      const derived = deriveState(lifecycle.lifecycle, events);
      const state = findState(lifecycle.lifecycle, derived.currentStateId);
      if (state && state.final) {
        data.completados++;
      }
    }
  }

  const ciclos: CicloSegmento[] = Array.from(ciclosMap.entries()).map(
    ([tipo, data]) => ({
      tipo,
      totalExpedientes: data.totalExpedientes,
      totalVendido: data.totalVendido,
      margen: data.totalVendido - data.totalCosto,
      tiempoPromedioDias:
        data.tiempos.length > 0
          ? Math.round(data.tiempos.reduce((a, b) => a + b, 0) / data.tiempos.length)
          : 0,
      tasaCierre:
        data.totalExpedientes > 0
          ? (data.completados / data.totalExpedientes) * 100
          : 0,
    })
  );

  return {
    periodo: {
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
    },
    ciclos,
  };
}
