/**
 * Parser determinista de horarios en texto → CalendarDef.
 * Lo no interpretable se convierte en pregunta; nunca se inventa.
 */

import type { CalendarDef, SeasonDef, TimeWindow, Weekday } from "../policies/calendario.js";

export interface ScheduleParseQuestion {
  readonly id: string;
  readonly field: string;
  readonly question: string;
  readonly fragment: string;
}

export interface ScheduleParseResult {
  readonly ok: boolean;
  /** Calendario parcial o completo; undefined si no se pudo interpretar nada útil. */
  readonly calendar?: CalendarDef;
  readonly questions: readonly ScheduleParseQuestion[];
  /** Fragmentos interpretados con éxito (trazabilidad). */
  readonly parsed: readonly string[];
}

const DAY_MAP: Readonly<Record<string, Weekday>> = {
  D: 0,
  dom: 0,
  domingo: 0,
  L: 1,
  lun: 1,
  lunes: 1,
  M: 2,
  mar: 2,
  martes: 2,
  X: 3,
  mie: 3,
  mié: 3,
  miercoles: 3,
  miércoles: 3,
  J: 4,
  jue: 4,
  jueves: 4,
  V: 5,
  vie: 5,
  viernes: 5,
  S: 6,
  sab: 6,
  sáb: 6,
  sabado: 6,
  sábado: 6,
};

const DAY_NAME_TO_CODE: Readonly<Record<string, string>> = {
  domingo: "D",
  lunes: "L",
  martes: "M",
  miercoles: "X",
  miércoles: "X",
  jueves: "J",
  viernes: "V",
  sabado: "S",
  sábado: "S",
};

function normalizeTime(raw: string): string | undefined {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 24 || min < 0 || min > 59) return undefined;
  if (h === 24 && min !== 0) return undefined;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseDayToken(tok: string): Weekday | undefined {
  const t = tok.trim().toLowerCase();
  if (t in DAY_MAP) return DAY_MAP[t];
  const upper = tok.trim().toUpperCase();
  if (upper in DAY_MAP) return DAY_MAP[upper];
  return undefined;
}

function expandDayRange(a: Weekday, b: Weekday): Weekday[] {
  const out: Weekday[] = [];
  let cur = a;
  for (let i = 0; i < 7; i++) {
    out.push(cur as Weekday);
    if (cur === b) break;
    cur = ((cur + 1) % 7) as Weekday;
  }
  return out;
}

function parseWindows(segment: string): TimeWindow[] | undefined {
  // "9:00-18:00" | "8:00-14:00 y 16:30-20:00" | "13:00-16:00 y 20:30-23:30"
  const parts = segment
    .split(/\s+y\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const windows: TimeWindow[] = [];
  for (const part of parts) {
    const m = part.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) return undefined;
    const start = normalizeTime(m[1]!);
    const end = normalizeTime(m[2]!);
    if (!start || !end) return undefined;
    windows.push({ start, end });
  }
  return windows.length > 0 ? windows : undefined;
}

function applyHours(
  weekly: Partial<Record<Weekday, TimeWindow[]>>,
  days: readonly Weekday[],
  windows: readonly TimeWindow[],
): void {
  for (const d of days) {
    const prev = weekly[d] ?? [];
    weekly[d] = [...prev, ...windows];
  }
}

function closedDayQuestion(
  dayLabel: string,
  fragment: string,
): ScheduleParseQuestion {
  return {
    id: `ask.horario.cerrado.${dayLabel}`,
    field: "calendar.horario",
    question: `Confirmado: ¿${dayLabel} cerrado? (fragmento: "${fragment}")`,
    fragment,
  };
}

/**
 * Interpreta texto libre de horario comercial español.
 * Ejemplos soportados:
 * - "L-V 9:00-18:00"
 * - "M-S 9:30-20:00, lunes cerrado"
 * - "L-V 8:00-14:00 y 16:30-20:00, S 9:00-14:00"
 * - "L-J 8:30-18:00, V 8:30-15:00; agosto intensivo" (temporada + pregunta)
 */
export function parseScheduleText(
  text: string,
  options?: { readonly calendarId?: string; readonly year?: number },
): ScheduleParseResult {
  const calendarId = options?.calendarId ?? "cal-parsed";
  const year = options?.year ?? 2026;
  const questions: ScheduleParseQuestion[] = [];
  const parsed: string[] = [];
  const weekly: Partial<Record<Weekday, TimeWindow[]>> = {};
  const seasons: SeasonDef[] = [];

  let working = text.trim();
  if (!working) {
    return {
      ok: false,
      questions: [
        {
          id: "ask.horario.empty",
          field: "calendar.horario",
          question: "Horario vacío: indique el horario semanal del negocio",
          fragment: "",
        },
      ],
      parsed: [],
    };
  }

  // Paréntesis / notas no horarias → pregunta, se retiran del texto base
  working = working.replace(/\(([^)]+)\)/g, (_m, inner: string) => {
    questions.push({
      id: `ask.horario.nota.${questions.length}`,
      field: "calendar.horario",
      question: `No interpreto como horario: "${inner.trim()}". ¿Cómo aplica?`,
      fragment: inner.trim(),
    });
    return " ";
  });

  // Temporada "agosto intensivo" (sin inventar horas)
  if (/agosto\s+intensivo/i.test(working)) {
    seasons.push({
      id: "temp-agosto",
      label: "agosto intensivo",
      startDate: `${year}-08-01`,
      endDate: `${year}-08-31`,
    });
    parsed.push("agosto intensivo→temporada");
    questions.push({
      id: "ask.horario.agosto_intensivo",
      field: "calendar.temporadas",
      question:
        "Detecté temporada «agosto intensivo». ¿Cuál es el horario concreto de agosto?",
      fragment: "agosto intensivo",
    });
    working = working.replace(/;?\s*agosto\s+intensivo/gi, " ");
  }

  // Multisede / sedes nombradas → pregunta
  const sedeMatch = working.match(/sede\s+\w+[^.]*/i);
  if (sedeMatch) {
    questions.push({
      id: "ask.horario.sede",
      field: "calendar.horario",
      question: `Hay mención de sede distinta: "${sedeMatch[0].trim()}". ¿Confirma horario por sede?`,
      fragment: sedeMatch[0].trim(),
    });
    working = working.replace(sedeMatch[0], " ");
  }

  // "lunes cerrado" / "<día> cerrado"
  working = working.replace(
    /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+cerrado\b/gi,
    (frag, dayName: string) => {
      const code = DAY_NAME_TO_CODE[dayName.toLowerCase()];
      const wd = code ? parseDayToken(code) : undefined;
      if (wd !== undefined) {
        delete weekly[wd];
        // Marcar cerrado explícitamente dejando ausente; registramos parse
        parsed.push(`${dayName} cerrado`);
      } else {
        questions.push(closedDayQuestion(dayName, frag));
      }
      return " ";
    },
  );

  // Segmentos separados por coma o punto y coma
  const segments = working
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const seg of segments) {
    // "L-V 9:00-18:00" | "L-J 8:30-18:00" | "M-S 9:30-20:00"
    const range = seg.match(
      /^([DLMXJVS])\s*-\s*([DLMXJVS])\s+(.+)$/i,
    );
    if (range) {
      const a = parseDayToken(range[1]!);
      const b = parseDayToken(range[2]!);
      const windows = parseWindows(range[3]!.trim());
      if (a === undefined || b === undefined || !windows) {
        questions.push({
          id: `ask.horario.seg.${questions.length}`,
          field: "calendar.horario",
          question: `No pude interpretar el segmento de horario: "${seg}"`,
          fragment: seg,
        });
        continue;
      }
      applyHours(weekly, expandDayRange(a, b), windows);
      parsed.push(seg);
      continue;
    }

    // "V 8:30-15:00" | "S 9:00-14:00" | "S 8:00-13:00"
    const single = seg.match(/^([DLMXJVS])\s+(.+)$/i);
    if (single) {
      const d = parseDayToken(single[1]!);
      const windows = parseWindows(single[2]!.trim());
      if (d === undefined || !windows) {
        questions.push({
          id: `ask.horario.seg.${questions.length}`,
          field: "calendar.horario",
          question: `No pude interpretar el segmento de horario: "${seg}"`,
          fragment: seg,
        });
        continue;
      }
      applyHours(weekly, [d], windows);
      parsed.push(seg);
      continue;
    }

    // Día completo en palabra: "viernes 8:30-15:00"
    const named = seg.match(
      /^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(.+)$/i,
    );
    if (named) {
      const code = DAY_NAME_TO_CODE[named[1]!.toLowerCase()];
      const d = code ? parseDayToken(code) : undefined;
      const windows = parseWindows(named[2]!.trim());
      if (d === undefined || !windows) {
        questions.push({
          id: `ask.horario.seg.${questions.length}`,
          field: "calendar.horario",
          question: `No pude interpretar el segmento de horario: "${seg}"`,
          fragment: seg,
        });
        continue;
      }
      applyHours(weekly, [d], windows);
      parsed.push(seg);
      continue;
    }

    questions.push({
      id: `ask.horario.seg.${questions.length}`,
      field: "calendar.horario",
      question: `No pude interpretar el segmento de horario: "${seg}"`,
      fragment: seg,
    });
  }

  // Re-aplicar "cerrado" tras rangos (p.ej. M-S luego lunes cerrado)
  // Ya se procesó antes; si el rango puso horas en lunes y luego cerrado lo borró — OK.
  // Si el texto era "M-S …, lunes cerrado", el cerrado se aplicó antes del rango.
  // Corregir: procesar cerrados DESPUÉS de rangos.
  // Re-scan original for closed days after building weekly:
  const closedRe =
    /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+cerrado\b/gi;
  let cm: RegExpExecArray | null;
  const src = text;
  while ((cm = closedRe.exec(src)) !== null) {
    const code = DAY_NAME_TO_CODE[cm[1]!.toLowerCase()];
    const wd = code ? parseDayToken(code) : undefined;
    if (wd !== undefined) {
      delete weekly[wd];
    }
  }

  const dayKeys = Object.keys(weekly).map(Number) as Weekday[];
  if (dayKeys.length === 0 && seasons.length === 0) {
    return {
      ok: false,
      questions:
        questions.length > 0
          ? questions
          : [
              {
                id: "ask.horario.unparsed",
                field: "calendar.horario",
                question: `No pude interpretar el horario: "${text}"`,
                fragment: text,
              },
            ],
      parsed,
    };
  }

  const weeklyHours = { ...weekly } as CalendarDef["weeklyHours"];

  const calendar: CalendarDef = {
    id: calendarId,
    weeklyHours,
    ...(seasons.length > 0 ? { seasons } : {}),
  };

  // ok=true solo si hay horario semanal y no quedan preguntas bloqueantes de segmentos
  // Las preguntas de temporada/nota son informativas pero impiden "ok" pleno
  const blockingQs = questions.filter(
    (q) =>
      !q.id.includes("agosto_intensivo") &&
      !q.id.includes("nota.") &&
      !q.id.includes("sede"),
  );
  const ok = dayKeys.length > 0 && blockingQs.length === 0;

  return { ok, calendar, questions, parsed };
}
