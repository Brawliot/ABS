/**
 * Manejador centralizado de errores del Juez.
 * Encapsula lógica de captura con fallbacks (copia → LLM → genérico).
 */

import type { JudgeRejectionError } from "../policies/judge.js";
import type { InterfaceCopyPack } from "../design/copy/types.js";
import { resolveJudgeError } from "../design/copy/index.js";
import type { LlmClient } from "../llm/index.js";
import { z } from "zod";

export interface JudgeErrorContext {
  readonly error: JudgeRejectionError;
  readonly actionId: string;
  readonly transitionId: string;
  readonly subjectId: string;
  readonly copyPack: InterfaceCopyPack;
  readonly llmClient?: LlmClient;
  readonly contentSpec?: Readonly<Record<string, { readonly title?: string }>>;
}

/**
 * Resuelve un error del Juez con fallbacks ordenados:
 * 1. Copia de UI (template)
 * 2. LLM (si disponible)
 * 3. Razón del Juez + genérico
 */
export async function resolveJudgeErrorWithFallback(
  ctx: JudgeErrorContext
): Promise<string> {
  // Nivel 1: Copia de UI templated
  try {
    const accionLabel =
      ctx.contentSpec?.[ctx.actionId]?.title ??
      ctx.transitionId.replace(/^t_/, "").replace(/_/g, " ");
    return resolveJudgeError(ctx.copyPack, ctx.error.trace, {
      accion: ctx.transitionId,
      accion_label: accionLabel,
      pedido: ctx.subjectId,
    });
  } catch (_copyErr) {
    // Continuar al siguiente fallback
  }

  // Nivel 2: LLM explicación clara (si disponible)
  if (ctx.llmClient) {
    try {
      const llmResult = await ctx.llmClient.completeStructured({
        componentId: "diagnosis",
        callKind: "diagnosis.extract_answers",
        system:
          "Eres un asistente que explica en lenguaje claro y profesional " +
          "por qué se rechazó una transición comercial. Sé conciso (máximo 2 líneas).",
        userPayload: {
          razon: ctx.error.trace.reason || "Rechazado por política",
          transicion: ctx.transitionId,
          regla: ctx.error.trace.appliedRuleId,
        },
        schema: z.object({ explicacion: z.string() }),
        schemaName: "rejection_explanation",
        jsonSchema: {
          type: "object",
          properties: {
            explicacion: { type: "string", description: "Explicación clara" },
          },
          required: ["explicacion"],
        },
        failureMode: "ask_clarification",
      });

      if (llmResult.kind === "ok") {
        return llmResult.data.explicacion;
      }
    } catch (_llmErr) {
      // Continuar al siguiente fallback
    }
  }

  // Nivel 3: Fallback genérico
  const reason = ctx.error.trace.reason || ctx.error.message;
  return reason && !/Error|at Object|stack/i.test(reason)
    ? reason
    : "No se pudo completar la acción con las reglas actuales. " +
      "Revise permisos, documentos o saldos pendientes.";
}
