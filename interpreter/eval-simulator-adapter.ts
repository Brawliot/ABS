/**
 * Adaptador LLM de evaluación: responde con simulateInterpreterIntent.
 * NO es OpenAI. Solo para harness / corpus sintético.
 */

import type {
  LlmAdapter,
  LlmCompletionRequest,
  LlmRawCompletion,
} from "../llm/types.js";
import { simulateInterpreterIntentJson } from "./eval-simulator.js";
import type { ExtractContext } from "./types.js";

function contextFromUserPayload(user: string): {
  text: string;
  context: ExtractContext;
} {
  try {
    const parsed = JSON.parse(user) as {
      message?: string;
      subjectRef?: string;
      allowedTransitionIds?: string[];
      hasAttachments?: boolean;
      parteDirectory?: (
        | { ref: string; label: string }
        | { ref: string; tokens: string[] }
      )[];
    };
    const subjectId =
      parsed.subjectRef?.replace(/^subject:/, "") ?? "subject-unknown";
    const parteDirectory = (parsed.parteDirectory ?? []).map((p) => {
      if ("tokens" in p && Array.isArray(p.tokens)) {
        const label = p.tokens
          .map((tok) =>
            tok.length === 0
              ? tok
              : tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase(),
          )
          .join(" ");
        return { ref: p.ref, label };
      }
      return { ref: p.ref, label: (p as { label: string }).label };
    });
    return {
      text: parsed.message ?? user,
      context: {
        subjectId,
        allowedTransitionIds: parsed.allowedTransitionIds ?? [],
        hasAttachments: parsed.hasAttachments ?? false,
        ...(parteDirectory.length > 0 ? { parteDirectory } : {}),
      },
    };
  } catch {
    return {
      text: user,
      context: {
        subjectId: "subject-unknown",
        allowedTransitionIds: [],
        hasAttachments: false,
      },
    };
  }
}

export class EvalSimulatorLlmAdapter implements LlmAdapter {
  readonly id = "heuristic" as const; // mismo id de infra; log.outcome distingue

  async complete(request: LlmCompletionRequest): Promise<LlmRawCompletion> {
    const started = Date.now();
    const { text, context } = contextFromUserPayload(request.user);
    // Restaurar allowed desde request si el minimizer alteró JSON
    if (context.allowedTransitionIds.length === 0) {
      // intentar recuperar de system no; dejar vacío → simulador pedirá aclaración
    }
    const content = simulateInterpreterIntentJson(text, context);
    const latencyMs = Date.now() - started;
    return {
      content,
      model: "eval_simulator",
      modelVersion: "eval_simulator-1",
      provider: "heuristic",
      usage: {
        promptTokens: Math.ceil(request.user.length / 4),
        completionTokens: Math.ceil(content.length / 4),
        totalTokens: Math.ceil((request.user.length + content.length) / 4),
      },
      latencyMs,
    };
  }
}
