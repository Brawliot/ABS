/**
 * Tipos compartidos de arquetipos de transacción.
 */

import type { Lifecycle } from "../core/lifecycle.js";
import type { MetaObjectSpec } from "../core/metaobject.js";
import type { TransaccionSubtype } from "../elements/subtypes.js";

export type ArchetypeId = TransaccionSubtype;

export interface ArchetypeDefinition {
  readonly id: ArchetypeId;
  readonly label: string;
  readonly lifecycle: Lifecycle;
  readonly spec: MetaObjectSpec;
  /** Valores iniciales del perfil/aprendiz para este tipo. */
  readonly profilePriors: Readonly<Record<string, number>>;
}

/**
 * Composición: un arquetipo secundario nace en un estado del dominante
 * y declara qué estado del dominante queda bloqueado mientras el secundario
 * no alcanza un terminal.
 */
export interface SecondaryBinding {
  readonly secondaryArchetypeId: ArchetypeId;
  /** Estado del dominante en el que nace la sub-transacción. */
  readonly bornInDominantState: string;
  /** Estado del dominante que no puede avanzarse mientras el secundario esté abierto. */
  readonly bloquea: string;
}

export interface ComposedArchetypeSpec {
  readonly dominant: ArchetypeId;
  readonly secondaries: readonly SecondaryBinding[];
}
