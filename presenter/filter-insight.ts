/**
 * Pasa Insights por el Filtro antes de mostrarlos.
 */

import type { Insight, InsightFact } from "../contracts/insight.js";
import {
  evaluateRowAccess,
  filterFields,
  DEFAULT_FIELD_RULES,
} from "../filter/index.js";
import type {
  FieldAccessRule,
  FilterPolicy,
  FilterReader,
  FilterRow,
  FilterSubjectKind,
  RowVerdict,
} from "../filter/types.js";
import type { CompiledRuleSet } from "../policies/types.js";

/** Campos típicos de Insights de capa 3 (previsiones, métricas). */
export const INSIGHT_FIELD_RULES: readonly FieldAccessRule[] = [
  ...DEFAULT_FIELD_RULES,
  {
    field: "ingresos_previstos",
    classification: "fiscal",
    allowedRoles: ["finanzas", "gerente", "contabilidad"],
  },
  {
    field: "margen_previsto",
    classification: "fiscal",
    allowedRoles: ["finanzas", "gerente", "contabilidad"],
  },
];

function toFilterKind(
  kind: Insight["subject"]["kind"],
): FilterSubjectKind {
  if (kind === "parte") return "parte";
  if (kind === "recurso") return "recurso";
  return "transaccion";
}

/** Construye fila de Filtro a partir del sujeto + hechos base. */
export function insightToFilterRow(insight: Insight): FilterRow {
  const fields: Record<string, unknown> = {};
  for (const f of insight.baseFacts) {
    const key = f.fieldKey ?? f.id;
    fields[key] = f.value;
  }
  return {
    kind: toFilterKind(insight.subject.kind),
    id: insight.subject.id,
    tenantId: insight.subject.tenantId,
    ...(insight.subject.sedeId !== undefined
      ? { sedeId: insight.subject.sedeId }
      : {}),
    ...(insight.subject.equipoId !== undefined
      ? { equipoId: insight.subject.equipoId }
      : {}),
    ...(insight.subject.parteId !== undefined
      ? { parteId: insight.subject.parteId }
      : {}),
    fields,
  };
}

export interface FilteredInsightFacts {
  readonly ok: boolean;
  readonly rowVerdict: RowVerdict;
  readonly visibleFacts: readonly InsightFact[];
  readonly redactedFieldKeys: readonly string[];
}

/**
 * Evalúa fila + campos del Insight. Si la fila se deniega o no quedan
 * hechos visibles, el Presentador no muestra el Insight.
 */
export function filterInsightFacts(input: {
  readonly insight: Insight;
  readonly reader: FilterReader;
  readonly ruleSet: CompiledRuleSet;
  readonly policy?: FilterPolicy;
  readonly at: string;
}): FilteredInsightFacts {
  const policy: FilterPolicy = input.policy ?? {
    fieldRules: INSIGHT_FIELD_RULES,
  };
  const row = insightToFilterRow(input.insight);
  const rowVerdict = evaluateRowAccess(input.reader, row, input.ruleSet);
  if (!rowVerdict.ok) {
    return {
      ok: false,
      rowVerdict,
      visibleFacts: [],
      redactedFieldKeys: [],
    };
  }

  const projected = filterFields(input.reader, row, policy, input.at);
  const visibleFacts = input.insight.baseFacts.filter((f) => {
    const key = f.fieldKey ?? f.id;
    return !projected.redactedFields.includes(key);
  });

  return {
    ok: visibleFacts.length > 0,
    rowVerdict,
    visibleFacts,
    redactedFieldKeys: projected.redactedFields,
  };
}
