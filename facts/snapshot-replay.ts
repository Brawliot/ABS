/**
 * SnapshotReplay: Helper para usar snapshots en proyecciones.
 * Estrategia: si hay snapshot, empezar desde ahí en lugar de evento 0.
 *
 * Ejemplo:
 * - 100K eventos totales para un sujeto
 * - Snapshot en evento 50K
 * - Procesar: snapshot (1 lookup) + eventos 50K-100K (50K events)
 * - vs. sin snapshot: todos los 100K eventos
 * - Mejora: 2x más rápido
 */

import type { TenantFactProjection } from "./projection.js";
import type { DomainEvent } from "../core/events.js";

export interface ReplayPlan {
  readonly initialState: unknown; // snapshot state or empty
  readonly eventsToProcess: readonly DomainEvent[];
  readonly fromStreamVersion: number; // versión desde donde empezar
}

/**
 * Planificar replay óptimo: considerar snapshots.
 * Retorna: estado inicial + eventos a procesar.
 */
export function planOptimalReplay(
  allEvents: readonly DomainEvent[],
  getSnapshot?: (streamVersion: number) => Promise<unknown>
): ReplayPlan {
  if (!getSnapshot || allEvents.length === 0) {
    // Sin snapshots: procesar TODO
    return {
      initialState: undefined,
      eventsToProcess: allEvents,
      fromStreamVersion: 0,
    };
  }

  // Con snapshots: buscar el más reciente
  // Por ahora, simple: procesar TODO (snapshot lookup sería async)
  // En producción: implementar con getSnapshot() async
  return {
    initialState: undefined,
    eventsToProcess: allEvents,
    fromStreamVersion: 0,
  };
}

/**
 * Aplicar replay plan a proyección.
 * Nota: async porque podría necesitar snapshot lookup.
 */
export async function applyReplayPlan(
  projection: TenantFactProjection,
  plan: ReplayPlan
): Promise<void> {
  // Si hay estado inicial (de snapshot), inicializar proyección con él
  if (plan.initialState) {
    // TODO: inicializar projection con snapshot state
    console.log(
      `[snapshot-replay] Inicializando desde snapshot @ v${plan.fromStreamVersion}`
    );
  }

  // Procesar eventos de fast-forward
  for (const event of plan.eventsToProcess) {
    projection.applyEvent(event);
  }
}
