/**
 * Adaptador heurístico / stand-in: no llama a red.
 * Usado por defecto en CI y como fallback (failureMode=heuristic).
 */

import type {
  LlmAdapter,
  LlmCompletionRequest,
  LlmRawCompletion,
} from "./types.js";

export type HeuristicResponder = (
  request: LlmCompletionRequest,
) => string | Promise<string>;

/**
 * Respuesta mínima válida con confianza media-alta (para smoke del adaptador).
 * Los componentes reales inyectarán su propio heuristicFn en LlmClient.
 */
export function defaultHeuristicContent(request: LlmCompletionRequest): string {
  void request;
  return JSON.stringify({
    confidence: 0.8,
    note: "heuristic_stand_in",
  });
}

export class HeuristicLlmAdapter implements LlmAdapter {
  readonly id = "heuristic" as const;
  private readonly responder: HeuristicResponder;

  constructor(responder?: HeuristicResponder) {
    this.responder = responder ?? defaultHeuristicContent;
  }

  async complete(
    request: LlmCompletionRequest,
    _signal?: AbortSignal,
  ): Promise<LlmRawCompletion> {
    const started = Date.now();
    const content = await this.responder(request);
    const latencyMs = Date.now() - started;
    const promptTokens = Math.ceil(
      (request.system.length + request.user.length) / 4,
    );
    const completionTokens = Math.ceil(content.length / 4);
    return {
      content,
      model: "heuristic",
      modelVersion: "heuristic-1",
      provider: "heuristic",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      latencyMs,
    };
  }
}
