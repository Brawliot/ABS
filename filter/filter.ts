/**
 * Funciones puras del Filtro (juez de lectura).
 */

import type { CompiledRuleSet, VisibilityScope } from "../policies/types.js";
import type {
  FieldAccessRule,
  FieldVerdict,
  FilterPolicy,
  FilterReadResult,
  FilterReader,
  FilterRow,
  FilteredRead,
  PersonalDataAccessRecord,
  RowVerdict,
} from "./types.js";
import { DEFAULT_FIELD_RULES, readerAttrs } from "./types.js";

/**
 * Evalúa si el lector puede ver la fila (permiso consulta + org + tenant + propia).
 * Pura y determinista.
 */
export function evaluateRowAccess(
  reader: FilterReader,
  row: FilterRow,
  ruleSet: CompiledRuleSet,
  options?: { readonly now?: string },
): RowVerdict {
  void options;
  if (reader.tenantId !== row.tenantId) {
    return {
      ok: false,
      rowId: row.id,
      reason: `Tenant distinto (lector=${reader.tenantId}; fila=${row.tenantId})`,
      ruleId: "filter:tenant",
    };
  }

  const visRules = ruleSet.rules.filter((r) => r.kind === "visibility");
  const applicable = visRules.filter(
    (r) =>
      r.kind === "visibility" &&
      r.allowedRoles.some((role) => reader.roles.includes(role)),
  );

  if (applicable.length === 0) {
    // Sin permiso de consulta explícito para sus roles → denegar
    // (si no hay ninguna visibility en el set, denegar lecturas L2 por defecto seguro)
    if (visRules.length === 0) {
      return {
        ok: false,
        rowId: row.id,
        reason: "Sin reglas de consulta (visibility) en el RuleSet",
        ruleId: "filter:no_visibility",
      };
    }
    return {
      ok: false,
      rowId: row.id,
      reason: `Sin permiso de consulta para roles [${reader.roles.join(", ") || "∅"}]`,
      ruleId: "filter:no_consult_role",
    };
  }

  const attrs = readerAttrs(ruleSet, reader);
  // Debe cumplir AL MENOS una regla de visibility aplicable
  for (const r of applicable) {
    if (r.kind !== "visibility") continue;
    if (matchesScope(r.visibilityScope, reader, row, attrs?.sedeId, attrs?.equipoId)) {
      return {
        ok: true,
        rowId: row.id,
        reason: `Consulta OK (scope=${r.visibilityScope}, regla=${r.id})`,
        ruleId: r.id,
      };
    }
  }

  return {
    ok: false,
    rowId: row.id,
    reason: `Fuera de ámbito organizativo o propia (sede/equipo/parte)`,
    ruleId: "filter:scope",
  };
}

function matchesScope(
  scope: VisibilityScope,
  reader: FilterReader,
  row: FilterRow,
  readerSede?: string,
  readerEquipo?: string,
): boolean {
  switch (scope) {
    case "empresa":
      return true;
    case "sede":
      return (
        readerSede !== undefined &&
        row.sedeId !== undefined &&
        readerSede === row.sedeId
      );
    case "equipo":
      return (
        readerEquipo !== undefined &&
        row.equipoId !== undefined &&
        readerEquipo === row.equipoId
      );
    case "propia":
      // Portal: transacciones de esa Parte; o sujeto = actor
      if (reader.parteId && row.parteId) {
        return reader.parteId === row.parteId;
      }
      if (row.kind === "parte") {
        return reader.parteId === row.id || reader.id === row.id;
      }
      return false;
    default:
      return false;
  }
}

/**
 * Evalúa visibilidad de un campo (fiscal / personal / operativo).
 */
export function evaluateFieldAccess(
  reader: FilterReader,
  field: string,
  value: unknown,
  policy: FilterPolicy,
): FieldVerdict {
  void value;
  const rules = policy.fieldRules.length
    ? policy.fieldRules
    : DEFAULT_FIELD_RULES;
  const rule = rules.find((r) => r.field === field);
  if (!rule) {
    return {
      field,
      visible: true,
      classification: "operativo",
      reason: "Campo operativo (sin restricción)",
    };
  }
  const ok = rule.allowedRoles.some((role) => reader.roles.includes(role));
  return {
    field,
    visible: ok,
    classification: rule.classification,
    reason: ok
      ? `Campo ${rule.classification} permitido`
      : `Campo ${rule.classification} oculto (roles insuficientes)`,
  };
}

/**
 * Filtra filas: solo las que pasan evaluateRowAccess.
 */
export function filterRows(
  reader: FilterReader,
  rows: readonly FilterRow[],
  ruleSet: CompiledRuleSet,
): {
  readonly allowed: readonly FilterRow[];
  readonly denied: readonly RowVerdict[];
} {
  const allowed: FilterRow[] = [];
  const denied: RowVerdict[] = [];
  for (const row of rows) {
    const v = evaluateRowAccess(reader, row, ruleSet);
    if (v.ok) allowed.push(row);
    else denied.push(v);
  }
  return { allowed, denied };
}

/**
 * Proyecta campos visibles de una fila. Registra accesos a datos personales.
 */
export function filterFields(
  reader: FilterReader,
  row: FilterRow,
  policy: FilterPolicy,
  at: string,
): {
  readonly fields: Readonly<Record<string, unknown>>;
  readonly redactedFields: readonly string[];
  readonly fieldVerdicts: readonly FieldVerdict[];
  readonly personalAccess: PersonalDataAccessRecord | null;
} {
  const out: Record<string, unknown> = {};
  const redacted: string[] = [];
  const verdicts: FieldVerdict[] = [];
  const personalSeen: string[] = [];

  for (const [field, value] of Object.entries(row.fields)) {
    const v = evaluateFieldAccess(reader, field, value, policy);
    verdicts.push(v);
    if (v.visible) {
      out[field] = value;
      if (v.classification === "personal") personalSeen.push(field);
    } else {
      redacted.push(field);
    }
  }

  const personalAccess: PersonalDataAccessRecord | null =
    personalSeen.length > 0
      ? {
          at,
          readerId: reader.id,
          tenantId: reader.tenantId,
          subjectKind: row.kind,
          subjectId: row.id,
          fields: personalSeen.sort(),
          purpose: "consulta",
        }
      : null;

  return {
    fields: out,
    redactedFields: redacted.sort(),
    fieldVerdicts: verdicts.sort((a, b) => a.field.localeCompare(b.field)),
    personalAccess,
  };
}

/**
 * Lectura completa a través del Filtro (filas + campos + traza PII).
 */
export function readThroughFilter(
  reader: FilterReader,
  rows: readonly FilterRow[],
  ruleSet: CompiledRuleSet,
  policy: FilterPolicy = { fieldRules: DEFAULT_FIELD_RULES },
  at = "1970-01-01T00:00:00.000Z",
): FilterReadResult {
  const { allowed, denied } = filterRows(reader, rows, ruleSet);
  const items: FilteredRead[] = [];
  const personalAccessLog: PersonalDataAccessRecord[] = [];

  for (const row of allowed) {
    const rowVerdict = evaluateRowAccess(reader, row, ruleSet);
    const projected = filterFields(reader, row, policy, at);
    if (projected.personalAccess) {
      personalAccessLog.push(projected.personalAccess);
    }
    items.push({
      row: {
        ...row,
        fields: projected.fields,
      },
      fields: projected.fields,
      redactedFields: projected.redactedFields,
      rowVerdict,
      fieldVerdicts: projected.fieldVerdicts,
    });
  }

  return {
    items,
    personalAccessLog,
    denied,
  };
}

/** Helper: ¿el campo es fiscal según la política? */
export function isFiscalField(
  field: string,
  rules: readonly FieldAccessRule[] = DEFAULT_FIELD_RULES,
): boolean {
  return rules.some((r) => r.field === field && r.classification === "fiscal");
}
