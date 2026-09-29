/**
 * Aprobación, reintentos de validación y versionado en overlay.
 */

import { createHash } from "node:crypto";
import type { PresentationOverlay } from "../presentation/types.js";
import {
  MAX_DESIGN_ATTEMPTS,
  type DesignSystem,
} from "./schema.js";
import { validateDesignSystem } from "./validate.js";
import {
  proposeDesignSystems,
  type DesignIdentityInput,
  type DesignProposalBatch,
} from "./propose.js";
import type { Layer4Stub } from "./layer4-stub.js";
import { HeuristicLayer4Stub } from "./layer4-stub.js";

export interface DesignSystemVersion {
  readonly version: string;
  readonly approvedAt: string;
  readonly contentHash: string;
  readonly companyId: string;
  readonly proposalId: string;
  readonly system: DesignSystem;
}

export interface DesignOverlayState {
  readonly current: DesignSystemVersion | null;
  readonly history: readonly DesignSystemVersion[];
}

export class DesignStore {
  private current: DesignSystemVersion | null = null;
  private readonly history: DesignSystemVersion[] = [];
  private seq = 0;

  approve(system: DesignSystem, companyId: string, at: string): DesignSystemVersion {
    const validation = validateDesignSystem(system);
    if (!validation.ok) {
      throw new DesignRejectionError(
        "Sistema rechazado por el validador",
        validation.issues.map((i) => i.message),
      );
    }
    this.seq += 1;
    const version = `ds-${this.seq}.0.0`;
    const contentHash = hashDesignSystem(system);
    const record: DesignSystemVersion = {
      version,
      approvedAt: at,
      contentHash,
      companyId,
      proposalId: system.id,
      system: Object.freeze(structuredClone(system)) as DesignSystem,
    };
    this.current = record;
    this.history.push(record);
    return record;
  }

  getCurrent(): DesignSystemVersion | null {
    return this.current;
  }

  getHistory(): readonly DesignSystemVersion[] {
    return this.history;
  }
}

export class DesignRejectionError extends Error {
  constructor(
    message: string,
    readonly reasons: readonly string[],
  ) {
    super(message);
    this.name = "DesignRejectionError";
  }
}

export function hashDesignSystem(system: DesignSystem): string {
  return createHash("sha256")
    .update(JSON.stringify(system))
    .digest("hex")
    .slice(0, 24);
}

/**
 * Valida una propuesta. Si falla, motivo + pedir otra (hasta MAX_DESIGN_ATTEMPTS).
 */
export function selectValidProposal(input: {
  readonly proposals: readonly DesignSystem[];
  readonly maxAttempts?: number;
}): {
  readonly system: DesignSystem;
  readonly attempt: number;
  readonly rejected: readonly { readonly id: string; readonly reasons: readonly string[] }[];
} {
  const max = input.maxAttempts ?? MAX_DESIGN_ATTEMPTS;
  const rejected: { id: string; reasons: string[] }[] = [];
  const slice = input.proposals.slice(0, max);
  for (let i = 0; i < slice.length; i++) {
    const system = slice[i]!;
    const v = validateDesignSystem(system);
    if (v.ok) {
      return { system, attempt: i + 1, rejected };
    }
    rejected.push({
      id: system.id,
      reasons: v.issues.map((x) => x.message),
    });
  }
  throw new DesignRejectionError(
    `Ninguna propuesta válida en ${max} intentos`,
    rejected.flatMap((r) => r.reasons),
  );
}

/**
 * Flujo completo: proponer → cliente elige índice → validar (reintentos) → guardar.
 */
export function runDesignSession(input: {
  readonly identity: DesignIdentityInput;
  readonly chosenIndex: 0 | 1 | 2;
  readonly approvedAt: string;
  readonly store: DesignStore;
  readonly layer4?: Layer4Stub;
  /** Si true, inserta un sistema malo antes para forzar rechazo+reintento. */
  readonly injectInvalidFirst?: DesignSystem;
}): {
  readonly batch: DesignProposalBatch;
  readonly approved: DesignSystemVersion;
  readonly overlay: PresentationOverlay;
  readonly rejectedBeforeAccept: readonly {
    readonly id: string;
    readonly reasons: readonly string[];
  }[];
} {
  const batch = proposeDesignSystems(
    input.identity,
    input.layer4 ?? new HeuristicLayer4Stub(),
  );
  let queue = [...batch.proposals];
  if (input.injectInvalidFirst) {
    queue = [input.injectInvalidFirst, ...queue];
  }
  // Preferir la elección del cliente; si falla, siguientes intentos
  const preferred = batch.proposals[input.chosenIndex]!;
  const ordered = [
    preferred,
    ...batch.proposals.filter((p) => p.id !== preferred.id),
  ];
  const toValidate = input.injectInvalidFirst
    ? [input.injectInvalidFirst, ...ordered]
    : ordered;

  const selected = selectValidProposal({ proposals: toValidate });
  const approved = input.store.approve(
    selected.system,
    input.identity.companyId,
    input.approvedAt,
  );
  const overlay = designSystemToOverlay(approved, input.store.getHistory());
  return {
    batch,
    approved,
    overlay,
    rejectedBeforeAccept: selected.rejected,
  };
}

/** Escribe el sistema aprobado en la capa superpuesta (versionada). */
export function designSystemToOverlay(
  current: DesignSystemVersion,
  history: readonly DesignSystemVersion[],
): PresentationOverlay {
  return {
    version: current.version,
    identity: {
      primaryColor: current.system.tokens.colors.primary,
      secondaryColor: current.system.tokens.colors.secondary,
    },
    designSystem: current,
    designSystemHistory: history.map((h) => ({
      version: h.version,
      contentHash: h.contentHash,
      approvedAt: h.approvedAt,
      proposalId: h.proposalId,
    })),
  };
}
