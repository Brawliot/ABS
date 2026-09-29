/**
 * Interfaz de lectura formal para capa 3 y Priorizador.
 * Sin acceso al almacén ni mutaciones.
 */

import { acceptanceRateByVariant } from "./aggregates.js";
import { responseStatsByInsightType } from "./type-stats.js";
import type { InsightTypeResponseStats } from "./type-stats.js";
import { pseudonymize } from "./privacy.js";
import type { InsightResponseStore } from "./store.js";
import type {
  InsightResponseOutcome,
  InsightResponseRecord,
  VariantAcceptanceStats,
} from "./types.js";

/** Vista DTO (misma forma que el registro, sin mutadores). */
export type InsightResponseView = Readonly<InsightResponseRecord>;

export interface ResponseQuery {
  readonly insightId?: string;
  readonly outcome?: InsightResponseOutcome;
  readonly experimentId?: string;
  readonly experimentVariant?: string;
  readonly audiencePseudoId?: string;
  readonly correlationPseudoId?: string;
}

/**
 * Puerto de solo lectura — capa 3 y Priorizador.
 */
export interface ResponseRegistrarReadPort {
  responses(query?: ResponseQuery): readonly InsightResponseView[];
  byInsight(insightId: string): readonly InsightResponseView[];
  /** Relaciona con correlación de impresión (id en claro → seudónimo). */
  byCorrelation(correlationId: string): readonly InsightResponseView[];
  acceptanceRateByVariant(
    experimentId: string,
  ): readonly VariantAcceptanceStats[];
  /** Tasas por tipo de Insight (Priorizador / aprendizaje). */
  statsByInsightType(): readonly InsightTypeResponseStats[];
  retainedCount(): number;
}

export function openResponseReader(
  store: InsightResponseStore,
): ResponseRegistrarReadPort {
  const readAll = () => store.all();

  const port: ResponseRegistrarReadPort = {
    responses(query?: ResponseQuery): readonly InsightResponseView[] {
      const q = query ?? {};
      return readAll().filter((r) => {
        if (q.insightId && r.insightId !== q.insightId) return false;
        if (q.outcome && r.outcome !== q.outcome) return false;
        if (q.experimentId && r.experimentId !== q.experimentId) return false;
        if (
          q.experimentVariant &&
          r.experimentVariant !== q.experimentVariant
        )
          return false;
        if (q.audiencePseudoId && r.audiencePseudoId !== q.audiencePseudoId)
          return false;
        if (
          q.correlationPseudoId &&
          r.correlationPseudoId !== q.correlationPseudoId
        )
          return false;
        return true;
      });
    },
    byInsight(insightId: string) {
      return store.byInsight(insightId);
    },
    byCorrelation(correlationId: string) {
      const pseudo = pseudonymize(correlationId);
      return readAll().filter((r) => r.correlationPseudoId === pseudo);
    },
    acceptanceRateByVariant(experimentId: string) {
      return acceptanceRateByVariant(readAll(), experimentId);
    },
    statsByInsightType() {
      return responseStatsByInsightType(readAll());
    },
    retainedCount() {
      return store.size();
    },
  };
  return Object.freeze(port);
}

export function assertResponseReadOnlyPort(port: unknown): void {
  if (port === null || typeof port !== "object") {
    throw new Error("Puerto Registrador inválido");
  }
  const o = port as Record<string, unknown>;
  if ("append" in o || "replace" in o || "recordShown" in o) {
    throw new Error("Capa 3/Priorizador no puede mutar el Registrador");
  }
  if (
    typeof o.responses !== "function" ||
    typeof o.acceptanceRateByVariant !== "function"
  ) {
    throw new Error("Puerto Registrador incompleto");
  }
}
