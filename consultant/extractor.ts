/**
 * Traductor NL → StructuredMetricQuery (catálogo cerrado).
 * Interfaz preparada para LLM; MVP = heurístico determinista offline.
 */

import {
  CONSULTANT_CONFIDENCE_THRESHOLD,
  type CanalId,
  type DimensionId,
  type MetricId,
  type SegmentoId,
} from "./catalog.js";
import type { PeriodFilter, StructuredMetricQuery } from "./types.js";

export interface ConsultantExtract {
  readonly query: StructuredMetricQuery | null;
  readonly confidence: number;
  readonly clarificationQuestion: string | null;
  readonly reason: "ok" | "low_confidence" | "out_of_catalog" | "ambiguous";
  readonly missingHint?: string;
  readonly suggestedMetrics?: readonly MetricId[];
}

export interface ConsultantTextExtractor {
  extract(
    question: string,
    context: { readonly defaultYear: number },
  ): ConsultantExtract;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

const MONTHS: ReadonlyArray<{ readonly re: RegExp; readonly month: number }> = [
  { re: /ener[oa]/, month: 1 },
  { re: /febrer[oa]/, month: 2 },
  { re: /marz[oa]/, month: 3 },
  { re: /abril/, month: 4 },
  { re: /may[oa]/, month: 5 },
  { re: /juni[oa]/, month: 6 },
  { re: /juli[oa]/, month: 7 },
  { re: /agost[oa]/, month: 8 },
  { re: /septiembr[ea]/, month: 9 },
  { re: /octubr[ea]/, month: 10 },
  { re: /noviembr[ea]/, month: 11 },
  { re: /diciembr[ea]/, month: 12 },
];

function parseMonth(t: string): number | undefined {
  for (const m of MONTHS) {
    if (m.re.test(t)) return m.month;
  }
  return undefined;
}

function parseYear(t: string, defaultYear: number): number {
  const m = t.match(/\b(20\d{2})\b/);
  return m ? Number(m[1]) : defaultYear;
}

function parseCanal(t: string): CanalId | undefined {
  if (/\bweb\b|online|ecommerce/.test(t)) return "web";
  if (/presencial|tienda|local/.test(t)) return "presencial";
  if (/autoservicio|self[-\s]?service|portal/.test(t)) return "autoservicio";
  if (/backoffice|oficina|interno/.test(t)) return "backoffice";
  return undefined;
}

function parseSegmento(t: string): SegmentoId | undefined {
  if (/premium|vip/.test(t)) return "premium";
  if (/empresa|b2b|corporativ/.test(t)) return "empresa";
  if (/retail|particular|b2c/.test(t)) return "retail";
  return undefined;
}

function parseSede(t: string): string | undefined {
  if (/\bsede-a\b/.test(t) || /sede\s+a\b/.test(t)) return "sede-a";
  if (/\bsede-b\b/.test(t) || /sede\s+b\b/.test(t)) return "sede-b";
  const m = t.match(/\bsede[-\s]?([a-z0-9]+)\b/i);
  if (m) return `sede-${m[1]!.toLowerCase()}`;
  return undefined;
}

function detectMetric(t: string): {
  readonly metricId: MetricId | null;
  readonly confidence: number;
  readonly missingHint?: string;
} {
  if (
    /(prevision|previsto|forecast|proyectad)/.test(t) &&
    /(ingreso|venta|factur)/.test(t)
  ) {
    return { metricId: "prevision_ingresos", confidence: 0.92 };
  }
  if (/ticket\s*medio|importe\s*medio|avg\s*ticket/.test(t)) {
    return { metricId: "ticket_medio", confidence: 0.9 };
  }
  if (/tasa\s*de\s*conversion|conversion/.test(t)) {
    return { metricId: "tasa_conversion", confidence: 0.9 };
  }
  if (
    /(cuant[oa]s?\s+unidad|numero\s+de\s+ventas|cuantas\s+ventas|unidades\s+en)/.test(
      t,
    )
  ) {
    return { metricId: "ventas_unidades", confidence: 0.9 };
  }
  if (
    /(cuanto\s+vend|ventas|facturacion|facturado|importe\s+de\s+ventas|vendimos|vendido)/.test(
      t,
    )
  ) {
    return { metricId: "ventas_importe", confidence: 0.93 };
  }
  if (
    /(stock|inventario|empleados|nomina|salario|rrhh|tiempo\s+hace|roi\s+de|costes\s+de\s+rrhh)/.test(
      t,
    )
  ) {
    return {
      metricId: null,
      confidence: 0.2,
      missingHint: "métrica no catalogada",
    };
  }
  return {
    metricId: null,
    confidence: 0.3,
    missingHint: "métrica no reconocida en catálogo",
  };
}

function detectGroupBy(t: string): readonly DimensionId[] {
  const dims: DimensionId[] = [];
  if (/por\s+canal|desglos.*canal|segun\s+canal|por\s+canales/.test(t)) {
    dims.push("canal");
  }
  if (/por\s+segmento|desglos.*segmento|segun\s+segmento/.test(t)) {
    dims.push("segmento");
  }
  if (/por\s+sede|desglos.*sede|segun\s+sede|por\s+sedes/.test(t)) {
    dims.push("sede");
  }
  if (/por\s+mes|por\s+periodo|mensual|por\s+meses/.test(t)) {
    dims.push("periodo");
  }
  return dims;
}

/**
 * Extractor heurístico = stand-in del LLM.
 * Nunca inventa métricas fuera del catálogo.
 */
export class HeuristicConsultantExtractor implements ConsultantTextExtractor {
  extract(
    question: string,
    context: { readonly defaultYear: number },
  ): ConsultantExtract {
    const t = norm(question);
    if (t.length < 6 || /^(hola|ok|ayuda|\?+)$/.test(t)) {
      return {
        query: null,
        confidence: 0.25,
        clarificationQuestion:
          "¿Qué métrica quieres consultar? (ventas, previsión, ticket medio, conversión…)",
        reason: "ambiguous",
        missingHint: "pregunta demasiado vaga",
        suggestedMetrics: ["ventas_importe", "prevision_ingresos"],
      };
    }

    const metric = detectMetric(t);
    if (!metric.metricId) {
      return {
        query: null,
        confidence: metric.confidence,
        clarificationQuestion:
          "Esa pregunta no encaja en el catálogo de métricas. ¿Quieres ventas, previsión de ingresos, ticket medio o tasa de conversión?",
        reason: "out_of_catalog",
        missingHint: metric.missingHint ?? "fuera de catálogo",
        suggestedMetrics: [
          "ventas_importe",
          "prevision_ingresos",
          "ticket_medio",
          "tasa_conversion",
        ],
      };
    }

    const month = parseMonth(t);
    const year = parseYear(t, context.defaultYear);
    const period: PeriodFilter = {
      year,
      ...(month !== undefined ? { month } : {}),
    };

    const groupBy = detectGroupBy(t);
    const canal = parseCanal(t);
    const segmento = parseSegmento(t);
    const sedeId = parseSede(t);

    // "por canal" sin métrica de ventas clara ya cubierta
    let confidence = metric.confidence;
    if (month === undefined && /marzo|abril|enero/.test(t) === false) {
      // sin periodo explícito baja un poco si pregunta de ventas
      if (!/este\s+ano|anual|ytd|todo\s+el\s+ano/.test(t) && month === undefined) {
        // ok if year only
      }
    }
    if (groupBy.length === 0 && /por\s+\w+/.test(t)) {
      confidence = Math.min(confidence, 0.55);
    }

    if (confidence < CONSULTANT_CONFIDENCE_THRESHOLD) {
      return {
        query: null,
        confidence,
        clarificationQuestion:
          "No estoy seguro de la métrica o el desglose. ¿Ventas por canal, por sede o por segmento?",
        reason: "low_confidence",
        suggestedMetrics: [metric.metricId],
      };
    }

    const query: StructuredMetricQuery = {
      metricId: metric.metricId,
      groupBy,
      period,
      filters: {
        ...(canal !== undefined ? { canal } : {}),
        ...(segmento !== undefined ? { segmento } : {}),
        ...(sedeId !== undefined ? { sedeId } : {}),
      },
      confidence,
    };

    return {
      query,
      confidence,
      clarificationQuestion: null,
      reason: "ok",
    };
  }
}
