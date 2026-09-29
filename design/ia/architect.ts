/**
 * Orquestación: construir IA determinista y escribir en overlay.
 */

import { createHash } from "node:crypto";
import { canonicalStringify } from "../../policies/compiler.js";
import type { PresentationOverlay, UiSpec } from "../../presentation/types.js";
import {
  buildRoleArchitecture,
  type ArchitectContext,
  type PendingTask,
} from "./rules.js";
import type {
  InformationArchitecture,
  RoleInformationArchitecture,
} from "./types.js";
import { InformationArchitectureError, MAX_MAIN_MENU_ENTRIES } from "./types.js";

export interface BuildInformationArchitectureInput {
  readonly spec: UiSpec;
  readonly roleIds: readonly string[];
  readonly pendingByRole: Readonly<Record<string, readonly PendingTask[]>>;
  readonly generatedAt: string;
  readonly secondaryFieldsByView?: Readonly<
    Record<string, readonly string[]>
  >;
}

function hashIa(byRole: readonly RoleInformationArchitecture[]): string {
  return createHash("sha256")
    .update(canonicalStringify(byRole))
    .digest("hex")
    .slice(0, 24);
}

/**
 * Construye la arquitectura de información (determinista).
 */
export function buildInformationArchitecture(
  input: BuildInformationArchitectureInput,
): InformationArchitecture {
  const roles = [...input.roleIds].sort();
  const byRole: RoleInformationArchitecture[] = [];

  for (const roleId of roles) {
    const ctx: ArchitectContext = {
      spec: input.spec,
      roleId,
      pendingTasks: input.pendingByRole[roleId] ?? [],
      ...(input.secondaryFieldsByView
        ? { secondaryFieldsByView: input.secondaryFieldsByView }
        : {}),
    };
    const arch = buildRoleArchitecture(ctx);
    if (arch.menu.primaryEntries.length > MAX_MAIN_MENU_ENTRIES) {
      throw new InformationArchitectureError(
        `Menú de ${roleId} supera ${MAX_MAIN_MENU_ENTRIES} entradas`,
      );
    }
    byRole.push(arch);
  }

  return {
    version: "ia-1.0.0",
    contentHash: hashIa(byRole),
    generatedAt: input.generatedAt,
    sourceUiSpecHash: input.spec.contentHash,
    byRole,
  };
}

/** Fusiona IA en la capa superpuesta (no toca estructura del Generador). */
export function applyInformationArchitectureToOverlay(
  overlay: PresentationOverlay | undefined,
  ia: InformationArchitecture,
): PresentationOverlay {
  return {
    version: overlay?.version ?? ia.version,
    ...(overlay?.identity ? { identity: overlay.identity } : {}),
    ...(overlay?.content ? { content: overlay.content } : {}),
    ...(overlay?.localization
      ? { localization: overlay.localization }
      : {}),
    ...(overlay?.designSystem
      ? { designSystem: overlay.designSystem }
      : {}),
    ...(overlay?.designSystemHistory
      ? { designSystemHistory: overlay.designSystemHistory }
      : {}),
    informationArchitecture: {
      version: ia.version,
      contentHash: ia.contentHash,
      generatedAt: ia.generatedAt,
      sourceUiSpecHash: ia.sourceUiSpecHash,
      byRole: ia.byRole,
    },
  };
}

export function roleArchitecture(
  ia: InformationArchitecture,
  roleId: string,
): RoleInformationArchitecture | undefined {
  return ia.byRole.find((r) => r.roleId === roleId);
}
