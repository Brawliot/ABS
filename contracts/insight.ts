/**
 * Contrato Insight — capa 3 produce; Presentador (capa 2) consume.
 * La implementación de capa 3 vive fuera de este módulo; aquí solo el contrato.
 */

import type { EvidenceKind } from "../core/grammar.js";
import type { TenantId } from "../tenancy/index.js";

/** Tipos de Insight admitidos por el contrato. */
export type InsightType =
  | "metrica"
  | "alerta"
  | "diagnostico"
  | "prevision"
  | "recomendacion"
  | "optimizacion"
  | "experimento";

/** Elemento al que se refiere el Insight. */
export type InsightSubjectKind =
  | "transaccion"
  | "parte"
  | "recurso"
  | "otro";

export interface InsightSubjectRef {
  readonly kind: InsightSubjectKind;
  readonly id: string;
  readonly tenantId: TenantId;
  readonly sedeId?: string;
  readonly equipoId?: string;
  readonly parteId?: string;
}

/**
 * Hecho base que justifica el Insight.
 * `fieldKey` opcional: clave usada por el Filtro (fiscal/personal/operativo).
 */
export interface InsightFact {
  readonly id: string;
  readonly label: string;
  readonly value: string | number | boolean;
  readonly fieldKey?: string;
}

/**
 * Acción sugerida: transición propuesta por la vía normal
 * Intérprete → Juez (el Presentador no ejecuta).
 */
export interface InsightSuggestedAction {
  readonly transitionId: string;
  readonly label: string;
  readonly evidenceKind?: EvidenceKind;
  readonly evidenceReference?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}

/** Variantes de experimento A/B (asignación determinista en Presentador). */
export interface InsightExperimentSpec {
  readonly experimentId: string;
  readonly variants: readonly string[];
}

/**
 * Insight — contrato estable capa 3 → Presentador.
 * Ningún Insight se muestra sin `baseFacts` no vacío (tras Filtro).
 */
export interface Insight {
  readonly id: string;
  readonly type: InsightType;
  readonly subject: InsightSubjectRef;
  readonly title: string;
  readonly summary: string;
  /** Datos que lo justifican — obligatorios para mostrarlo. */
  readonly baseFacts: readonly InsightFact[];
  /** Confianza [0, 1]. */
  readonly confidence: number;
  readonly generatedAt: string;
  /** Tras esta fecha el Presentador no lo muestra. */
  readonly expiresAt: string;
  readonly suggestedAction?: InsightSuggestedAction;
  readonly experiment?: InsightExperimentSpec;
  /** Pistas de colocación (capa 3); el Presentador las resuelve contra UiSpec. */
  readonly preferredModuleId?: string;
  readonly preferredViewId?: string;
  /**
   * Impacto estimado (p. ej. valor de la transacción afectada).
   * Lo usa el Priorizador para puntuar urgencia.
   */
  readonly estimatedImpact?: number;
  /**
   * True si la alerta deriva de Cumplimiento: el Priorizador no la baja
   * del nivel "destacar".
   */
  readonly complianceDerived?: boolean;
}

/** Versión del contrato Insight. */
export const INSIGHT_CONTRACT_VERSION = "1.0.0-mvp";

export function assertInsightContract(insight: Insight): void {
  if (!insight.id) throw new Error("Insight sin id");
  if (!insight.baseFacts || insight.baseFacts.length === 0) {
    throw new Error(
      `Insight ${insight.id}: contrato exige hechos base no vacíos`,
    );
  }
  if (insight.confidence < 0 || insight.confidence > 1) {
    throw new Error(`Insight ${insight.id}: confianza fuera de [0,1]`);
  }
  if (Date.parse(insight.expiresAt) <= Date.parse(insight.generatedAt)) {
    throw new Error(
      `Insight ${insight.id}: expiresAt debe ser posterior a generatedAt`,
    );
  }
  if (
    insight.experiment &&
    insight.experiment.variants.length === 0
  ) {
    throw new Error(
      `Insight ${insight.id}: experimento sin variantes`,
    );
  }
}
