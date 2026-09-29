import { ARCHETYPES } from "../archetypes/catalog.js";
import { LearnerRegistry } from "./bayesian.js";

/** Inicializa aprendices por tipo de arquetipo con priors heredados. */
export function createArchetypeLearnerRegistry(): LearnerRegistry {
  const registry = new LearnerRegistry();
  for (const arch of ARCHETYPES) {
    registry.getOrCreate(`transaccion:${arch.id}`, arch.profilePriors);
  }
  return registry;
}

export * from "./bayesian.js";
export * from "./drift.js";
export * from "./privacy.js";
