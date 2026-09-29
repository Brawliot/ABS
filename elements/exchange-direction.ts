/**
 * Extensión: dirección de intercambio (comprador/vendedor).
 * Permite usar el arquetipo `venta` como compra a proveedor sin 7º arquetipo.
 * No altera la máquina de estados; tipifica Partes y roles de intercambio.
 */

import type { ParteSubtype } from "./subtypes.js";

export type ExchangeDirection = "empresa_vende" | "empresa_compra";

export interface ExchangeParties {
  readonly direction: ExchangeDirection;
  /** Parte que paga / recibe el bien según dirección. */
  readonly compradorParteId: string;
  readonly vendedorParteId: string;
  readonly compradorSubtype: ParteSubtype;
  readonly vendedorSubtype: ParteSubtype;
}

export class ExchangeDirectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExchangeDirectionError";
  }
}

/**
 * Resuelve Partes coherentes con la dirección.
 * empresa_vende: cliente compra, empresa (vía oferta) vende — comprador=cliente.
 * empresa_compra: empresa compra a proveedor — comprador tipado cliente-rol interno,
 * vendedor=proveedor.
 */
export function resolveExchangeParties(input: {
  readonly direction: ExchangeDirection;
  readonly empresaParteId: string;
  readonly contraparteParteId: string;
}): ExchangeParties {
  if (!input.empresaParteId || !input.contraparteParteId) {
    throw new ExchangeDirectionError("Partes de intercambio incompletas");
  }
  if (input.empresaParteId === input.contraparteParteId) {
    throw new ExchangeDirectionError(
      "Comprador y vendedor no pueden ser la misma Parte",
    );
  }
  if (input.direction === "empresa_vende") {
    return {
      direction: "empresa_vende",
      compradorParteId: input.contraparteParteId,
      vendedorParteId: input.empresaParteId,
      compradorSubtype: "cliente",
      vendedorSubtype: "proveedor", // empresa actúa como proveedor del cliente
    };
  }
  return {
    direction: "empresa_compra",
    compradorParteId: input.empresaParteId,
    vendedorParteId: input.contraparteParteId,
    compradorSubtype: "cliente", // rol estructural comprador
    vendedorSubtype: "proveedor",
  };
}

export function assertExchangeConsistent(parties: ExchangeParties): void {
  if (parties.compradorParteId === parties.vendedorParteId) {
    throw new ExchangeDirectionError("Partes idénticas");
  }
  if (parties.direction === "empresa_compra") {
    if (parties.vendedorSubtype !== "proveedor") {
      throw new ExchangeDirectionError(
        "empresa_compra exige vendedor subtype proveedor",
      );
    }
  }
  if (parties.direction === "empresa_vende") {
    if (parties.compradorSubtype !== "cliente") {
      throw new ExchangeDirectionError(
        "empresa_vende exige comprador subtype cliente",
      );
    }
  }
}

/** ¿La dirección invierte el sesgo semántico típico de venta? */
export function isPurchaseFromSupplier(
  direction: ExchangeDirection,
): boolean {
  return direction === "empresa_compra";
}
