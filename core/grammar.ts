/**
 * Gramática cerrada del metaobjeto.
 * Añadir un valor a cualquier enum exige versión mayor (spec/VERSIONING.md).
 */

/** Tipos de estado derivados de 4 ejes: entradas, salidas, control salida, resultado terminal. */
export const StateKinds = [
  "inicial",
  "intermedio",
  "en_espera",
  "terminal_exito",
  "terminal_excepcion",
] as const;

export type StateKind = (typeof StateKinds)[number];

export const EvidenceKinds = ["aceptacion", "sistema", "fisica"] as const;
export type EvidenceKind = (typeof EvidenceKinds)[number];

export const ActorKinds = ["humano", "sistema", "ia"] as const;
export type ActorKind = (typeof ActorKinds)[number];

export const EventKinds = [
  "transicion",
  "excepcion",
  "modificacion",
  "vencimiento",
] as const;
export type EventKind = (typeof EventKinds)[number];

export const ElementKinds = [
  "parte",
  "actor",
  "oferta",
  "recurso",
  "transaccion",
  "estado",
  "compromiso",
  "movimiento_valor",
  "evidencia",
  "evento",
] as const;
export type ElementKind = (typeof ElementKinds)[number];

export function isTerminalKind(kind: StateKind): boolean {
  return kind === "terminal_exito" || kind === "terminal_excepcion";
}

export function isSuccessTerminal(kind: StateKind): boolean {
  return kind === "terminal_exito";
}
