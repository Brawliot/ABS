/**
 * Asignación determinista a variantes de experimento.
 * Misma persona (audienceKey) + mismo experimento → misma variante siempre.
 */

import { createHash } from "node:crypto";

export function stableHashU32(input: string): number {
  const buf = createHash("sha256").update(input, "utf8").digest();
  return buf.readUInt32BE(0);
}

/**
 * Elige variante por hash estable `experimentId:audienceKey`.
 * Independiente de sesión: solo de la clave de audiencia.
 */
export function assignExperimentVariant(
  experimentId: string,
  audienceKey: string,
  variants: readonly string[],
): string {
  if (variants.length === 0) {
    throw new Error(`Experimento ${experimentId}: sin variantes`);
  }
  const n = stableHashU32(`${experimentId}:${audienceKey}`);
  return variants[n % variants.length]!;
}
