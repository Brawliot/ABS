/**
 * Implementación real: OpenAI Chat Completions + JSON schema.
 * Configurable por OPENAI_API_KEY / ABS_LLM_MODEL.
 */

import {
  LlmProviderError,
  type LlmAdapter,
  type LlmCompletionRequest,
  type LlmRawCompletion,
} from "./types.js";

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export type OpenAiFetch = typeof fetch;

export interface OpenAiAdapterOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: OpenAiFetch;
}

export class OpenAiLlmAdapter implements LlmAdapter {
  readonly id = "openai" as const;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: OpenAiFetch;

  constructor(options: OpenAiAdapterOptions = {}) {
    const key = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    if (!key) {
      throw new LlmProviderError(
        "OpenAiLlmAdapter: falta OPENAI_API_KEY (o options.apiKey)",
      );
    }
    this.apiKey = key;
    this.defaultModel =
      options.model ?? process.env.ABS_LLM_MODEL ?? DEFAULT_OPENAI_MODEL;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(
    request: LlmCompletionRequest,
    signal?: AbortSignal,
  ): Promise<LlmRawCompletion> {
    const model = request.model ?? this.defaultModel;
    const started = Date.now();
    let res: Response;
    try {
      const init: RequestInit = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: request.temperature ?? 0,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.schemaName,
              strict: true,
              schema: request.jsonSchema,
            },
          },
        }),
      };
      if (signal) init.signal = signal;
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, init);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      throw new LlmProviderError(
        `OpenAI red: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    const latencyMs = Date.now() - started;
    const bodyText = await res.text();
    if (!res.ok) {
      throw new LlmProviderError(
        `OpenAI HTTP ${res.status}: ${bodyText.slice(0, 400)}`,
      );
    }

    let data: {
      model?: string;
      choices?: { message?: { content?: string | null } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    try {
      data = JSON.parse(bodyText) as typeof data;
    } catch {
      throw new LlmProviderError("OpenAI: respuesta no JSON");
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new LlmProviderError("OpenAI: sin content en choices[0]");
    }

    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;
    return {
      content,
      model: data.model ?? model,
      modelVersion: data.model ?? model,
      provider: "openai",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: data.usage?.total_tokens ?? promptTokens + completionTokens,
      },
      latencyMs,
    };
  }
}
