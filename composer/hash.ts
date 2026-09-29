/**
 * Hash canónico determinista de la salida del compositor.
 */

import { createHash } from "node:crypto";
import type { ComposerSuccess } from "./types.js";

function stable(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stable);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = stable(obj[k]);
  }
  return out;
}

/** Hash de la composición entregable (sin traces largas). */
export function hashComposerOutput(
  parts: Pick<
    ComposerSuccess,
    | "composition"
    | "processes"
    | "policyTemplates"
    | "visibility"
    | "questions"
    | "nonComposable"
    | "dominant"
  >,
): string {
  const payload = stable({
    dominant: parts.dominant,
    composition: parts.composition ?? null,
    processes: parts.processes,
    policyTemplates: parts.policyTemplates,
    visibility: parts.visibility,
    questions: parts.questions.map((q) => ({
      id: q.id,
      field: q.field,
    })),
    nonComposable: parts.nonComposable.map((n) => ({
      extension: n.extension,
      field: n.field ?? null,
    })),
  });
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 16);
}
