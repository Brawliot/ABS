/**
 * Tipos del Compositor determinista (BusinessProfile → composición).
 */

import type { ArchetypeId, ComposedArchetypeSpec, SecondaryBinding } from "../archetypes/types.js";
import type { ProcessDecl } from "../contracts/business-profile/types.js";
import type { PolicyTemplateInvocation } from "../contracts/policy-templates/types.js";

export interface TraceEntry {
  readonly elementId: string;
  readonly elementKind:
    | "process"
    | "secondary"
    | "policy"
    | "visibility"
    | "question"
    | "non_composable"
    | "capacity"
    | "composition";
  readonly field: string;
  readonly ruleId: string;
  readonly decision: string;
  readonly value?: unknown;
}

export interface ComposerQuestion {
  readonly id: string;
  readonly field: string;
  readonly question: string;
  readonly oracleRule?: "FAIL_IF_COMPOSER_CHOOSES";
  readonly ruleId: string;
  /** ask = bloquea materialize; confirm = listada antes de materialize (default aplicado). */
  readonly kind?: "ask" | "confirm";
}

export interface VisibilityRequirement {
  readonly scope: "propia" | "equipo" | "empresa";
  readonly roles: readonly string[];
  readonly fields?: readonly string[];
  readonly ruleId: string;
}

export interface NonComposableItem {
  readonly extension: string;
  readonly reason: string;
  readonly field?: string;
  readonly ruleId: string;
}

export interface ComposerSuccess {
  readonly ok: true;
  readonly composition: ComposedArchetypeSpec | undefined;
  readonly processes: readonly ProcessDecl[];
  readonly policyTemplates: readonly PolicyTemplateInvocation[];
  readonly visibility: readonly VisibilityRequirement[];
  readonly questions: readonly ComposerQuestion[];
  readonly nonComposable: readonly NonComposableItem[];
  readonly traces: readonly TraceEntry[];
  /** Hitos validados (compromisos pagar + bloqueos de fase). */
  readonly milestones?: readonly import("../archetypes/milestones.js").HitoPagoSpec[];
  /** Hash canónico de la composición entregable (determinista). */
  readonly compositionHash: string;
  readonly dominant: ArchetypeId;
}

export interface ComposerFailure {
  readonly ok: false;
  readonly code: "INVALID_COMPOSITION" | "INCOMPLETE_PROFILE" | "CONTRADICTION";
  readonly message: string;
  readonly details: readonly string[];
  readonly traces: readonly TraceEntry[];
  readonly questions: readonly ComposerQuestion[];
}

export type ComposerResult = ComposerSuccess | ComposerFailure;

export type RuleAction =
  | {
      readonly type: "ask";
      readonly questionId: string;
      readonly field: string;
      readonly question: string;
      readonly oracleRule?: "FAIL_IF_COMPOSER_CHOOSES";
      readonly kind?: "ask" | "confirm";
    }
  | {
      readonly type: "add_secondary";
      readonly secondaryArchetypeId: ArchetypeId;
      /** Si se omite, se usa binding por defecto del dominante. */
      readonly bornInDominantState?: string;
      readonly bloquea?: string;
    }
  | {
      readonly type: "forbid_secondary";
      readonly secondaryArchetypeId: ArchetypeId;
      readonly reason: string;
    }
  | {
      readonly type: "add_policy";
      readonly plantilla: PolicyTemplateInvocation["plantilla"];
      readonly parametros: PolicyTemplateInvocation["parametros"];
      readonly idSuffix: string;
      readonly transitionId?: string;
    }
  | {
      readonly type: "add_process";
      readonly process: ProcessDecl;
    }
  | {
      readonly type: "set_visibility";
      readonly scope: VisibilityRequirement["scope"];
      readonly roles: readonly string[];
      readonly fields?: readonly string[];
    }
  | {
      readonly type: "mark_non_composable";
      readonly extension: string;
      readonly reason: string;
      readonly field?: string;
    }
  | {
      readonly type: "set_capacity";
      readonly mode: "cita_individual" | "plazas";
    }
  | {
      readonly type: "retention_before_close";
      readonly reason: string;
    };

export interface CompositionRule {
  readonly id: string;
  readonly description: string;
  /** Evaluador puro: true ⇒ aplicar then[]. */
  readonly when: string;
  readonly then: readonly RuleAction[];
}

export type { SecondaryBinding, ComposedArchetypeSpec, ProcessDecl };
