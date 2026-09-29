/**
 * Constructor de máquinas de arquetipo con excepciones estándar.
 */

import type {
  CommitmentRef,
  Lifecycle,
  StateNode,
  Transition,
} from "../core/lifecycle.js";

export type TransitionDraft = {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly condition: string;
  readonly requiredEvidence: Transition["requiredEvidence"];
  readonly allowedActor: Transition["allowedActor"];
  readonly fulfills?: readonly string[];
};

export function buildArchetypeLifecycle(params: {
  commitments: readonly CommitmentRef[];
  states: readonly StateNode[];
  happyPath: readonly TransitionDraft[];
  exceptions: readonly TransitionDraft[];
}): Lifecycle {
  const normalize = (t: TransitionDraft): Transition => ({
    id: t.id,
    from: t.from,
    to: t.to,
    condition: t.condition,
    requiredEvidence: t.requiredEvidence,
    allowedActor: t.allowedActor,
    fulfills: t.fulfills ?? [],
  });

  return {
    commitments: params.commitments,
    states: params.states,
    transitions: [
      ...params.happyPath.map(normalize),
      ...params.exceptions.map(normalize),
    ],
  };
}
