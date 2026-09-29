/**
 * Usuarios, evidencias y campos sintéticos para el Probador.
 */

import type { EvidenceKind } from "../../core/grammar.js";
import type { Lifecycle, Transition } from "../../core/lifecycle.js";
import type { JudgeActor, JudgeEvidence } from "../../policies/judge.js";
import type { RoleDef } from "../../policies/types.js";
import type { FormFieldSpec, FormSpec, UiSpec } from "../../presentation/types.js";

export interface SyntheticUser {
  readonly roleId: string;
  readonly actor: JudgeActor;
}

export function syntheticUsers(roles: readonly RoleDef[]): readonly SyntheticUser[] {
  return roles.map((r) => ({
    roleId: r.id,
    actor: {
      id: `qa-user-${r.id}`,
      kind: "humano" as const,
      roles: [r.id],
    },
  }));
}

/** Evidencia sintética acorde al tipo exigido por la transición. */
export function syntheticEvidence(
  transition: Transition,
  now: string,
  seq: number,
): JudgeEvidence {
  const kind = transition.requiredEvidence as EvidenceKind;
  const base: JudgeEvidence = {
    kind,
    reference: `qa-ref-${transition.id}-${seq}`,
    recordedAt: now,
  };
  if (kind === "fisica" && /cerrar|pagar|factura/i.test(transition.id)) {
    return { ...base, referenceType: "factura" };
  }
  if (kind === "fisica") {
    return { ...base, referenceType: "albaran" };
  }
  return base;
}

export function makeEvidenceFactory(
  lifecycle: Lifecycle,
  now: string,
): (transitionId: string) => JudgeEvidence {
  let seq = 0;
  return (transitionId: string) => {
    const t = lifecycle.transitions.find((x) => x.id === transitionId);
    if (!t) {
      return {
        kind: "sistema",
        reference: `qa-unknown-${transitionId}`,
        recordedAt: now,
      };
    }
    return syntheticEvidence(t, now, seq++);
  };
}

/** Campos de negocio sintéticos (venta con crédito / facturación). */
export function syntheticCreditFields(): Record<
  string,
  string | number | boolean
> {
  return {
    importe: 18000,
    parte_id: "parte:cliente-qa",
    factura_id: "fac-qa-001",
    oferta_version: 1,
    credito: true,
  };
}

/**
 * Rellena campos obligatorios de un formulario; marca imposibles.
 */
export function fillRequiredFields(
  form: FormSpec,
): {
  readonly values: Record<string, string | number | boolean>;
  readonly impossible: readonly FormFieldSpec[];
} {
  const values: Record<string, string | number | boolean> = {};
  const impossible: FormFieldSpec[] = [];
  for (const f of form.fields) {
    if (!f.required) continue;
    const v = syntheticFieldValue(f);
    if (v === null) impossible.push(f);
    else values[f.name] = v;
  }
  return { values, impossible };
}

export function syntheticFieldValue(
  f: FormFieldSpec,
): string | number | boolean | null {
  switch (f.type) {
    case "string":
      return `qa-${f.name}`;
    case "number":
      return 1;
    case "boolean":
      return true;
    case "date":
      return "2026-06-01T00:00:00.000Z";
    case "enum":
      if (!f.enumValues || f.enumValues.length === 0) return null;
      return f.enumValues[0]!;
    case "reference":
      if (!f.referenceEntity) return null;
      return `${f.referenceEntity}:qa-1`;
    default:
      return null;
  }
}

/** Actor con el kind exigido por la transición, conservando roles. */
export function actorForTransition(
  user: SyntheticUser,
  transition: Transition,
): JudgeActor {
  return {
    id: user.actor.id,
    kind: transition.allowedActor,
    roles: user.actor.roles,
  };
}

export function usersForAction(
  users: readonly SyntheticUser[],
  visibleRoles: readonly string[],
): readonly SyntheticUser[] {
  return users.filter((u) => visibleRoles.includes(u.roleId));
}

export function allActors(users: readonly SyntheticUser[]): JudgeActor[] {
  return users.map((u) => u.actor);
}

export function formsFromSpec(spec: UiSpec): readonly FormSpec[] {
  return spec.forms;
}
