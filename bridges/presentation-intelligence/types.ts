/**
 * Puente presentación → inteligencia (capa 2 → capa 3).
 * Telemetría de recorridos + Insights; almacén SEPARADO del EventStore.
 */

export const TELEMETRY_RETENTION_DAYS = 90;

export type ExperienceEventKind =
  | "step_view"
  | "step_dwell"
  | "abandon"
  | "error"
  | "judge_rejection_shown"
  /** Insight mostrado en UI (qué / dónde / a quién seudonimizado). */
  | "insight_shown";

/** Registro de telemetría: solo ids seudonimizados, sin PII en claro. */
export interface ExperienceTelemetryRecord {
  readonly id: string;
  readonly kind: ExperienceEventKind;
  readonly at: string;
  /** Sesión seudonimizada (hash). */
  readonly sessionPseudoId: string;
  /** Actor/Parte seudonimizado — nunca id en claro. */
  readonly subjectPseudoId: string;
  readonly tenantPseudoId: string;
  readonly recorridoId: string;
  readonly stepId: string;
  /** ms en el paso (step_dwell). */
  readonly dwellMs?: number;
  readonly errorCode?: string;
  /** Motivo de rechazo del Juez (texto de sistema, sin PII). */
  readonly judgeRejectionCode?: string;
  /** Identificador del Insight mostrado (qué). */
  readonly insightId?: string;
  /** Superficie / vista / módulo donde se mostró (dónde). */
  readonly insightSurfaceId?: string;
  /** Colocación opaca (banner, panel, paso…). */
  readonly insightPlacement?: string;
  /**
   * Id de correlación seudonimizado para el Registrador de respuesta (capa 3).
   * Relaciona impresión ↔ respuesta sin PII.
   */
  readonly correlationPseudoId?: string;
  readonly meta?: Readonly<Record<string, string | number | boolean>>;
}

/** DTO de lectura: impresión de Insight (capa 3 / Registrador). */
export interface InsightImpression {
  readonly recordId: string;
  readonly at: string;
  readonly insightId: string;
  readonly surfaceId: string;
  readonly placement: string | null;
  readonly subjectPseudoId: string;
  readonly sessionPseudoId: string;
  readonly tenantPseudoId: string;
  readonly recorridoId: string;
  readonly stepId: string;
  readonly correlationPseudoId: string | null;
}

export interface FunnelStepStats {
  readonly stepId: string;
  readonly views: number;
  readonly abandons: number;
  readonly errors: number;
  readonly judgeRejections: number;
  readonly insightShown: number;
  readonly totalDwellMs: number;
}

export interface RecorridoFunnel {
  readonly recorridoId: string;
  readonly steps: readonly FunnelStepStats[];
  /** Paso con más abandonos (empate → primero en orden). */
  readonly topAbandonStepId: string | null;
  readonly totalSessionsApprox: number;
}

export class ExperiencePrivacyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExperiencePrivacyError";
  }
}

export class ExperienceStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExperienceStoreError";
  }
}
