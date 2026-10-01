/**
 * Generador de reportes BI — análisis de ciclos, ventas, cobros e impagos.
 */

import type { AppRuntime } from "../web/runtime.js";
import type { TransitionEvent, DomainEvent } from "../core/events.js";
import { deriveState } from "../core/derivation.js";
import { findState } from "../core/lifecycle.js";

export interface ReporteVentas {
  totalVendido: number;
  numeroExpedientes: number;
  promedioVenta: number;
  expedientesCreados: number;
  expedientesCerrados: number;
}

export interface ReporteCobros {
  totalCobrado: number;
  numeroCobros: number;
  pormedioDePago: Record<string, number>;
  porCliente: Array<{ cliente: string; total: number }>;
  tasaCobro: number;
}

export interface ReporteImpagos {
  clientesConDeuda: Array<{
    cliente: string;
    importe: number;
    diasAtraso: number;
  }>;
  importeTotal: number;
  tasaImpago: number;
}

export interface ReporteCiclos {
  porTipo: Record<
    string,
    {
      total: number;
      promedioDias: number;
      tasaCierre: number;
    }
  >;
}

export interface ReporteResumen {
  fechaDesde: string;
  fechaHasta: string;
  ventas: ReporteVentas;
  cobros: ReporteCobros;
  impagos: ReporteImpagos;
  ciclos: ReporteCiclos;
}

/**
 * Extrae datos monetarios del evento si existen en `data`.
 */
function extraerMonto(event: TransitionEvent): number {
  if (!event.data || typeof event.data !== "object") return 0;
  const data = event.data as Record<string, unknown>;
  // Busca campos comunes para montos
  const monto =
    data.monto ||
    data.importe ||
    data.valor ||
    data.total ||
    data.amount ||
    data.price;
  return typeof monto === "number" ? monto : 0;
}

/**
 * Obtiene el cliente/parte asociado a un expediente.
 */
function obtenerClienteDelExpediente(
  runtime: AppRuntime,
  subjectId: string
): string {
  const sub = runtime.subjects.find((s) => s.id === subjectId);
  return sub ? sub.parteId : "desconocido";
}

/**
 * Genera reporte de ventas.
 */
export function generarReporteVentas(
  runtime: AppRuntime,
  opciones: {
    desde: Date;
    hasta: Date;
  }
): ReporteVentas {
  const { desde, hasta } = opciones;
  let totalVendido = 0;
  let numeroExpedientes = 0;
  let expedientesCreados = 0;
  let expedientesCerrados = 0;

  for (const subject of runtime.subjects) {
    const events = runtime.store.getBySubject(subject.id) as TransitionEvent[];
    if (events.length === 0) continue;

    numeroExpedientes++;
    let primerEvento = true;
    let ultimoEvento: TransitionEvent | null = null;

    for (const evt of events) {
      const fecha = new Date(evt.occurredAt);
      if (fecha >= desde && fecha <= hasta) {
        const monto = extraerMonto(evt);
        totalVendido += monto;
      }

      if (primerEvento) {
        if (new Date(evt.occurredAt) >= desde) expedientesCreados++;
        primerEvento = false;
      }
      ultimoEvento = evt;
    }

    if (ultimoEvento && new Date(ultimoEvento.occurredAt) <= hasta) {
      expedientesCerrados++;
    }
  }

  return {
    totalVendido,
    numeroExpedientes,
    promedioVenta: numeroExpedientes > 0 ? totalVendido / numeroExpedientes : 0,
    expedientesCreados,
    expedientesCerrados,
  };
}

/**
 * Genera reporte de cobros.
 */
export function generarReporteCobros(
  runtime: AppRuntime,
  opciones: {
    desde: Date;
    hasta: Date;
  }
): ReporteCobros {
  const { desde, hasta } = opciones;
  let totalCobrado = 0;
  let numeroCobros = 0;
  const pormedioDePago: Record<string, number> = {};
  const porCliente: Record<string, number> = {};

  for (const subject of runtime.subjects) {
    const events = runtime.store.getBySubject(subject.id) as TransitionEvent[];
    for (const evt of events) {
      const fecha = new Date(evt.occurredAt);
      if (fecha >= desde && fecha <= hasta) {
        const monto = extraerMonto(evt);
        if (monto > 0) {
          totalCobrado += monto;
          numeroCobros++;

          const medio = (evt.data as any)?.medioDePago || "otro";
          pormedioDePago[medio] = (pormedioDePago[medio] || 0) + monto;

          const cliente = obtenerClienteDelExpediente(runtime, subject.id);
          porCliente[cliente] = (porCliente[cliente] || 0) + monto;
        }
      }
    }
  }

  const topClientes = Object.entries(porCliente)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([cliente, total]) => ({ cliente, total }));

  const totalVendido = generarReporteVentas(runtime, opciones).totalVendido;
  const tasaCobro =
    totalVendido > 0
      ? (totalCobrado / totalVendido) * 100
      : 0;

  return {
    totalCobrado,
    numeroCobros,
    pormedioDePago,
    porCliente: topClientes,
    tasaCobro,
  };
}

/**
 * Genera reporte de impagos.
 */
export function generarReporteImpagos(
  runtime: AppRuntime,
  opciones: {
    desde: Date;
    hasta: Date;
  }
): ReporteImpagos {
  const { desde, hasta } = opciones;
  const clientesConDeuda: Map<
    string,
    { importe: number; diasAtraso: number }
  > = new Map();
  let importeTotal = 0;

  for (const subject of runtime.subjects) {
    const events = runtime.store.getBySubject(subject.id) as TransitionEvent[];
    const lifecycle = runtime.lifecycleForSubject(subject.id);
    if (!lifecycle) continue;

    const derived = deriveState(lifecycle.lifecycle, events);

    // Si el estado es "vencido" o similar, contar como impago
    const state = findState(lifecycle.lifecycle, derived.currentStateId);
    if (state && state.kind === "vencido") {
      const cliente = obtenerClienteDelExpediente(runtime, subject.id);
      const ultimoEvento = events[events.length - 1];
      const diasAtraso = ultimoEvento
        ? Math.floor(
            (new Date().getTime() - new Date(ultimoEvento.occurredAt).getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0;

      let deuda = 0;
      for (const evt of events) {
        deuda += extraerMonto(evt);
      }

      if (deuda > 0) {
        importeTotal += deuda;
        clientesConDeuda.set(cliente, { importe: deuda, diasAtraso });
      }
    }
  }

  const totalVendido = generarReporteVentas(runtime, opciones).totalVendido;
  const tasaImpago =
    totalVendido > 0
      ? (importeTotal / totalVendido) * 100
      : 0;

  return {
    clientesConDeuda: Array.from(clientesConDeuda.entries()).map(
      ([cliente, { importe, diasAtraso }]) => ({
        cliente,
        importe,
        diasAtraso,
      })
    ),
    importeTotal,
    tasaImpago,
  };
}

/**
 * Genera reporte de ciclos.
 */
export function generarReporteCiclos(
  runtime: AppRuntime,
  opciones: {
    desde: Date;
    hasta: Date;
  }
): ReporteCiclos {
  const { desde, hasta } = opciones;
  const porTipo: Record<
    string,
    {
      total: number;
      tiempos: number[];
      completados: number;
    }
  > = {};

  for (const subject of runtime.subjects) {
    const lifecycle = runtime.lifecycleForSubject(subject.id);
    if (!lifecycle) continue;

    const tipo = lifecycle.archetypeId;
    if (!porTipo[tipo]) {
      porTipo[tipo] = { total: 0, tiempos: [], completados: 0 };
    }

    const events = runtime.store.getBySubject(subject.id) as TransitionEvent[];
    if (events.length === 0) continue;

    const primeraFecha = new Date(events[0].occurredAt);
    if (primeraFecha >= desde && primeraFecha <= hasta) {
      porTipo[tipo].total++;

      const ultimoEvento = events[events.length - 1];
      const diasTranscurridos = Math.floor(
        (new Date(ultimoEvento.occurredAt).getTime() - primeraFecha.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      porTipo[tipo].tiempos.push(diasTranscurridos);

      // Verificar si está cerrado (estado final)
      const derived = deriveState(lifecycle.lifecycle, events);
      const state = findState(lifecycle.lifecycle, derived.currentStateId);
      if (state && state.final) {
        porTipo[tipo].completados++;
      }
    }
  }

  const resultado: ReporteCiclos = { porTipo: {} };
  for (const [tipo, datos] of Object.entries(porTipo)) {
    const promedioDias =
      datos.tiempos.length > 0
        ? datos.tiempos.reduce((a, b) => a + b, 0) / datos.tiempos.length
        : 0;
    const tasaCierre =
      datos.total > 0
        ? (datos.completados / datos.total) * 100
        : 0;

    resultado.porTipo[tipo] = {
      total: datos.total,
      promedioDias,
      tasaCierre,
    };
  }

  return resultado;
}

/**
 * Genera reporte completo (resumen).
 */
export function generarReporteResumen(
  runtime: AppRuntime,
  opciones: {
    desde: Date;
    hasta: Date;
  }
): ReporteResumen {
  return {
    fechaDesde: opciones.desde.toISOString(),
    fechaHasta: opciones.hasta.toISOString(),
    ventas: generarReporteVentas(runtime, opciones),
    cobros: generarReporteCobros(runtime, opciones),
    impagos: generarReporteImpagos(runtime, opciones),
    ciclos: generarReporteCiclos(runtime, opciones),
  };
}
