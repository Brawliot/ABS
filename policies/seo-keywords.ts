/**
 * Motor SEO - Monitoreo de Keywords
 * Tracking de posiciones, análisis de oportunidades
 */

import { randomUUID } from "crypto";
import type {
  KeywordMonitoring,
  HistóricoPosición,
  OportunidadSEO,
} from "../elements/seo.js";

export class MotorSEO_Keywords {
  private keywords: Map<string, KeywordMonitoring> = new Map();
  private histórico: Map<string, HistóricoPosición> = new Map();

  // ========== KEYWORDS ==========

  agregarKeyword(
    keyword: string,
    url: string,
    volumenBúsqueda: number = 0,
    dificultad: number = 50,
    intención: "informacional" | "navegacional" | "transaccional" | "comercial" = "comercial"
  ): KeywordMonitoring {
    const id = randomUUID();

    const kw = {
      id,
      keyword,
      url,
      posiciónActual: 0,
      volumenBúsqueda,
      dificultad,
      intención,
      competencia: [],
      fechaÚltimaActualización: new Date(),
      activa: true,
    } as any as KeywordMonitoring;

    this.keywords.set(id, kw);
    return kw;
  }

  obtenerKeyword(keywordId: string): KeywordMonitoring | undefined {
    return this.keywords.get(keywordId);
  }

  listarKeywords(): KeywordMonitoring[] {
    return Array.from(this.keywords.values()).filter((k) => k.activa);
  }

  desactivarKeyword(keywordId: string): boolean {
    const kw = this.keywords.get(keywordId);
    if (!kw) return false;

    (kw as any).activa = false;
    return true;
  }

  // ========== POSICIONES ==========

  actualizarRanking(
    keywordId: string,
    nuevaPosición: number,
    impresiones: number = 0,
    clics: number = 0
  ): boolean {
    const kw = this.keywords.get(keywordId);
    if (!kw) return false;

    // Guardar posición anterior
    (kw as any).posiciónAnterior = kw.posiciónActual;

    // Actualizar posición actual
    (kw as any).posiciónActual = nuevaPosición;
    (kw as any).fechaÚltimaActualización = new Date();

    // Registrar en histórico
    const id = randomUUID();
    const histórico: HistóricoPosición = {
      id,
      keywordId,
      posición: nuevaPosición,
      impresiones,
      clics,
      ctr: impresiones > 0 ? (clics / impresiones) * 100 : 0,
      fecha: new Date(),
    };

    this.histórico.set(id, histórico);
    return true;
  }

  obtenerHistóricoKeyword(keywordId: string): HistóricoPosición[] {
    return Array.from(this.histórico.values())
      .filter((h) => h.keywordId === keywordId)
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }

  // ========== ANÁLISIS DE CAMBIOS ==========

  detectarCambiosRanking(): {
    mejorando: KeywordMonitoring[];
    empeorando: KeywordMonitoring[];
    sin_cambios: KeywordMonitoring[];
  } {
    const mejorando: KeywordMonitoring[] = [];
    const empeorando: KeywordMonitoring[] = [];
    const sin_cambios: KeywordMonitoring[] = [];

    for (const kw of this.keywords.values()) {
      if (!kw.activa || !kw.posiciónAnterior) {
        sin_cambios.push(kw);
        continue;
      }

      const cambio = kw.posiciónAnterior - kw.posiciónActual;

      if (cambio > 0) {
        mejorando.push(kw);
      } else if (cambio < 0) {
        empeorando.push(kw);
      } else {
        sin_cambios.push(kw);
      }
    }

    return { mejorando, empeorando, sin_cambios };
  }

  // ========== OPORTUNIDADES ==========

  calcularOportunidades(
    minPosición: number = 2,
    maxPosición: number = 10
  ): OportunidadSEO[] {
    const oportunidades: OportunidadSEO[] = [];

    for (const kw of this.keywords.values()) {
      if (
        kw.activa &&
        kw.posiciónActual >= minPosición &&
        kw.posiciónActual <= maxPosición
      ) {
        const posicionesAmejorar = kw.posiciónActual - 1;
        const impresionesExtra = (kw.volumenBúsqueda / 30) * posicionesAmejorar * 0.5; // Estimación

        const oportunidad: OportunidadSEO = {
          keyword: kw.keyword,
          posición: kw.posiciónActual,
          potencialClicsExtra: Math.round(impresionesExtra),
          dificultad: kw.dificultad,
          recomendación: `Mejorar a posición 1 generaría ~${Math.round(impresionesExtra)} clics extra mensualmente`,
          fechaIdentificación: new Date(),
        };

        oportunidades.push(oportunidad);
      }
    }

    return oportunidades.sort(
      (a, b) => b.potencialClicsExtra - a.potencialClicsExtra
    );
  }

  // ========== REPORTES ==========

  generarReporteKeywords(): {
    totalKeywords: number;
    enPosición1: number;
    enTop3: number;
    enTop10: number;
    posiciónPromedio: number;
    keywords: KeywordMonitoring[];
  } {
    const activos = this.listarKeywords();
    let posiciónPromedio = 0;
    let enPosición1 = 0;
    let enTop3 = 0;
    let enTop10 = 0;

    for (const kw of activos) {
      posiciónPromedio += kw.posiciónActual;

      if (kw.posiciónActual === 1) {
        enPosición1++;
      }
      if (kw.posiciónActual <= 3) {
        enTop3++;
      }
      if (kw.posiciónActual <= 10) {
        enTop10++;
      }
    }

    posiciónPromedio = activos.length > 0 ? posiciónPromedio / activos.length : 0;

    return {
      totalKeywords: activos.length,
      enPosición1,
      enTop3,
      enTop10,
      posiciónPromedio: Math.round(posiciónPromedio * 10) / 10,
      keywords: activos,
    };
  }

  obtenerKeywordsPorUrl(url: string): KeywordMonitoring[] {
    return Array.from(this.keywords.values()).filter((k) => k.url === url && k.activa);
  }

  obtenerKeywordsPorIntención(intención: string): KeywordMonitoring[] {
    return Array.from(this.keywords.values()).filter(
      (k) => k.intención === intención && k.activa
    );
  }

  // ========== ANÁLISIS COMPETITIVO ==========

  agregarCompetensia(keywordId: string, competidor: string): boolean {
    const kw = this.keywords.get(keywordId);
    if (!kw) return false;

    if (!kw.competencia.includes(competidor)) {
      kw.competencia.push(competidor);
    }

    return true;
  }

  obtenerCompetidoresParaKeyword(keyword: string): string[] {
    for (const kw of this.keywords.values()) {
      if (kw.keyword === keyword) {
        return kw.competencia;
      }
    }

    return [];
  }

  // ========== PRIORIZACIÓN ==========

  obtenerKeywordsPrioritarias(): KeywordMonitoring[] {
    return this.listarKeywords()
      .filter((kw) => kw.volumenBúsqueda > 0)
      .sort((a, b) => {
        // Priorizar por: volumen - dificultad, después por dificultad baja
        const scoreA = a.volumenBúsqueda - a.dificultad * 10;
        const scoreB = b.volumenBúsqueda - b.dificultad * 10;
        return scoreB - scoreA;
      })
      .slice(0, 10);
  }
}
