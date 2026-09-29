/**
 * Defaults seguros / a confirmar del materializador.
 */

import type { CalendarDef } from "../../policies/calendario.js";
import { holidaysForLocation } from "./holidays.js";
import type { BusinessLocation } from "./types.js";

const WEEKDAY_WINDOW = [{ start: "09:00", end: "18:00" }] as const;

/**
 * Calendario por defecto: L–V 9–18.
 * confidence conceptual baja; política = confirmar con el usuario.
 */
export function defaultBusinessHoursCalendar(
  location?: BusinessLocation,
): CalendarDef {
  const exceptions = location ? [...holidaysForLocation(location)] : [];
  return {
    id: "cal-default-lv-9-18",
    weeklyHours: {
      1: [...WEEKDAY_WINDOW],
      2: [...WEEKDAY_WINDOW],
      3: [...WEEKDAY_WINDOW],
      4: [...WEEKDAY_WINDOW],
      5: [...WEEKDAY_WINDOW],
    },
    exceptions,
    seasons: [],
    shifts: [],
  };
}

/** Confidence sugerida al aplicar el default de calendario. */
export const DEFAULT_CALENDAR_CONFIDENCE = 0.35;
