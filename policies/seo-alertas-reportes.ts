/**
 * Motor SEO - Alertas y Reportes
 * Monitoreo automático, alertas, reportes mensuales
 */

import { randomUUID } from "crypto";
import type {
  AlertaSEO,
  ReporteSEO,
  KeywordMonitoring,
  ErrorCrawling,
  PáginaNoIndexada,
  MejoraSEO,
} from "../elements/seo.js";

export class MotorSEO_Alertas {
  private alertas: Map<string, AlertaSEO> = new Map();
  private reportes: Map<string, ReporteSEO> = new Map();
  private mejoras: Map<string, MejoraSEO> = new Map();

  // ========== ALERTAS ==========

  generarAlerta(
    tipo: "ranking_bajando" | "rastreo_error" | "página_sin_indexar" | "ctr_bajando",
    umbral: number,
    correoNotificación: string,
    keyword?: string
  ): AlertaSEO {
    const id = randomUUID();

    const alerta: AlertaSEO = {
      id,
      tipo,
      keyword,
      umbral,
      activa: true,
      correoNotificación,
      fechaCreación: new Date(),
    };

    this.alertas.set(id, alerta);
    return alerta;
  }

  obtenerAlerta(alertaId: string): AlertaSEO | undefined {
    return this.alertas.get(alertaId);
  }

  listarAlertas(): AlertaSEO[] {
    return Array.from(this.alertas.values()).filter((a) => a.activa);
  }

  desactivarAlerta(alertaId: string): boolean {
    const alerta = this.alertas.get(alertaId);
    if (!alerta) return false;

    (alerta as any).activa = false;
    return true;
  }

  // ========== DETECCIÓN AUTOMÁTICA ==========

  detectarRankingBajando(
    keywords: KeywordMonitoring[],
    posicionesBajadas: number = 3
  ): KeywordMonitoring[] {
    return keywords.filter(
      (k) =>
        k.posiciónAnterior &&
        k.posiciónAnterior - k.posiciónActual >= -posicionesBajadas &&
        k.posiciónActual > k.posiciónAnterior
    );
  }

  detectarRankingMejorando(
    keywords: KeywordMonitoring[],
    posicionesMejoro: number = 3
  ): KeywordMonitoring[] {
    return keywords.filter(
      (k) =>
        k.posiciónAnterior &&
        k.posiciónAnterior - k.posiciónActual >= posicionesMejoro
    );
  }

  verificarErroresCrawling(errores: ErrorCrawling[]): boolean {
    return errores.length > 0;
  }

  verificarPáginasNoIndexadas(páginas: PáginaNoIndexada[]): boolean {
    return páginas.length > 0;
  }

  // ========== REPORTES ==========

  generarReporteMensual(
    keywords: KeywordMonitoring[],
    errores: ErrorCrawling[],
    páginasNoIndexadas: PáginaNoIndexada[],
    período: string = "mensual"
  ): ReporteSEO {
    const id = randomUUID();

    // Top 10 keywords
    const keywordsTop10 = keywords
      .sort((a, b) => a.posiciónActual - b.posiciónActual)
      .slice(0, 10);

    // Oportunidades: posición 2-10
    const keywordsOportunidad = keywords.filter(
      (k) => k.posiciónActual > 1 && k.posiciónActual <= 10
    );

    // Mejoras sugeridas
    const mejoras: string[] = [];
    if (errores.length > 0) {
      mejoras.push(`Resolver ${errores.length} errores de rastreo`);
    }
    if (páginasNoIndexadas.length > 0) {
      mejoras.push(`Indexar ${páginasNoIndexadas.length} páginas no indexadas`);
    }
    if (keywordsOportunidad.length > 0) {
      mejoras.push(`Optimizar ${keywordsOportunidad.length} keywords para top 1-3`);
    }

    // Puntuación técnica (simulada)
    const puntuaciónTécnica = Math.max(0, 100 - errores.length * 5);

    // Puntuación SEO general
    const posiciónPromedia =
      keywords.length > 0
        ? keywords.reduce((sum, k) => sum + k.posiciónActual, 0) / keywords.length
        : 0;
    const puntuaciónSEO = Math.max(0, 100 - (posiciónPromedia - 1) * 2);

    const reportePeriodo: "semanal" | "mensual" | "trimestral" = (período as any) === "mensual" ? "mensual" : período === "semanal" ? "semanal" : "trimestral";

    const reporte: ReporteSEO = {
      id,
      período: reportePeriodo,
      fechaGeneración: new Date(),
      keywordsTop10,
      keywordsOportunidad,
      erroresCrawling: errores,
      páginasNoIndexadas,
      mejoras,
      puntuaciónTécnica,
      puntuaciónSEO,
    };

    this.reportes.set(id, reporte);
    return reporte;
  }

  generarReporte(
    keywords: KeywordMonitoring[],
    errores: ErrorCrawling[],
    páginasNoIndexadas: PáginaNoIndexada[]
  ): ReporteSEO {
    return this.generarReporteMensual(keywords, errores, páginasNoIndexadas);
  }

  obtenerReporte(reporteId: string): ReporteSEO | undefined {
    return this.reportes.get(reporteId);
  }

  listarReportes(): ReporteSEO[] {
    return Array.from(this.reportes.values()).sort(
      (a, b) => b.fechaGeneración.getTime() - a.fechaGeneración.getTime()
    );
  }

  enviarReporteMensual(
    correos: string[],
    keywords: KeywordMonitoring[],
    errores: ErrorCrawling[],
    páginasNoIndexadas: PáginaNoIndexada[]
  ): boolean {
    const reporte = this.generarReporteMensual(keywords, errores, páginasNoIndexadas);

    // Simular envío de email
    console.log(`Enviando reporte mensual a: ${correos.join(", ")}`);
    console.log(JSON.stringify(reporte, null, 2));

    return true;
  }

  // ========== EXPORTAR REPORTES ==========

  exportarReporteHTML(reporteId: string): string | null {
    const reporte = this.reportes.get(reporteId);
    if (!reporte) return null;

    return `
      <html>
        <head>
          <title>Reporte SEO - ${reporte.período}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            .metric { margin: 10px 0; padding: 10px; background: #f0f0f0; }
          </style>
        </head>
        <body>
          <h1>Reporte SEO - ${reporte.período}</h1>
          <div class="metric">
            <strong>Puntuación Técnica:</strong> ${reporte.puntuaciónTécnica}/100
          </div>
          <div class="metric">
            <strong>Puntuación SEO:</strong> ${reporte.puntuaciónSEO}/100
          </div>
          <div class="metric">
            <strong>Keywords en Top 10:</strong> ${reporte.keywordsTop10.length}
          </div>
          <div class="metric">
            <strong>Oportunidades:</strong> ${reporte.keywordsOportunidad.length}
          </div>
          <div class="metric">
            <strong>Errores Detectados:</strong> ${reporte.erroresCrawling.length}
          </div>
        </body>
      </html>
    `;
  }

  exportarReporteJSON(reporteId: string): string | null {
    const reporte = this.reportes.get(reporteId);
    if (!reporte) return null;

    return JSON.stringify(reporte, null, 2);
  }

  // ========== MEJORAS ==========

  agregarMejora(
    título: string,
    descripción: string,
    impactoEstimado: number,
    esfuerzo: "bajo" | "medio" | "alto"
  ): MejoraSEO {
    const id = randomUUID();

    const mejora: MejoraSEO = {
      id,
      título,
      descripción,
      impactoEstimado,
      esfuerzo,
      estado: "pendiente",
      fechaRecomendación: new Date(),
    };

    this.mejoras.set(id, mejora);
    return mejora;
  }

  marcarMejoraCompletada(mejoraId: string): boolean {
    const mejora = this.mejoras.get(mejoraId);
    if (!mejora) return false;

    (mejora as any).estado = "completada";
    (mejora as any).fechaCompletacion = new Date();
    return true;
  }

  obtenerMejoras(): MejoraSEO[] {
    return Array.from(this.mejoras.values());
  }

  obtenerMejoraPendientes(): MejoraSEO[] {
    return Array.from(this.mejoras.values()).filter((m) => m.estado === "pendiente");
  }

  obtenerMejorasporImpacto(): MejoraSEO[] {
    return Array.from(this.mejoras.values())
      .sort((a, b) => b.impactoEstimado - a.impactoEstimado)
      .sort((a, b) => {
        const esfuerzoScore = { bajo: 1, medio: 2, alto: 3 };
        return esfuerzoScore[a.esfuerzo] - esfuerzoScore[b.esfuerzo];
      });
  }

  // ========== ESTADÍSTICAS DE REPORTES ==========

  obtenerEstadísticasReportes(): {
    totalReportes: number;
    últimoReporte?: ReporteSEO;
    puntuaciónPromedio: number;
    tendencia: "mejorando" | "empeorando" | "estable";
  } {
    const reportes = this.listarReportes();

    if (reportes.length === 0) {
      return {
        totalReportes: 0,
        puntuaciónPromedio: 0,
        tendencia: "estable",
      };
    }

    const puntuaciónPromedio =
      reportes.reduce((sum, r) => sum + r.puntuaciónSEO, 0) / reportes.length;

    let tendencia: "mejorando" | "empeorando" | "estable" = "estable";
    if (reportes.length >= 2 && reportes[0] && reportes[1]) {
      const penúltima = reportes[1];
      const última = reportes[0];
      if (última.puntuaciónSEO > penúltima.puntuaciónSEO) {
        tendencia = "mejorando";
      } else if (última.puntuaciónSEO < penúltima.puntuaciónSEO) {
        tendencia = "empeorando";
      }
    }

    return {
      totalReportes: reportes.length,
      últimoReporte: reportes[0],
      puntuaciónPromedio,
      tendencia,
    };
  }

  configurarAlertas(keywords: KeywordMonitoring[]): void {
    // Crear alertas automáticas para keywords importantes
    const importantesKeywords = keywords
      .filter((k) => k.volumenBúsqueda > 100)
      .slice(0, 5);

    for (const kw of importantesKeywords) {
      this.generarAlerta(
        "ranking_bajando",
        kw.posiciónActual + 5,
        "alerts@example.com",
        kw.keyword
      );
    }
  }
}
