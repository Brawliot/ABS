/**
 * Visibilidad estructural: solo lo que UiSpec declara para el rol.
 * La UI no inventa permisos; filtra por roleIds / visibleRoles.
 */

import type {
  ActionSpec,
  ProcessGroupSpec,
  UiSpec,
  ViewSpec,
} from "../presentation/types.js";

export function processGroupsForRole(
  spec: UiSpec,
  roleId: string,
): readonly ProcessGroupSpec[] {
  const groups = spec.processGroups ?? [];
  return groups.filter((g) => {
    if (g.roleIds.length === 0) return true;
    return g.roleIds.includes(roleId);
  });
}

export function actionVisibleForRole(
  action: ActionSpec,
  roleId: string,
): boolean {
  return action.visibleRoles.includes(roleId);
}

export function viewsInGroups(
  spec: UiSpec,
  groups: readonly ProcessGroupSpec[],
): readonly ViewSpec[] {
  const ids = new Set<string>();
  for (const g of groups) {
    for (const id of g.viewIds) ids.add(id);
    for (const id of g.panelIds) ids.add(id);
  }
  return spec.views.filter((v) => ids.has(v.id));
}

export function actionsForView(
  spec: UiSpec,
  view: ViewSpec,
  roleId: string,
): readonly ActionSpec[] {
  return spec.actions.filter(
    (a) =>
      view.actionIds.includes(a.id) && actionVisibleForRole(a, roleId),
  );
}

/** Acciones del grupo visibles para el rol (aunque no estén en la vista actual). */
export function actionsForGroup(
  spec: UiSpec,
  group: ProcessGroupSpec,
  roleId: string,
): readonly ActionSpec[] {
  return spec.actions.filter(
    (a) =>
      group.actionIds.includes(a.id) && actionVisibleForRole(a, roleId),
  );
}
