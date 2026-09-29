/**
 * Metaobjeto: plantilla única de 5 capas que instanciarán los 10 elementos.
 */

import type { Definition, FieldValues } from "./definition.js";
import { validateFieldValues } from "./definition.js";
import type { Identity } from "./identity.js";
import { assertIdentity } from "./identity.js";
import type { Lifecycle } from "./lifecycle.js";
import type { InvariantSet } from "./invariants.js";
import type { IncrementalLearner } from "./profile.js";
import { NoOpLearner } from "./profile.js";
import { validateLifecycle, type ValidationResult } from "./validator.js";

export interface MetaObjectSpec {
  readonly identity: Identity;
  readonly definition: Definition;
  readonly lifecycle: Lifecycle;
  readonly invariants: InvariantSet;
  readonly learner?: IncrementalLearner;
}

export interface RegisteredMetaObject {
  readonly identity: Identity;
  readonly definition: Definition;
  readonly lifecycle: Lifecycle;
  readonly invariants: InvariantSet;
  readonly learner: IncrementalLearner;
  readonly fieldValues: FieldValues;
}

export class MetaObjectRegistryError extends Error {
  constructor(
    message: string,
    readonly validation: ValidationResult,
  ) {
    super(message);
    this.name = "MetaObjectRegistryError";
  }
}

/**
 * Registro de metaobjetos: rechaza cualquier máquina inválida.
 */
export class MetaObjectRegistry {
  private readonly byId = new Map<string, RegisteredMetaObject>();

  register(
    spec: MetaObjectSpec,
    fieldValues: FieldValues = {},
  ): RegisteredMetaObject {
    assertIdentity(spec.identity);

    const lifecycleResult = validateLifecycle(spec.lifecycle);
    if (!lifecycleResult.ok) {
      throw new MetaObjectRegistryError(
        "Ninguna máquina inválida puede registrarse",
        lifecycleResult,
      );
    }

    const fieldErrors = validateFieldValues(spec.definition, fieldValues);
    if (fieldErrors.length > 0) {
      throw new MetaObjectRegistryError(
        `Definición inválida: ${fieldErrors.join("; ")}`,
        {
          ok: false,
          issues: fieldErrors.map((m) => ({
            code: "INVALID_FIELD_VALUES" as const,
            message: m,
          })),
        },
      );
    }

    if (this.byId.has(spec.identity.id)) {
      throw new MetaObjectRegistryError(
        `Ya existe un metaobjeto con id ${spec.identity.id}`,
        {
          ok: false,
          issues: [
            {
              code: "DUPLICATE_METAOBJECT_ID",
              message: spec.identity.id,
            },
          ],
        },
      );
    }

    const registered: RegisteredMetaObject = {
      identity: spec.identity,
      definition: spec.definition,
      lifecycle: spec.lifecycle,
      invariants: spec.invariants,
      learner: spec.learner ?? new NoOpLearner(),
      fieldValues,
    };

    this.byId.set(registered.identity.id, registered);
    return registered;
  }

  get(id: string): RegisteredMetaObject | undefined {
    return this.byId.get(id);
  }
}
