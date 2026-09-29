/**
 * Extensión: capacidad por plazas vs cita individual.
 * Sobre el hecho recurso.capacidad_comprometida + calendario.
 */

export type CapacitySemantics = "cita_individual" | "plazas";

export interface PlazaCapacityState {
  readonly recursoId: string;
  readonly plazasTotales: number;
  /** Unidades ya comprometidas en el periodo (hecho capacidad_comprometida). */
  readonly comprometidas: number;
  readonly solicitado: number;
}

export class PlazaCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlazaCapacityError";
  }
}

export function plazasLibres(state: {
  readonly plazasTotales: number;
  readonly comprometidas: number;
}): number {
  if (state.plazasTotales < 0 || state.comprometidas < 0) {
    throw new PlazaCapacityError("Capacidad negativa inválida");
  }
  return Math.max(0, state.plazasTotales - state.comprometidas);
}

/**
 * Cita individual: solicitado debe ser 1 y libres >= 1.
 * Plazas: solicitado ∈ (0, plazasLibres].
 */
export function canReserveCapacity(
  semantics: CapacitySemantics,
  state: PlazaCapacityState,
): boolean {
  if (state.plazasTotales <= 0) return false;
  if (state.solicitado <= 0) return false;
  const libres = plazasLibres(state);
  if (semantics === "cita_individual") {
    return state.solicitado === 1 && libres >= 1;
  }
  return state.solicitado <= libres;
}

export function assertCanReserveCapacity(
  semantics: CapacitySemantics,
  state: PlazaCapacityState,
): void {
  if (!canReserveCapacity(semantics, state)) {
    throw new PlazaCapacityError(
      `Reserva rechazada (${semantics}): solicitado=${state.solicitado}, libres=${plazasLibres(state)}, total=${state.plazasTotales}`,
    );
  }
}

/**
 * Solape de ventanas de calendario (entregas/turnos) — puro.
 */
export function windowsOverlap(
  a: { readonly start: string; readonly end: string },
  b: { readonly start: string; readonly end: string },
): boolean {
  return a.start < b.end && b.start < a.end;
}
