/**
 * Transacciones vinculadas: una “reapertura” o devolución NUNCA muta un terminal.
 * Crea una transacción nueva con campo vinculada_a → id de la original.
 */

import { createTransaccionSpec } from "../elements/index.js";
import type { MetaObjectSpec } from "../core/metaobject.js";
import { requireArchetype } from "./catalog.js";
import type { ArchetypeId } from "./types.js";

export interface LinkedTransactionRequest {
  /** Id de la transacción original (terminal). */
  readonly originalTransactionId: string;
  /** Arquetipo de la nueva (p. ej. venta para devolución). */
  readonly archetypeId: ArchetypeId;
  /** Id de la nueva transacción. */
  readonly newTransactionId: string;
  readonly reason: "devolucion" | "reapertura_vinculada" | "correccion";
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface LinkedTransactionSpec {
  readonly spec: MetaObjectSpec;
  readonly fieldValues: Readonly<Record<string, unknown>>;
  readonly vinculadaA: string;
  readonly reason: LinkedTransactionRequest["reason"];
}

/**
 * Construye la especificación de una transacción nueva vinculada.
 * No reabre el terminal de la original.
 */
export function createLinkedTransaction(
  request: LinkedTransactionRequest,
): LinkedTransactionSpec {
  const arch = requireArchetype(request.archetypeId);
  const base = createTransaccionSpec(request.archetypeId, arch.lifecycle);
  const spec: MetaObjectSpec = {
    ...base,
    identity: {
      ...base.identity,
      id: request.newTransactionId,
    },
  };
  return {
    spec,
    fieldValues: {
      subtype: request.archetypeId,
      arquetipo_id: request.archetypeId,
      vinculada_a: request.originalTransactionId,
      motivo_vinculo: request.reason,
      ...(request.parameters ?? {}),
    },
    vinculadaA: request.originalTransactionId,
    reason: request.reason,
  };
}

/** Atajo: devolución tras cierre de una venta. */
export function createDevolucionVinculada(
  originalVentaId: string,
  newId: string,
): LinkedTransactionSpec {
  return createLinkedTransaction({
    originalTransactionId: originalVentaId,
    archetypeId: "venta",
    newTransactionId: newId,
    reason: "devolucion",
  });
}
