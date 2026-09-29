/**
 * Tipos del Consultor — preguntas NL → consultas estructuradas de lectura.
 */

import type {
  CanalId,
  DimensionId,
  MetricId,
  SegmentoId,
} from "./catalog.js";

export interface PeriodFilter {
  readonly year: number;
  /** 1–12 */
  readonly month?: number;
  /** 1–4 */
  readonly quarter?: number;
}

export interface StructuredMetricQuery {
  readonly metricId: MetricId;
  /** Dimensiones de desglose (group by). */
  readonly groupBy: readonly DimensionId[];
  readonly period: PeriodFilter;
  readonly filters: {
    readonly canal?: CanalId;
    readonly segmento?: SegmentoId;
    readonly sedeId?: string;
  };
  readonly confidence: number;
}

/** Fila de hechos métricos (proyección; no EventStore). */
export interface MetricFactRow {
  readonly id: string;
  readonly tenantId: string;
  readonly sedeId: string;
  readonly equipoId?: string;
  readonly parteId?: string;
  readonly canal: CanalId;
  readonly segmento: SegmentoId;
  readonly year: number;
  readonly month: number;
  readonly importe: number;
  readonly unidades: number;
  readonly ingresos_previstos: number;
  readonly conversion: number;
  readonly ticket_medio: number;
}

export interface CalculationTrace {
  readonly metricId: MetricId;
  readonly metricLabel: string;
  readonly period: PeriodFilter;
  readonly filters: StructuredMetricQuery["filters"];
  readonly groupBy: readonly DimensionId[];
  readonly rowsConsidered: number;
  readonly rowsAfterFilter: number;
}

export interface MetricBucket {
  readonly key: string;
  readonly dimensions: Readonly<Record<string, string | number>>;
  readonly value: number;
}

export type ConsultantOutcome =
  | {
      readonly kind: "respuesta";
      readonly query: StructuredMetricQuery;
      readonly buckets: readonly MetricBucket[];
      readonly total: number;
      readonly calculation: CalculationTrace;
      readonly clarificationAsked: false;
    }
  | {
      readonly kind: "aclaracion";
      readonly question: string;
      readonly confidence: number;
      readonly reason: "low_confidence" | "out_of_catalog" | "ambiguous";
      readonly suggestedMetrics?: readonly MetricId[];
      readonly clarificationAsked: true;
    };

export interface UnansweredGap {
  readonly id: string;
  readonly at: string;
  readonly question: string;
  readonly reason: string;
  readonly readerId: string;
  /** Pista de métrica ausente / no reconocida. */
  readonly missingHint: string;
}

export class ConsultantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsultantError";
  }
}
