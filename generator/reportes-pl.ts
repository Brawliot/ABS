/**
 * Reporte P&L (Profit & Loss) — cuenta de resultados y márgenes.
 */

import type { AppRuntime } from "../web/runtime.js";
import type { TransitionEvent } from "../core/events.js";

export interface LineaP_L {
  concepto: string;
  valor: number;
}

export interface ReporteP_L {
  periodo: {
    desde: string;
    hasta: string;
  };
  ingresos: LineaP_L[];
  ingresoTotal: number;
  costos: LineaP_L[];
  costoTotal: number;
  gastos: LineaP_L[];
  gastoTotal: number;
  margenNeto: number;
  margenPorcentaje: number;
  rentabilidadPorCliente: Array<{
    cliente: string;
    ingresos: number;
    costos: number;
    margen: number;
  }>;
  rentabilidadPorProducto: Array<{
    producto: string;
    ingresos: number;
    costos: number;
    margen: number;
  }>;
  comparativaMes: Array<{
    mes: string;
    ingresos: number;
    costos: number;
    margen: number;
    margenPorcentaje: number;
  }>;
}

function obtenerClienteDelExpediente(
  runtime: AppRuntime,
  subjectId: string
): string {
  const sub = runtime.subjects.find((s) => s.id === subjectId);
  return sub ? sub.parteId : "desconocido";
}

function extraerDatos(event: TransitionEvent): {
  monto: number;
  costo: number;
  gasto: number;
  producto?: string | undefined;
} {
  if (!event.data || typeof event.data !== "object") {
    return { monto: 0, costo: 0, gasto: 0 };
  }
  const data = event.data as Record<string, unknown>;
  return {
    monto: typeof data.monto === "number" ? data.monto : 0,
    costo: typeof data.costo === "number" ? data.costo : 0,
    gasto: typeof data.gasto === "number" ? data.gasto : 0,
    producto: typeof data.producto === "string" ? data.producto : undefined,
  };
}

/**
 * Genera reporte P&L con análisis de márgenes.
 */
export function generarReporteP_L(
  runtime: AppRuntime,
  opciones: {
    desde: Date;
    hasta: Date;
  }
): ReporteP_L {
  const { desde, hasta } = opciones;

  const ingresos: Map<string, number> = new Map();
  const costos: Map<string, number> = new Map();
  const gastos: Map<string, number> = new Map();

  let ingresoTotal = 0;
  let costoTotal = 0;
  let gastoTotal = 0;

  const rentabilidadPorClienteMap: Map<
    string,
    { ingresos: number; costos: number }
  > = new Map();
  const rentabilidadPorProductoMap: Map<
    string,
    { ingresos: number; costos: number }
  > = new Map();

  const comparativaMesMap: Map<
    string,
    { ingresos: number; costos: number; gastos: number }
  > = new Map();

  for (const subject of runtime.subjects) {
    const events = runtime.store.getBySubject(subject.id) as TransitionEvent[];
    const cliente = obtenerClienteDelExpediente(runtime, subject.id);

    for (const evt of events) {
      const fecha = new Date(evt.occurredAt);
      if (fecha >= desde && fecha <= hasta) {
        const { monto, costo, gasto, producto } = extraerDatos(evt);

        // Ingresos
        if (monto > 0) {
          ingresoTotal += monto;
          const concepto = `Venta - ${evt.transitionId}`;
          ingresos.set(concepto, (ingresos.get(concepto) || 0) + monto);

          // Por cliente
          const clienteData = rentabilidadPorClienteMap.get(cliente) || {
            ingresos: 0,
            costos: 0,
          };
          clienteData.ingresos += monto;
          rentabilidadPorClienteMap.set(cliente, clienteData);

          // Por producto
          if (producto) {
            const prodData = rentabilidadPorProductoMap.get(producto) || {
              ingresos: 0,
              costos: 0,
            };
            prodData.ingresos += monto;
            rentabilidadPorProductoMap.set(producto, prodData);
          }
        }

        // Costos
        if (costo > 0) {
          costoTotal += costo;
          const concepto = `Costo - ${evt.transitionId}`;
          costos.set(concepto, (costos.get(concepto) || 0) + costo);

          // Por cliente
          const clienteData = rentabilidadPorClienteMap.get(cliente) || {
            ingresos: 0,
            costos: 0,
          };
          clienteData.costos += costo;
          rentabilidadPorClienteMap.set(cliente, clienteData);

          // Por producto
          if (producto) {
            const prodData = rentabilidadPorProductoMap.get(producto) || {
              ingresos: 0,
              costos: 0,
            };
            prodData.costos += costo;
            rentabilidadPorProductoMap.set(producto, prodData);
          }
        }

        // Gastos operacionales
        if (gasto > 0) {
          gastoTotal += gasto;
          const concepto = `Gasto - ${evt.transitionId}`;
          gastos.set(concepto, (gastos.get(concepto) || 0) + gasto);
        }

        // Comparativa por mes
        const mes = fecha.toISOString().substring(0, 7); // YYYY-MM
        const mesData = comparativaMesMap.get(mes) || {
          ingresos: 0,
          costos: 0,
          gastos: 0,
        };
        mesData.ingresos += monto;
        mesData.costos += costo;
        mesData.gastos += gasto;
        comparativaMesMap.set(mes, mesData);
      }
    }
  }

  const margenNeto = ingresoTotal - costoTotal - gastoTotal;
  const margenPorcentaje =
    ingresoTotal > 0 ? (margenNeto / ingresoTotal) * 100 : 0;

  // Convertir mapas a arrays
  const ingresosArray: LineaP_L[] = Array.from(ingresos.entries()).map(
    ([concepto, valor]) => ({ concepto, valor })
  );

  const costosArray: LineaP_L[] = Array.from(costos.entries()).map(
    ([concepto, valor]) => ({ concepto, valor })
  );

  const gastosArray: LineaP_L[] = Array.from(gastos.entries()).map(
    ([concepto, valor]) => ({ concepto, valor })
  );

  const rentabilidadPorCliente = Array.from(
    rentabilidadPorClienteMap.entries()
  )
    .map(([cliente, { ingresos, costos }]) => ({
      cliente,
      ingresos,
      costos,
      margen: ingresos - costos,
    }))
    .sort((a, b) => b.margen - a.margen);

  const rentabilidadPorProducto = Array.from(
    rentabilidadPorProductoMap.entries()
  )
    .map(([producto, { ingresos, costos }]) => ({
      producto,
      ingresos,
      costos,
      margen: ingresos - costos,
    }))
    .sort((a, b) => b.margen - a.margen);

  const comparativaMes = Array.from(comparativaMesMap.entries())
    .map(([mes, { ingresos, costos, gastos }]) => ({
      mes,
      ingresos,
      costos,
      margen: ingresos - costos - gastos,
      margenPorcentaje:
        ingresos > 0
          ? ((ingresos - costos - gastos) / ingresos) * 100
          : 0,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  return {
    periodo: {
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
    },
    ingresos: ingresosArray,
    ingresoTotal,
    costos: costosArray,
    costoTotal,
    gastos: gastosArray,
    gastoTotal,
    margenNeto,
    margenPorcentaje,
    rentabilidadPorCliente,
    rentabilidadPorProducto,
    comparativaMes,
  };
}

/**
 * Calcula rentabilidad de un cliente específico.
 */
export function rentabilidadCliente(
  runtime: AppRuntime,
  clienteId: string,
  opciones: {
    desde: Date;
    hasta: Date;
  }
): {
  cliente: string;
  ingresos: number;
  costos: number;
  margen: number;
  margenPorcentaje: number;
} {
  const { desde, hasta } = opciones;
  let ingresos = 0;
  let costos = 0;

  for (const subject of runtime.subjects) {
    const cliente = subject.parteId;
    if (cliente !== clienteId) continue;

    const events = runtime.store.getBySubject(subject.id) as TransitionEvent[];
    for (const evt of events) {
      const fecha = new Date(evt.occurredAt);
      if (fecha >= desde && fecha <= hasta) {
        const { monto, costo } = extraerDatos(evt);
        ingresos += monto;
        costos += costo;
      }
    }
  }

  const margen = ingresos - costos;
  const margenPorcentaje =
    ingresos > 0 ? (margen / ingresos) * 100 : 0;

  return {
    cliente: clienteId,
    ingresos,
    costos,
    margen,
    margenPorcentaje,
  };
}
