/**
 * Fábrica de especificaciones de elemento a partir del metaobjeto.
 */

import type { Definition, FieldSpec } from "../core/definition.js";
import type { ElementKind } from "../core/grammar.js";
import type { InvariantSet } from "../core/invariants.js";
import type { Lifecycle } from "../core/lifecycle.js";
import type { MetaObjectSpec } from "../core/metaobject.js";

const GRAMMAR_VERSION = "2.0.0";

export function elementSpec(params: {
  id: string;
  elementKind: ElementKind;
  subtype: string;
  allowedSubtypes: readonly string[];
  fields: readonly FieldSpec[];
  lifecycle: Lifecycle;
  invariants?: InvariantSet;
}): MetaObjectSpec {
  if (!params.allowedSubtypes.includes(params.subtype)) {
    throw new Error(
      `Subtipo cerrado inválido para ${params.elementKind}: ${params.subtype}`,
    );
  }

  const definition: Definition = {
    subtype: params.subtype,
    fields: [
      {
        name: "subtype",
        type: "enum",
        required: true,
        enumValues: params.allowedSubtypes,
      },
      ...params.fields,
    ],
  };

  return {
    identity: {
      id: params.id,
      elementKind: params.elementKind,
      grammarVersion: GRAMMAR_VERSION,
    },
    definition,
    lifecycle: params.lifecycle,
    invariants: params.invariants ?? [
      {
        id: "inv_elemento_estructural",
        appliesInStates: [],
        predicate: "always_true",
        description: "Invariante estructural del elemento",
      },
    ],
  };
}
