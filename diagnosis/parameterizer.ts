/**
 * Parametrizador (LLM acotado): propone campos; el validador de esquema decide.
 */

import type { Definition, FieldValues } from "../core/definition.js";
import { validateFieldValues } from "../core/definition.js";
import type { ArchetypeId } from "../archetypes/types.js";
import { requireArchetype } from "../archetypes/catalog.js";

export interface ParameterizerProposal {
  readonly fields: FieldValues;
}

export interface DiagnosisParameterizer {
  propose(
    description: string,
    dominant: ArchetypeId,
  ): ParameterizerProposal;
}

export class StructuredParameterizer implements DiagnosisParameterizer {
  constructor(private readonly fixed: ParameterizerProposal) {}

  propose(
    _description: string,
    _dominant: ArchetypeId,
  ): ParameterizerProposal {
    return this.fixed;
  }
}

export function validateProposedParameters(
  dominant: ArchetypeId,
  proposal: ParameterizerProposal,
): { ok: true; values: FieldValues } | { ok: false; errors: string[] } {
  const archetype = requireArchetype(dominant);
  const definition: Definition = archetype.spec.definition;
  const errors = validateFieldValues(definition, proposal.fields);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, values: proposal.fields };
}
