/**
 * Revisor de seguridad — tipos del pase final (revisa configuración, no el motor).
 */

export type SecurityFindingKind =
  | "sod_violation"
  | "least_privilege"
  | "excessive_force"
  | "pii_unnecessary"
  | "automation_overprivilege"
  | "fraud_sequence";

export type SecuritySeverity = "critical" | "major" | "minor";

export interface SecurityStepRef {
  readonly roleId?: string;
  readonly transitionIds?: readonly string[];
  readonly ruleIds?: readonly string[];
  readonly field?: string;
  readonly sequenceId?: string;
}

export interface Layer1ChangeProposal {
  readonly id: string;
  readonly findingId: string;
  /** Descripción de qué cambiar en políticas (capa 1). Nunca aplicada. */
  readonly description: string;
  /** Borrador de permiso a retirar o restringir (informativo). */
  readonly suggestedPermissionPatch?: {
    readonly removeRoleFromTransitions?: Readonly<
      Record<string, readonly string[]>
    >;
    readonly revokeForceRoles?: readonly string[];
    readonly revokeVisibilityFields?: readonly string[];
  };
}

export interface SecurityFinding {
  readonly id: string;
  readonly kind: SecurityFindingKind;
  readonly severity: SecuritySeverity;
  readonly message: string;
  readonly step: SecurityStepRef;
  /** Secuencia de transiciones que demuestra el hallazgo (si aplica). */
  readonly demonstration: readonly string[];
  readonly proposal: Layer1ChangeProposal;
}

export interface SecurityReport {
  readonly version: string;
  readonly caseId: string;
  readonly ranAt: string;
  readonly durationMs: number;
  readonly findings: readonly SecurityFinding[];
  readonly deliveryBlocked: boolean;
  /** Propuestas agregadas; el Revisor NUNCA las aplica. */
  readonly proposals: readonly Layer1ChangeProposal[];
}

export class SecurityDeliveryBlockedError extends Error {
  constructor(
    message: string,
    readonly report: SecurityReport,
  ) {
    super(message);
    this.name = "SecurityDeliveryBlockedError";
  }
}

/** Máximo de roles distintos con force_grant antes de alertar. */
export const MAX_FORCE_ROLES = 2;
