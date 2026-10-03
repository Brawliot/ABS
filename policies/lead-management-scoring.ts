/**
 * Motor de Scoring de Leads
 * Puntuación, temperatura, calificación de leads
 */

import { randomUUID } from "crypto";
import type {
  EventoLead,
  ReglaScoring,
  PrediccionConversión,
} from "../elements/lead-management.js";

export class MotorScoring {
  private reglas: Map<string, ReglaScoring> = new Map();
  private eventos: Map<string, EventoLead> = new Map();

  constructor() {
    // Inicializar reglas por defecto
    this.crearRegla("apertura_email", "email_abierto", 5);
    this.crearRegla("click_email", "email_click", 10);
    this.crearRegla("visita_pagina", "página_visitada", 3);
    this.crearRegla("formulario_enviado", "formulario_enviado", 15);
    this.crearRegla("demo_solicitada", "demo_solicitada", 25);
  }

  // ========== REGLAS ==========

  crearRegla(
    nombre: string,
    evento: "email_abierto" | "email_click" | "página_visitada" | "formulario_enviado" | "demo_solicitada",
    puntos: number
  ): ReglaScoring {
    const id = randomUUID();
    const regla: ReglaScoring = {
      id,
      nombre,
      evento,
      puntos,
    };

    this.reglas.set(id, regla);
    return regla;
  }

  obtenerReglas(): ReglaScoring[] {
    return Array.from(this.reglas.values());
  }

  // ========== EVENTOS Y PUNTUACIÓN ==========

  incrementarPuntos(
    leadId: string,
    tipo: "email_abierto" | "email_click" | "página_visitada" | "formulario_enviado" | "demo_solicitada",
    puntosAdicionales?: number
  ): EventoLead {
    const id = randomUUID();
    const ahora = new Date();

    // Buscar regla por defecto o usar puntos adicionales
    let puntos = puntosAdicionales || 0;
    for (const regla of this.reglas.values()) {
      if (regla.evento === tipo) {
        puntos = regla.puntos;
        break;
      }
    }

    const evento: EventoLead = {
      id,
      leadId,
      tipo,
      puntos,
      fecha: ahora,
    };

    this.eventos.set(id, evento);
    return evento;
  }

  obtenerPuntuacionLead(leadId: string): number {
    const eventosLead = Array.from(this.eventos.values()).filter(
      (e) => e.leadId === leadId
    );
    return eventosLead.reduce((total, evento) => total + evento.puntos, 0);
  }

  // ========== TEMPERATURA ==========

  calcularTemperatura(
    leadId: string
  ): "fría" | "tibia" | "caliente" {
    const puntuación = this.obtenerPuntuacionLead(leadId);

    if (puntuación < 30) return "fría";
    if (puntuación < 70) return "tibia";
    return "caliente";
  }

  // ========== DETECCIÓN DE LEADS CUALIFICADOS ==========

  detectarLeadsQualificados(
    puntuaciónMínima: number = 70
  ): string[] {
    const leadsMap = new Map<string, number>();

    for (const evento of this.eventos.values()) {
      const actual = leadsMap.get(evento.leadId) || 0;
      leadsMap.set(evento.leadId, actual + evento.puntos);
    }

    return Array.from(leadsMap.entries())
      .filter(([_, puntuación]) => puntuación >= puntuaciónMínima)
      .map(([leadId, _]) => leadId);
  }

  // ========== DETECCIÓN DE LEADS PERDIDOS ==========

  detectarLeadsPerdidos(
    díasSinActividad: number = 30
  ): string[] {
    const ahora = new Date();
    const límiteMs = díasSinActividad * 24 * 60 * 60 * 1000;
    const leadsActivos = new Set<string>();

    for (const evento of this.eventos.values()) {
      const tiempoTranscurrido = ahora.getTime() - evento.fecha.getTime();
      if (tiempoTranscurrido < límiteMs) {
        leadsActivos.add(evento.leadId);
      }
    }

    // Encontrar todos los leads únicos
    const todosLeads = new Set<string>();
    for (const evento of this.eventos.values()) {
      todosLeads.add(evento.leadId);
    }

    // Los perdidos son los que no tienen actividad reciente
    const perdidos = Array.from(todosLeads).filter(
      (leadId) => !leadsActivos.has(leadId)
    );

    return perdidos;
  }

  // ========== RECOMENDACIONES ==========

  recomendarAcción(leadId: string): string {
    const temperatura = this.calcularTemperatura(leadId);
    const puntuación = this.obtenerPuntuacionLead(leadId);

    if (temperatura === "caliente") {
      return "LLAMAR: Lead muy cualificado, listo para conversión";
    }

    if (temperatura === "tibia") {
      if (puntuación > 50) {
        return "ENVIAR DEMO: Lead interesado, ofrecer demostración";
      }
      return "ENVIAR CONTENIDO: Lead en consideración, seguir nutriendo";
    }

    return "IGNORAR: Lead frío, requiere más nurturing";
  }

  // ========== PREDICCIÓN ==========

  predecirProbabilidadConversión(
    leadId: string,
    históricoTasaConversión: number = 0.15
  ): PrediccionConversión {
    const puntuación = this.obtenerPuntuacionLead(leadId);
    const temperatura = this.calcularTemperatura(leadId);

    // Modelo simple de predicción
    let probabilidad = históricoTasaConversión * 100;

    if (temperatura === "caliente") {
      probabilidad *= 4;
    } else if (temperatura === "tibia") {
      probabilidad *= 2;
    }

    // Normalizar entre 0-100
    probabilidad = Math.min(100, probabilidad);

    const factores = [
      `Temperatura: ${temperatura}`,
      `Puntuación: ${puntuación}`,
      `Modelo: Histórico ${(históricoTasaConversión * 100).toFixed(1)}%`,
    ];

    return {
      leadId,
      probabilidad,
      factores,
      fechaCálculo: new Date(),
    };
  }

  // ========== REPORTES ==========

  obtenerReporteScoring(): {
    leadsTotales: number;
    calientesCount: number;
    tibiasCount: number;
    friasCount: number;
    puntuaciónPromedio: number;
    topLeads: Array<{ leadId: string; puntuación: number }>;
  } {
    const leadsMap = new Map<string, number>();

    for (const evento of this.eventos.values()) {
      const actual = leadsMap.get(evento.leadId) || 0;
      leadsMap.set(evento.leadId, actual + evento.puntos);
    }

    const topLeads = Array.from(leadsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([leadId, puntuación]) => ({ leadId, puntuación }));

    const puntuaciones = Array.from(leadsMap.values());
    const puntuaciónPromedio =
      puntuaciones.length > 0
        ? puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length
        : 0;

    const calientesCount = Array.from(leadsMap.entries()).filter(
      ([_, p]) => p >= 70
    ).length;
    const tibiasCount = Array.from(leadsMap.entries()).filter(
      ([_, p]) => p >= 30 && p < 70
    ).length;
    const friasCount = Array.from(leadsMap.entries()).filter(
      ([_, p]) => p < 30
    ).length;

    return {
      leadsTotales: leadsMap.size,
      calientesCount,
      tibiasCount,
      friasCount,
      puntuaciónPromedio,
      topLeads,
    };
  }

  obtenerEventosLead(leadId: string): EventoLead[] {
    return Array.from(this.eventos.values()).filter((e) => e.leadId === leadId);
  }
}
