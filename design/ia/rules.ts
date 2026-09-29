/**
 * Reglas iniciales deterministas del Arquitecto de información.
 */

import type { ActionSpec, UiSpec } from "../../presentation/types.js";
import {
  frequencyWeight,
  isPurchaseRelated,
} from "./frequency.js";
import {
  MAX_MAIN_MENU_ENTRIES,
  PRIMARY_LIST_FIELDS,
  type HomeHighlight,
  type MenuSpec,
  type RoleInformationArchitecture,
  type ViewFieldHierarchy,
} from "./types.js";

/** Tarea pendiente: espera acción del rol. */
export interface PendingTask {
  readonly id: string;
  readonly label: string;
  readonly actionId: string;
  readonly transitionId: string;
  readonly subjectId?: string;
}

export interface ArchitectContext {
  readonly spec: UiSpec;
  readonly roleId: string;
  /** Transacciones / ítems que esperan acción del rol. */
  readonly pendingTasks: readonly PendingTask[];
  /** Campos secundarios opcionales por vista (si no, se infieren). */
  readonly secondaryFieldsByView?: Readonly<Record<string, readonly string[]>>;
}

function actionsForRole(spec: UiSpec, roleId: string): ActionSpec[] {
  return spec.actions.filter((a) => a.visibleRoles.includes(roleId));
}

function localize(spec: UiSpec, key: string): string {
  return spec.localization[0]?.strings[key] ?? key;
}

function actionDisplayLabel(spec: UiSpec, action: ActionSpec): string {
  const fromContent = spec.content[action.id]?.title;
  if (fromContent) return fromContent;
  const fromLoc = localize(spec, action.labelKey);
  if (fromLoc !== action.labelKey) return fromLoc;
  // Heurística: recibir mercancía
  if (/recibir|recepcion|t_recibir/i.test(action.transitionId + action.labelKey)) {
    return "Recibir mercancía";
  }
  return action.transitionId;
}

/**
 * Inicio: pendientes primero, luego acciones frecuentes destacadas.
 */
export function buildHome(ctx: ArchitectContext): HomeHighlight {
  const roleActions = actionsForRole(ctx.spec, ctx.roleId).filter(
    (a) =>
      !isPurchaseRelated(a.transitionId, a.labelKey) ||
      frequencyWeight(ctx.roleId, a.transitionId, a.labelKey) > 0,
  );

  const pendingActionIds = [
    ...new Set(ctx.pendingTasks.map((t) => t.actionId)),
  ];
  const pendingLabels = ctx.pendingTasks.map((t) => t.label);

  const ranked = [...roleActions].sort((a, b) => {
    const wa = frequencyWeight(ctx.roleId, a.transitionId, a.labelKey);
    const wb = frequencyWeight(ctx.roleId, b.transitionId, b.labelKey);
    if (wb !== wa) return wb - wa;
    return a.id.localeCompare(b.id);
  });

  const highlightActions = [
    ...pendingActionIds,
    ...ranked.map((a) => a.id).filter((id) => !pendingActionIds.includes(id)),
  ].slice(0, 5);

  const labels: string[] = [];
  for (const id of highlightActions) {
    const act = ctx.spec.actions.find((a) => a.id === id);
    if (act) labels.push(actionDisplayLabel(ctx.spec, act));
  }
  for (const pl of pendingLabels) {
    if (!labels.includes(pl)) labels.push(pl);
  }

  // Vistas que contienen esas acciones
  const viewIds = ctx.spec.views
    .filter((v) => v.actionIds.some((id) => highlightActions.includes(id)))
    .map((v) => v.id)
    .sort();

  return {
    viewIds,
    actionIds: highlightActions,
    labels: [...new Set(labels)],
    pendingTaskIds: ctx.pendingTasks.map((t) => t.id).sort(),
  };
}

/**
 * Menú: máx. 7 principales; resto agrupado. Sin acciones de compra para vendedor.
 */
export function buildMenu(ctx: ArchitectContext): MenuSpec {
  const roleActions = actionsForRole(ctx.spec, ctx.roleId).filter(
    (a) => !isPurchaseRelated(a.transitionId, a.labelKey, actionDisplayLabel(ctx.spec, a)),
  );

  const modules = ctx.spec.modules.filter((m) =>
    m.roleIds.includes(ctx.roleId),
  );

  type Entry = {
    id: string;
    label: string;
    kind: "view" | "action" | "module";
    refId: string;
    weight: number;
  };

  const entries: Entry[] = [];

  // Pendientes como entradas de peso máximo
  for (const task of ctx.pendingTasks) {
    entries.push({
      id: `menu.pending.${task.id}`,
      label: task.label,
      kind: "action",
      refId: task.actionId,
      weight: 10_000,
    });
  }

  for (const a of roleActions) {
    const label = actionDisplayLabel(ctx.spec, a);
    entries.push({
      id: `menu.action.${a.id}`,
      label,
      kind: "action",
      refId: a.id,
      weight: frequencyWeight(ctx.roleId, a.transitionId, a.labelKey),
    });
  }

  for (const m of modules) {
    entries.push({
      id: `menu.module.${m.id}`,
      label: localize(ctx.spec, m.labelKey),
      kind: "module",
      refId: m.id,
      weight: 30,
    });
  }

  // Deduplicar por refId+kind (quedarse con mayor peso)
  const best = new Map<string, Entry>();
  for (const e of entries) {
    const key = `${e.kind}:${e.refId}`;
    const prev = best.get(key);
    if (!prev || e.weight > prev.weight) best.set(key, e);
  }

  const sorted = [...best.values()].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.id.localeCompare(b.id);
  });

  const primary = sorted.slice(0, MAX_MAIN_MENU_ENTRIES).map((e) => ({
    id: e.id,
    label: e.label,
    kind: e.kind,
    refId: e.refId,
  }));

  const rest = sorted.slice(MAX_MAIN_MENU_ENTRIES);
  const groups =
    rest.length === 0
      ? []
      : [
          {
            id: "menu.group.mas",
            label: "Más",
            entryIds: rest.map((e) => e.id),
          },
        ];

  return { primaryEntries: primary, groups };
}

export function buildViewHierarchies(
  ctx: ArchitectContext,
): readonly ViewFieldHierarchy[] {
  return ctx.spec.views.map((v) => {
    const secondary =
      ctx.secondaryFieldsByView?.[v.id] ??
      ["canal", "sede", "segmento", "notas"];
    return {
      viewId: v.id,
      primaryFields: [...PRIMARY_LIST_FIELDS],
      secondaryFields: [...secondary],
    };
  });
}

export function buildRoleArchitecture(
  ctx: ArchitectContext,
): RoleInformationArchitecture {
  return {
    roleId: ctx.roleId,
    home: buildHome(ctx),
    menu: buildMenu(ctx),
    viewHierarchies: buildViewHierarchies(ctx),
  };
}
