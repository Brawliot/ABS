/**
 * Operaciones de registro: mostrado, aceptado, rechazado, ignorado, caducado.
 */

import type { InsightType } from "../contracts/insight.js";
import { buildResponseRecord } from "./privacy.js";
import type { InsightResponseStore } from "./store.js";
import {
  ResponseRegistrarError,
  type InsightResponseRecord,
  type TransitionLinkResult,
} from "./types.js";

const DEFAULT_IGNORE_MS = 24 * 60 * 60 * 1000;

function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

export interface RecordShownInput {
  readonly responseId: string;
  readonly insightId: string;
  readonly insightType: InsightType | string;
  readonly shownAt: string;
  readonly audienceKey: string;
  readonly subjectId: string;
  readonly tenantId: string;
  readonly sessionId?: string;
  readonly correlationId?: string;
  readonly experimentId?: string;
  readonly experimentVariant?: string;
  /** Plazo para actuar; por defecto 24h tras shownAt. */
  readonly ignoreAfterMs?: number;
  readonly ignoreDeadlineAt?: string;
}

/** Insight mostrado → outcome pendiente hasta actuar o vencer plazo. */
export function recordShown(
  store: InsightResponseStore,
  input: RecordShownInput,
): InsightResponseRecord {
  const ignoreDeadlineAt =
    input.ignoreDeadlineAt ??
    addMs(input.shownAt, input.ignoreAfterMs ?? DEFAULT_IGNORE_MS);

  const record = buildResponseRecord({
    id: input.responseId,
    insightId: input.insightId,
    insightType: input.insightType,
    outcome: "pendiente",
    outcomeAt: input.shownAt,
    shownAt: input.shownAt,
    ignoreDeadlineAt,
    audienceKey: input.audienceKey,
    subjectId: input.subjectId,
    tenantId: input.tenantId,
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.correlationId !== undefined
      ? { correlationId: input.correlationId }
      : {}),
    ...(input.experimentId !== undefined
      ? { experimentId: input.experimentId }
      : {}),
    ...(input.experimentVariant !== undefined
      ? { experimentVariant: input.experimentVariant }
      : {}),
  });
  store.append(record);
  return record;
}

export interface RecordAcceptedInput {
  readonly responseId: string;
  readonly at: string;
  readonly transitionId: string;
  readonly transitionEventId: string;
  readonly transitionResult?: TransitionLinkResult;
}

/** Aceptado: vincula transición (y resultado si ya existe). */
export function recordAccepted(
  store: InsightResponseStore,
  input: RecordAcceptedInput,
): InsightResponseRecord {
  const prev = store.get(input.responseId);
  if (!prev) {
    throw new ResponseRegistrarError(
      `No hay respuesta mostrada: ${input.responseId}`,
    );
  }
  if (prev.outcome !== "pendiente") {
    throw new ResponseRegistrarError(
      `Respuesta ${input.responseId} ya cerrada como ${prev.outcome}`,
    );
  }
  const next: InsightResponseRecord = {
    ...prev,
    outcome: "aceptado",
    outcomeAt: input.at,
    transitionId: input.transitionId,
    transitionEventId: input.transitionEventId,
    transitionResult: input.transitionResult ?? null,
  };
  store.replace(next);
  return next;
}

/** Vincula resultado final de la transición (éxito o excepción). */
export function linkTransitionResult(
  store: InsightResponseStore,
  input: {
    readonly responseId: string;
    readonly at: string;
    readonly transitionResult: TransitionLinkResult;
    readonly transitionEventId?: string;
  },
): InsightResponseRecord {
  const prev = store.get(input.responseId);
  if (!prev) {
    throw new ResponseRegistrarError(
      `No hay respuesta: ${input.responseId}`,
    );
  }
  if (prev.outcome !== "aceptado") {
    throw new ResponseRegistrarError(
      `Solo se vincula resultado a aceptados (era ${prev.outcome})`,
    );
  }
  const next: InsightResponseRecord = {
    ...prev,
    outcomeAt: input.at,
    transitionResult: input.transitionResult,
    transitionEventId:
      input.transitionEventId ?? prev.transitionEventId,
  };
  store.replace(next);
  return next;
}

export function recordRejected(
  store: InsightResponseStore,
  input: { readonly responseId: string; readonly at: string },
): InsightResponseRecord {
  const prev = store.get(input.responseId);
  if (!prev) {
    throw new ResponseRegistrarError(
      `No hay respuesta mostrada: ${input.responseId}`,
    );
  }
  if (prev.outcome !== "pendiente") {
    throw new ResponseRegistrarError(
      `Respuesta ${input.responseId} ya cerrada como ${prev.outcome}`,
    );
  }
  const next: InsightResponseRecord = {
    ...prev,
    outcome: "rechazado",
    outcomeAt: input.at,
  };
  store.replace(next);
  return next;
}

/**
 * Vistos sin actuar dentro del plazo → ignorado.
 * Devuelve cuántos se marcaron.
 */
export function sweepIgnored(
  store: InsightResponseStore,
  nowIso: string,
): readonly InsightResponseRecord[] {
  const marked: InsightResponseRecord[] = [];
  for (const r of store.all()) {
    if (r.outcome !== "pendiente") continue;
    if (!r.shownAt || !r.ignoreDeadlineAt) continue;
    if (Date.parse(nowIso) < Date.parse(r.ignoreDeadlineAt)) continue;
    const next: InsightResponseRecord = {
      ...r,
      outcome: "ignorado",
      outcomeAt: nowIso,
    };
    store.replace(next);
    marked.push(next);
  }
  return marked;
}

/**
 * Insight conocido que caducó sin haberse mostrado.
 */
export function recordExpiredUnseen(
  store: InsightResponseStore,
  input: {
    readonly responseId: string;
    readonly insightId: string;
    readonly insightType: InsightType | string;
    readonly expiredAt: string;
    readonly audienceKey: string;
    readonly subjectId: string;
    readonly tenantId: string;
    readonly experimentId?: string;
    readonly experimentVariant?: string;
  },
): InsightResponseRecord {
  const record = buildResponseRecord({
    id: input.responseId,
    insightId: input.insightId,
    insightType: input.insightType,
    outcome: "caducado_sin_ver",
    outcomeAt: input.expiredAt,
    shownAt: null,
    ignoreDeadlineAt: null,
    audienceKey: input.audienceKey,
    subjectId: input.subjectId,
    tenantId: input.tenantId,
    ...(input.experimentId !== undefined
      ? { experimentId: input.experimentId }
      : {}),
    ...(input.experimentVariant !== undefined
      ? { experimentVariant: input.experimentVariant }
      : {}),
  });
  store.append(record);
  return record;
}
