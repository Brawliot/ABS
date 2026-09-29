/**
 * Catálogo cerrado del Consultor — métricas, dimensiones y filtros.
 * El LLM/extractor SOLO puede emitir ids de este catálogo.
 */

export const CONSULTANT_CONFIDENCE_THRESHOLD = 0.85;

export type MetricId =
  | "ventas_importe"
  | "ventas_unidades"
  | "prevision_ingresos"
  | "tasa_conversion"
  | "ticket_medio";

export type DimensionId = "canal" | "segmento" | "periodo" | "sede";

export type CanalId = "presencial" | "web" | "autoservicio" | "backoffice";
export type SegmentoId = "retail" | "empresa" | "premium";

export interface MetricDefinition {
  readonly id: MetricId;
  readonly label: string;
  readonly description: string;
  readonly unit: "eur" | "count" | "ratio";
  readonly allowedDimensions: readonly DimensionId[];
  /** Campo de fila usado al agregar. */
  readonly valueField: string;
}

export interface DimensionDefinition {
  readonly id: DimensionId;
  readonly label: string;
  readonly values?: readonly string[];
}

export const METRIC_CATALOG: readonly MetricDefinition[] = [
  {
    id: "ventas_importe",
    label: "Ventas (importe)",
    description: "Suma de importes de ventas cerradas",
    unit: "eur",
    allowedDimensions: ["canal", "segmento", "periodo", "sede"],
    valueField: "importe",
  },
  {
    id: "ventas_unidades",
    label: "Ventas (unidades)",
    description: "Número de transacciones de venta",
    unit: "count",
    allowedDimensions: ["canal", "segmento", "periodo", "sede"],
    valueField: "unidades",
  },
  {
    id: "prevision_ingresos",
    label: "Previsión de ingresos",
    description: "Ingresos previstos",
    unit: "eur",
    allowedDimensions: ["canal", "segmento", "periodo", "sede"],
    valueField: "ingresos_previstos",
  },
  {
    id: "tasa_conversion",
    label: "Tasa de conversión",
    description: "Propuestas aceptadas / propuestas",
    unit: "ratio",
    allowedDimensions: ["canal", "segmento", "periodo", "sede"],
    valueField: "conversion",
  },
  {
    id: "ticket_medio",
    label: "Ticket medio",
    description: "Importe medio por venta",
    unit: "eur",
    allowedDimensions: ["canal", "segmento", "periodo", "sede"],
    valueField: "ticket_medio",
  },
];

export const DIMENSION_CATALOG: readonly DimensionDefinition[] = [
  {
    id: "canal",
    label: "Canal",
    values: ["presencial", "web", "autoservicio", "backoffice"],
  },
  {
    id: "segmento",
    label: "Segmento",
    values: ["retail", "empresa", "premium"],
  },
  { id: "periodo", label: "Periodo" },
  { id: "sede", label: "Sede" },
];

const METRIC_BY_ID = new Map(METRIC_CATALOG.map((m) => [m.id, m]));
const DIM_IDS = new Set(DIMENSION_CATALOG.map((d) => d.id));

export function getMetric(id: string): MetricDefinition | undefined {
  return METRIC_BY_ID.get(id as MetricId);
}

export function isMetricId(id: string): id is MetricId {
  return METRIC_BY_ID.has(id as MetricId);
}

export function isDimensionId(id: string): id is DimensionId {
  return DIM_IDS.has(id as DimensionId);
}

export function assertQueryAgainstCatalog(query: {
  readonly metricId: string;
  readonly groupBy: readonly string[];
}): void {
  if (!isMetricId(query.metricId)) {
    throw new Error(`Métrica fuera de catálogo: ${query.metricId}`);
  }
  const metric = getMetric(query.metricId)!;
  for (const d of query.groupBy) {
    if (!isDimensionId(d)) {
      throw new Error(`Dimensión fuera de catálogo: ${d}`);
    }
    if (!metric.allowedDimensions.includes(d)) {
      throw new Error(
        `Dimensión ${d} no permitida para métrica ${query.metricId}`,
      );
    }
  }
}
