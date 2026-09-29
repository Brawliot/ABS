/**
 * Registro de llamadas LLM — sin datos personales.
 */

import { randomUUID } from "node:crypto";
import type {
  LlmCallKind,
  LlmCallLogEntry,
  LlmComponentId,
  LlmProviderId,
  LlmTokenUsage,
} from "./types.js";

export type LlmLogSink = (entry: LlmCallLogEntry) => void;

const memoryLog: LlmCallLogEntry[] = [];

export function memoryLogSink(entry: LlmCallLogEntry): void {
  memoryLog.push(entry);
}

export function getMemoryLog(): readonly LlmCallLogEntry[] {
  return memoryLog;
}

export function clearMemoryLog(): void {
  memoryLog.length = 0;
}

export function createCallLogEntry(input: {
  readonly componentId: LlmComponentId;
  readonly callKind: LlmCallKind;
  readonly provider: LlmProviderId;
  readonly model: string;
  readonly modelVersion: string;
  readonly durationMs: number;
  readonly usage: LlmTokenUsage;
  readonly estimatedCostUsd: number;
  readonly validation: LlmCallLogEntry["validation"];
  readonly outcome: LlmCallLogEntry["outcome"];
  readonly userContentHash: string;
  readonly cassetteId?: string;
}): LlmCallLogEntry {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    componentId: input.componentId,
    callKind: input.callKind,
    provider: input.provider,
    model: input.model,
    modelVersion: input.modelVersion,
    durationMs: input.durationMs,
    usage: input.usage,
    estimatedCostUsd: input.estimatedCostUsd,
    validation: input.validation,
    outcome: input.outcome,
    userContentHash: input.userContentHash,
    ...(input.cassetteId !== undefined
      ? { cassetteId: input.cassetteId }
      : {}),
  };
}

/** Garantiza que el log no arrastra PII obvia en campos de texto. */
export function assertLogHasNoPii(entry: LlmCallLogEntry): void {
  const blob = JSON.stringify(entry);
  if (
    /@|\bES\d{2}\d{4}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(blob) &&
    /@/.test(blob)
  ) {
    // Permitir solo si no parece email (hashes/uuid pueden tener @? no)
    if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(blob)) {
      throw new Error("LlmCallLogEntry contiene email — PII prohibida en log");
    }
  }
}
