/**
 * Extensión: pagos por hitos parametrizados.
 * Lista importe/% → compromisos `pagar` + aristas bornIn→bloquea (fase siguiente).
 * No crea arquetipos; produce commitments + SecondaryBinding-like edges
 * o restricciones de fase sobre el dominante.
 */

import type { ComposedArchetypeSpec, SecondaryBinding } from "./types.js";
import { validateComposition } from "./composition.js";
import type { CompositionValidationResult } from "./composition.js";

export interface HitoPagoSpec {
  readonly id: string;
  readonly fase: string;
  readonly pct?: number;
  readonly importeEur?: number;
  readonly bornInDominantState: string;
  readonly bloquea: string;
}

export interface HitoCommitment {
  readonly id: string;
  readonly label: string;
  readonly subtype: "pagar";
  readonly hitoId: string;
  readonly pct?: number;
  readonly importeEur?: number;
}

export class HitosError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HitosError";
  }
}

export function validateHitosList(hitos: readonly HitoPagoSpec[]): void {
  if (hitos.length === 0) {
    throw new HitosError("Se requiere al menos un hito");
  }
  let sumPct = 0;
  let hasPct = false;
  const ids = new Set<string>();
  for (const h of hitos) {
    if (ids.has(h.id)) throw new HitosError(`Hito id duplicado: ${h.id}`);
    ids.add(h.id);
    if (h.bloquea === h.bornInDominantState) {
      throw new HitosError(
        `${h.id}: bloquea no puede igualar bornInDominantState`,
      );
    }
    if (h.pct === undefined && h.importeEur === undefined) {
      throw new HitosError(`${h.id}: falta pct o importeEur`);
    }
    if (h.pct !== undefined) {
      hasPct = true;
      sumPct += h.pct;
    }
  }
  if (hasPct && Math.abs(sumPct - 100) > 0.01) {
    throw new HitosError(`Suma de pct debe ser 100 (actual ${sumPct})`);
  }
}

/** Compromisos pagar derivados de hitos. */
export function hitosToCommitments(
  hitos: readonly HitoPagoSpec[],
): readonly HitoCommitment[] {
  validateHitosList(hitos);
  return hitos.map((h) => ({
    id: `c_pagar_hito_${h.id}`,
    label: `Pago hito ${h.fase}`,
    subtype: "pagar" as const,
    hitoId: h.id,
    ...(h.pct !== undefined ? { pct: h.pct } : {}),
    ...(h.importeEur !== undefined ? { importeEur: h.importeEur } : {}),
  }));
}

/**
 * Modelo de bloqueo de fase: cada hito puede materializarse como binding
 * a secundaria financiera (cobertura) O como arista de dependencia de estado.
 * Aquí exponemos bindings opcionales a financiera (uno por hito) — el compositor
 * puede preferir solo commitments + restriction; validateComposition acepta multi-bloquea.
 */
export function hitosToFinancieraBindings(
  hitos: readonly HitoPagoSpec[],
): readonly SecondaryBinding[] {
  validateHitosList(hitos);
  return hitos.map((h) => ({
    secondaryArchetypeId: "financiera" as const,
    bornInDominantState: h.bornInDominantState,
    bloquea: h.bloquea,
  }));
}

/**
 * Valida que una composición dominante + bindings de hitos sea aceptable
 * por el validador de composición (sin ciclos).
 */
export function validateHitosOnDominant(
  dominant: ComposedArchetypeSpec["dominant"],
  hitos: readonly HitoPagoSpec[],
): CompositionValidationResult {
  validateHitosList(hitos);
  // Un solo binding financiera que bloquea el primer avance crítico es más
  // limpio; multi-financiera con mismo secondaryArchetypeId no es válido en
  // runtime (map by archetype). Preferimos commitments + un binding sintético
  // del primer hito, y documentamos el resto como restrictions de fase.
  const first = hitos[0]!;
  const composition: ComposedArchetypeSpec = {
    dominant,
    secondaries: [
      {
        secondaryArchetypeId: "financiera",
        bornInDominantState: first.bornInDominantState,
        bloquea: first.bloquea,
      },
    ],
  };
  return validateComposition(composition);
}

/**
 * Grafo de fases: bornIn → bloquea por hito (para UI / oráculo).
 * No inserta N financieras; el compositor usa commitments + este grafo.
 */
export function hitosPhaseGraph(
  hitos: readonly HitoPagoSpec[],
): ReadonlyMap<string, ReadonlySet<string>> {
  validateHitosList(hitos);
  const adj = new Map<string, Set<string>>();
  for (const h of hitos) {
    if (!adj.has(h.bornInDominantState)) adj.set(h.bornInDominantState, new Set());
    adj.get(h.bornInDominantState)!.add(h.bloquea);
    if (!adj.has(h.bloquea)) adj.set(h.bloquea, new Set());
  }
  return adj;
}

/** Transición típica servicio_proyecto que entra en el estado bloqueado por el hito. */
export const DEFAULT_BLOQUEA_TRANSITION: Readonly<Record<string, string>> = {
  en_ejecucion: "t_ejecutar",
  en_espera: "t_presentar",
  cerrada: "t_cerrar",
};

export function transitionIdForBloqueaState(bloqueaStateId: string): string | undefined {
  return DEFAULT_BLOQUEA_TRANSITION[bloqueaStateId];
}

/** Campo de formulario/hecho: primer hito por id; siguientes usan hito_anterior_cobrado. */
export function hitoPaymentField(hitoId: string, index: number): string {
  return index === 0 ? `hito_${hitoId}_cobrado` : "hito_anterior_cobrado";
}
