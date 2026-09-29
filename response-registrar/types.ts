/**
 * Registrador de respuesta — respuestas a Insights mostrados.
 * Almacén SEPARADO del EventStore; seudónimos como telemetría UX.
 */

export const RESPONSE_RETENTION_DAYS = 90;

/** Resultado de la respuesta humana (o del tiempo). */
export type InsightResponseOutcome =
  | "aceptado"
  | "rechazado"
  | "ignorado"
  | "caducado_sin_ver"
  | "pendiente";

/** Resultado final de la transición vinculada (si se aceptó). */
export type TransitionLinkResult = "exito" | "excepcion";

/**
 * Registro persistido (solo ids seudonimizados / ids de sistema).
 */
export interface InsightResponseRecord {
  readonly id: string;
  readonly insightId: string;
  readonly insightType: string;
  readonly outcome: InsightResponseOutcome;
  /** Momento del último cambio de outcome. */
  readonly outcomeAt: string;
  /** Primera visualización; null si caducó sin ver. */
  readonly shownAt: string | null;
  /** Plazo para actuar tras ver; pasado → ignorado. */
  readonly ignoreDeadlineAt: string | null;
  readonly audiencePseudoId: string;
  readonly subjectPseudoId: string;
  readonly tenantPseudoId: string;
  readonly sessionPseudoId: string | null;
  readonly correlationPseudoId: string | null;
  readonly experimentId: string | null;
  readonly experimentVariant: string | null;
  /** Transición solicitada al aceptar. */
  readonly transitionId: string | null;
  /** Evento de negocio resultante (id opaco). */
  readonly transitionEventId: string | null;
  readonly transitionResult: TransitionLinkResult | null;
}

export interface VariantAcceptanceStats {
  readonly experimentId: string;
  readonly variant: string;
  readonly shown: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly ignored: number;
  readonly acceptanceRate: number;
}

export class ResponseRegistrarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResponseRegistrarError";
  }
}

export class ResponsePrivacyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResponsePrivacyError";
  }
}
