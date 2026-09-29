/**
 * Cliente LLM: minimización → adaptador → validación Zod (reintento×1) → confianza → log.
 * Nunca inventa datos ante fallo: heuristic | ask_clarification | noop.
 */

import { z } from "zod";
import {
  CassetteLlmAdapter,
  defaultCassetteDir,
} from "./cassette.js";
import {
  resolveConfidenceThreshold,
  isAboveConfidenceThreshold,
} from "./confidence.js";
import { estimateCostUsd } from "./cost.js";
import { HeuristicLlmAdapter } from "./heuristic-adapter.js";
import {
  assertLogHasNoPii,
  createCallLogEntry,
  memoryLogSink,
  type LlmLogSink,
} from "./log.js";
import { OpenAiLlmAdapter } from "./openai-adapter.js";
import { createHash } from "node:crypto";
import { minimizePayload, type MinimizeOptions } from "./privacy.js";
import {
  LlmProviderError,
  LlmTimeoutError,
  LlmValidationError,
  type FailureMode,
  type LlmAdapter,
  type LlmCallLogEntry,
  type LlmComponentId,
  type LlmRawCompletion,
  type LlmRuntimeMode,
  type LlmStructuredOutcome,
  type StructuredCallOptions,
  type WithConfidence,
} from "./types.js";
import { parseAndValidate } from "./validate.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface LlmClientOptions {
  readonly adapter?: LlmAdapter;
  readonly mode?: LlmRuntimeMode;
  readonly cassetteDir?: string;
  readonly logSink?: LlmLogSink;
  readonly confidenceThresholds?: Partial<Record<LlmComponentId, number>>;
  readonly defaultTimeoutMs?: number;
  readonly minimizeOptions?: MinimizeOptions;
}

export class LlmClient {
  private readonly adapter: LlmAdapter;
  private readonly logSink: LlmLogSink;
  private readonly confidenceThresholds: Partial<
    Record<LlmComponentId, number>
  >;
  private readonly defaultTimeoutMs: number;
  private readonly minimizeOptions: MinimizeOptions | undefined;

  constructor(options: LlmClientOptions = {}) {
    this.logSink = options.logSink ?? memoryLogSink;
    this.confidenceThresholds = options.confidenceThresholds ?? {};
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.minimizeOptions = options.minimizeOptions;

    const mode = options.mode ?? "live";
    const base = options.adapter ?? new HeuristicLlmAdapter();
    if (mode === "record" || mode === "replay") {
      this.adapter = new CassetteLlmAdapter({
        inner: base,
        dir: options.cassetteDir ?? defaultCassetteDir(),
        mode,
      });
    } else {
      this.adapter = base;
    }
  }

  getAdapterId(): string {
    return this.adapter.id;
  }

  async completeStructured<T extends z.ZodTypeAny>(
    opts: StructuredCallOptions<T>,
  ): Promise<LlmStructuredOutcome<z.infer<T>>> {
    const started = Date.now();
    const minimized = opts.skipMinimize
      ? (() => {
          const text =
            typeof opts.userPayload === "string"
              ? opts.userPayload
              : JSON.stringify(opts.userPayload);
          return {
            text,
            redacted: [] as string[],
            contentHash: createHash("sha256")
              .update(text, "utf8")
              .digest("hex")
              .slice(0, 16),
          };
        })()
      : minimizePayload(opts.userPayload, this.minimizeOptions);
    const threshold = resolveConfidenceThreshold(
      opts.componentId,
      opts.confidenceThreshold,
      this.confidenceThresholds,
    );
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;

    const request = {
      componentId: opts.componentId,
      callKind: opts.callKind,
      system: opts.system,
      user: minimized.text,
      schemaName: opts.schemaName,
      jsonSchema: opts.jsonSchema,
      ...(opts.model !== undefined ? { model: opts.model } : {}),
    };

    let validation: LlmCallLogEntry["validation"] = "rejected";
    let raw: LlmRawCompletion | undefined;
    let lastError: unknown;

    const attempt = async (): Promise<WithConfidence<z.infer<T>>> => {
      raw = await this.completeWithTimeout(request, timeoutMs);
      return parseAndValidate(raw.content, opts.schema);
    };

    try {
      let data: WithConfidence<z.infer<T>>;
      try {
        data = await attempt();
        validation = "accepted";
      } catch (err) {
        if (!(err instanceof LlmValidationError)) throw err;
        lastError = err;
        // Reintento único tras fallo de esquema / JSON mal formado
        data = await attempt();
        validation = "retry_accepted";
      }

      const durationMs = Date.now() - started;
      const usage = raw!.usage;
      const log = this.emitLog({
        componentId: opts.componentId,
        callKind: opts.callKind,
        provider: raw!.provider,
        model: raw!.model,
        modelVersion: raw!.modelVersion,
        durationMs,
        usage,
        estimatedCostUsd: estimateCostUsd(raw!.model, usage),
        validation,
        outcome: isAboveConfidenceThreshold(data.confidence, threshold)
          ? "ok"
          : "ask_clarification",
        userContentHash: minimized.contentHash,
      });

      if (!isAboveConfidenceThreshold(data.confidence, threshold)) {
        return {
          kind: "ask_clarification",
          reason: `Confianza ${data.confidence} < umbral ${threshold} (${opts.componentId})`,
          data,
          log,
        };
      }
      return { kind: "ok", data, log };
    } catch (err) {
      lastError = err;
      if (err instanceof LlmValidationError) {
        validation = "retry_rejected";
      }
      return this.handleFailure({
        opts,
        minimizedHash: minimized.contentHash,
        started,
        raw,
        validation,
        err: lastError,
        failureMode: opts.failureMode,
      });
    }
  }

  private async completeWithTimeout(
    request: Parameters<LlmAdapter["complete"]>[0],
    timeoutMs: number,
  ): Promise<LlmRawCompletion> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.adapter.complete(request, controller.signal);
    } catch (err) {
      if (
        (err instanceof Error && err.name === "AbortError") ||
        controller.signal.aborted
      ) {
        throw new LlmTimeoutError(
          `LLM timeout tras ${timeoutMs}ms (${request.callKind})`,
        );
      }
      if (err instanceof LlmProviderError || err instanceof LlmTimeoutError) {
        throw err;
      }
      throw new LlmProviderError(
        err instanceof Error ? err.message : String(err),
        err,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async handleFailure<T extends z.ZodTypeAny>(input: {
    readonly opts: StructuredCallOptions<T>;
    readonly minimizedHash: string;
    readonly started: number;
    readonly raw: LlmRawCompletion | undefined;
    readonly validation: LlmCallLogEntry["validation"];
    readonly err: unknown;
    readonly failureMode: FailureMode;
  }): Promise<LlmStructuredOutcome<z.infer<T>>> {
    const durationMs = Date.now() - input.started;
    const usage = input.raw?.usage ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    const model = input.raw?.model ?? "unknown";
    const reason =
      input.err instanceof Error ? input.err.message : String(input.err);

    const outcomeBase =
      input.err instanceof LlmTimeoutError
        ? ("timeout" as const)
        : input.err instanceof LlmValidationError
          ? ("schema_error" as const)
          : ("provider_error" as const);

    if (input.failureMode === "heuristic" && input.opts.heuristic) {
      const data = await input.opts.heuristic();
      const log = this.emitLog({
        componentId: input.opts.componentId,
        callKind: input.opts.callKind,
        provider: input.raw?.provider ?? "heuristic",
        model: "heuristic",
        modelVersion: "heuristic-1",
        durationMs,
        usage,
        estimatedCostUsd: 0,
        validation: input.validation,
        outcome: "heuristic_fallback",
        userContentHash: input.minimizedHash,
      });
      return { kind: "heuristic_fallback", data, log };
    }

    if (input.failureMode === "ask_clarification") {
      const log = this.emitLog({
        componentId: input.opts.componentId,
        callKind: input.opts.callKind,
        provider: input.raw?.provider ?? "openai",
        model,
        modelVersion: input.raw?.modelVersion ?? model,
        durationMs,
        usage,
        estimatedCostUsd: estimateCostUsd(model, usage),
        validation: input.validation,
        outcome: "ask_clarification",
        userContentHash: input.minimizedHash,
      });
      return {
        kind: "ask_clarification",
        reason: `Fallo LLM: ${reason}`,
        log,
      };
    }

    // noop (o heuristic sin fn)
    const log = this.emitLog({
      componentId: input.opts.componentId,
      callKind: input.opts.callKind,
      provider: input.raw?.provider ?? "openai",
      model,
      modelVersion: input.raw?.modelVersion ?? model,
      durationMs,
      usage,
      estimatedCostUsd: estimateCostUsd(model, usage),
      validation: input.validation,
      outcome: input.failureMode === "noop" ? "noop" : outcomeBase,
      userContentHash: input.minimizedHash,
    });
    if (input.failureMode === "noop") {
      return { kind: "noop", reason, log };
    }
    return { kind: "error", reason, log };
  }

  private emitLog(
    partial: Omit<Parameters<typeof createCallLogEntry>[0], never>,
  ): LlmCallLogEntry {
    const entry = createCallLogEntry(partial);
    assertLogHasNoPii(entry);
    this.logSink(entry);
    return entry;
  }
}

/**
 * Factory desde entorno.
 * Por defecto: heuristic (CI/suite determinista).
 * OpenAI solo si ABS_LLM_PROVIDER=openai y hay OPENAI_API_KEY.
 */
export function createLlmClientFromEnv(
  overrides?: LlmClientOptions,
): LlmClient {
  const provider = (process.env.ABS_LLM_PROVIDER ?? "heuristic").toLowerCase();
  const mode = (process.env.ABS_LLM_MODE as LlmRuntimeMode | undefined) ?? "live";

  let adapter: LlmAdapter;
  if (provider === "openai") {
    adapter = new OpenAiLlmAdapter({
      ...(process.env.ABS_LLM_MODEL
        ? { model: process.env.ABS_LLM_MODEL }
        : {}),
    });
  } else {
    adapter = new HeuristicLlmAdapter();
  }

  return new LlmClient({
    adapter,
    mode: provider === "cassette" ? "replay" : mode,
    ...(process.env.ABS_LLM_CASSETTE_DIR
      ? { cassetteDir: process.env.ABS_LLM_CASSETTE_DIR }
      : {}),
    ...overrides,
  });
}
