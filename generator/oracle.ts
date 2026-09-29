/**
 * Oráculo de UI derivada de procesos.
 * Para cada perfil: toda transición alcanzable → acción; todo estado → vista;
 * todo bloqueo → indicador; ningún rol ve acciones que no puede ejecutar.
 */

import type { GeneratorInput } from "./types.js";
import {
  actionsVisibleToRole,
  generateUiSpec,
} from "./generate.js";
import type { UiSpec } from "../presentation/types.js";

export type OracleFindingCode =
  | "MISSING_STATE_VIEW"
  | "MISSING_TRANSITION_ACTION"
  | "MISSING_BLOCK_INDICATOR"
  | "ROLE_SEES_UNAUTHORIZED_ACTION"
  | "ACTION_WITHOUT_VISIBLE_ROLE"
  | "MISSING_PROCESS_GROUP";

export interface OracleFinding {
  readonly code: OracleFindingCode;
  readonly message: string;
  readonly detail?: Readonly<Record<string, string>>;
}

export interface OracleReport {
  readonly caseId: string;
  readonly ok: boolean;
  readonly findings: readonly OracleFinding[];
  readonly stats: {
    readonly stateViews: number;
    readonly actions: number;
    readonly blockIndicators: number;
    readonly processGroups: number;
  };
}

function reachableTransitions(input: GeneratorInput): {
  lifecycleId: string;
  transitionId: string;
  from: string;
}[] {
  const out: {
    lifecycleId: string;
    transitionId: string;
    from: string;
  }[] = [];
  for (const slice of input.lifecycles) {
    const reachable = new Set<string>();
    const initials = slice.lifecycle.states
      .filter((s) => s.kind === "inicial")
      .map((s) => s.id);
    const queue = [...initials];
    for (const id of initials) reachable.add(id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const t of slice.lifecycle.transitions) {
        if (t.from !== cur) continue;
        if (!reachable.has(t.to)) {
          reachable.add(t.to);
          queue.push(t.to);
        }
      }
    }
    for (const t of slice.lifecycle.transitions) {
      if (reachable.has(t.from)) {
        out.push({
          lifecycleId: slice.id,
          transitionId: t.id,
          from: t.from,
        });
      }
    }
  }
  return out;
}

/**
 * Ejecuta el oráculo sobre un GeneratorInput (genera UiSpec si no se pasa).
 */
export function runProcessUiOracle(
  input: GeneratorInput,
  spec?: UiSpec,
): OracleReport {
  const ui = spec ?? generateUiSpec(input);
  const findings: OracleFinding[] = [];

  for (const slice of input.lifecycles) {
    for (const state of slice.lifecycle.states) {
      const viewId = `view.${slice.id}.${state.id}`;
      const view = ui.views.find((v) => v.id === viewId);
      if (!view || view.kind !== "tablero") {
        findings.push({
          code: "MISSING_STATE_VIEW",
          message: `Falta vista de estado ${viewId}`,
          detail: { lifecycleId: slice.id, stateId: state.id },
        });
      }
    }
  }

  const reachable = reachableTransitions(input);
  for (const t of reachable) {
    const actionId = `action.${t.lifecycleId}.${t.transitionId}`;
    const action = ui.actions.find((a) => a.id === actionId);
    const hasGuardRoles = input.ruleSet.rules.some(
      (r) =>
        r.kind === "guard" &&
        r.transitionId === t.transitionId &&
        (r.action === "ejecutar" || r.action === "aprobar") &&
        r.allowedRoles.length > 0,
    );
    if (!hasGuardRoles) {
      // Sin permiso → no debe haber acción (correcto)
      if (action) {
        findings.push({
          code: "ACTION_WITHOUT_VISIBLE_ROLE",
          message: `Acción ${actionId} existe sin roles de guarda`,
          detail: { actionId },
        });
      }
      continue;
    }
    if (!action) {
      findings.push({
        code: "MISSING_TRANSITION_ACTION",
        message: `Falta acción para transición alcanzable ${t.transitionId}`,
        detail: {
          lifecycleId: t.lifecycleId,
          transitionId: t.transitionId,
        },
      });
      continue;
    }
    if (action.visibleRoles.length === 0) {
      findings.push({
        code: "ACTION_WITHOUT_VISIBLE_ROLE",
        message: `Acción ${actionId} sin visibleRoles`,
        detail: { actionId },
      });
    }
  }

  if (input.composition) {
    for (const sec of input.composition.secondaries) {
      const indicator = ui.views.find(
        (v) =>
          v.kind === "panel_bloqueo" &&
          v.presentation?.secondaryArchetypeId === sec.secondaryArchetypeId &&
          v.presentation?.bloquea === sec.bloquea,
      );
      if (!indicator) {
        findings.push({
          code: "MISSING_BLOCK_INDICATOR",
          message: `Falta indicador de bloqueo para ${sec.secondaryArchetypeId}→${sec.bloquea}`,
          detail: {
            secondaryArchetypeId: sec.secondaryArchetypeId,
            bloquea: sec.bloquea,
          },
        });
      }
    }
  }

  for (const role of input.roles) {
    const visible = actionsVisibleToRole(ui, role.id);
    for (const a of visible) {
      const allowed = input.ruleSet.rules.some(
        (r) =>
          r.kind === "guard" &&
          r.transitionId === a.transitionId &&
          (r.action === "ejecutar" || r.action === "aprobar") &&
          r.allowedRoles.includes(role.id),
      );
      if (!allowed) {
        findings.push({
          code: "ROLE_SEES_UNAUTHORIZED_ACTION",
          message: `Rol ${role.id} ve acción ${a.id} sin guarda`,
          detail: { roleId: role.id, actionId: a.id },
        });
      }
    }
  }

  if (!ui.processGroups || ui.processGroups.length === 0) {
    findings.push({
      code: "MISSING_PROCESS_GROUP",
      message: "UiSpec sin processGroups",
    });
  } else {
    for (const slice of input.lifecycles) {
      const g = ui.processGroups.find((p) => p.lifecycleId === slice.id);
      if (!g) {
        findings.push({
          code: "MISSING_PROCESS_GROUP",
          message: `Falta processGroup para ${slice.id}`,
          detail: { lifecycleId: slice.id },
        });
      }
    }
  }

  return {
    caseId: input.caseId,
    ok: findings.length === 0,
    findings,
    stats: {
      stateViews: ui.views.filter((v) => v.kind === "tablero").length,
      actions: ui.actions.length,
      blockIndicators: ui.views.filter((v) => v.kind === "panel_bloqueo")
        .length,
      processGroups: ui.processGroups?.length ?? 0,
    },
  };
}

/** Huella funcional (estados, acciones, roles) — ignora paneles/organización. */
export function functionalFingerprint(spec: UiSpec): {
  states: string[];
  actions: string[];
  actionRoles: string[];
} {
  const states = spec.views
    .filter((v) => v.kind === "tablero" && v.stateId && v.lifecycleId)
    .map((v) => `${v.lifecycleId}:${v.stateId}`)
    .sort();
  const actions = spec.actions
    .map((a) => `${a.lifecycleId}:${a.transitionId}`)
    .sort();
  const actionRoles = spec.actions
    .map((a) => `${a.id}|${[...a.visibleRoles].sort().join(",")}`)
    .sort();
  return { states, actions, actionRoles };
}
