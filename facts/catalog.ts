/**
 * Catálogo de hechos (MVP): declaración de nombre, tipo, parámetros y derivación.
 */

import type { TenantId } from "../tenancy/index.js";

export type FactResultType = "number" | "integer" | "duration_ms";

export type FactElementKind = "parte" | "recurso" | "transaccion";

export interface FactParamSpec {
  readonly name: string;
  readonly type: "string" | "number" | "iso_date";
  readonly required: boolean;
}

export interface FactDefinition {
  readonly id: string;
  readonly label: string;
  readonly resultType: FactResultType;
  readonly element: FactElementKind;
  readonly params: readonly FactParamSpec[];
  /** Cómo se deriva (documentación + id de proyección). */
  readonly derivation: string;
}

/** IDs del MVP. */
export const FACT_IDS = {
  PARTE_SALDO_PENDIENTE: "parte.saldo_pendiente",
  PARTE_ANTIGUEDAD_MS: "parte.antiguedad_ms",
  RECURSO_CAPACIDAD_COMPROMETIDA: "recurso.capacidad_comprometida",
  PARTE_TX_EN_ESTADO: "parte.tx_en_estado",
  /** 1 si actor/recurso está en turno abierto; 0 si no. */
  CALENDARIO_TURNO_DISPONIBLE: "calendario.turno_disponible",
  /** Progreso de meta de volumen (agregado; informativo). */
  OBJETIVO_VOLUMEN: "objetivo.volumen",
  OBJETIVO_VALOR: "objetivo.valor",
  OBJETIVO_TASA: "objetivo.tasa",
} as const;

export const FACT_CATALOG: readonly FactDefinition[] = [
  {
    id: FACT_IDS.PARTE_SALDO_PENDIENTE,
    label: "Saldo pendiente de una Parte",
    resultType: "number",
    element: "parte",
    params: [{ name: "parteId", type: "string", required: true }],
    derivation:
      "Suma de importes de transacciones abiertas (no terminal) vinculadas a la Parte, por tenant",
  },
  {
    id: FACT_IDS.PARTE_ANTIGUEDAD_MS,
    label: "Antigüedad de una Parte",
    resultType: "duration_ms",
    element: "parte",
    params: [{ name: "parteId", type: "string", required: true }],
    derivation:
      "now - occurredAt de la primera transacción de la Parte en el tenant",
  },
  {
    id: FACT_IDS.RECURSO_CAPACIDAD_COMPROMETIDA,
    label: "Capacidad comprometida de un Recurso en un periodo",
    resultType: "number",
    element: "recurso",
    params: [
      { name: "recursoId", type: "string", required: true },
      { name: "periodStart", type: "iso_date", required: true },
      { name: "periodEnd", type: "iso_date", required: true },
    ],
    derivation:
      "Suma de capacityUnits reservadas en el periodo [periodStart, periodEnd) por tenant",
  },
  {
    id: FACT_IDS.PARTE_TX_EN_ESTADO,
    label: "Número de transacciones de una Parte en un estado",
    resultType: "integer",
    element: "parte",
    params: [
      { name: "parteId", type: "string", required: true },
      { name: "stateId", type: "string", required: true },
    ],
    derivation:
      "Conteo de transacciones abiertas de la Parte cuyo estado actual es stateId",
  },
  {
    id: FACT_IDS.CALENDARIO_TURNO_DISPONIBLE,
    label: "Disponibilidad de Actor o Recurso en turno",
    resultType: "integer",
    element: "recurso",
    params: [
      { name: "actorId", type: "string", required: false },
      { name: "recursoId", type: "string", required: false },
      { name: "at", type: "iso_date", required: true },
    ],
    derivation:
      "1 si el calendario declara turno abierto para el actor/recurso en `at`; 0 si no (Proveedor + calendarios)",
  },
  {
    id: FACT_IDS.OBJETIVO_VOLUMEN,
    label: "Volumen acumulado (meta)",
    resultType: "number",
    element: "transaccion",
    params: [{ name: "scopeId", type: "string", required: true }],
    derivation: "Agregado de volumen en el alcance; solo informativo para metas",
  },
  {
    id: FACT_IDS.OBJETIVO_VALOR,
    label: "Valor acumulado (meta)",
    resultType: "number",
    element: "transaccion",
    params: [{ name: "scopeId", type: "string", required: true }],
    derivation: "Agregado de valor en el alcance; solo informativo para metas",
  },
  {
    id: FACT_IDS.OBJETIVO_TASA,
    label: "Tasa observada (meta)",
    resultType: "number",
    element: "transaccion",
    params: [{ name: "scopeId", type: "string", required: true }],
    derivation: "Tasa calculada en el alcance; solo informativo para metas",
  },
] as const;

const byId = new Map(FACT_CATALOG.map((f) => [f.id, f]));

export function getFactDefinition(factId: string): FactDefinition | undefined {
  return byId.get(factId);
}

export function assertKnownFact(
  factId: string,
  params: Readonly<Record<string, unknown>>,
): FactDefinition {
  const def = byId.get(factId);
  if (!def) {
    throw new FactCatalogError(
      `Hecho inexistente en el catálogo: "${factId}"`,
      "UNKNOWN_FACT",
    );
  }
  for (const p of def.params) {
    if (p.required && (params[p.name] === undefined || params[p.name] === "")) {
      throw new FactCatalogError(
        `Hecho ${factId}: falta parámetro obligatorio "${p.name}"`,
        "BAD_PARAMS",
      );
    }
  }
  for (const key of Object.keys(params)) {
    if (!def.params.some((p) => p.name === key)) {
      throw new FactCatalogError(
        `Hecho ${factId}: parámetro desconocido "${key}"`,
        "BAD_PARAMS",
      );
    }
  }
  return def;
}

export class FactCatalogError extends Error {
  constructor(
    message: string,
    readonly code: "UNKNOWN_FACT" | "BAD_PARAMS",
  ) {
    super(message);
    this.name = "FactCatalogError";
  }
}

export type FactParams = Readonly<Record<string, string | number>>;

export interface FactKey {
  readonly tenantId: TenantId;
  readonly factId: string;
  readonly paramsKey: string;
}

export function paramsKey(params: FactParams): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
}

export function makeFactKey(
  tenantId: TenantId,
  factId: string,
  params: FactParams,
): FactKey {
  return { tenantId, factId, paramsKey: paramsKey(params) };
}
