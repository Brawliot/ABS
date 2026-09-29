/**
 * Propuestas de cambio en capa 1 — NUNCA se aplican automáticamente.
 */

import type { Layer1ChangeProposal } from "./types.js";

let proposalSeq = 0;

export function proposalFor(
  findingId: string,
  body: {
    readonly description: string;
    readonly suggestedPermissionPatch?: Layer1ChangeProposal["suggestedPermissionPatch"];
  },
): Layer1ChangeProposal {
  proposalSeq += 1;
  return {
    id: `prop.${proposalSeq}.${findingId}`,
    findingId,
    description: body.description,
    ...(body.suggestedPermissionPatch
      ? { suggestedPermissionPatch: body.suggestedPermissionPatch }
      : {}),
  };
}

/** Reinicia contador (tests). */
export function resetProposalSeq(): void {
  proposalSeq = 0;
}
