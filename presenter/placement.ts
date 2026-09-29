/**
 * Colocación: Insight → Módulo + Vista junto al sujeto.
 */

import type { Insight } from "../contracts/insight.js";
import type { ModuleSpec, UiSpec, ViewSpec } from "../presentation/types.js";
import { PresenterError } from "./types.js";

export interface Placement {
  readonly moduleId: string;
  readonly viewId: string;
}

function moduleMatchesReader(
  mod: ModuleSpec,
  readerRoles: readonly string[],
): boolean {
  if (mod.roleIds.length === 0) return true;
  return mod.roleIds.some((r) => readerRoles.includes(r));
}

function pickViewForSubject(
  views: readonly ViewSpec[],
  subjectKind: Insight["subject"]["kind"],
  preferredViewId?: string,
): ViewSpec | undefined {
  if (preferredViewId) {
    const pref = views.find((v) => v.id === preferredViewId);
    if (pref) return pref;
  }
  if (subjectKind === "transaccion") {
    return (
      views.find((v) => v.kind === "detalle") ??
      views.find((v) => v.kind === "tablero") ??
      views[0]
    );
  }
  if (subjectKind === "parte" || subjectKind === "recurso") {
    return (
      views.find((v) => v.kind === "lista") ??
      views.find((v) => v.kind === "detalle") ??
      views[0]
    );
  }
  return views[0];
}

/**
 * Resuelve módulo y vista para mostrar el Insight junto a su sujeto.
 */
export function resolvePlacement(
  insight: Insight,
  uiSpec: UiSpec,
  readerRoles: readonly string[],
): Placement {
  const preferredMod = insight.preferredModuleId
    ? uiSpec.modules.find((m) => m.id === insight.preferredModuleId)
    : undefined;

  const candidates = preferredMod
    ? [preferredMod]
    : uiSpec.modules.filter((m) => moduleMatchesReader(m, readerRoles));

  for (const mod of candidates) {
    if (!moduleMatchesReader(mod, readerRoles) && preferredMod !== mod) {
      continue;
    }
    const views = uiSpec.views.filter((v) => mod.viewIds.includes(v.id));
    const view = pickViewForSubject(
      views,
      insight.subject.kind,
      insight.preferredViewId,
    );
    if (view) {
      return { moduleId: mod.id, viewId: view.id };
    }
  }

  // Último recurso: primer módulo con vistas
  for (const mod of uiSpec.modules) {
    const views = uiSpec.views.filter((v) => mod.viewIds.includes(v.id));
    const view = pickViewForSubject(views, insight.subject.kind);
    if (view) {
      return { moduleId: mod.id, viewId: view.id };
    }
  }

  throw new PresenterError(
    `Sin colocación para Insight ${insight.id} (sujeto ${insight.subject.kind}:${insight.subject.id})`,
  );
}
