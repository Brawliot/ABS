/**
 * Validación Zod de salidas LLM.
 * Nunca se usa una respuesta sin validar.
 */

import { z } from "zod";
import { LlmValidationError, type WithConfidence } from "./types.js";

/** Extiende un schema de objeto con `confidence` obligatorio. */
export function withConfidenceSchema<T extends z.ZodRawShape>(
  shape: T,
): z.ZodObject<T & { confidence: z.ZodNumber }> {
  return z.object({
    ...shape,
    confidence: z.number().min(0).max(1),
  });
}

function issuesOf(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

/**
 * Parsea JSON + valida Zod.
 * Si falla, lanza LlmValidationError (el cliente reintenta una vez).
 */
export function parseAndValidate<T extends z.ZodTypeAny>(
  raw: string,
  schema: T,
): WithConfidence<z.infer<T>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LlmValidationError("Respuesta LLM no es JSON válido", [
      "json_parse",
    ]);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LlmValidationError(
      "Respuesta LLM no cumple el esquema",
      issuesOf(result.error),
    );
  }

  const data = result.data as WithConfidence<z.infer<T>>;
  if (typeof (data as { confidence?: unknown }).confidence !== "number") {
    throw new LlmValidationError("Respuesta LLM sin campo confidence", [
      "confidence: required",
    ]);
  }
  return data;
}
