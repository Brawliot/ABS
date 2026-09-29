/**
 * Puerto de entrada del BusinessProfile.
 * Cualquier fuente (formulario, importación, traductor futuro) implementa esto.
 * El diagnóstico externo NO se implementa aquí.
 */

import type { BusinessProfile } from "./types.js";
import { validateBusinessProfile } from "./validate.js";
import {
  businessProfileToGeneratorInput,
  materializeBusinessProfile,
  type MaterializeOptions,
} from "./materialize.js";
import type { GeneratorInput } from "../../generator/types.js";

/**
 * Fuente de un perfil de negocio en bruto (JSON-compatible).
 * El consumidor ABS valida y materializa; la fuente solo aporta datos.
 */
export interface BusinessProfileSource {
  /** Identificador estable de la fuente (p. ej. "json-file", "manual-form"). */
  readonly sourceId: string;
  /**
   * Carga el documento en bruto (aún no validado).
   * Puede ser síncrono o asíncrono.
   */
  load(): unknown | Promise<unknown>;
}

/** Carga + valida. No materializa ni genera. */
export async function loadBusinessProfile(
  source: BusinessProfileSource,
): Promise<BusinessProfile> {
  const raw = await Promise.resolve(source.load());
  return validateBusinessProfile(raw);
}

/** Carga + valida + materializa → GeneratorInput (sin generar UiSpec). */
export async function loadGeneratorInput(
  source: BusinessProfileSource,
  options?: MaterializeOptions,
): Promise<GeneratorInput> {
  const raw = await Promise.resolve(source.load());
  return businessProfileToGeneratorInput(raw, options);
}

export {
  validateBusinessProfile,
  materializeBusinessProfile,
  businessProfileToGeneratorInput,
};
