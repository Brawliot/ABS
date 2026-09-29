/**
 * Priorizador — decide qué Insights se muestran, cuándo y con qué urgencia.
 */

/** Niveles de urgencia cerrados (MVP). */
export type UrgencyLevel =
  | "interrumpir"
  | "destacar"
  | "mostrar_en_contexto"
  | "solo_bajo_consulta";

export const URGENCY_RANK: Readonly<Record<UrgencyLevel, number>> = {
  interrumpir: 3,
  destacar: 2,
  mostrar_en_contexto: 1,
  solo_bajo_consulta: 0,
};

export const URGENCY_BY_RANK: readonly UrgencyLevel[] = [
  "solo_bajo_consulta",
  "mostrar_en_contexto",
  "destacar",
  "interrumpir",
];

export const DEFAULT_INTERRUPT_LIMIT_PER_DAY = 3;

export interface PrioritizerConfig {
  /** Límite global de interrupciones por persona y día. */
  readonly defaultInterruptLimitPerDay: number;
  /** Override por rol (se usa el mínimo entre roles del lector). */
  readonly interruptLimitByRole: Readonly<Record<string, number>>;
  /** Observaciones mínimas antes de demotar por ignorados. */
  readonly minObservationsForLearning: number;
  /** Si ignoreRate ≥ este umbral → baja un nivel. */
  readonly ignoreRateDemotionThreshold: number;
  /**
   * Umbrales de puntuación (score ≥ umbral → ese nivel o superior).
   * Orden: interrumpir > destacar > contexto > resto consulta.
   */
  readonly scoreThresholds: {
    readonly interrumpir: number;
    readonly destacar: number;
    readonly mostrar_en_contexto: number;
  };
  /** Multiplicadores base por tipo de Insight. */
  readonly typeWeights: Readonly<Record<string, number>>;
}

export const DEFAULT_PRIORITIZER_CONFIG: PrioritizerConfig = {
  defaultInterruptLimitPerDay: DEFAULT_INTERRUPT_LIMIT_PER_DAY,
  interruptLimitByRole: {
    gerente: 5,
    finanzas: 4,
    vendedor: 3,
    cliente: 1,
  },
  minObservationsForLearning: 10,
  ignoreRateDemotionThreshold: 0.9,
  scoreThresholds: {
    interrumpir: 0.72,
    destacar: 0.48,
    mostrar_en_contexto: 0.28,
  },
  typeWeights: {
    alerta: 1.0,
    diagnostico: 0.85,
    recomendacion: 0.75,
    prevision: 0.65,
    optimizacion: 0.55,
    metrica: 0.4,
    experimento: 0.35,
  },
};

export interface PrioritizedInsight {
  readonly insightId: string;
  readonly urgency: UrgencyLevel;
  /** Puntuación [0, ~1+] antes de límites. */
  readonly score: number;
  readonly demotedByLearning: boolean;
  readonly complianceFloorApplied: boolean;
  readonly interruptDeferred: boolean;
}

export interface PrioritizeResult {
  readonly items: readonly PrioritizedInsight[];
  readonly interruptCount: number;
  readonly interruptLimit: number;
}

export class PrioritizerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrioritizerError";
  }
}

export function demoteUrgency(level: UrgencyLevel): UrgencyLevel {
  const rank = URGENCY_RANK[level];
  if (rank <= 0) return "solo_bajo_consulta";
  return URGENCY_BY_RANK[rank - 1]!;
}

export function maxUrgency(
  a: UrgencyLevel,
  b: UrgencyLevel,
): UrgencyLevel {
  return URGENCY_RANK[a] >= URGENCY_RANK[b] ? a : b;
}

export function minUrgency(
  a: UrgencyLevel,
  b: UrgencyLevel,
): UrgencyLevel {
  return URGENCY_RANK[a] <= URGENCY_RANK[b] ? a : b;
}
