/**
 * Interfaz formal de lectura para la capa 3 (inteligencia).
 * La capa 3 solo obtiene agregados / DTOs — nunca el almacén.
 */

import { buildRecorridoFunnel, topAbandonmentPoints } from "./funnel.js";
import { pseudonymize } from "./privacy.js";
import type { ExperienceTelemetryStore } from "./store.js";
import type {
  FunnelStepStats,
  InsightImpression,
  RecorridoFunnel,
} from "./types.js";

export interface InsightImpressionQuery {
  readonly recorridoId?: string;
  readonly insightId?: string;
  readonly surfaceId?: string;
  readonly subjectPseudoId?: string;
  readonly correlationPseudoId?: string;
}

/**
 * Puerto de solo lectura hacia telemetría agregada.
 * Sin `append`, sin referencia al `ExperienceTelemetryStore`.
 */
export interface Layer3PresentationIntelligence {
  funnelFor(
    recorridoId: string,
    stepOrder: readonly string[],
  ): RecorridoFunnel;

  topAbandonments(
    recorridoId: string,
    stepOrder: readonly string[],
    limit?: number,
  ): readonly FunnelStepStats[];

  /**
   * Insights mostrados: qué (`insightId`), dónde (`surfaceId`),
   * a quién (`subjectPseudoId`) — para el Registrador de respuesta.
   */
  insightImpressions(
    query?: InsightImpressionQuery,
  ): readonly InsightImpression[];

  /** Relaciona impresiones con un id de correlación en claro (se seudonimiza). */
  impressionsForCorrelation(
    correlationId: string,
  ): readonly InsightImpression[];

  /** Número de registros retenidos (métrica, no dump). */
  retainedCount(): number;
}

function toImpression(
  r: {
    readonly id: string;
    readonly at: string;
    readonly insightId?: string;
    readonly insightSurfaceId?: string;
    readonly insightPlacement?: string;
    readonly subjectPseudoId: string;
    readonly sessionPseudoId: string;
    readonly tenantPseudoId: string;
    readonly recorridoId: string;
    readonly stepId: string;
    readonly correlationPseudoId?: string;
    readonly kind: string;
  },
): InsightImpression | null {
  if (r.kind !== "insight_shown" || !r.insightId || !r.insightSurfaceId) {
    return null;
  }
  return {
    recordId: r.id,
    at: r.at,
    insightId: r.insightId,
    surfaceId: r.insightSurfaceId,
    placement: r.insightPlacement ?? null,
    subjectPseudoId: r.subjectPseudoId,
    sessionPseudoId: r.sessionPseudoId,
    tenantPseudoId: r.tenantPseudoId,
    recorridoId: r.recorridoId,
    stepId: r.stepId,
    correlationPseudoId: r.correlationPseudoId ?? null,
  };
}

/**
 * Abre el puerto de capa 3. El almacén queda encapsulado en el cierre;
 * el valor devuelto no expone `append` ni el store.
 */
export function openLayer3Reader(
  store: ExperienceTelemetryStore,
): Layer3PresentationIntelligence {
  const readAll = () => store.all();

  const port: Layer3PresentationIntelligence = {
    funnelFor(
      recorridoId: string,
      stepOrder: readonly string[],
    ): RecorridoFunnel {
      return buildRecorridoFunnel(recorridoId, readAll(), stepOrder);
    },
    topAbandonments(
      recorridoId: string,
      stepOrder: readonly string[],
      limit = 5,
    ): readonly FunnelStepStats[] {
      return topAbandonmentPoints(
        buildRecorridoFunnel(recorridoId, readAll(), stepOrder),
        limit,
      );
    },
    insightImpressions(
      query?: InsightImpressionQuery,
    ): readonly InsightImpression[] {
      const q = query ?? {};
      return readAll()
        .map(toImpression)
        .filter((x): x is InsightImpression => x !== null)
        .filter((imp) => {
          if (q.recorridoId && imp.recorridoId !== q.recorridoId) return false;
          if (q.insightId && imp.insightId !== q.insightId) return false;
          if (q.surfaceId && imp.surfaceId !== q.surfaceId) return false;
          if (q.subjectPseudoId && imp.subjectPseudoId !== q.subjectPseudoId)
            return false;
          if (
            q.correlationPseudoId &&
            imp.correlationPseudoId !== q.correlationPseudoId
          )
            return false;
          return true;
        });
    },
    impressionsForCorrelation(
      correlationId: string,
    ): readonly InsightImpression[] {
      const pseudo = pseudonymize(correlationId);
      return readAll()
        .map(toImpression)
        .filter((x): x is InsightImpression => x !== null)
        .filter((imp) => imp.correlationPseudoId === pseudo);
    },
    retainedCount(): number {
      return store.size();
    },
  };
  return Object.freeze(port);
}

/** Comprueba en runtime que un valor es solo el puerto (sin almacén). */
export function assertLayer3ReadOnlyPort(port: unknown): void {
  if (port === null || typeof port !== "object") {
    throw new Error("Puerto capa 3 inválido");
  }
  const o = port as Record<string, unknown>;
  if ("append" in o) {
    throw new Error("Capa 3 no puede tener append sobre telemetría");
  }
  if ("purgeExpired" in o) {
    throw new Error("Capa 3 no puede purgar el almacén");
  }
  if (typeof o.funnelFor !== "function" || typeof o.insightImpressions !== "function") {
    throw new Error("Puerto capa 3 incompleto");
  }
}
