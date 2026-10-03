/**
 * Motor SEO - Integración Google Search Console
 * Datos de búsqueda, rastreo, indexación
 */

import { randomUUID } from "crypto";
import type {
  DatosGoogleSearchConsole,
  PáginaNoIndexada,
  ErrorCrawling,
} from "../elements/seo.js";

export class MotorSEO_GoogleIntegration {
  private datosGSC: Map<string, DatosGoogleSearchConsole> = new Map();
  private páginasNoIndexadas: Map<string, PáginaNoIndexada> = new Map();
  private erroresCrawling: Map<string, ErrorCrawling> = new Map();
  private tokenOAuth?: string;

  // ========== CONEXIÓN ==========

  conectarGoogleSearchConsole(tokenOAuth: string): boolean {
    // En producción, aquí se verificaría el token con Google OAuth
    this.tokenOAuth = tokenOAuth;
    return true;
  }

  estaConectado(): boolean {
    return !!this.tokenOAuth;
  }

  desconectar(): boolean {
    this.tokenOAuth = undefined as any;
    return true;
  }

  // ========== DATOS DE BÚSQUEDA ==========

  obtenerDatosBúsqueda(keyword: string, período: "semana" | "mes" | "trimestre" = "mes"): DatosGoogleSearchConsole | null {
    if (!this.estaConectado()) return null;

    const id = randomUUID();
    const ahora = new Date();

    // Simular datos (en producción vendría de Google)
    const datos: DatosGoogleSearchConsole = {
      id,
      keyword,
      impresiones: Math.floor(Math.random() * 1000) + 100,
      clics: Math.floor(Math.random() * 100) + 10,
      ctr: 0,
      posiciónPromedio: Math.floor(Math.random() * 100) + 1,
      período,
      fecha: ahora,
    };

    (datos as any).ctr = datos.impresiones > 0 ? (datos.clics / datos.impresiones) * 100 : 0;

    this.datosGSC.set(id, datos);
    return datos;
  }

  listarDatosBúsqueda(): DatosGoogleSearchConsole[] {
    return Array.from(this.datosGSC.values());
  }

  obtenerTendenciaBúsqueda(keyword: string): {
    impresiones: number;
    clics: number;
    ctr: number;
    posición: number;
  }[] {
    return (Array.from(this.datosGSC.values())
      .filter((d) => d.keyword === keyword)
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())) as any;
  }

  // ========== INDEXACIÓN ==========

  identificarPáginasNoIndexadas(): PáginaNoIndexada[] {
    return Array.from(this.páginasNoIndexadas.values());
  }

  registrarPáginaNoIndexada(
    url: string,
    razón: "bloqueada_robots" | "no_encontrada" | "sin_indexar" | "pendiente_indexación"
  ): void {
    const id = randomUUID();
    const página = {
      url,
      razón,
      descubierta: new Date(),
    } as any as PáginaNoIndexada;

    this.páginasNoIndexadas.set(id, página);
  }

  resolverPáginaNoIndexada(url: string, resolución: string): boolean {
    for (const página of this.páginasNoIndexadas.values()) {
      if (página.url === url) {
        (página as any).resolución = resolución;
        return true;
      }
    }

    return false;
  }

  // ========== ERRORES DE RASTREO ==========

  detectarErroresCrawling(): ErrorCrawling[] {
    return Array.from(this.erroresCrawling.values());
  }

  registrarErrorCrawling(
    url: string,
    tipoError: "404" | "500" | "timeout" | "ssl" | "robots",
    descripción: string
  ): ErrorCrawling {
    const id = randomUUID();
    const ahora = new Date();

    // Verificar si ya existe para actualizar última detección
    for (const error of this.erroresCrawling.values()) {
      if (error.url === url && error.tipoError === tipoError) {
        (error as any).úlitmaDetección = ahora;
        return error;
      }
    }

    // Crear nuevo
    const error: ErrorCrawling = {
      id,
      url,
      tipoError,
      descripción,
      primeraDetección: ahora,
      úlitmaDetección: ahora,
    };

    this.erroresCrawling.set(id, error);
    return error;
  }

  resolverErrorCrawling(errorId: string): boolean {
    return this.erroresCrawling.delete(errorId);
  }

  obtenerErroresPorTipo(
    tipoError: "404" | "500" | "timeout" | "ssl" | "robots"
  ): ErrorCrawling[] {
    return Array.from(this.erroresCrawling.values()).filter((e) => e.tipoError === tipoError);
  }

  // ========== SUGERENCIAS ==========

  sugerirMejoras(): string[] {
    const sugerencias: string[] = [];

    const errorCount = this.erroresCrawling.size;
    if (errorCount > 0) {
      sugerencias.push(`Resolver ${errorCount} errores de rastreo críticos`);
    }

    const noIndexadas = this.páginasNoIndexadas.size;
    if (noIndexadas > 0) {
      sugerencias.push(`Investigar ${noIndexadas} páginas no indexadas`);
    }

    const datos = this.listarDatosBúsqueda();
    const bajoCTR = datos.filter((d) => d.ctr < 2).length;
    if (bajoCTR > 0) {
      sugerencias.push(`Mejorar CTR en ${bajoCTR} keywords con bajo rendimiento`);
    }

    const errorCrawlingCount = this.obtenerErroresPorTipo("404").length;
    if (errorCrawlingCount > 0) {
      sugerencias.push(`Corregir ${errorCrawlingCount} enlaces rotos (404s)`);
    }

    const erroresSSL = this.obtenerErroresPorTipo("ssl").length;
    if (erroresSSL > 0) {
      sugerencias.push(`Revisar configuración SSL - ${erroresSSL} problemas detectados`);
    }

    return sugerencias;
  }

  // ========== EXPORTAR DATOS ==========

  exportarDatosGoogleSearchConsole(): {
    fechaExportación: Date;
    datosTotal: number;
    errorCount: number;
    páginasNoIndexadas: number;
    topKeywords: DatosGoogleSearchConsole[];
  } {
    const topKeywords = Array.from(this.datosGSC.values())
      .sort((a, b) => b.clics - a.clics)
      .slice(0, 10);

    return {
      fechaExportación: new Date(),
      datosTotal: this.datosGSC.size,
      errorCount: this.erroresCrawling.size,
      páginasNoIndexadas: this.páginasNoIndexadas.size,
      topKeywords,
    };
  }

  // ========== ESTADÍSTICAS ==========

  obtenerEstadísticasGenerales(): {
    impresionesTotal: number;
    clicsTotal: number;
    ctrPromedio: number;
    posiciónPromedia: number;
  } {
    const datos = this.listarDatosBúsqueda();

    if (datos.length === 0) {
      return {
        impresionesTotal: 0,
        clicsTotal: 0,
        ctrPromedio: 0,
        posiciónPromedia: 0,
      };
    }

    const impresionesTotal = datos.reduce((sum, d) => sum + d.impresiones, 0);
    const clicsTotal = datos.reduce((sum, d) => sum + d.clics, 0);
    const ctrPromedio = datos.reduce((sum, d) => sum + d.ctr, 0) / datos.length;
    const posiciónPromedia =
      datos.reduce((sum, d) => sum + d.posiciónPromedio, 0) / datos.length;

    return {
      impresionesTotal,
      clicsTotal,
      ctrPromedio: Math.round(ctrPromedio * 100) / 100,
      posiciónPromedia: Math.round(posiciónPromedia * 10) / 10,
    };
  }
}
