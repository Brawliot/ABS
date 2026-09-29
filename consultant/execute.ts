/**
 * Ejecución de consultas estructuradas sobre hechos métricos + Filtro.
 * Nunca consulta libre al EventStore.
 */

import {
  DEFAULT_FIELD_RULES,
  readThroughFilter,
  type FilterPolicy,
  type FilterReader,
  type FilterRow,
} from "../filter/index.js";
import type { CompiledRuleSet } from "../policies/types.js";
import {
  assertQueryAgainstCatalog,
  getMetric,
} from "./catalog.js";
import type {
  CalculationTrace,
  MetricBucket,
  MetricFactRow,
  StructuredMetricQuery,
} from "./types.js";
import { ConsultantError } from "./types.js";

const METRIC_FIELD_RULES = [
  ...DEFAULT_FIELD_RULES,
  {
    field: "ingresos_previstos",
    classification: "fiscal" as const,
    allowedRoles: ["finanzas", "gerente", "contabilidad"],
  },
];

export function metricFactToFilterRow(row: MetricFactRow): FilterRow {
  return {
    kind: "transaccion",
    id: row.id,
    tenantId: row.tenantId,
    sedeId: row.sedeId,
    ...(row.equipoId !== undefined ? { equipoId: row.equipoId } : {}),
    ...(row.parteId !== undefined ? { parteId: row.parteId } : {}),
    fields: {
      importe: row.importe,
      unidades: row.unidades,
      ingresos_previstos: row.ingresos_previstos,
      conversion: row.conversion,
      ticket_medio: row.ticket_medio,
      canal: row.canal,
      segmento: row.segmento,
      year: row.year,
      month: row.month,
      sedeId: row.sedeId,
    },
  };
}

function matchesPeriod(
  row: MetricFactRow,
  period: StructuredMetricQuery["period"],
): boolean {
  if (row.year !== period.year) return false;
  if (period.month !== undefined && row.month !== period.month) return false;
  if (period.quarter !== undefined) {
    const q = Math.ceil(row.month / 3);
    if (q !== period.quarter) return false;
  }
  return true;
}

function matchesFilters(
  row: MetricFactRow,
  filters: StructuredMetricQuery["filters"],
): boolean {
  if (filters.canal && row.canal !== filters.canal) return false;
  if (filters.segmento && row.segmento !== filters.segmento) return false;
  if (filters.sedeId && row.sedeId !== filters.sedeId) return false;
  return true;
}

function valueFromFields(
  fields: Readonly<Record<string, unknown>>,
  valueField: string,
): number {
  const v = fields[valueField];
  return typeof v === "number" ? v : 0;
}

function bucketKey(
  dims: Readonly<Record<string, string | number>>,
): string {
  return Object.keys(dims)
    .sort()
    .map((k) => `${k}=${dims[k]}`)
    .join("|");
}

export interface ExecuteQueryResult {
  readonly buckets: readonly MetricBucket[];
  readonly total: number;
  readonly calculation: CalculationTrace;
}

/**
 * Ejecuta una consulta del catálogo: prefiltro de periodo/filtros → Filtro → agregación.
 */
export function executeStructuredQuery(input: {
  readonly query: StructuredMetricQuery;
  readonly facts: readonly MetricFactRow[];
  readonly reader: FilterReader;
  readonly ruleSet: CompiledRuleSet;
  readonly at?: string;
  readonly policy?: FilterPolicy;
}): ExecuteQueryResult {
  assertQueryAgainstCatalog(input.query);
  const metric = getMetric(input.query.metricId);
  if (!metric) {
    throw new ConsultantError(`Métrica desconocida: ${input.query.metricId}`);
  }

  const scoped = input.facts.filter(
    (r) =>
      matchesPeriod(r, input.query.period) &&
      matchesFilters(r, input.query.filters),
  );

  const asFilterRows = scoped.map(metricFactToFilterRow);
  const filtered = readThroughFilter(
    input.reader,
    asFilterRows,
    input.ruleSet,
    input.policy ?? { fieldRules: METRIC_FIELD_RULES },
    input.at ?? "2026-06-01T00:00:00.000Z",
  );

  const agg = new Map<
    string,
    { dims: Record<string, string | number>; sum: number; n: number }
  >();

  for (const item of filtered.items) {
    const fields = item.fields;
    if (!(metric.valueField in fields)) continue;

    const dims: Record<string, string | number> = {};
    for (const d of input.query.groupBy) {
      if (d === "canal") dims.canal = String(fields.canal ?? "");
      else if (d === "segmento")
        dims.segmento = String(fields.segmento ?? "");
      else if (d === "sede")
        dims.sede = String(fields.sedeId ?? item.row.sedeId ?? "");
      else if (d === "periodo") {
        dims.year = Number(fields.year);
        dims.month = Number(fields.month);
      }
    }
    const key =
      input.query.groupBy.length === 0 ? "_total_" : bucketKey(dims);
    let slot = agg.get(key);
    if (!slot) {
      slot = { dims, sum: 0, n: 0 };
      agg.set(key, slot);
    }
    slot.sum += valueFromFields(fields, metric.valueField);
    slot.n += 1;
  }

  const buckets: MetricBucket[] = [...agg.entries()].map(([, s]) => {
    let value = s.sum;
    if (metric.id === "ticket_medio" || metric.id === "tasa_conversion") {
      value = s.n === 0 ? 0 : s.sum / s.n;
    }
    return {
      key: bucketKey(s.dims) || "_total_",
      dimensions: s.dims,
      value,
    };
  });
  buckets.sort((a, b) => a.key.localeCompare(b.key));

  const total =
    metric.id === "ticket_medio" || metric.id === "tasa_conversion"
      ? buckets.length === 0
        ? 0
        : buckets.reduce((a, b) => a + b.value, 0) / buckets.length
      : buckets.reduce((a, b) => a + b.value, 0);

  const calculation: CalculationTrace = {
    metricId: metric.id,
    metricLabel: metric.label,
    period: input.query.period,
    filters: input.query.filters,
    groupBy: input.query.groupBy,
    rowsConsidered: scoped.length,
    rowsAfterFilter: filtered.items.length,
  };

  return { buckets, total, calculation };
}
