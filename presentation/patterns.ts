/**
 * Patrones admitidos por tipo de vista + defaults deterministas.
 */

import type {
  BoardPattern,
  FormPattern,
  ListPattern,
  NavPattern,
} from "../design/schema.js";
import type { ViewSpec } from "./types.js";

export interface AdmittedPatterns {
  readonly listados: readonly ListPattern[];
  readonly navegacion: readonly NavPattern[];
  readonly formularios: readonly FormPattern[];
  readonly tableros: readonly BoardPattern[];
}

export interface ChosenPatterns {
  readonly listados: ListPattern;
  readonly navegacion: NavPattern;
  readonly formularios: FormPattern;
  readonly tableros: BoardPattern;
}

const PANEL_ADMITTED: AdmittedPatterns = {
  listados: ["lista", "tarjetas"],
  navegacion: ["lateral", "superior", "inferior_movil"],
  formularios: ["una_columna"],
  tableros: ["lista_agrupada"],
};

const PANEL_DEFAULTS: ChosenPatterns = {
  listados: "lista",
  navegacion: "superior",
  formularios: "una_columna",
  tableros: "lista_agrupada",
};

/** Catálogo cerrado: qué admite cada kind de vista. */
export const ADMITTED_BY_VIEW_KIND: Readonly<
  Record<ViewSpec["kind"], AdmittedPatterns>
> = {
  tablero: {
    listados: ["lista", "tarjetas"],
    navegacion: ["lateral", "superior", "inferior_movil"],
    formularios: ["una_columna"],
    tableros: ["kanban", "lista_agrupada"],
  },
  lista: {
    listados: ["tabla", "lista", "tarjetas"],
    navegacion: ["lateral", "superior", "inferior_movil"],
    formularios: ["una_columna"],
    tableros: ["lista_agrupada"],
  },
  detalle: {
    listados: ["lista", "tarjetas"],
    navegacion: ["lateral", "superior", "inferior_movil"],
    formularios: ["una_columna", "dos_columnas", "por_pasos"],
    tableros: ["lista_agrupada"],
  },
  formulario: {
    listados: ["lista"],
    navegacion: ["superior", "inferior_movil"],
    formularios: ["una_columna", "dos_columnas", "por_pasos"],
    tableros: ["lista_agrupada"],
  },
  panel_agenda: PANEL_ADMITTED,
  panel_retencion: PANEL_ADMITTED,
  panel_credito: PANEL_ADMITTED,
  panel_periodos: PANEL_ADMITTED,
  panel_bloqueo: PANEL_ADMITTED,
  portal_filtro: PANEL_ADMITTED,
};

/** Defaults deterministas si el patrón del DS no es compatible. */
export const DEFAULT_PATTERNS_BY_VIEW_KIND: Readonly<
  Record<ViewSpec["kind"], ChosenPatterns>
> = {
  tablero: {
    listados: "lista",
    navegacion: "superior",
    formularios: "una_columna",
    tableros: "kanban",
  },
  lista: {
    listados: "tabla",
    navegacion: "superior",
    formularios: "una_columna",
    tableros: "lista_agrupada",
  },
  detalle: {
    listados: "lista",
    navegacion: "superior",
    formularios: "una_columna",
    tableros: "lista_agrupada",
  },
  formulario: {
    listados: "lista",
    navegacion: "superior",
    formularios: "una_columna",
    tableros: "lista_agrupada",
  },
  panel_agenda: PANEL_DEFAULTS,
  panel_retencion: PANEL_DEFAULTS,
  panel_credito: PANEL_DEFAULTS,
  panel_periodos: PANEL_DEFAULTS,
  panel_bloqueo: PANEL_DEFAULTS,
  portal_filtro: PANEL_DEFAULTS,
};

export function admittedPatternsForView(
  kind: ViewSpec["kind"],
): AdmittedPatterns {
  return ADMITTED_BY_VIEW_KIND[kind];
}
