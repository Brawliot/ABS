/**
 * Políticas de capa 1 (declarativas) → reglas ejecutables de capa 0.
 *
 * El compilador NUNCA emite estados ni transiciones nuevas.
 * Solo: guardas, condiciones, cálculos, requisitos de evidencia, invariantes
 * y visibilidad (consultar).
 */

import type {
  ActorAttributes,
  OrganizationDef,
} from "./organization.js";
import type { CalendarDef, CompiledCalendar } from "./calendario.js";
import type {
  CompiledDeadline,
  CompiledGoal,
  ObjectiveDef,
} from "./objetivo.js";
import type { ClassificationDef } from "./clasificacion.js";

/** Roles mínimos de la empresa (capa 1). */
export interface RoleDef {
  readonly id: string;
  readonly label: string;
}

/** Predicado sobre un campo de la transacción / contexto. */
export interface FieldPredicate {
  readonly field: string;
  readonly op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "present" | "absent";
  readonly value?: number | string | boolean;
}

/** Selector de clasificación (Parte / Oferta / Recurso). */
export interface ClassificationSelector {
  readonly target: "parte" | "oferta" | "recurso";
  readonly dimension: "segmento" | "familia" | "categoria" | "zona";
  readonly value: string;
  /** Campo de la tx con el id del sujeto (p. ej. parte_id). */
  readonly subjectField: string;
}

/** Cálculo declarativo (precio, descuento, …). */
export interface FieldCalculation {
  readonly field: string;
  readonly op: "set" | "add" | "subtract" | "multiply";
  readonly value: number;
  /** Segmento legacy / alias de temporada comercial. */
  readonly segment?: string;
  /** Temporada del calendario (selector). */
  readonly season?: string;
  /** Solo aplica si el sujeto tiene la etiqueta. */
  readonly classification?: ClassificationSelector;
}

/** Aprobación por umbral → requisito de evidencia, no estado nuevo. */
export interface ThresholdApproval {
  readonly when: FieldPredicate;
  readonly requiredRole?: string;
  /** Exige que el aprobador sea el superior directo del actor sujeto. */
  readonly requiredDirectSuperior?: boolean;
  readonly transitionId?: string;
}

/** Cuándo se fija la regla respecto a versiones del RuleSet. */
export type RuleBindingMode = "at_create" | "on_state" | "live";

export interface RuleBindingDecl {
  readonly mode: RuleBindingMode;
  /** Obligatorio si mode === "on_state". */
  readonly stateId?: string;
}

export interface RuleBinding {
  readonly mode: RuleBindingMode;
  readonly stateId?: string;
}

export type PermissionAction = "consultar" | "ejecutar" | "aprobar" | "forzar";

export type VisibilityScope = "empresa" | "sede" | "equipo" | "propia";

export type PolicyKind = "permiso" | "politica" | "cumplimiento";

export interface PermissionPolicy {
  readonly id: string;
  readonly kind: "permiso";
  /** Por defecto "ejecutar" (compatibilidad). */
  readonly action?: PermissionAction;
  /** Obligatorio salvo action === "consultar". */
  readonly transitionId?: string;
  readonly allowedRoles: readonly string[];
  readonly visibility?: { readonly scope: VisibilityScope };
  readonly binding?: RuleBindingDecl;
}

export interface BusinessPolicy {
  readonly id: string;
  readonly kind: "politica";
  readonly transitionId: string;
  readonly segment?: string;
  readonly season?: string;
  readonly classification?: ClassificationSelector;
  readonly calculation?: FieldCalculation;
  readonly condition?: FieldPredicate;
  readonly approval?: ThresholdApproval;
  readonly requiredFacts?: readonly FactRequirement[];
  readonly factCondition?: FactBoundConditionDecl;
  /** Restricción: guarda de rechazo (aunque haya permisos). */
  readonly restriction?: FieldPredicate;
  readonly factRestriction?: FactBoundConditionDecl;
  readonly binding?: RuleBindingDecl;
}

export interface FactRequirement {
  readonly factId: string;
  readonly params: Readonly<Record<string, string>>;
}

export interface FactBoundConditionDecl {
  readonly factId: string;
  readonly params: Readonly<Record<string, string>>;
  readonly amountField?: string;
  readonly op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  readonly value: number;
}

export interface CompliancePolicy {
  readonly id: string;
  readonly kind: "cumplimiento";
  readonly transitionId: string;
  readonly requiredEvidence?: {
    readonly kind: "aceptacion" | "sistema" | "fisica";
    readonly referenceType?: string;
    readonly requiredRole?: string;
  };
  readonly invariant?: {
    readonly id: string;
    readonly predicate: string;
    readonly appliesInStates?: readonly string[];
    readonly description: string;
  };
  /**
   * Restricción de cumplimiento (máx. prioridad, nunca forzable).
   * Si el predicado se cumple → rechazo.
   */
  readonly restriction?: FieldPredicate;
  /**
   * Plazo legal sobre ancla temporal en campos (p. ej. desistimiento 14 días).
   * Mientras el plazo esté abierto, la transición de esta política se rechaza.
   */
  readonly legalDeadline?: {
    /** Campo ISO de ancla (p. ej. compra_at / cierre_at). */
    readonly anchorField: string;
    /** Duración legal en ms (14 días = 14*24*60*60*1000). */
    readonly durationMs: number;
    readonly description: string;
  };
  /** Conservación: solo documenta política; el borrado usa ParteIdentityStore. */
  readonly dataRetention?: {
    readonly description: string;
  };
  /**
   * Aviso de plazo (tpl.aviso_plazo): no bloquea; runtime emite Insight vía Priorizador.
   */
  readonly avisoPlazo?: {
    readonly diasAntes: number;
    readonly description: string;
  };
  readonly binding?: RuleBindingDecl;
}

export type Layer1Policy = PermissionPolicy | BusinessPolicy | CompliancePolicy;

export interface PolicyDocument {
  readonly id: string;
  readonly version: string;
  readonly companyId: string;
  readonly archetypeId: string;
  readonly roles: readonly RoleDef[];
  /** Organización: sede / equipo / jerarquía → atributos de Actor. */
  readonly organization?: OrganizationDef;
  /** Calendario laboral (horario, festivos, turnos, temporadas). */
  readonly calendar?: CalendarDef;
  /** Objetivos: plazos sobre compromisos y metas no bloqueantes. */
  readonly objectives?: readonly ObjectiveDef[];
  /** Semilla de clasificación (etiquetas Parte/Oferta/Recurso). */
  readonly classification?: ClassificationDef;
  readonly permissions?: readonly PermissionPolicy[];
  readonly policies?: readonly BusinessPolicy[];
  readonly compliance?: readonly CompliancePolicy[];
  readonly states?: unknown;
  readonly transitions?: unknown;
  readonly createState?: unknown;
  readonly addTransition?: unknown;
  readonly newStates?: unknown;
  readonly newTransitions?: unknown;
}

export const PRIORITY = {
  cumplimiento: 300,
  permiso: 200,
  /** Restricciones: tras permiso, antes que el resto de política blanda. */
  restriccion: 150,
  politica: 100,
} as const;

export type CompiledRuleKind =
  | "guard"
  | "condition"
  | "calculation"
  | "evidence_requirement"
  | "invariant"
  | "visibility"
  | "force_grant"
  | "legal_deadline";

interface CompiledRuleBase {
  readonly binding: RuleBinding;
  readonly requiredFacts?: readonly FactRequirement[];
}

export interface CompiledCondition extends CompiledRuleBase {
  readonly kind: "condition";
  readonly id: string;
  readonly priority: number;
  readonly transitionId: string;
  readonly predicate: FieldPredicate;
  readonly sourcePolicyId: string;
  readonly sourceKind: PolicyKind;
  readonly factBinding?: {
    readonly factId: string;
    readonly params: Readonly<Record<string, string>>;
    readonly amountField?: string;
  };
  /** true = restricción (rechazo duro). */
  readonly isRestriction?: boolean;
}

export interface CompiledGuard extends CompiledRuleBase {
  readonly kind: "guard";
  readonly id: string;
  readonly priority: number;
  readonly transitionId: string;
  readonly allowedRoles: readonly string[];
  readonly sourcePolicyId: string;
  readonly sourceKind: PolicyKind;
  readonly action: "ejecutar" | "aprobar";
}

export interface CompiledCalculation extends CompiledRuleBase {
  readonly kind: "calculation";
  readonly id: string;
  readonly priority: number;
  readonly transitionId: string;
  readonly calculation: FieldCalculation;
  readonly sourcePolicyId: string;
  readonly sourceKind: PolicyKind;
}

export interface CompiledEvidenceRequirement extends CompiledRuleBase {
  readonly kind: "evidence_requirement";
  readonly id: string;
  readonly priority: number;
  readonly transitionId: string;
  readonly evidenceKind: "aceptacion" | "sistema" | "fisica";
  readonly requiredRole?: string;
  readonly requiredDirectSuperior?: boolean;
  readonly referenceType?: string;
  readonly when?: FieldPredicate;
  readonly sourcePolicyId: string;
  readonly sourceKind: PolicyKind;
}

/** Plazo legal compilado → condición de rechazo mientras el plazo esté abierto. */
export interface CompiledLegalDeadline extends CompiledRuleBase {
  readonly kind: "legal_deadline";
  readonly id: string;
  readonly priority: number;
  readonly transitionId: string;
  readonly anchorField: string;
  readonly durationMs: number;
  readonly description: string;
  readonly sourcePolicyId: string;
  readonly sourceKind: "cumplimiento";
}

export interface CompiledInvariant extends CompiledRuleBase {
  readonly kind: "invariant";
  readonly id: string;
  readonly priority: number;
  readonly invariantId: string;
  readonly predicate: string;
  readonly appliesInStates: readonly string[];
  readonly description: string;
  readonly sourcePolicyId: string;
  readonly sourceKind: PolicyKind;
  readonly transitionId?: string;
}

/** Regla de visibilidad (consultar); no bloquea transiciones. */
export interface CompiledVisibility extends CompiledRuleBase {
  readonly kind: "visibility";
  readonly id: string;
  readonly priority: number;
  readonly allowedRoles: readonly string[];
  readonly visibilityScope: VisibilityScope;
  readonly sourcePolicyId: string;
  readonly sourceKind: "permiso";
}

/** Permiso de forzar (Observador); no es guarda de avance. */
export interface CompiledForceGrant extends CompiledRuleBase {
  readonly kind: "force_grant";
  readonly id: string;
  readonly priority: number;
  readonly transitionId: string;
  readonly allowedRoles: readonly string[];
  readonly sourcePolicyId: string;
  readonly sourceKind: "permiso";
}

export type CompiledRule =
  | CompiledGuard
  | CompiledCondition
  | CompiledCalculation
  | CompiledEvidenceRequirement
  | CompiledInvariant
  | CompiledVisibility
  | CompiledForceGrant
  | CompiledLegalDeadline;

export interface CompiledRuleSet {
  readonly version: string;
  readonly activationAt: string;
  readonly sourceDocumentId: string;
  readonly sourceDocumentVersion: string;
  readonly companyId: string;
  readonly archetypeId: string;
  readonly contentHash: string;
  readonly roles: readonly RoleDef[];
  readonly rules: readonly CompiledRule[];
  /** Directorio de actores compilado desde organization. */
  readonly actorDirectory: Readonly<Record<string, ActorAttributes>>;
  readonly calendar?: CompiledCalendar;
  readonly deadlines: readonly CompiledDeadline[];
  readonly goals: readonly CompiledGoal[];
}

export interface CompileCatalog {
  readonly transitionIds: readonly string[];
  readonly stateIds: readonly string[];
  readonly fieldNames: readonly string[];
}

export class PolicyCompileError extends Error {
  constructor(
    message: string,
    readonly code:
      | "FORBIDDEN_STRUCTURE"
      | "UNKNOWN_TRANSITION"
      | "UNKNOWN_FIELD"
      | "UNKNOWN_ROLE"
      | "UNKNOWN_STATE_REF"
      | "UNKNOWN_FACT"
      | "BAD_FACT_PARAMS"
      | "CONTRADICTION"
      | "SCHEMA"
      | "EMPTY"
      | "ORG"
      | "CALENDAR"
      | "OBJECTIVE",
  ) {
    super(message);
    this.name = "PolicyCompileError";
  }
}

/** Binding por defecto: cálculos al crear; permisos y resto en vivo. */
export function defaultBindingFor(
  kind: CompiledRuleKind,
  explicit?: RuleBindingDecl,
): RuleBinding {
  if (explicit) {
    return explicit.stateId !== undefined
      ? { mode: explicit.mode, stateId: explicit.stateId }
      : { mode: explicit.mode };
  }
  if (kind === "calculation") return { mode: "at_create" };
  return { mode: "live" };
}
