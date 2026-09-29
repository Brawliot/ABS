/**
 * Misma política de seudonimización que la telemetría UX del puente.
 */

import { FORBIDDEN_EVENT_PII_KEYS } from "../policies/identity.js";
import { pseudonymize } from "../bridges/presentation-intelligence/privacy.js";
import {
  ResponsePrivacyError,
  type InsightResponseRecord,
} from "./types.js";

export { pseudonymize };

const SCHEMA_KEYS = new Set([
  "id",
  "insightId",
  "insightType",
  "outcome",
  "outcomeAt",
  "shownAt",
  "ignoreDeadlineAt",
  "audiencePseudoId",
  "subjectPseudoId",
  "tenantPseudoId",
  "sessionPseudoId",
  "correlationPseudoId",
  "experimentId",
  "experimentVariant",
  "transitionId",
  "transitionEventId",
  "transitionResult",
]);

const FORBIDDEN = new Set(
  [
    ...FORBIDDEN_EVENT_PII_KEYS,
    "actorId",
    "parteId",
    "email",
    "freeText",
    "mensaje",
    "message",
    "displayName",
  ].map((k) => k.toLowerCase()),
);

function scan(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") {
    if (
      typeof value === "string" &&
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(value)
    ) {
      throw new ResponsePrivacyError(
        `Respuesta rechazada: posible email en ${path}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scan(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SCHEMA_KEYS.has(k)) {
      continue;
    }
    if (FORBIDDEN.has(k.toLowerCase()) || k.toLowerCase().includes("email")) {
      throw new ResponsePrivacyError(
        `Respuesta rechazada: clave PII "${k}"`,
      );
    }
    scan(v, path ? `${path}.${k}` : k);
  }
}

export function assertResponsePrivacy(record: InsightResponseRecord): void {
  scan(record, "");
  const json = JSON.stringify(record);
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(json)) {
    throw new ResponsePrivacyError(
      "Respuesta rechazada: posible email en claro",
    );
  }
}

export function buildResponseRecord(input: {
  readonly id: string;
  readonly insightId: string;
  readonly insightType: string;
  readonly outcome: InsightResponseRecord["outcome"];
  readonly outcomeAt: string;
  readonly shownAt: string | null;
  readonly ignoreDeadlineAt: string | null;
  readonly audienceKey: string;
  readonly subjectId: string;
  readonly tenantId: string;
  readonly sessionId?: string;
  readonly correlationId?: string;
  readonly experimentId?: string;
  readonly experimentVariant?: string;
  readonly transitionId?: string;
  readonly transitionEventId?: string;
  readonly transitionResult?: InsightResponseRecord["transitionResult"];
}): InsightResponseRecord {
  const record: InsightResponseRecord = {
    id: input.id,
    insightId: input.insightId,
    insightType: input.insightType,
    outcome: input.outcome,
    outcomeAt: input.outcomeAt,
    shownAt: input.shownAt,
    ignoreDeadlineAt: input.ignoreDeadlineAt,
    audiencePseudoId: pseudonymize(input.audienceKey),
    subjectPseudoId: pseudonymize(input.subjectId),
    tenantPseudoId: pseudonymize(input.tenantId),
    sessionPseudoId: input.sessionId
      ? pseudonymize(input.sessionId)
      : null,
    correlationPseudoId: input.correlationId
      ? pseudonymize(input.correlationId)
      : null,
    experimentId: input.experimentId ?? null,
    experimentVariant: input.experimentVariant ?? null,
    transitionId: input.transitionId ?? null,
    transitionEventId: input.transitionEventId ?? null,
    transitionResult: input.transitionResult ?? null,
  };
  assertResponsePrivacy(record);
  return record;
}
