/**
 * Probador — tipos del informe de pase final del Generador.
 */

export type QaFindingKind =
  | "action_never_enabled"
  | "dead_end"
  | "recorrido_no_terminal"
  | "screen_no_exit"
  | "impossible_required_field";

export type QaSeverity = "critical" | "major" | "minor";

/** Paso exacto donde ocurre el hallazgo. */
export interface QaStepRef {
  readonly scenarioId?: string;
  readonly lifecycleId?: string;
  readonly stateId?: string;
  readonly transitionId?: string;
  readonly viewId?: string;
  readonly actionId?: string;
  readonly formId?: string;
  readonly fieldName?: string;
  readonly recorridoId?: string;
  readonly roleId?: string;
}

export interface QaFinding {
  readonly id: string;
  readonly kind: QaFindingKind;
  readonly severity: QaSeverity;
  readonly message: string;
  readonly step: QaStepRef;
}

export interface QaScenarioResult {
  readonly id: string;
  readonly label: string;
  readonly reachedTerminal: boolean;
  readonly terminalStateId: string | null;
  readonly rolesUsed: readonly string[];
  readonly transitionsApplied: readonly string[];
}

export interface QaReport {
  readonly version: string;
  readonly caseId: string;
  readonly ranAt: string;
  readonly durationMs: number;
  readonly findings: readonly QaFinding[];
  /** true si hay al menos un hallazgo crítico. */
  readonly deliveryBlocked: boolean;
  readonly scenarios: readonly QaScenarioResult[];
  readonly actionsEnabled: readonly string[];
  readonly statesVisited: readonly string[];
}

export class QaDeliveryBlockedError extends Error {
  constructor(
    message: string,
    readonly report: QaReport,
  ) {
    super(message);
    this.name = "QaDeliveryBlockedError";
  }
}

export const QA_MAX_DURATION_MS = 5 * 60 * 1000;
