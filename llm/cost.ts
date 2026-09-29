/**
 * Estimación de coste por llamada (USD) — orientativa para telemetría.
 */

import type { LlmTokenUsage } from "./types.js";

/** Precios aproximados USD / 1M tokens (entrada, salida). */
export const MODEL_PRICE_USD_PER_MTOK: Readonly<
  Record<string, { readonly in: number; readonly out: number }>
> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  heuristic: { in: 0, out: 0 },
  cassette: { in: 0, out: 0 },
};

export function estimateCostUsd(
  model: string,
  usage: LlmTokenUsage,
): number {
  const key = model in MODEL_PRICE_USD_PER_MTOK ? model : "gpt-4o-mini";
  const price = MODEL_PRICE_USD_PER_MTOK[key] ?? MODEL_PRICE_USD_PER_MTOK["gpt-4o-mini"]!;
  const cost =
    (usage.promptTokens / 1_000_000) * price.in +
    (usage.completionTokens / 1_000_000) * price.out;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
