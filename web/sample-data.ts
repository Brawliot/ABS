/**
 * Datos de ejemplo mínimos (solo lectura) para tableros y paneles.
 * No son hechos de negocio reales; sirven para visualizar la UiSpec.
 */

import type { ValidatedUiSpec } from "../presentation/validated.js";
import type { SampleRow } from "./types.js";

export const DEFAULT_SAMPLE_PARTES = [
  { id: "parte-demo-1", label: "Cliente demo A" },
  { id: "parte-demo-2", label: "Cliente demo B" },
] as const;

/**
 * Filas de ejemplo por estado de tablero + paneles.
 * Determinista a partir de la UiSpec.
 */
export function buildSampleRows(spec: ValidatedUiSpec): readonly SampleRow[] {
  const rows: SampleRow[] = [];
  const states = [
    ...new Set(
      spec.views
        .filter((v) => v.kind === "tablero" && v.stateId)
        .map((v) => v.stateId!),
    ),
  ].sort();

  let n = 1;
  for (const stateId of states) {
    rows.push({
      id: `row-${n}`,
      label: `Expediente ejemplo ${n}`,
      stateId,
      parteId: n % 2 === 0 ? "parte-demo-2" : "parte-demo-1",
      meta: `estado=${stateId}`,
    });
    n++;
    if (n > 12) break;
  }

  if (spec.views.some((v) => v.kind === "panel_agenda")) {
    rows.push({
      id: "row-cita-1",
      label: "Cita / hueco ejemplo",
      stateId: null,
      parteId: "parte-demo-1",
      meta: "panel_agenda",
    });
  }
  if (spec.views.some((v) => v.kind === "panel_retencion")) {
    rows.push({
      id: "row-fianza-1",
      label: "Retención / fianza abierta",
      stateId: null,
      parteId: "parte-demo-1",
      meta: "panel_retencion",
    });
  }
  if (spec.views.some((v) => v.kind === "panel_credito")) {
    rows.push({
      id: "row-credito-1",
      label: "Cuenta / crédito ejemplo",
      stateId: null,
      parteId: "parte-demo-2",
      meta: "panel_credito",
    });
  }
  if (spec.views.some((v) => v.kind === "panel_periodos")) {
    rows.push({
      id: "row-periodo-1",
      label: "Periodo / cuota ejemplo",
      stateId: null,
      parteId: "parte-demo-1",
      meta: "panel_periodos",
    });
  }

  return rows;
}

/** Filtra filas para portal (scope propia): solo la Parte de sesión. */
export function rowsForPortal(
  rows: readonly SampleRow[],
  parteId: string,
): readonly SampleRow[] {
  return rows.filter((r) => r.parteId === parteId);
}
