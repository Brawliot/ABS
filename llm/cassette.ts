/**
 * Modo grabado: cassettes deterministas sin llamar al proveedor.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  LlmProviderError,
  type LlmAdapter,
  type LlmCompletionRequest,
  type LlmRawCompletion,
  type LlmRuntimeMode,
} from "./types.js";

export interface CassetteRecord {
  readonly id: string;
  readonly requestFingerprint: string;
  readonly recordedAt: string;
  readonly response: LlmRawCompletion;
}

export function cassetteFingerprint(request: LlmCompletionRequest): string {
  const payload = JSON.stringify({
    callKind: request.callKind,
    componentId: request.componentId,
    system: request.system,
    user: request.user,
    schemaName: request.schemaName,
    model: request.model ?? "",
  });
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 24);
}

export function cassettePath(dir: string, fingerprint: string): string {
  return join(dir, `${fingerprint}.json`);
}

export function loadCassette(
  dir: string,
  fingerprint: string,
): CassetteRecord | undefined {
  const path = cassettePath(dir, fingerprint);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as CassetteRecord;
}

export function saveCassette(dir: string, record: CassetteRecord): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    cassettePath(dir, record.requestFingerprint),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

/**
 * Decorador: replay desde disco, o live (+ record opcional) delegando al inner.
 */
export class CassetteLlmAdapter implements LlmAdapter {
  readonly id = "cassette" as const;
  private readonly inner: LlmAdapter;
  private readonly dir: string;
  private readonly mode: LlmRuntimeMode;

  constructor(options: {
    readonly inner: LlmAdapter;
    readonly dir: string;
    readonly mode: LlmRuntimeMode;
  }) {
    this.inner = options.inner;
    this.dir = options.dir;
    this.mode = options.mode;
  }

  async complete(
    request: LlmCompletionRequest,
    signal?: AbortSignal,
  ): Promise<LlmRawCompletion> {
    const fp = cassetteFingerprint(request);

    if (this.mode === "replay") {
      const hit = loadCassette(this.dir, fp);
      if (!hit) {
        throw new LlmProviderError(
          `Cassette miss (replay): ${fp} en ${this.dir}`,
        );
      }
      return {
        ...hit.response,
        provider: "cassette",
        latencyMs: 0,
      };
    }

    const raw = await this.inner.complete(request, signal);

    if (this.mode === "record") {
      saveCassette(this.dir, {
        id: fp,
        requestFingerprint: fp,
        recordedAt: new Date().toISOString(),
        response: raw,
      });
    }

    return raw;
  }
}

export function defaultCassetteDir(root = process.cwd()): string {
  return join(root, "tmp", "llm-cassettes");
}
