/**
 * Vincula DesignSystem → patrones elegidos por vista (sin mutar la estructura).
 */

import type { DesignSystem, PatternSet } from "../design/schema.js";
import type { PresentationChannel, UiSpec, ViewSpec } from "./types.js";
import {
  admittedPatternsForView,
  DEFAULT_PATTERNS_BY_VIEW_KIND,
  type ChosenPatterns,
} from "./patterns.js";
import { resolveTokenMap, type ResolvedTokenMap } from "./resolve-tokens.js";

export interface PatternWarning {
  readonly viewId: string;
  readonly slot: keyof PatternSet;
  readonly requested: string;
  readonly fallback: string;
  readonly message: string;
}

export interface ViewPatternBinding {
  readonly viewId: string;
  readonly admitted: ReturnType<typeof admittedPatternsForView>;
  readonly chosen: ChosenPatterns;
}

export interface UiDesignBinding {
  readonly designSystemId: string;
  readonly designContentHash: string;
  readonly roleId: string;
  readonly channel: PresentationChannel;
  readonly tokens: ResolvedTokenMap;
  readonly views: readonly ViewPatternBinding[];
  readonly warnings: readonly PatternWarning[];
}

function chooseSlot<T extends string>(
  requested: T,
  admitted: readonly T[],
  fallback: T,
  viewId: string,
  slot: keyof PatternSet,
  warnings: PatternWarning[],
): T {
  if (admitted.includes(requested)) return requested;
  warnings.push({
    viewId,
    slot,
    requested,
    fallback,
    message: `Patrón ${slot}=${requested} incompatible con vista ${viewId}; se usa ${fallback}`,
  });
  return fallback;
}

/**
 * Elige patrones del DS entre los admitidos por cada vista.
 * No modifica la UiSpec (independencia estructura/diseño).
 */
export function bindDesignToUiSpec(input: {
  readonly spec: UiSpec;
  readonly designSystem: DesignSystem;
  readonly designContentHash: string;
  readonly roleId: string;
  readonly channel: PresentationChannel;
}): UiDesignBinding {
  const tokens = resolveTokenMap({
    designSystem: input.designSystem,
    roleId: input.roleId,
    channel: input.channel,
  });
  const dsPatterns = input.designSystem.patterns;
  const warnings: PatternWarning[] = [];
  const views: ViewPatternBinding[] = input.spec.views.map((view) => {
    const admitted = admittedPatternsForView(view.kind);
    const defaults = DEFAULT_PATTERNS_BY_VIEW_KIND[view.kind];
    const chosen: ChosenPatterns = {
      listados: chooseSlot(
        dsPatterns.listados,
        admitted.listados,
        defaults.listados,
        view.id,
        "listados",
        warnings,
      ),
      navegacion: chooseSlot(
        dsPatterns.navegacion,
        admitted.navegacion,
        defaults.navegacion,
        view.id,
        "navegacion",
        warnings,
      ),
      formularios: chooseSlot(
        dsPatterns.formularios,
        admitted.formularios,
        defaults.formularios,
        view.id,
        "formularios",
        warnings,
      ),
      tableros: chooseSlot(
        dsPatterns.tableros,
        admitted.tableros,
        defaults.tableros,
        view.id,
        "tableros",
        warnings,
      ),
    };
    return { viewId: view.id, admitted, chosen };
  });

  return {
    designSystemId: input.designSystem.id,
    designContentHash: input.designContentHash,
    roleId: input.roleId,
    channel: input.channel,
    tokens,
    views,
    warnings,
  };
}

/** Aviso si una vista concreta tuvo fallback de patrón. */
export function warningsForView(
  binding: UiDesignBinding,
  viewId: string,
): readonly PatternWarning[] {
  return binding.warnings.filter((w) => w.viewId === viewId);
}

export function bindingForView(
  binding: UiDesignBinding,
  view: ViewSpec,
): ViewPatternBinding | undefined {
  return binding.views.find((v) => v.viewId === view.id);
}
