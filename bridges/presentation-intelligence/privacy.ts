/**
 * Seudonimización y validación anti-PII para telemetría UX.
 */

import { createHash } from "node:crypto";
import { FORBIDDEN_EVENT_PII_KEYS } from "../../policies/identity.js";
import {
  ExperiencePrivacyError,
  type ExperienceTelemetryRecord,
} from "./types.js";

const DEFAULT_SALT = "abs-experience-telemetry-v1";

/** Hash estable seudónimo (no reversible en el MVP). */
export function pseudonymize(
  value: string,
  salt: string = DEFAULT_SALT,
): string {
  return createHash("sha256")
    .update(`${salt}:${value}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

const EXTRA_FORBIDDEN_KEYS = [
  "actorId",
  "parteId",
  "freeText",
  "mensaje",
  "message",
  "displayName",
] as const;

const FORBIDDEN_KEY_SET = new Set(
  [...FORBIDDEN_EVENT_PII_KEYS, ...EXTRA_FORBIDDEN_KEYS].map((k) =>
    k.toLowerCase(),
  ),
);

const SCHEMA_KEYS = new Set([
  "sessionPseudoId",
  "subjectPseudoId",
  "tenantPseudoId",
  "recorridoId",
  "stepId",
  "id",
  "kind",
  "at",
  "dwellMs",
  "errorCode",
  "judgeRejectionCode",
  "insightId",
  "insightSurfaceId",
  "insightPlacement",
  "correlationPseudoId",
  "meta",
]);

function keyLooksLikePii(key: string): boolean {
  const lower = key.toLowerCase();
  if (FORBIDDEN_KEY_SET.has(lower)) return true;
  if (lower.includes("nombre") || lower.includes("email")) return true;
  if (lower === "phone" || lower.includes("telefono")) return true;
  return false;
}

function scanObject(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(value)) {
        throw new ExperiencePrivacyError(
          `Telemetría rechazada: posible email en claro en ${path}`,
        );
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanObject(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SCHEMA_KEYS.has(k)) {
      if (k === "meta") scanObject(v, path ? `${path}.meta` : "meta");
      continue;
    }
    if (keyLooksLikePii(k)) {
      throw new ExperiencePrivacyError(
        `Telemetría rechazada: clave PII "${k}" en ${path || "/"}`,
      );
    }
    scanObject(v, path ? `${path}.${k}` : k);
  }
}

/**
 * Rechaza registros con claves o valores que parezcan PII en claro.
 */
export function assertTelemetryPrivacy(
  record: ExperienceTelemetryRecord,
): void {
  scanObject(record, "");
  const json = JSON.stringify(record);
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(json)) {
    throw new ExperiencePrivacyError(
      "Telemetría rechazada: posible email en claro",
    );
  }
}

export function buildTelemetryRecord(input: {
  readonly id: string;
  readonly kind: ExperienceTelemetryRecord["kind"];
  readonly at: string;
  readonly sessionId: string;
  readonly actorOrParteId: string;
  readonly tenantId: string;
  readonly recorridoId: string;
  readonly stepId: string;
  readonly dwellMs?: number;
  readonly errorCode?: string;
  readonly judgeRejectionCode?: string;
  readonly insightId?: string;
  readonly insightSurfaceId?: string;
  readonly insightPlacement?: string;
  /** Id opaco de correlación (se seudonimiza). */
  readonly correlationId?: string;
  readonly meta?: Readonly<Record<string, string | number | boolean>>;
  readonly salt?: string;
}): ExperienceTelemetryRecord {
  const salt = input.salt ?? DEFAULT_SALT;
  const record: ExperienceTelemetryRecord = {
    id: input.id,
    kind: input.kind,
    at: input.at,
    sessionPseudoId: pseudonymize(input.sessionId, salt),
    subjectPseudoId: pseudonymize(input.actorOrParteId, salt),
    tenantPseudoId: pseudonymize(input.tenantId, salt),
    recorridoId: input.recorridoId,
    stepId: input.stepId,
    ...(input.dwellMs !== undefined ? { dwellMs: input.dwellMs } : {}),
    ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
    ...(input.judgeRejectionCode !== undefined
      ? { judgeRejectionCode: input.judgeRejectionCode }
      : {}),
    ...(input.insightId !== undefined ? { insightId: input.insightId } : {}),
    ...(input.insightSurfaceId !== undefined
      ? { insightSurfaceId: input.insightSurfaceId }
      : {}),
    ...(input.insightPlacement !== undefined
      ? { insightPlacement: input.insightPlacement }
      : {}),
    ...(input.correlationId !== undefined
      ? { correlationPseudoId: pseudonymize(input.correlationId, salt) }
      : {}),
    ...(input.meta !== undefined ? { meta: input.meta } : {}),
  };
  assertTelemetryPrivacy(record);
  return record;
}

/** Registra visualización de Insight (qué, dónde, a quién seudonimizado). */
export function buildInsightShownRecord(input: {
  readonly id: string;
  readonly at: string;
  readonly sessionId: string;
  readonly actorOrParteId: string;
  readonly tenantId: string;
  readonly recorridoId: string;
  readonly stepId: string;
  readonly insightId: string;
  readonly insightSurfaceId: string;
  readonly insightPlacement?: string;
  readonly correlationId?: string;
  readonly salt?: string;
}): ExperienceTelemetryRecord {
  return buildTelemetryRecord({
    id: input.id,
    kind: "insight_shown",
    at: input.at,
    sessionId: input.sessionId,
    actorOrParteId: input.actorOrParteId,
    tenantId: input.tenantId,
    recorridoId: input.recorridoId,
    stepId: input.stepId,
    insightId: input.insightId,
    insightSurfaceId: input.insightSurfaceId,
    ...(input.insightPlacement !== undefined
      ? { insightPlacement: input.insightPlacement }
      : {}),
    ...(input.correlationId !== undefined
      ? { correlationId: input.correlationId }
      : {}),
    ...(input.salt !== undefined ? { salt: input.salt } : {}),
  });
}
