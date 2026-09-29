/**
 * Límites de interrupciones por persona y día (configurable por rol).
 */

import type { PrioritizerConfig } from "./types.js";
import { DEFAULT_PRIORITIZER_CONFIG } from "./types.js";

/**
 * Límite efectivo por roles del lector.
 * Si hay overrides configurados para sus roles → el más restrictivo (mínimo).
 * Si no → `defaultInterruptLimitPerDay` (3).
 */
export function resolveInterruptLimit(
  roles: readonly string[],
  config: PrioritizerConfig = DEFAULT_PRIORITIZER_CONFIG,
): number {
  const configured = roles
    .map((r) => config.interruptLimitByRole[r])
    .filter((n): n is number => n !== undefined);
  if (configured.length === 0) {
    return config.defaultInterruptLimitPerDay;
  }
  return Math.min(...configured);
}

export function dayKeyFromIso(nowIso: string): string {
  return nowIso.slice(0, 10);
}
