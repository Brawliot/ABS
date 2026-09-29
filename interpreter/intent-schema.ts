/**
 * Esquema Zod de intención estructurada del Intérprete (salida LLM).
 * Solo campos que el orquestador puede validar antes del Juez.
 */

import { z } from "zod";
import { withConfidenceSchema } from "../llm/validate.js";

export const IntentCandidateSchema = z.object({
  transitionId: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(1),
});

export const IntentAmountSchema = z.object({
  amount: z.number(),
  currency: z.string().optional().default("EUR"),
  label: z.string().optional(),
});

export const IntentDateSchema = z.object({
  raw: z.string(),
  iso: z.string().optional(),
  role: z.string().optional(),
});

/**
 * Respuesta LLM: intención + entidades. `confidence` obligatorio.
 * transitionId null + clarificationQuestion ⇒ aclaración (nunca actuar).
 */
export const InterpreterIntentSchema = withConfidenceSchema({
  transitionId: z.string().nullable(),
  intentLabel: z.string(),
  evidenceKind: z.enum(["aceptacion", "sistema", "fisica"]),
  evidenceReferenceType: z.string().optional(),
  evidencePendingValidation: z.boolean(),
  ambiguous: z.boolean(),
  clarificationQuestion: z.string().nullable(),
  parteRefs: z.array(z.string()),
  amounts: z.array(IntentAmountSchema),
  dates: z.array(IntentDateSchema),
  fields: z.record(z.unknown()),
  candidates: z.array(IntentCandidateSchema),
});

export type InterpreterIntentLlm = z.infer<typeof InterpreterIntentSchema>;

/** JSON Schema para OpenAI response_format (subset estricto). */
export const INTERPRETER_INTENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "confidence",
    "transitionId",
    "intentLabel",
    "evidenceKind",
    "evidencePendingValidation",
    "ambiguous",
    "clarificationQuestion",
    "parteRefs",
    "amounts",
    "dates",
    "fields",
    "candidates",
  ],
  properties: {
    confidence: { type: "number" },
    transitionId: { type: ["string", "null"] },
    intentLabel: { type: "string" },
    evidenceKind: {
      type: "string",
      enum: ["aceptacion", "sistema", "fisica"],
    },
    evidenceReferenceType: { type: "string" },
    evidencePendingValidation: { type: "boolean" },
    ambiguous: { type: "boolean" },
    clarificationQuestion: { type: ["string", "null"] },
    parteRefs: { type: "array", items: { type: "string" } },
    amounts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["amount"],
        properties: {
          amount: { type: "number" },
          currency: { type: "string" },
          label: { type: "string" },
        },
      },
    },
    dates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["raw"],
        properties: {
          raw: { type: "string" },
          iso: { type: "string" },
          role: { type: "string" },
        },
      },
    },
    fields: { type: "object", additionalProperties: true },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["transitionId", "label", "confidence"],
        properties: {
          transitionId: { type: "string" },
          label: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

export const INTERPRETER_SYSTEM_PROMPT = `Eres el Intérprete de un sistema operativo de negocio basado en eventos.
Tu ÚNICA tarea: traducir el mensaje del usuario a una intención JSON estructurada.
NO ejecutas nada. NO inventas transiciones fuera de la lista permitida.

Reglas:
1. transitionId DEBE ser null o uno de allowedTransitionIds.
2. Si el mensaje es ambiguo, faltan datos, o hay varias Partes posibles → ambiguous=true, transitionId=null, clarificationQuestion con UNA pregunta concreta (p.ej. "¿García Pérez o García López?").
3. Nunca elijas por suposición entre opciones.
4. Extrae importes (amounts), fechas (dates) y referencias a Partes (parteRefs usando los refs del directorio si existen).
5. Declaraciones de pago con comprobante → evidenceKind=fisica, evidencePendingValidation=true, fields.pago_confirmado=false.
6. confidence ∈ [0,1]: alta solo si la transición y entidades están claras.
7. Responde SOLO JSON válido según el esquema.`;
