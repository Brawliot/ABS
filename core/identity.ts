/**
 * Capa 1 — Identidad: qué hace único a un elemento.
 */

import type { ElementKind } from "./grammar.js";

export interface Identity {
  /** Identificador único inmutable del ejemplar. */
  readonly id: string;
  /** Cuál de los 10 elementos instancia este metaobjeto. */
  readonly elementKind: ElementKind;
  /** Versión de gramática bajo la que se creó (MAJOR.MINOR.PATCH). */
  readonly grammarVersion: string;
}

export function assertIdentity(identity: Identity): void {
  if (!identity.id || identity.id.trim().length === 0) {
    throw new Error("Identidad inválida: id vacío");
  }
  if (!identity.grammarVersion || identity.grammarVersion.trim().length === 0) {
    throw new Error("Identidad inválida: grammarVersion vacío");
  }
}
