/**
 * Tipos del adaptador LLM común.
 * Ninguna salida se ejecuta directamente: pasa por validadores + Intérprete → Juez.
 */

import type { z } from "zod";

/** Componentes de IA que usarán el adaptador (conexión posterior). */
export type LlmComponentId =
  | "interpreter"
  | "consultant"
  | "redactor"
  | "designer"
  | "diagnosis";

/**
 * Tipos de llamada — cada uno documenta qué datos salen al proveedor (RGPD).
 * Ver `call-kinds.ts` / LLM-INFRA-REPORT.md.
 */
export type LlmCallKind =
  | "interpreter.extract_intent"
  | "consultant.extract_query"
  | "redactor.propose_copy"
  | "designer.propose_tokens"
  | "diagnosis.extract_answers";

/** Comportamiento ante fallo del proveedor / schema / timeout. */
export type FailureMode = "heuristic" | "ask_clarification" | "noop";

export type LlmProviderId = "openai" | "heuristic" | "cassette";

/** Modo operativo del cliente. */
export type LlmRuntimeMode = "live" | "record" | "replay";

export interface LlmTokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface LlmCompletionRequest {
  readonly componentId: LlmComponentId;
  readonly callKind: LlmCallKind;
  readonly system: string;
  /** Texto ya minimizado (sin PII innecesaria). */
  readonly user: string;
  readonly schemaName: string;
  /** JSON Schema para response_format del proveedor (si aplica). */
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly model?: string;
  readonly temperature?: number;
}

export interface LlmRawCompletion {
  readonly content: string;
  readonly model: string;
  /** Versión / snapshot del modelo si el proveedor la expone. */
  readonly modelVersion: string;
  readonly provider: LlmProviderId;
  readonly usage: LlmTokenUsage;
  readonly latencyMs: number;
}

export interface LlmAdapter {
  readonly id: LlmProviderId;
  complete(
    request: LlmCompletionRequest,
    signal?: AbortSignal,
  ): Promise<LlmRawCompletion>;
}

/** Envelope obligatorio: toda respuesta estructurada lleva confianza. */
export type WithConfidence<T> = T & { readonly confidence: number };

export interface LlmCallLogEntry {
  readonly id: string;
  readonly at: string;
  readonly componentId: LlmComponentId;
  readonly callKind: LlmCallKind;
  readonly provider: LlmProviderId;
  readonly model: string;
  readonly modelVersion: string;
  readonly durationMs: number;
  readonly usage: LlmTokenUsage;
  readonly estimatedCostUsd: number;
  readonly validation: "accepted" | "rejected" | "retry_accepted" | "retry_rejected";
  readonly outcome:
    | "ok"
    | "ask_clarification"
    | "heuristic_fallback"
    | "noop"
    | "provider_error"
    | "timeout"
    | "schema_error";
  /** Hash del user minimizado (no el texto). */
  readonly userContentHash: string;
  readonly cassetteId?: string;
}

export type LlmStructuredOutcome<T> =
  | {
      readonly kind: "ok";
      readonly data: WithConfidence<T>;
      readonly log: LlmCallLogEntry;
    }
  | {
      readonly kind: "ask_clarification";
      readonly reason: string;
      readonly data?: WithConfidence<T>;
      readonly log: LlmCallLogEntry;
    }
  | {
      readonly kind: "heuristic_fallback";
      readonly data: WithConfidence<T>;
      readonly log: LlmCallLogEntry;
    }
  | {
      readonly kind: "noop";
      readonly reason: string;
      readonly log: LlmCallLogEntry;
    }
  | {
      readonly kind: "error";
      readonly reason: string;
      readonly log: LlmCallLogEntry;
    };

export interface StructuredCallOptions<T extends z.ZodTypeAny> {
  readonly componentId: LlmComponentId;
  readonly callKind: LlmCallKind;
  readonly system: string;
  /**
   * Payload de usuario antes de minimizar.
   * Puede ser string o estructura; se aplica privacy.minimize.
   */
  readonly userPayload: unknown;
  readonly schema: T;
  readonly schemaName: string;
  /** JSON Schema enviado al proveedor (derivado o manual). */
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly failureMode: FailureMode;
  /** Fallback determinista si failureMode=heuristic. */
  readonly heuristic?: () => WithConfidence<z.infer<T>> | Promise<WithConfidence<z.infer<T>>>;
  readonly confidenceThreshold?: number;
  readonly timeoutMs?: number;
  readonly model?: string;
  /**
   * Si true, `userPayload` ya está minimizado (string u objeto serializable)
   * y no se vuelve a aplicar privacy.minimize.
   */
  readonly skipMinimize?: boolean;
}

export class LlmValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[],
  ) {
    super(message);
    this.name = "LlmValidationError";
  }
}

export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

export class LlmTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmTimeoutError";
  }
}
