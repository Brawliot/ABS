/**
 * Validador de valores de formulario contra schema compilado.
 * Previene inyección de datos inválidos.
 */

import { z } from "zod";
import type { Transition } from "../core/lifecycle.js";
import type { CompiledRuleSet } from "../policies/types.js";

/**
 * Define schema de validación por tipo de transición.
 * Extensible: agregar nuevas transiciones aquí.
 */
export const formValueSchemas: Record<string, z.ZodSchema> = {
  // Esquemas por defecto (permisivos)
  default: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),

  // Ejemplos de schemas específicos (uncomment según necesidad)
  // t_aceptar: z.object({
  //   importe: z.coerce.number().positive("Importe debe ser positivo"),
  //   factura_id: z.string().min(1, "Factura requerida"),
  //   base_imponible: z.coerce.number().nonnegative(),
  // }).passthrough(),
};

/**
 * Valida valores de formulario contra el schema de la transición.
 * Si no hay schema específico, usa el default (permisivo).
 *
 * @throws Error si los valores no cumplen el schema
 */
export function validateFormValues(
  transitionId: string,
  formValues: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const schema = formValueSchemas[transitionId] ?? formValueSchemas.default;

  if (!schema) {
    throw new Error(`No schema available for transition ${transitionId}`);
  }

  try {
    // Intenta coercer tipos numéricos si es posible
    const coercedValues: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(formValues)) {
      if (typeof v === "string") {
        // Intenta coercer a número
        if (/^-?\d+(\.\d+)?$/.test(v)) {
          coercedValues[k] = Number(v);
        }
        // Intenta coercer a boolean
        else if (v === "true" || v === "false") {
          coercedValues[k] = v === "true";
        }
        // Mantiene como string
        else {
          coercedValues[k] = v;
        }
      } else {
        coercedValues[k] = v;
      }
    }

    return schema.parse(coercedValues);
  } catch (err) {
    const msg = err instanceof z.ZodError
      ? err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
      : String(err);
    throw new Error(`Validación de formulario fallida (${transitionId}): ${msg}`);
  }
}

/**
 * Retorna el schema de validación para una transición.
 * Útil para generar UI con validación client-side.
 */
export function getFormSchema(transitionId: string): z.ZodSchema {
  return formValueSchemas[transitionId] ?? formValueSchemas.default;
}

/**
 * Registra un nuevo schema de validación para una transición.
 */
export function registerFormSchema(transitionId: string, schema: z.ZodSchema): void {
  formValueSchemas[transitionId] = schema;
}
