/**
 * Sellado capa 2: la presentación nunca accede al almacén ni a proyecciones.
 */

import { readThroughFilter } from "./filter.js";
import { Layer2DirectAccessError } from "./types.js";
import type { FilterReadResult, FilterReader, FilterRow, FilterPolicy } from "./types.js";
import type { CompiledRuleSet } from "../policies/types.js";

const FORBIDDEN = new Set([
  "eventStore",
  "store",
  "events",
  "getBySubject",
  "all",
  "append",
  "projection",
  "projections",
  "provider",
  "factProvider",
  "EventStore",
  "TenantFactProjection",
  "getEventById",
  "readEvents",
  "rebuild",
  "applyEvent",
]);

/**
 * Sella un objeto expuesto a la capa 2: cualquier acceso a almacén/proyección falla.
 */
export function sealAgainstLayer2DirectAccess<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const name = String(prop);
      if (FORBIDDEN.has(name)) {
        throw new Layer2DirectAccessError(
          `Lectura directa bloqueada desde capa 2: "${name}". Use el Filtro (readThroughFilter).`,
        );
      }
      return Reflect.get(t, prop, receiver);
    },
  });
}

export interface PresentationReadGateway {
  read(
    reader: FilterReader,
    rows: readonly FilterRow[],
    ruleSet: CompiledRuleSet,
    policy?: FilterPolicy,
    at?: string,
  ): FilterReadResult;
}

/**
 * Gateway único de lectura para presentación (solo Filtro).
 */
export function createPresentationReadGateway(): PresentationReadGateway {
  return sealAgainstLayer2DirectAccess({
    read: readThroughFilter,
  });
}

/**
 * Simula un contexto L2 malicioso que intenta llevar el almacén:
 * al tocarlo, falla.
 */
export function assertNoDirectStoreAccess(
  layer2Context: Readonly<Record<string, unknown>>,
): void {
  sealAgainstLayer2DirectAccess(layer2Context as object);
  for (const key of FORBIDDEN) {
    if (key in layer2Context) {
      // Acceso intencional para disparar el proxy si alguien lo envuelve después;
      // si la clave está en el objeto plano, también rechazamos.
      throw new Layer2DirectAccessError(
        `Lectura directa bloqueada desde capa 2: "${key}". Use el Filtro (readThroughFilter).`,
      );
    }
  }
}
