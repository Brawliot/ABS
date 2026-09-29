/**
 * Festivos derivados de ubicación (MVP: España nacional).
 * Ampliable por regionCode sin cambiar el contrato.
 */

import type { CalendarException } from "../../policies/calendario.js";
import type { BusinessLocation } from "./types.js";

/** Festivos nacionales ES (fecha civil UTC) — conjunto mínimo 2026. */
const ES_NATIONAL_2026: readonly CalendarException[] = [
  { date: "2026-01-01", closed: true, label: "Año Nuevo" },
  { date: "2026-01-06", closed: true, label: "Reyes" },
  { date: "2026-05-01", closed: true, label: "Día del Trabajo" },
  { date: "2026-08-15", closed: true, label: "Asunción" },
  { date: "2026-10-12", closed: true, label: "Fiesta Nacional" },
  { date: "2026-11-01", closed: true, label: "Todos los Santos" },
  { date: "2026-12-06", closed: true, label: "Constitución" },
  { date: "2026-12-08", closed: true, label: "Inmaculada" },
  { date: "2026-12-25", closed: true, label: "Navidad" },
];

export function holidaysForLocation(
  location: BusinessLocation,
): readonly CalendarException[] {
  const cc = location.countryCode.toUpperCase();
  if (cc === "ES") {
    return ES_NATIONAL_2026;
  }
  return [];
}
