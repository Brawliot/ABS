/**
 * Tipos para SEO (Search Engine Optimization)
 * Phase 5 Final - MVP Launch
 */

export interface KeywordMonitoring {
  readonly id: string;
  readonly keyword: string;
  readonly url: string;
  posiciónActual: number;
  posiciónAnterior: number | undefined;
  readonly volumenBúsqueda: number;
  readonly dificultad: number; // 0-100
  readonly intención: "informacional" | "navegacional" | "transaccional" | "comercial";
  readonly competencia: string[];
  fechaÚltimaActualización: Date;
  activa: boolean;
}

export interface HistóricoPosición {
  readonly id: string;
  readonly keywordId: string;
  readonly posición: number;
  readonly impresiones: number;
  readonly clics: number;
  readonly ctr: number;
  readonly fecha: Date;
}

export interface DatosGoogleSearchConsole {
  readonly id: string;
  readonly keyword: string;
  readonly impresiones: number;
  readonly clics: number;
  readonly ctr: number;
  readonly posiciónPromedio: number;
  readonly posición?: number; // For compatibility
  readonly período: "semana" | "mes" | "trimestre";
  readonly fecha: Date;
}

export interface PáginaNoIndexada {
  readonly url: string;
  readonly razón: "bloqueada_robots" | "no_encontrada" | "sin_indexar" | "pendiente_indexación";
  readonly descubierta: Date;
  resolución: string | undefined;
}

export interface ErrorCrawling {
  readonly id: string;
  readonly url: string;
  readonly tipoError: "404" | "500" | "timeout" | "ssl" | "robots";
  readonly descripción: string;
  readonly primeraDetección: Date;
  úlitmaDetección: Date;
}

export interface AlertaSEO {
  readonly id: string;
  readonly tipo: "ranking_bajando" | "rastreo_error" | "página_sin_indexar" | "ctr_bajando";
  readonly keyword: string | undefined;
  readonly umbral: number;
  activa: boolean;
  readonly correoNotificación: string;
  readonly fechaCreación: Date;
}

export interface ReporteSEO {
  readonly id: string;
  readonly período: "semanal" | "mensual" | "trimestral";
  readonly fechaGeneración: Date;
  readonly keywordsTop10: KeywordMonitoring[];
  readonly keywordsOportunidad: KeywordMonitoring[];
  readonly erroresCrawling: ErrorCrawling[];
  readonly páginasNoIndexadas: PáginaNoIndexada[];
  readonly mejoras: string[];
  readonly puntuaciónTécnica: number; // 0-100
  readonly puntuaciónSEO: number; // 0-100
}

export interface ValidacionTécnica {
  readonly velocidadPágina: "rápida" | "media" | "lenta"; // milliseconds
  readonly móvilOptimizado: boolean;
  readonly httpsActivo: boolean;
  readonly sitemapPresente: boolean;
  readonly robotsTxtPresente: boolean;
  readonly schemaJSON: boolean;
  readonly imágenesConAlt: boolean;
  readonly h1Presentes: boolean;
  readonly enlacesRotos: number;
  readonly puntuaciónTotal: number; // 0-100
  readonly fechaValidación: Date;
}

export interface OportunidadSEO {
  readonly keyword: string;
  readonly posición: number; // 2-10
  readonly potencialClicsExtra: number;
  readonly dificultad: number;
  readonly recomendación: string;
  readonly fechaIdentificación: Date;
}

export interface MejoraSEO {
  readonly id: string;
  readonly título: string;
  readonly descripción: string;
  readonly impactoEstimado: number; // 0-100
  readonly esfuerzo: "bajo" | "medio" | "alto";
  estado: "pendiente" | "en_progreso" | "completada";
  readonly fechaRecomendación: Date;
  fechaCompletacion: Date | undefined;
}
