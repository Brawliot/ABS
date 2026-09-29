/**
 * Calendario de capa 1: horario, excepción, turno, temporada.
 * Función de tiempo hábil para el reloj de plazos.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=domingo … 6=sábado (UTC)

export interface TimeWindow {
  /** "HH:MM" 24h; end "24:00" permitido. */
  readonly start: string;
  readonly end: string;
}

export interface CalendarException {
  /** Fecha civil UTC YYYY-MM-DD. */
  readonly date: string;
  /** true = cerrado todo el día (festivo). */
  readonly closed?: boolean;
  /** Ventanas alternativas ese día (si no closed). */
  readonly windows?: readonly TimeWindow[];
  readonly label?: string;
}

export interface ShiftDef {
  readonly id: string;
  readonly label: string;
  /** Días de la semana UTC en que aplica. */
  readonly weekdays: readonly Weekday[];
  readonly window: TimeWindow;
  /** Actores disponibles en este turno. */
  readonly actorIds?: readonly string[];
  /** Recursos disponibles en este turno. */
  readonly recursoIds?: readonly string[];
}

export interface SeasonDef {
  readonly id: string;
  readonly label: string;
  /** Inclusive YYYY-MM-DD UTC. */
  readonly startDate: string;
  readonly endDate: string;
}

export interface CalendarDef {
  readonly id: string;
  /** Horario semanal por weekday UTC. Ausente = cerrado. */
  readonly weeklyHours: Readonly<Partial<Record<Weekday, readonly TimeWindow[]>>>;
  readonly exceptions?: readonly CalendarException[];
  readonly shifts?: readonly ShiftDef[];
  readonly seasons?: readonly SeasonDef[];
  /**
   * Minutos antes del vencimiento en que el reloj pasa a "en_riesgo".
   * Por defecto 24h.
   */
  readonly atRiskBeforeMs?: number;
}

export interface CompiledCalendar {
  readonly id: string;
  readonly weeklyHours: Readonly<
    Partial<Record<Weekday, readonly TimeWindow[]>>
  >;
  readonly exceptions: Readonly<Record<string, CalendarException>>;
  readonly shifts: readonly ShiftDef[];
  readonly seasons: readonly SeasonDef[];
  readonly atRiskBeforeMs: number;
}

export class CalendarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarError";
  }
}

export function compileCalendar(def: CalendarDef): CompiledCalendar {
  if (!def.id) throw new CalendarError("Calendario sin id");
  const exceptions: Record<string, CalendarException> = {};
  for (const ex of def.exceptions ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ex.date)) {
      throw new CalendarError(`Excepción con fecha inválida: ${ex.date}`);
    }
    exceptions[ex.date] = ex;
  }
  for (const s of def.seasons ?? []) {
    if (s.startDate > s.endDate) {
      throw new CalendarError(`Temporada ${s.id}: startDate > endDate`);
    }
  }
  return Object.freeze({
    id: def.id,
    weeklyHours: def.weeklyHours,
    exceptions: Object.freeze(exceptions),
    shifts: Object.freeze([...(def.shifts ?? [])]),
    seasons: Object.freeze([...(def.seasons ?? [])]),
    atRiskBeforeMs: def.atRiskBeforeMs ?? 24 * 60 * 60 * 1000,
  });
}

/** Ventanas abiertas para un instante (UTC). */
export function openWindowsAt(
  calendar: CompiledCalendar,
  instant: Date,
): readonly TimeWindow[] {
  const dateKey = utcDateKey(instant);
  const ex = calendar.exceptions[dateKey];
  if (ex?.closed) return [];
  if (ex?.windows) return ex.windows;
  const wd = instant.getUTCDay() as Weekday;
  return calendar.weeklyHours[wd] ?? [];
}

export function isBusinessInstant(
  calendar: CompiledCalendar,
  instant: Date,
): boolean {
  const windows = openWindowsAt(calendar, instant);
  const mins = utcMinutesOfDay(instant);
  return windows.some((w) => {
    const a = parseHm(w.start);
    const b = parseHm(w.end);
    return mins >= a && mins < b;
  });
}

/**
 * Añade duración hábil (ms) respetando horario y excepciones/festivos.
 * El reloj solo avanza dentro de ventanas abiertas.
 */
export function addBusinessDuration(
  calendar: CompiledCalendar,
  startIso: string,
  durationMs: number,
): string {
  if (durationMs < 0) {
    throw new CalendarError("durationMs no puede ser negativo");
  }
  if (durationMs === 0) return new Date(startIso).toISOString();

  let cursor = new Date(startIso).getTime();
  let remaining = durationMs;
  // Límite de seguridad: ~10 años de pasos de 1h
  const maxIter = 100_000;
  let iter = 0;

  while (remaining > 0 && iter++ < maxIter) {
    const d = new Date(cursor);
    const windows = openWindowsAt(calendar, d);
    if (windows.length === 0) {
      // Saltar al inicio del día siguiente UTC
      cursor = startOfUtcDay(cursor) + 24 * 60 * 60 * 1000;
      continue;
    }

    const dayStart = startOfUtcDay(cursor);
    let progressed = false;
    for (const w of windows) {
      const winStart = dayStart + parseHm(w.start) * 60_000;
      const winEnd = dayStart + parseHm(w.end) * 60_000;
      if (cursor >= winEnd) continue;
      const effectiveStart = Math.max(cursor, winStart);
      if (effectiveStart >= winEnd) continue;
      const available = winEnd - effectiveStart;
      if (available <= 0) continue;
      if (remaining <= available) {
        return new Date(effectiveStart + remaining).toISOString();
      }
      remaining -= available;
      cursor = winEnd;
      progressed = true;
    }
    if (!progressed) {
      cursor = dayStart + 24 * 60 * 60 * 1000;
    }
  }

  throw new CalendarError(
    "No se pudo resolver la duración hábil (calendario sin huecos suficientes)",
  );
}

/** Temporada activa en una fecha civil UTC (YYYY-MM-DD o ISO). */
export function activeSeasonId(
  calendar: CompiledCalendar,
  atIso: string,
): string | undefined {
  const day = atIso.slice(0, 10);
  for (const s of calendar.seasons) {
    if (day >= s.startDate && day <= s.endDate) return s.id;
  }
  return undefined;
}

/**
 * ¿Está el actor/recurso en un turno abierto en `atIso`?
 * (Disponibilidad usada también como hecho del Proveedor.)
 */
export function isOnShift(
  calendar: CompiledCalendar,
  atIso: string,
  subject: { readonly actorId?: string; readonly recursoId?: string },
): boolean {
  const d = new Date(atIso);
  if (!isBusinessInstant(calendar, d)) return false;
  const wd = d.getUTCDay() as Weekday;
  const mins = utcMinutesOfDay(d);
  for (const shift of calendar.shifts) {
    if (!shift.weekdays.includes(wd)) continue;
    const a = parseHm(shift.window.start);
    const b = parseHm(shift.window.end);
    if (mins < a || mins >= b) continue;
    if (subject.actorId && shift.actorIds?.includes(subject.actorId)) {
      return true;
    }
    if (subject.recursoId && shift.recursoIds?.includes(subject.recursoId)) {
      return true;
    }
  }
  return false;
}

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcMinutesOfDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Minutos desde 00:00; "24:00" → 1440. */
export function parseHm(hm: string): number {
  if (hm === "24:00") return 24 * 60;
  const m = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!m) throw new CalendarError(`Hora inválida: ${hm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new CalendarError(`Hora inválida: ${hm}`);
  return h * 60 + min;
}
