/**
 * Motor de SLA y Métricas: Seguimiento de cumplimiento de SLA,
 * cálculo de métricas de eficiencia de agentes y dashboard.
 */

import type { Ticket, NivelPrioridad } from "./soporte-tickets.js";

export interface DefinicionSLA {
  readonly prioridad: NivelPrioridad;
  readonly horasMaximas: number;
}

export interface MetricasTicket {
  readonly ticketId: string;
  readonly numero: number;
  readonly estado: string;
  readonly cumplidasla: boolean;
  readonly horasTranscurridas: number;
  readonly horasRestantes: number;
  readonly porcentajeCompleción: number;
}

export interface MetricasAgente {
  readonly agenteId: string;
  readonly nombre: string;
  readonly ticketsResueltos: number;
  readonly tiempoPromedioResolución: number; // horas
  readonly satisfaccionPromedio: number; // 0-100
  readonly cumplimientoSLA: number; // %
  readonly cargaTrabajoActual: number;
}

export interface DashboardMetricas {
  readonly totalTickets: number;
  readonly ticketsAbiertos: number;
  readonly ticketsEnProgreso: number;
  readonly ticketsResueltos: number;
  readonly ticketsVencidos: number;
  readonly cumplimientoSLAGlobal: number; // %
  readonly tiempoResolucionPromedio: number; // horas
  readonly satisfaccionPromedio: number; // 1-5
  readonly metricasAgentes: readonly MetricasAgente[];
}

export class MotorSLAMetricas {
  private definicionesSLA: Map<NivelPrioridad, DefinicionSLA> = new Map([
    ["crítica", { prioridad: "crítica", horasMaximas: 12 }],
    ["alta", { prioridad: "alta", horasMaximas: 24 }],
    ["media", { prioridad: "media", horasMaximas: 72 }],
    ["baja", { prioridad: "baja", horasMaximas: 168 }], // 7 días
  ]);

  private ticketsRegistrados = new Map<string, MetricasTicket>();
  private metricasAgentesRegistradas = new Map<string, MetricasAgente>();

  definirSLA(prioridad: NivelPrioridad, horasMaximas: number): void {
    this.definicionesSLA.set(prioridad, {
      prioridad,
      horasMaximas,
    });
  }

  verificarCumplimientoSLA(ticket: Ticket): boolean {
    const sla = this.definicionesSLA.get(ticket.prioridad);
    if (!sla) return true; // Si no hay SLA definido, no hay incumplimiento

    const ahora = new Date();
    const msTranscurridos = ahora.getTime() - ticket.fechaCreacion.getTime();
    const horasTranscurridas = msTranscurridos / (1000 * 60 * 60);

    return horasTranscurridas <= sla.horasMaximas;
  }

  private registrarMetricasTicket(ticket: Ticket): void {
    const ahora = new Date();
    const msTranscurridos = ahora.getTime() - ticket.fechaCreacion.getTime();
    const horasTranscurridas = msTranscurridos / (1000 * 60 * 60);

    const msTotales = ticket.fechaVencimiento.getTime() - ticket.fechaCreacion.getTime();
    const horasTotales = msTotales / (1000 * 60 * 60);

    const metricas: MetricasTicket = {
      ticketId: ticket.id,
      numero: ticket.numero,
      estado: ticket.estado,
      cumplidasla: this.verificarCumplimientoSLA(ticket),
      horasTranscurridas: Math.round(horasTranscurridas * 10) / 10,
      horasRestantes: Math.max(0, Math.round((horasTotales - horasTranscurridas) * 10) / 10),
      porcentajeCompleción: Math.round((horasTranscurridas / horasTotales) * 100),
    };

    this.ticketsRegistrados.set(ticket.id, metricas);
  }

  obtenerMetricas(tickets: readonly Ticket[]): DashboardMetricas {
    const ahora = new Date();
    let totalTickets = 0;
    let ticketsAbiertos = 0;
    let ticketsEnProgreso = 0;
    let ticketsResueltos = 0;
    let ticketsVencidos = 0;
    let totalHorasResolución = 0;

    const ticketsResueltosArray: Ticket[] = [];

    for (const ticket of tickets) {
      this.registrarMetricasTicket(ticket);
      totalTickets++;

      if (ticket.estado === "abierto") ticketsAbiertos++;
      else if (ticket.estado === "en_progreso") ticketsEnProgreso++;
      else if (ticket.estado === "resuelto") {
        ticketsResueltos++;
        ticketsResueltosArray.push(ticket);
        if (ticket.fechaResolución) {
          const ms = ticket.fechaResolución.getTime() - ticket.fechaCreacion.getTime();
          totalHorasResolución += ms / (1000 * 60 * 60);
        }
      }

      if (ahora > ticket.fechaVencimiento && ticket.estado !== "resuelto") {
        ticketsVencidos++;
      }
    }

    const cumplimientoSLAGlobal = totalTickets > 0
      ? Math.round(
          (Array.from(this.ticketsRegistrados.values()).filter(m => m.cumplidasla).length / totalTickets) * 100
        )
      : 100;

    const tiempoResolucionPromedio =
      ticketsResueltos > 0 ? totalHorasResolución / ticketsResueltos : 0;

    return {
      totalTickets,
      ticketsAbiertos,
      ticketsEnProgreso,
      ticketsResueltos,
      ticketsVencidos,
      cumplimientoSLAGlobal,
      tiempoResolucionPromedio: Math.round(tiempoResolucionPromedio * 10) / 10,
      satisfaccionPromedio: 4.2, // Placeholder
      metricasAgentes: Array.from(this.metricasAgentesRegistradas.values()),
    };
  }

  obtenerEficienciaAgente(agenteId: string, tickets: readonly Ticket[]): MetricasAgente {
    const ticketsDelAgente = tickets.filter(t => t.agenteAsignadoId === agenteId);
    const ticketsResueltos = ticketsDelAgente.filter(t => t.estado === "resuelto");

    let totalHorasResolución = 0;
    for (const ticket of ticketsResueltos) {
      if (ticket.fechaResolución) {
        const ms = ticket.fechaResolución.getTime() - ticket.fechaCreacion.getTime();
        totalHorasResolución += ms / (1000 * 60 * 60);
      }
    }

    const tiempoPromedio =
      ticketsResueltos.length > 0 ? totalHorasResolución / ticketsResueltos.length : 0;

    const cumplimientoSLA =
      ticketsResueltos.length > 0
        ? Math.round(
            (ticketsResueltos.filter(t => this.verificarCumplimientoSLA(t)).length /
              ticketsResueltos.length) *
              100
          )
        : 100;

    const metricas: MetricasAgente = {
      agenteId,
      nombre: `Agente ${agenteId}`,
      ticketsResueltos: ticketsResueltos.length,
      tiempoPromedioResolución: Math.round(tiempoPromedio * 10) / 10,
      satisfaccionPromedio: 4.5, // Placeholder
      cumplimientoSLA,
      cargaTrabajoActual: ticketsDelAgente.filter(t => t.estado === "en_progreso").length,
    };

    this.metricasAgentesRegistradas.set(agenteId, metricas);
    return metricas;
  }
}
