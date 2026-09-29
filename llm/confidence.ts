/**
 * Umbrales de confianza por componente.
 * Por debajo del umbral → pedir aclaración (no actuar).
 */

import type { LlmComponentId } from "./types.js";

export const DEFAULT_CONFIDENCE_THRESHOLDS: Readonly<
  Record<LlmComponentId, number>
> = {
  interpreter: 0.7,
  consultant: 0.7,
  redactor: 0.6,
  designer: 0.55,
  diagnosis: 0.75,
};

export function resolveConfidenceThreshold(
  componentId: LlmComponentId,
  override?: number,
  table?: Partial<Record<LlmComponentId, number>>,
): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return override;
  }
  if (table && typeof table[componentId] === "number") {
    return table[componentId]!;
  }
  return DEFAULT_CONFIDENCE_THRESHOLDS[componentId];
}

export function isAboveConfidenceThreshold(
  confidence: number,
  threshold: number,
): boolean {
  return Number.isFinite(confidence) && confidence >= threshold;
}
