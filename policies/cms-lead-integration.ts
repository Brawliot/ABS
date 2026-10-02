/**
 * Integración CMS + Lead Management
 * CTAs, formularios embebidos, seguimiento de conversiones
 */

import { randomUUID } from "crypto";
import type { CTA, PáginaCMS } from "../elements/cms.js";

export interface EventoCTA {
  readonly id: string;
  readonly ctaId: string;
  readonly páginaId: string;
  readonly fecha: Date;
  readonly ipOrigen: string;
  readonly tipoEvento: "clic" | "visualización";
}

export interface TasaConversionPágina {
  readonly páginaId: string;
  readonly vistas: number;
  readonly clicsEnCTA: number;
  readonly tasaConversion: number;
  readonly leadsCapturados: number;
  readonly conversiones: number;
}

export class MotorCMS_LeadIntegration {
  private ctas: Map<string, CTA> = new Map();
  private eventos: Map<string, EventoCTA> = new Map();
  private conversionMap: Map<string, number> = new Map(); // páginaId -> count

  // ========== CTAS ==========

  agregarCTA(
    páginaId: string,
    texto: string,
    url: string,
    tipo: "botón" | "enlace" | "formulario" = "botón",
    color?: string,
    posición: string = "bottom"
  ): CTA {
    const id = randomUUID();

    const cta: CTA = {
      id,
      páginaId,
      texto,
      url,
      tipo,
      color: color || "#007bff",
      posición,
      clicsRegistrados: 0,
      fechaCreación: new Date(),
    };

    this.ctas.set(id, cta);
    return cta;
  }

  obtenerCTA(ctaId: string): CTA | undefined {
    return this.ctas.get(ctaId);
  }

  obtenerCTAsPorPágina(páginaId: string): CTA[] {
    return Array.from(this.ctas.values()).filter((c) => c.páginaId === páginaId);
  }

  registrarClicCTA(ctaId: string, ipOrigen: string = "127.0.0.1"): boolean {
    const cta = this.ctas.get(ctaId);
    if (!cta) return false;

    (cta as any).clicsRegistrados++;

    // Registrar evento
    const id = randomUUID();
    const evento: EventoCTA = {
      id,
      ctaId,
      páginaId: cta.páginaId,
      fecha: new Date(),
      ipOrigen,
      tipoEvento: "clic",
    };

    this.eventos.set(id, evento);
    return true;
  }

  // ========== FORMULARIOS EMBEBIDOS ==========

  incrustarFormulario(
    páginaId: string,
    formularioId: string,
    posición: string = "bottom"
  ): CTA {
    return this.agregarCTA(
      páginaId,
      "Enviar Formulario",
      `/formulario/${formularioId}`,
      "formulario",
      "#28a745",
      posición
    );
  }

  // ========== SEGUIMIENTO DE CONVERSIONES ==========

  registrarVistaConversión(páginaId: string): boolean {
    // Simulado: normalmente se haría desde el cliente
    const contador = this.conversionMap.get(páginaId) || 0;
    this.conversionMap.set(páginaId, contador + 1);
    return true;
  }

  rastrearClicsCTA(páginaId: string): number {
    const ctas = this.obtenerCTAsPorPágina(páginaId);
    return ctas.reduce((total, cta) => total + cta.clicsRegistrados, 0);
  }

  medirTasaConversionPágina(
    página: PáginaCMS,
    vistas: number = 0,
    leadsCapturados: number = 0,
    conversiones: number = 0
  ): TasaConversionPágina {
    const ctas = this.obtenerCTAsPorPágina(página.id);
    const clicsEnCTA = ctas.reduce((total, cta) => total + cta.clicsRegistrados, 0);

    const tasaConversion = vistas > 0 ? (clicsEnCTA / vistas) * 100 : 0;

    return {
      páginaId: página.id,
      vistas,
      clicsEnCTA,
      tasaConversion,
      leadsCapturados,
      conversiones,
    };
  }

  // ========== ANÁLISIS ==========

  obtenerPáginasConMejorConversión(páginas: PáginaCMS[]): Array<{
    página: PáginaCMS;
    tasaConversion: number;
  }> {
    return páginas
      .map((p) => ({
        página: p,
        tasaConversion: this.rastrearClicsCTA(p.id) / (p.vistas || 1),
      }))
      .sort((a, b) => b.tasaConversion - a.tasaConversion)
      .slice(0, 5);
  }

  obtenerPáginasConBajaConversión(páginas: PáginaCMS[]): Array<{
    página: PáginaCMS;
    tasaConversion: number;
  }> {
    return páginas
      .filter((p) => p.vistas > 0)
      .map((p) => ({
        página: p,
        tasaConversion: this.rastrearClicsCTA(p.id) / p.vistas,
      }))
      .sort((a, b) => a.tasaConversion - b.tasaConversion)
      .slice(0, 5);
  }

  obtenerRecomendacionesConversión(página: PáginaCMS): string[] {
    const recomendaciones: string[] = [];

    const ctas = this.obtenerCTAsPorPágina(página.id);
    if (ctas.length === 0) {
      recomendaciones.push("Agregar al menos un CTA a la página");
    } else if (ctas.length > 3) {
      recomendaciones.push("Muchos CTAs pueden confundir al visitante");
    }

    const tasaConversion =
      página.vistas > 0 ? this.rastrearClicsCTA(página.id) / página.vistas : 0;
    if (tasaConversion < 0.01) {
      recomendaciones.push("Tasa de conversión muy baja - mejorar CTA o contenido");
    }

    if (!página.seo.metaDescripción) {
      recomendaciones.push("Optimizar meta description para mejorar CTR en resultados de búsqueda");
    }

    return recomendaciones;
  }

  // ========== ATRIBUCIÓN ==========

  obtenerAtribuciónCanal(páginaId: string): {
    clicsCTA: number;
    formularioEmbebido: number;
    otros: number;
  } {
    const eventos = Array.from(this.eventos.values()).filter(
      (e) => e.páginaId === páginaId && e.tipoEvento === "clic"
    );

    const ctas = this.obtenerCTAsPorPágina(páginaId);
    const formularioCtas = ctas.filter((c) => c.tipo === "formulario");

    let clicsCTA = 0;
    let formularioEmbebido = 0;

    for (const evento of eventos) {
      const cta = this.ctas.get(evento.ctaId);
      if (cta?.tipo === "formulario") {
        formularioEmbebido++;
      } else {
        clicsCTA++;
      }
    }

    return {
      clicsCTA,
      formularioEmbebido,
      otros: eventos.length - clicsCTA - formularioEmbebido,
    };
  }

  // ========== PRUEBAS A/B ==========

  crearVarianteCTA(
    ctaOriginalId: string,
    nuevoTexto?: string,
    nuevoColor?: string
  ): CTA | null {
    const ctaOriginal = this.ctas.get(ctaOriginalId);
    if (!ctaOriginal) return null;

    return this.agregarCTA(
      ctaOriginal.páginaId,
      nuevoTexto || ctaOriginal.texto,
      ctaOriginal.url,
      ctaOriginal.tipo,
      nuevoColor || ctaOriginal.color,
      ctaOriginal.posición
    );
  }

  compararRendimientoCTAs(
    ctaIds: string[]
  ): Array<{ ctaId: string; clics: number; rendimiento: number }> {
    const resultados = [];
    let totalClics = 0;

    for (const ctaId of ctaIds) {
      const cta = this.ctas.get(ctaId);
      if (cta) {
        totalClics += cta.clicsRegistrados;
        resultados.push({
          ctaId,
          clics: cta.clicsRegistrados,
          rendimiento: 0,
        });
      }
    }

    for (const resultado of resultados) {
      resultado.rendimiento =
        totalClics > 0 ? (resultado.clics / totalClics) * 100 : 0;
    }

    return resultados.sort((a, b) => b.rendimiento - a.rendimiento);
  }
}
