/**
 * Bindings por defecto bornIn → bloquea según dominante.
 */

import type { ArchetypeId } from "../archetypes/types.js";

export function defaultFinancieraBinding(dominant: ArchetypeId): {
  bornInDominantState: string;
  bloquea: string;
} {
  switch (dominant) {
    case "venta":
      return { bornInDominantState: "aceptada", bloquea: "en_entrega" };
    case "servicio_proyecto":
      return { bornInDominantState: "acordado", bloquea: "en_ejecucion" };
    case "uso_temporal":
      return { bornInDominantState: "reservada", bloquea: "en_uso" };
    case "suscripcion":
      return { bornInDominantState: "activa", bloquea: "en_renovacion" };
    case "intermediacion":
      return { bornInDominantState: "propuesta", bloquea: "cerrada" };
    case "financiera":
      return { bornInDominantState: "aprobada", bloquea: "desembolsada" };
    default: {
      const _e: never = dominant;
      return _e;
    }
  }
}

/** Taller postventa: servicio nace al cerrar venta y bloquea entrega residual. */
export function defaultPostventaServicioBinding(): {
  bornInDominantState: string;
  bloquea: string;
} {
  return { bornInDominantState: "cerrada", bloquea: "en_entrega" };
}
