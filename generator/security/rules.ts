/**
 * Reglas deterministas sobre la configuración generada (capa 1 + UiSpec).
 */

import type { GeneratorInput } from "../types.js";
import type { UiSpec } from "../../presentation/types.js";
import type { CompiledRuleSet } from "../../policies/types.js";
import {
  AUTOMATION_ROLE_PATTERN,
  PII_FIELD_PATTERNS,
  SOD_PAIRS,
  matchesAny,
} from "./catalog.js";
import { MAX_FORCE_ROLES, type SecurityFinding } from "./types.js";
import { proposalFor } from "./propose.js";

function rolesForTransition(
  ruleSet: CompiledRuleSet,
  transitionId: string,
): Set<string> {
  const roles = new Set<string>();
  for (const r of ruleSet.rules) {
    if (r.kind === "guard" && r.transitionId === transitionId) {
      for (const role of r.allowedRoles) roles.add(role);
    }
  }
  return roles;
}

function allTransitionIds(input: GeneratorInput): string[] {
  const ids = new Set<string>();
  for (const slice of input.lifecycles) {
    for (const t of slice.lifecycle.transitions) ids.add(t.id);
  }
  for (const r of input.ruleSet.rules) {
    if ("transitionId" in r && typeof r.transitionId === "string") {
      ids.add(r.transitionId);
    }
  }
  return [...ids].sort();
}

/**
 * Separación de funciones: mismo rol en ambos lados del par SoD.
 */
export function checkSegregationOfDuties(
  input: GeneratorInput,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const transitions = allTransitionIds(input);

  for (const pair of SOD_PAIRS) {
    const createTs = transitions.filter((t) => pair.createPattern.test(t));
    const approveTs = transitions.filter((t) => pair.approvePattern.test(t));
    if (createTs.length === 0 || approveTs.length === 0) continue;

    const createRoles = new Set<string>();
    const approveRoles = new Set<string>();
    for (const t of createTs) {
      for (const r of rolesForTransition(input.ruleSet, t)) createRoles.add(r);
    }
    for (const t of approveTs) {
      for (const r of rolesForTransition(input.ruleSet, t)) approveRoles.add(r);
    }

    for (const role of createRoles) {
      if (!approveRoles.has(role)) continue;
      const demo = [...createTs, ...approveTs];
      const id = `sec.sod.${pair.id}.${role}`;
      findings.push({
        id,
        kind: "sod_violation",
        severity: "critical",
        message: `El rol «${role}» puede ${pair.label}`,
        step: {
          roleId: role,
          transitionIds: demo,
        },
        demonstration: demo,
        proposal: proposalFor(id, {
          description: `Retirar a «${role}» de una de las dos familias de permiso (${pair.id})`,
          suggestedPermissionPatch: {
            removeRoleFromTransitions: {
              [role]: approveTs,
            },
          },
        }),
      });
    }
  }
  return findings;
}

/**
 * Mínimo privilegio: permisos de ejecución que ningún recorrido/acción usa.
 */
export function checkLeastPrivilege(
  input: GeneratorInput,
  spec: UiSpec,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const usedByRole = new Map<string, Set<string>>();

  for (const a of spec.actions) {
    for (const role of a.visibleRoles) {
      let set = usedByRole.get(role);
      if (!set) {
        set = new Set();
        usedByRole.set(role, set);
      }
      set.add(a.transitionId);
    }
  }
  // Recorridos: transiciones de acciones ligadas a módulos del rol
  for (const mod of spec.modules) {
    for (const role of mod.roleIds) {
      let set = usedByRole.get(role);
      if (!set) {
        set = new Set();
        usedByRole.set(role, set);
      }
      for (const aid of mod.actionIds) {
        const act = spec.actions.find((a) => a.id === aid);
        if (act) set.add(act.transitionId);
      }
    }
  }

  for (const r of input.ruleSet.rules) {
    if (r.kind !== "guard") continue;
    for (const role of r.allowedRoles) {
      const used = usedByRole.get(role);
      if (used && used.has(r.transitionId)) continue;
      // Si el rol no aparece en ningún módulo/acción, o no usa esta transición
      const id = `sec.least.${role}.${r.transitionId}`;
      findings.push({
        id,
        kind: "least_privilege",
        severity: "major",
        message: `El rol «${role}» tiene permiso sobre «${r.transitionId}» que no usa ningún recorrido`,
        step: {
          roleId: role,
          transitionIds: [r.transitionId],
          ruleIds: [r.id],
        },
        demonstration: [r.transitionId],
        proposal: proposalFor(id, {
          description: `Retirar permiso de «${role}» sobre «${r.transitionId}»`,
          suggestedPermissionPatch: {
            removeRoleFromTransitions: { [role]: [r.transitionId] },
          },
        }),
      });
    }
  }
  return findings;
}

/**
 * Forzado: demasiados roles, o force_grant sin acotar (binding live).
 */
export function checkForceGrants(input: GeneratorInput): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const forceRoles = new Set<string>();
  const unlimited: string[] = [];

  for (const r of input.ruleSet.rules) {
    if (r.kind !== "force_grant") continue;
    for (const role of r.allowedRoles) forceRoles.add(role);
    if (r.binding.mode === "live") {
      unlimited.push(r.id);
    }
  }

  if (forceRoles.size > MAX_FORCE_ROLES) {
    const id = "sec.force.too_many_roles";
    findings.push({
      id,
      kind: "excessive_force",
      severity: "critical",
      message: `Demasiados roles con permiso de forzar (${forceRoles.size} > ${MAX_FORCE_ROLES}): ${[...forceRoles].join(", ")}`,
      step: { roleId: [...forceRoles].join(",") },
      demonstration: [...forceRoles],
      proposal: proposalFor(id, {
        description: `Reducir force_grant a ≤${MAX_FORCE_ROLES} roles de supervisión`,
        suggestedPermissionPatch: {
          revokeForceRoles: [...forceRoles].slice(MAX_FORCE_ROLES),
        },
      }),
    });
  }

  if (unlimited.length > 0 && forceRoles.size > 0) {
    const id = "sec.force.unlimited";
    findings.push({
      id,
      kind: "excessive_force",
      severity: forceRoles.size > 1 ? "critical" : "major",
      message: `Forzados sin límite (binding live) en: ${unlimited.join(", ")}`,
      step: { ruleIds: unlimited },
      demonstration: unlimited,
      proposal: proposalFor(id, {
        description:
          "Acotar force_grant con binding on_state o at_create y motivo obligatorio ya exigido por Observador",
        suggestedPermissionPatch: {
          revokeForceRoles: [...forceRoles],
        },
      }),
    });
  }

  return findings;
}

/**
 * Datos personales visibles para roles sin acción que los requiera.
 */
export function checkUnnecessaryPii(
  input: GeneratorInput,
  spec: UiSpec,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  // Campos PII declarados en formularios
  const piiFields = new Set<string>();
  for (const form of spec.forms) {
    for (const f of form.fields) {
      if (PII_FIELD_PATTERNS.some((p) => p.test(f.name))) piiFields.add(f.name);
    }
  }
  // Visibilidad amplia (consultar) sin transición asociada
  for (const r of input.ruleSet.rules) {
    if (r.kind !== "visibility") continue;
    for (const role of r.allowedRoles) {
      const needsPii = spec.actions.some(
        (a) =>
          a.visibleRoles.includes(role) &&
          a.evidenceFields.some((f) =>
            PII_FIELD_PATTERNS.some((p) => p.test(f.name)),
          ),
      );
      // Si hay campos PII en forms y el rol solo consulta (visibility) sin acciones
      const hasActions = spec.actions.some((a) =>
        a.visibleRoles.includes(role),
      );
      if (piiFields.size > 0 && !hasActions && !needsPii) {
        const id = `sec.pii.${role}.${r.id}`;
        findings.push({
          id,
          kind: "pii_unnecessary",
          severity: "major",
          message: `El rol «${role}» puede ver datos personales sin ninguna acción que los requiera`,
          step: {
            roleId: role,
            ruleIds: [r.id],
            ...(piiFields.size > 0
              ? { field: [...piiFields][0]! }
              : {}),
          },
          demonstration: [...piiFields],
          proposal: proposalFor(id, {
            description: `Restringir visibility de «${role}» o retirar campos personales del alcance`,
            suggestedPermissionPatch: {
              revokeVisibilityFields: [...piiFields],
            },
          }),
        });
      }
    }
  }
  return findings;
}

/**
 * Automatizaciones (roles bot/auto/sistema) con permisos demasiado amplios.
 */
export function checkAutomationPrivilege(
  input: GeneratorInput,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const autoRoles = input.roles
    .map((r) => r.id)
    .filter((id) => AUTOMATION_ROLE_PATTERN.test(id));

  for (const role of autoRoles) {
    const transitions: string[] = [];
    for (const r of input.ruleSet.rules) {
      if (r.kind === "guard" && r.allowedRoles.includes(role)) {
        transitions.push(r.transitionId);
      }
    }
    // Amplio = más de 3 transiciones de ejecución, o incluye pago/forzar
    const touchesMoney = transitions.some((t) =>
      /pago|pagar|cerrar|force/i.test(t),
    );
    if (transitions.length > 3 || touchesMoney) {
      const id = `sec.auto.${role}`;
      findings.push({
        id,
        kind: "automation_overprivilege",
        severity: touchesMoney ? "critical" : "major",
        message: `Automatización «${role}» con permisos amplios (${transitions.length} transiciones)`,
        step: { roleId: role, transitionIds: transitions },
        demonstration: transitions,
        proposal: proposalFor(id, {
          description: `Reducir permisos de «${role}» al mínimo de transiciones de sistema necesarias`,
          suggestedPermissionPatch: {
            removeRoleFromTransitions: { [role]: transitions },
          },
        }),
      });
    }
  }
  return findings;
}

export function runStaticRules(
  input: GeneratorInput,
  spec: UiSpec,
): SecurityFinding[] {
  return [
    ...checkSegregationOfDuties(input),
    ...checkForceGrants(input),
    ...checkAutomationPrivilege(input),
    ...checkLeastPrivilege(input, spec),
    ...checkUnnecessaryPii(input, spec),
  ];
}

export { rolesForTransition, allTransitionIds, matchesAny };
