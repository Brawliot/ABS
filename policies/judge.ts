/**
 * Juez (MVP): aplica un CompiledRuleSet como guardas del pipeline de transición.
 *
 * Orden: Cumplimiento → Permiso → Política → guardas existentes del núcleo.
 * No sustituye assertCanAdvance ni la composición; las invoca al final.
 */

import {
  assertCanAdvance,
  DerivationError,
  type AdvanceCommand,
  type DerivedState,
} from "../core/derivation.js";
import type { EvidenceRecord, TransitionEvent } from "../core/events.js";
import type { ActorKind } from "../core/grammar.js";
import type { Lifecycle, Transition } from "../core/lifecycle.js";
import { selectEffectiveRules } from "./compiler.js";
import { isDirectSuperior } from "./organization.js";
import {
  activeSeasonId,
  type CompiledCalendar,
} from "./calendario.js";
import {
  subjectMatchesClassification,
  type ClassificationSnapshot,
} from "./clasificacion.js";
import {
  evaluateGoals,
  type GoalEvaluation,
} from "./objetivo.js";
import type {
  CompiledCalculation,
  CompiledCondition,
  CompiledEvidenceRequirement,
  CompiledGuard,
  CompiledInvariant,
  CompiledLegalDeadline,
  CompiledRule,
  CompiledRuleSet,
  FactRequirement,
  FieldPredicate,
  VisibilityScope,
} from "./types.js";
import type { FactBag, FactRequest } from "../facts/provider.js";
import { sealAgainstEventStore } from "../facts/provider.js";
import type { FactParams } from "../facts/catalog.js";
import type { TenantId } from "../tenancy/index.js";
import { judgeLogger } from "./judge-logger.js";

/** Campos de la transacción / contexto de negocio (capa 1). */
export type TransactionFields = Readonly<Record<string, unknown>>;

export interface JudgeActor {
  readonly id: string;
  readonly kind: ActorKind;
  /** Roles de empresa del actor que ejecuta. */
  readonly roles: readonly string[];
}

/**
 * Evidencia vista por el Juez (extiende la del núcleo sin mutarla).
 * referenceType: tipado lógico (factura, …).
 * evidencingRoles: roles de quien aporta la evidencia (aprobación).
 */
export interface JudgeEvidence extends EvidenceRecord {
  readonly referenceType?: string;
  readonly evidencingRoles?: readonly string[];
  /** Actor que aporta la evidencia (aprobación / superior). */
  readonly evidencingActorId?: string;
}

export interface GuardContext {
  readonly transactionId: string;
  readonly currentStateId: string;
  readonly fields: TransactionFields;
  readonly transitionId: string;
  readonly actor: JudgeActor;
  /**
   * Actor sujeto de la transacción (jerarquía / superior directo).
   * Por defecto = actor ejecutor.
   */
  readonly subjectActorId: string;
  readonly evidence: JudgeEvidence;
  readonly ruleSet: CompiledRuleSet;
  readonly segment?: string;
  /** Hechos entregados por el Proveedor (nunca el EventStore). */
  readonly facts?: FactBag;
  readonly tenantId?: TenantId;
  /** Instantánea ISO para plazos legales. */
  readonly now: string;
}

export type GuardVerdict =
  | { readonly ok: true; readonly ruleId: string; readonly reason: string }
  | {
      readonly ok: false;
      readonly ruleId: string;
      readonly reason: string;
    };

/** Función pura y determinista: una regla → veredicto. */
export type PolicyGuardFn = (ctx: GuardContext) => GuardVerdict;

export type GuardPhase =
  | "cumplimiento"
  | "permiso"
  | "politica"
  | "nucleo";

export interface GuardEvaluationRecord {
  readonly phase: GuardPhase;
  readonly ruleId: string;
  readonly result: "accepted" | "rejected" | "skipped";
  readonly reason: string;
}

export interface JudgeTrace {
  readonly at: string;
  readonly subjectId: string;
  readonly transitionId: string;
  readonly ruleSetVersion: string;
  readonly ruleSetContentHash: string;
  readonly guardsEvaluated: readonly GuardEvaluationRecord[];
  readonly result: "accepted" | "rejected";
  readonly reason: string;
  readonly appliedRuleId: string | null;
  readonly calculations: Readonly<Record<string, number>>;
  /** Valores exactos de hechos usados y posición del flujo. */
  readonly factsUsed?: Readonly<
    Record<
      string,
      {
        readonly value: number;
        readonly version: number;
        readonly streamPosition: number;
      }
    >
  >;
  readonly factsStreamPosition?: number;
}

export class JudgeRejectionError extends Error {
  constructor(
    message: string,
    readonly trace: JudgeTrace,
  ) {
    super(message);
    this.name = "JudgeRejectionError";
  }
}

export interface PolicyEventData {
  readonly calculations: Readonly<Record<string, number>>;
  readonly fieldsAfter: TransactionFields;
  readonly ruleSetVersion: string;
  readonly ruleSetContentHash: string;
  /** Desviación si la transición se forzó saltando Permiso/Política. */
  readonly deviation?: ForcedDeviation;
}

/** Atributo de desviación embebido en el evento de transición. */
export interface ForcedDeviation {
  readonly kind: "forced_transition";
  readonly skippedRuleId: string;
  readonly skippedPhase: "permiso" | "politica";
  readonly ruleSetVersion: string;
  readonly ruleSetContentHash: string;
  readonly actorId: string;
  readonly reason: string;
}

/**
 * Intento de forzar tras rechazo de Permiso o Política.
 * Cumplimiento y núcleo nunca son forzables.
 */
export interface ForceOverride {
  /** Motivo en texto libre — obligatorio. */
  readonly reason: string;
  /** Reglas que este actor puede forzar explícitamente. */
  readonly allowedForceRuleIds: readonly string[];
}

export class ForceNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForceNotAllowedError";
  }
}

export interface JudgedAdvanceInput {
  readonly subjectId: string;
  readonly lifecycle: Lifecycle;
  readonly derived: DerivedState;
  readonly command: AdvanceCommand;
  readonly actor: JudgeActor;
  /** Actor sujeto (jerarquía). Por defecto = actor.id. */
  readonly subjectActorId?: string;
  readonly evidence: JudgeEvidence;
  readonly fields: TransactionFields;
  /** RuleSet vivo (permisos, restricciones, …). */
  readonly ruleSet: CompiledRuleSet;
  /**
   * Snapshot al crear la transacción (reglas `at_create`).
   * Si se omite, se usa `ruleSet`.
   */
  readonly creationRuleSet?: CompiledRuleSet;
  /** Snapshots fijados al entrar en cada estado (`on_state`). */
  readonly stateBoundRuleSets?: Readonly<Record<string, CompiledRuleSet>>;
  readonly segment?: string;
  readonly now?: string;
  /** Vía de forzado (solo Permiso/Política + permiso explícito + motivo). */
  readonly force?: ForceOverride;
  readonly tenantId?: TenantId;
  /** Bolsa de hechos preparada por el Proveedor (opcional). */
  readonly facts?: FactBag;
  /** Clasificación viva (etiquetas actuales). */
  readonly classification?: ClassificationSnapshot;
  /**
   * Clasificación al crear la tx (para cálculos `at_create` con selector).
   * Si se omite, se usa `classification`.
   */
  readonly creationClassification?: ClassificationSnapshot;
  /** Temporada forzada (si no, se deriva del calendario + now). */
  readonly seasonId?: string;
}

export interface JudgedAdvanceResult {
  readonly transition: Transition;
  readonly event: TransitionEvent;
  readonly fieldsAfter: TransactionFields;
  readonly calculations: Readonly<Record<string, number>>;
  readonly trace: JudgeTrace;
}

/**
 * Evalúa una sola regla compilada (función pura).
 * Cálculos no rechazan: se aplican aparte si todas las guardas pasan.
 */
export function evaluateCompiledRule(
  rule: CompiledRule,
  ctx: GuardContext,
): GuardVerdict {
  if (
    rule.kind !== "invariant" &&
    rule.kind !== "visibility" &&
    "transitionId" in rule &&
    rule.transitionId !== ctx.transitionId
  ) {
    return {
      ok: true,
      ruleId: rule.id,
      reason: `Regla ${rule.id} no aplica a ${ctx.transitionId}`,
    };
  }

  switch (rule.kind) {
    case "guard":
      return evaluatePermissionGuard(rule, ctx);
    case "condition":
      return evaluateCondition(rule, ctx);
    case "evidence_requirement":
      return evaluateEvidenceRequirement(rule, ctx);
    case "invariant":
      return evaluateInvariant(rule, ctx);
    case "calculation":
      return {
        ok: true,
        ruleId: rule.id,
        reason: `Cálculo ${rule.id} diferido a fase de aplicación`,
      };
    case "visibility":
      return {
        ok: true,
        ruleId: rule.id,
        reason: `Visibilidad ${rule.id} no bloquea transiciones`,
      };
    case "force_grant":
      return {
        ok: true,
        ruleId: rule.id,
        reason: `Force grant ${rule.id} se consulta vía Observador, no como guarda de avance`,
      };
    case "legal_deadline":
      return evaluateLegalDeadline(rule, ctx);
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

function evaluateLegalDeadline(
  rule: CompiledLegalDeadline,
  ctx: GuardContext,
): GuardVerdict {
  if (rule.transitionId !== ctx.transitionId) {
    return { ok: true, ruleId: rule.id, reason: "Plazo legal no aplica" };
  }
  const anchorRaw = ctx.fields[rule.anchorField];
  if (typeof anchorRaw !== "string" || !anchorRaw) {
    return {
      ok: false,
      ruleId: rule.id,
      reason: `Plazo legal: falta ancla "${rule.anchorField}" — ${rule.description}`,
    };
  }
  const due = Date.parse(anchorRaw) + rule.durationMs;
  const now = Date.parse(ctx.now);
  if (Number.isNaN(due) || Number.isNaN(now)) {
    return {
      ok: false,
      ruleId: rule.id,
      reason: `Plazo legal: fechas inválidas (${rule.anchorField})`,
    };
  }
  // Mientras el plazo legal esté abierto, esta transición (p. ej. rechazar devolución) se rechaza.
  if (now < due) {
    return {
      ok: false,
      ruleId: rule.id,
      reason: `Plazo legal abierto hasta ${new Date(due).toISOString()}: ${rule.description}`,
    };
  }
  return {
    ok: true,
    ruleId: rule.id,
    reason: `Plazo legal vencido; transición permitida (${rule.description})`,
  };
}

function evaluatePermissionGuard(
  rule: CompiledGuard,
  ctx: GuardContext,
): GuardVerdict {
  if (rule.transitionId !== ctx.transitionId) {
    return {
      ok: true,
      ruleId: rule.id,
      reason: `Permiso no aplica a ${ctx.transitionId}`,
    };
  }
  const ok = rule.allowedRoles.some((r) => ctx.actor.roles.includes(r));
  if (!ok) {
    return {
      ok: false,
      ruleId: rule.id,
      reason: `Actor sin rol requerido (exige uno de [${rule.allowedRoles.join(", ")}]; tiene [${ctx.actor.roles.join(", ") || "∅"}])`,
    };
  }
  return {
    ok: true,
    ruleId: rule.id,
    reason: `Permiso OK: rol autorizado para ${rule.transitionId}`,
  };
}

function evaluateCondition(
  rule: CompiledCondition,
  ctx: GuardContext,
): GuardVerdict {
  if (rule.transitionId !== ctx.transitionId) {
    return { ok: true, ruleId: rule.id, reason: "Condición no aplica" };
  }

  if (rule.factBinding) {
    if (!ctx.facts) {
      return {
        ok: false,
        ruleId: rule.id,
        reason: `Condición de hecho requiere FactBag (hecho ${rule.factBinding.factId})`,
      };
    }
    const params = resolveFactParams(rule.factBinding.params, ctx.fields);
    let left = ctx.facts.get(rule.factBinding.factId, params);
    if (rule.factBinding.amountField) {
      left += Number(ctx.fields[rule.factBinding.amountField] ?? 0);
    }
    const right = Number(rule.predicate.value);
    const matches = compareOp(left, rule.predicate.op, right);
    if (rule.isRestriction) {
      if (matches) {
        return {
          ok: false,
          ruleId: rule.id,
          reason: `Restricción: hecho ${rule.factBinding.factId} cumple ${rule.predicate.op} ${right} (eval=${left})`,
        };
      }
      return {
        ok: true,
        ruleId: rule.id,
        reason: `Restricción de hecho no activada (eval=${left})`,
      };
    }
    if (!matches) {
      return {
        ok: false,
        ruleId: rule.id,
        reason: `Condición de hecho fallida: ${rule.factBinding.factId}=${ctx.facts.get(rule.factBinding.factId, params)}${rule.factBinding.amountField ? `+${ctx.fields[rule.factBinding.amountField]}` : ""} ${rule.predicate.op} ${right} (eval=${left})`,
      };
    }
    return {
      ok: true,
      ruleId: rule.id,
      reason: `Condición de hecho OK (eval=${left} ${rule.predicate.op} ${right})`,
    };
  }

  if (
    rule.isRestriction &&
    rule.predicate.op !== "present" &&
    rule.predicate.op !== "absent"
  ) {
    const raw = ctx.fields[rule.predicate.field];
    if (raw === undefined || raw === null || raw === "") {
      return {
        ok: false,
        ruleId: rule.id,
        reason: `Restricción: falta dato "${rule.predicate.field}" requerido para evaluar la política`,
      };
    }
  }

  const matches = evalPredicate(rule.predicate, ctx.fields);
  if (rule.isRestriction) {
    if (matches) {
      return {
        ok: false,
        ruleId: rule.id,
        reason: `Restricción: ${predicateLabel(rule.predicate)}`,
      };
    }
    return {
      ok: true,
      ruleId: rule.id,
      reason: `Restricción no activada: ${predicateLabel(rule.predicate)}`,
    };
  }

  if (!matches) {
    return {
      ok: false,
      ruleId: rule.id,
      reason: `Condición fallida: ${predicateLabel(rule.predicate)}`,
    };
  }
  return {
    ok: true,
    ruleId: rule.id,
    reason: `Condición OK: ${predicateLabel(rule.predicate)}`,
  };
}

function compareOp(
  left: number,
  op: FieldPredicate["op"],
  right: number,
): boolean {
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    default:
      return false;
  }
}

/** Resuelve "$fields.x" contra campos de la transacción. */
export function resolveFactParams(
  params: Readonly<Record<string, string>>,
  fields: TransactionFields,
): FactParams {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v.startsWith("$fields.")) {
      const field = v.slice("$fields.".length);
      const raw = fields[field];
      out[k] = typeof raw === "number" ? raw : String(raw ?? "");
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Agrega FactRequest de todas las reglas aplicables a una transición. */
export function collectFactRequests(
  ruleSet: CompiledRuleSet,
  transitionId: string,
  fields: TransactionFields,
): FactRequest[] {
  const reqs: FactRequest[] = [];
  const seen = new Set<string>();
  for (const rule of ruleSet.rules) {
    const list: FactRequirement[] = [];
    if ("requiredFacts" in rule && rule.requiredFacts) {
      list.push(...rule.requiredFacts);
    }
    if (rule.kind === "condition" && rule.factBinding) {
      list.push({
        factId: rule.factBinding.factId,
        params: rule.factBinding.params,
      });
    }
    if (rule.kind !== "invariant" && "transitionId" in rule) {
      if (rule.transitionId !== transitionId) continue;
    }
    for (const r of list) {
      const params = resolveFactParams(r.params, fields);
      const key = `${r.factId}:${JSON.stringify(params)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      reqs.push({ factId: r.factId, params });
    }
  }
  return reqs;
}

function factsUsedFromBag(
  bag: FactBag | undefined,
): JudgeTrace["factsUsed"] | undefined {
  if (!bag) return undefined;
  const out: Record<
    string,
    { value: number; version: number; streamPosition: number }
  > = {};
  for (const [k, e] of Object.entries(bag.entries)) {
    out[k] = {
      value: e.value,
      version: e.version,
      streamPosition: e.streamPosition,
    };
  }
  return out;
}

function evaluateEvidenceRequirement(
  rule: CompiledEvidenceRequirement,
  ctx: GuardContext,
): GuardVerdict {
  if (rule.transitionId !== ctx.transitionId) {
    return { ok: true, ruleId: rule.id, reason: "Evidencia no aplica" };
  }

  if (rule.when) {
    const whenField = rule.when.field;
    const whenRaw = ctx.fields[whenField];
    if (
      whenRaw === undefined ||
      whenRaw === null ||
      whenRaw === ""
    ) {
      return {
        ok: false,
        ruleId: rule.id,
        reason: `Aprobación: falta dato "${whenField}" requerido para evaluar el umbral`,
      };
    }
    if (!evalPredicate(rule.when, ctx.fields)) {
      return {
        ok: true,
        ruleId: rule.id,
        reason: `Umbral no alcanzado (${predicateLabel(rule.when)}); requisito no activo`,
      };
    }
  }

  if (ctx.evidence.kind !== rule.evidenceKind) {
    return {
      ok: false,
      ruleId: rule.id,
      reason: `Evidencia de política: se exige kind=${rule.evidenceKind}; recibida=${ctx.evidence.kind}`,
    };
  }

  if (rule.referenceType) {
    const got =
      ctx.evidence.referenceType ??
      inferReferenceType(ctx.evidence.reference);
    if (got !== rule.referenceType) {
      return {
        ok: false,
        ruleId: rule.id,
        reason: `Evidencia de cumplimiento: se exige referenceType=${rule.referenceType}; recibida=${got ?? "∅"}`,
      };
    }
  }

  if (rule.requiredRole) {
    const roles = new Set([
      ...ctx.actor.roles,
      ...(ctx.evidence.evidencingRoles ?? []),
    ]);
    if (!roles.has(rule.requiredRole)) {
      return {
        ok: false,
        ruleId: rule.id,
        reason: `Se exige aceptación del rol "${rule.requiredRole}" (aprobación por umbral)`,
      };
    }
  }

  if (rule.requiredDirectSuperior) {
    const approverId = ctx.evidence.evidencingActorId ?? ctx.actor.id;
    if (
      !isDirectSuperior(
        ctx.ruleSet.actorDirectory,
        ctx.subjectActorId,
        approverId,
      )
    ) {
      const expected =
        ctx.ruleSet.actorDirectory[ctx.subjectActorId]?.reportsTo ?? "∅";
      return {
        ok: false,
        ruleId: rule.id,
        reason: `Se exige aprobación del superior directo de ${ctx.subjectActorId} (esperado=${expected}; recibida=${approverId})`,
      };
    }
  }

  return {
    ok: true,
    ruleId: rule.id,
    reason: `Requisito de evidencia OK (${rule.evidenceKind}${rule.requiredRole ? `/${rule.requiredRole}` : ""}${rule.requiredDirectSuperior ? "/superior-directo" : ""})`,
  };
}

function evaluateInvariant(
  rule: CompiledInvariant,
  ctx: GuardContext,
): GuardVerdict {
  if (
    rule.appliesInStates.length > 0 &&
    !rule.appliesInStates.includes(ctx.currentStateId)
  ) {
    return {
      ok: true,
      ruleId: rule.id,
      reason: `Invariante no aplica en estado ${ctx.currentStateId}`,
    };
  }

  const m = /^field_present:(.+)$/.exec(rule.predicate);
  if (m) {
    const field = m[1]!;
    const v = ctx.fields[field];
    if (v === undefined || v === null || v === "") {
      return {
        ok: false,
        ruleId: rule.id,
        reason: `Invariante ${rule.invariantId}: falta campo "${field}" — ${rule.description}`,
      };
    }
    return {
      ok: true,
      ruleId: rule.id,
      reason: `Invariante ${rule.invariantId} OK`,
    };
  }

  return {
    ok: true,
    ruleId: rule.id,
    reason: `Invariante ${rule.invariantId} (predicado no evaluado estructuralmente)`,
  };
}

/**
 * Aplica cálculos de política sobre una copia de campos (puro).
 * Selectores: segment, season, classification (Parte/Oferta/Recurso).
 */
export function applyCalculations(
  rules: readonly CompiledRule[],
  transitionId: string,
  fields: TransactionFields,
  options?: {
    readonly segment?: string;
    readonly seasonId?: string;
    readonly classification?: ClassificationSnapshot;
    readonly creationClassification?: ClassificationSnapshot;
  },
): { fieldsAfter: Record<string, unknown>; calculations: Record<string, number> } {
  const fieldsAfter: Record<string, unknown> = { ...fields };
  const calculations: Record<string, number> = {};
  const segment = options?.segment;
  const seasonId = options?.seasonId;
  const liveClass = options?.classification;
  const createClass = options?.creationClassification ?? liveClass;

  const calcs = rules.filter(
    (r): r is CompiledCalculation =>
      r.kind === "calculation" && r.transitionId === transitionId,
  );

  for (const rule of calcs) {
    const calc = rule.calculation;
    const labels =
      rule.binding.mode === "at_create" ? createClass : liveClass;

    if (calc.season !== undefined) {
      if (seasonId === undefined || calc.season !== seasonId) continue;
    }

    if (calc.classification) {
      if (!labels) continue;
      const subjectId = String(fields[calc.classification.subjectField] ?? "");
      if (
        !subjectMatchesClassification(labels, calc.classification, subjectId)
      ) {
        continue;
      }
    } else if (calc.segment !== undefined) {
      // Compat: segment como etiqueta de Parte.dimension=segmento, o match explícito
      if (labels) {
        const parteId = String(
          fields.parte_id ?? fields.parteId ?? "",
        );
        const byLabel =
          parteId !== "" &&
          subjectMatchesClassification(
            labels,
            {
              target: "parte",
              dimension: "segmento",
              value: calc.segment,
            },
            parteId,
          );
        const byArg = segment !== undefined && segment === calc.segment;
        if (!byLabel && !byArg) continue;
      } else {
        if (segment !== undefined && segment !== calc.segment) continue;
        if (segment === undefined) continue;
      }
    }

    const current = Number(fieldsAfter[calc.field] ?? 0);
    let next: number;
    switch (calc.op) {
      case "set":
        next = calc.value;
        break;
      case "add":
        next = current + calc.value;
        break;
      case "subtract":
        next = current - calc.value;
        break;
      case "multiply":
        next = current * calc.value;
        break;
    }
    fieldsAfter[calc.field] = next;
    calculations[calc.field] = next;
  }

  return { fieldsAfter, calculations };
}

function phaseOf(rule: CompiledRule): GuardPhase {
  if (rule.sourceKind === "cumplimiento") return "cumplimiento";
  if (rule.sourceKind === "permiso") return "permiso";
  return "politica";
}

const PHASE_ORDER: GuardPhase[] = ["cumplimiento", "permiso", "politica"];

/**
 * Evalúa todas las reglas de política aplicables en orden de prioridad de fase.
 * La primera que rechaza detiene; la traza incluye todas las evaluadas hasta ahí.
 * Los cálculos no se ejecutan aquí (solo se listan como skipped/deferred).
 * `skipRuleIds`: reglas ya forzadas (vía de forzado); no altera la lógica de cada guarda.
 */
export function evaluatePolicyGuards(
  ctx: GuardContext,
  options?: {
    readonly skipRuleIds?: ReadonlySet<string>;
    readonly skipReason?: string;
  },
): {
  readonly accepted: boolean;
  readonly evaluations: readonly GuardEvaluationRecord[];
  readonly appliedRuleId: string | null;
  readonly reason: string;
} {
  const skip = options?.skipRuleIds ?? new Set<string>();
  const skipReason =
    options?.skipReason ?? "Regla saltada por forzado autorizado";
  const applicable = [...ctx.ruleSet.rules]
    .filter(
      (r) =>
        r.kind !== "calculation" &&
        r.kind !== "visibility" &&
        r.kind !== "force_grant",
    )
    .sort((a, b) => {
      const pa = PHASE_ORDER.indexOf(phaseOf(a));
      const pb = PHASE_ORDER.indexOf(phaseOf(b));
      if (pa !== pb) return pa - pb;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id.localeCompare(b.id);
    });

  const evaluations: GuardEvaluationRecord[] = [];

  for (const rule of applicable) {
    if (skip.has(rule.id)) {
      evaluations.push({
        phase: phaseOf(rule),
        ruleId: rule.id,
        result: "skipped",
        reason: skipReason,
      });
      continue;
    }

    // Invariantes de cumplimiento: evaluar en la transición objetivo si aplica al estado actual
    if (rule.kind === "invariant") {
      const v = evaluateCompiledRule(rule, ctx);
      evaluations.push({
        phase: phaseOf(rule),
        ruleId: rule.id,
        result: v.ok ? "accepted" : "rejected",
        reason: v.reason,
      });
      if (!v.ok) {
        return {
          accepted: false,
          evaluations,
          appliedRuleId: rule.id,
          reason: v.reason,
        };
      }
      continue;
    }

    if (!("transitionId" in rule) || rule.transitionId !== ctx.transitionId) {
      continue;
    }

    const v = evaluateCompiledRule(rule, ctx);
    evaluations.push({
      phase: phaseOf(rule),
      ruleId: rule.id,
      result: v.ok ? "accepted" : "rejected",
      reason: v.reason,
    });
    if (!v.ok) {
      return {
        accepted: false,
        evaluations,
        appliedRuleId: rule.id,
        reason: v.reason,
      };
    }
  }

  return {
    accepted: true,
    evaluations,
    appliedRuleId: null,
    reason: "Todas las guardas de política aceptaron",
  };
}

/**
 * Pipeline juzgado: políticas primero, luego assertCanAdvance (núcleo).
 * Emite evento con cálculos y versión del RuleSet para reconstrucción.
 * Vía de forzado: solo Permiso/Política, con permiso explícito y motivo.
 */
export function attemptJudgedAdvance(
  input: JudgedAdvanceInput,
): JudgedAdvanceResult {
  const now = input.now ?? input.command.occurredAt;
  const effectiveRules = selectEffectiveRules({
    ruleSet: input.ruleSet,
    ...(input.creationRuleSet !== undefined
      ? { creationRuleSet: input.creationRuleSet }
      : {}),
    ...(input.stateBoundRuleSets !== undefined
      ? { stateBoundRuleSets: input.stateBoundRuleSets }
      : {}),
  });
  const effectiveRuleSet: CompiledRuleSet = {
    ...input.ruleSet,
    rules: effectiveRules,
    // Directorio: preferir el vivo (jerarquía actual) salvo que no exista
    actorDirectory:
      Object.keys(input.ruleSet.actorDirectory).length > 0
        ? input.ruleSet.actorDirectory
        : (input.creationRuleSet?.actorDirectory ??
          input.ruleSet.actorDirectory),
  };

  const ctxRaw: GuardContext = {
    transactionId: input.subjectId,
    currentStateId: input.derived.currentStateId,
    fields: input.fields,
    transitionId: input.command.transitionId,
    actor: input.actor,
    subjectActorId: input.subjectActorId ?? input.actor.id,
    evidence: input.evidence,
    ruleSet: effectiveRuleSet,
    now,
    ...(input.segment !== undefined ? { segment: input.segment } : {}),
    ...(input.facts !== undefined ? { facts: input.facts } : {}),
    ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
  };
  const ctx = sealAgainstEventStore(ctxRaw);
  const factsMeta = input.facts
    ? {
        factsUsed: factsUsedFromBag(input.facts)!,
        factsStreamPosition: input.facts.streamPosition,
      }
    : {};

  let policy = evaluatePolicyGuards(ctx);
  let deviation: ForcedDeviation | undefined;

  if (!policy.accepted) {
    const rejected = policy.evaluations.find((e) => e.result === "rejected");
    const phase = rejected?.phase;
    const ruleId = policy.appliedRuleId;

    if (!input.force) {
      const trace: JudgeTrace = {
        at: now,
        subjectId: input.subjectId,
        transitionId: input.command.transitionId,
        ruleSetVersion: input.ruleSet.version,
        ruleSetContentHash: input.ruleSet.contentHash,
        guardsEvaluated: policy.evaluations,
        result: "rejected",
        reason: policy.reason,
        appliedRuleId: policy.appliedRuleId,
        calculations: {},
        ...factsMeta,
      };
      judgeLogger.logRejected(trace, input.actor.id);
      throw new JudgeRejectionError(policy.reason, trace);
    }

    assertForceAllowed(input.force, phase, ruleId);

    const skipReason = `Forzada por ${input.actor.id}: ${input.force.reason.trim()}`;
    policy = evaluatePolicyGuards(ctx, {
      skipRuleIds: new Set([ruleId!]),
      skipReason,
    });

    if (!policy.accepted) {
      const nextPhase = policy.evaluations.find(
        (e) => e.result === "rejected",
      )?.phase;
      if (nextPhase === "cumplimiento" || nextPhase === "nucleo") {
        throw new ForceNotAllowedError(
          `Forzado rechazado: las guardas de ${nextPhase} nunca se pueden forzar`,
        );
      }
      const trace: JudgeTrace = {
        at: now,
        subjectId: input.subjectId,
        transitionId: input.command.transitionId,
        ruleSetVersion: input.ruleSet.version,
        ruleSetContentHash: input.ruleSet.contentHash,
        guardsEvaluated: policy.evaluations,
        result: "rejected",
        reason: policy.reason,
        appliedRuleId: policy.appliedRuleId,
        calculations: {},
        ...factsMeta,
      };
      throw new JudgeRejectionError(policy.reason, trace);
    }

    deviation = {
      kind: "forced_transition",
      skippedRuleId: ruleId!,
      skippedPhase: phase as "permiso" | "politica",
      ruleSetVersion: input.ruleSet.version,
      ruleSetContentHash: input.ruleSet.contentHash,
      actorId: input.actor.id,
      reason: input.force.reason.trim(),
    };
  }

  const { fieldsAfter, calculations } = applyCalculations(
    effectiveRules,
    input.command.transitionId,
    input.fields,
    (() => {
      const seasonId = resolveSeason(input);
      return {
        ...(input.segment !== undefined ? { segment: input.segment } : {}),
        ...(seasonId !== undefined ? { seasonId } : {}),
        ...(input.classification !== undefined
          ? { classification: input.classification }
          : {}),
        ...(input.creationClassification !== undefined
          ? { creationClassification: input.creationClassification }
          : {}),
      };
    })(),
  );

  // Tras políticas: guardas existentes del núcleo (nunca forzables)
  let transition: Transition;
  try {
    transition = assertCanAdvance(
      input.lifecycle,
      input.derived,
      input.command,
    );
  } catch (err) {
    const msg =
      err instanceof DerivationError || err instanceof Error
        ? err.message
        : String(err);
    const evaluations: GuardEvaluationRecord[] = [
      ...policy.evaluations,
      {
        phase: "nucleo",
        ruleId: "nucleo:assertCanAdvance",
        result: "rejected",
        reason: msg,
      },
    ];
    const trace: JudgeTrace = {
      at: now,
      subjectId: input.subjectId,
      transitionId: input.command.transitionId,
      ruleSetVersion: input.ruleSet.version,
      ruleSetContentHash: input.ruleSet.contentHash,
      guardsEvaluated: evaluations,
      result: "rejected",
      reason: msg,
      appliedRuleId: "nucleo:assertCanAdvance",
      calculations,
      ...factsMeta,
    };
    // Intento de forzar el núcleo: siempre falla
    if (input.force) {
      throw new ForceNotAllowedError(
        "Forzado rechazado: las guardas del núcleo nunca se pueden forzar",
      );
    }
    throw new JudgeRejectionError(msg, trace);
  }

  const nucleoEval: GuardEvaluationRecord = {
    phase: "nucleo",
    ruleId: "nucleo:assertCanAdvance",
    result: "accepted",
    reason: `Núcleo OK: ${transition.from}→${transition.to}`,
  };

  const policyData: PolicyEventData = {
    calculations,
    fieldsAfter,
    ruleSetVersion: input.ruleSet.version,
    ruleSetContentHash: input.ruleSet.contentHash,
    ...(deviation !== undefined ? { deviation } : {}),
  };

  const event: TransitionEvent = {
    id: input.command.eventId,
    kind: "transicion",
    subjectId: input.subjectId,
    occurredAt: input.command.occurredAt,
    actorId: input.command.actorId,
    actorKind: input.command.actorKind,
    evidence: {
      kind: input.evidence.kind,
      reference: input.evidence.reference,
      recordedAt: input.evidence.recordedAt,
    },
    transitionId: transition.id,
    fromStateId: transition.from,
    toStateId: transition.to,
    data: policyData as unknown as Record<string, unknown>,
  };

  const trace: JudgeTrace = {
    at: now,
    subjectId: input.subjectId,
    transitionId: transition.id,
    ruleSetVersion: input.ruleSet.version,
    ruleSetContentHash: input.ruleSet.contentHash,
    guardsEvaluated: [...policy.evaluations, nucleoEval],
    result: "accepted",
    reason: deviation
      ? `Aceptada con forzado de ${deviation.skippedRuleId}: ${deviation.reason}`
      : `Aceptada con RuleSet ${input.ruleSet.version}`,
    appliedRuleId: deviation?.skippedRuleId ?? null,
    calculations,
    ...factsMeta,
  };

  if (deviation) {
    judgeLogger.logForced(
      trace,
      input.actor.id,
      deviation.reason,
      deviation.skippedPhase,
    );
  } else {
    judgeLogger.logAccepted(trace, input.actor.id);
  }

  return { transition, event, fieldsAfter, calculations, trace };
}

/** Valida la vía de forzado (sin alterar la evaluación de la guarda). */
export function assertForceAllowed(
  force: ForceOverride,
  phase: GuardPhase | undefined,
  ruleId: string | null,
): void {
  if (!force.reason || force.reason.trim() === "") {
    throw new ForceNotAllowedError(
      "Forzado rechazado: el motivo en texto libre es obligatorio",
    );
  }
  if (phase === "cumplimiento" || phase === "nucleo") {
    throw new ForceNotAllowedError(
      `Forzado rechazado: las guardas de ${phase} nunca se pueden forzar`,
    );
  }
  if (phase !== "permiso" && phase !== "politica") {
    throw new ForceNotAllowedError(
      "Forzado rechazado: solo se pueden forzar Permiso o Política",
    );
  }
  if (!ruleId || !force.allowedForceRuleIds.includes(ruleId)) {
    throw new ForceNotAllowedError(
      `Forzado rechazado: sin permiso explícito de forzado para la regla ${ruleId ?? "?"}`,
    );
  }
}

/**
 * Reconstruye campos acumulando `data.fieldsAfter` / calculations de eventos.
 * Determinista: mismo historial ⇒ mismos campos.
 */
export function reconstructFieldsFromEvents(
  events: readonly TransitionEvent[],
  initial: TransactionFields = {},
): Record<string, unknown> {
  let fields: Record<string, unknown> = { ...initial };
  for (const ev of events) {
    if (ev.kind !== "transicion" || !ev.data) continue;
    const d = ev.data as Partial<PolicyEventData>;

    // Validar que fieldsAfter sea un objeto plano (sin funciones, símbolos, etc.)
    if (d.fieldsAfter && typeof d.fieldsAfter === "object") {
      if (!isValidFieldsObject(d.fieldsAfter)) {
        console.warn(
          `[WARN] reconstructFieldsFromEvents: fieldsAfter corrupto en evento ${ev.id}, saltando`
        );
        continue;
      }
      fields = { ...fields, ...d.fieldsAfter };
    } else if (d.calculations && typeof d.calculations === "object") {
      if (!isValidFieldsObject(d.calculations)) {
        console.warn(
          `[WARN] reconstructFieldsFromEvents: calculations corrupto en evento ${ev.id}, saltando`
        );
        continue;
      }
      fields = { ...fields, ...d.calculations };
    }
  }
  return fields;
}

/**
 * Valida que un objeto sea un diccionario plano de valores simples.
 * Rechaza funciones, símbolos, clases, etc.
 */
function isValidFieldsObject(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== "object") return false;
  if (Array.isArray(obj)) return false;
  if (obj.constructor !== Object) return false;

  for (const value of Object.values(obj)) {
    const t = typeof value;
    if (t === "function" || t === "symbol") return false;
    if (value !== null && typeof value === "object" && !isPlainValue(value)) {
      return false;
    }
  }
  return true;
}

/**
 * Valida que un valor sea un tipo primitivo permitido.
 */
function isPlainValue(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  const t = typeof val;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(val)) {
    return val.every((v) => isPlainValue(v));
  }
  if (t === "object" && val.constructor === Object) {
    return Object.values(val).every((v) => isPlainValue(v));
  }
  return false;
}

/**
 * Re-evalúa una transición histórica con el RuleSet que quedó en el evento.
 * Cambiar el RuleSet "actual" no altera el resultado si se pasa el histórico.
 */
export function evaluateWithEmbeddedRuleSet(
  input: Omit<JudgedAdvanceInput, "ruleSet"> & {
    readonly historicalRuleSet: CompiledRuleSet;
  },
): JudgedAdvanceResult {
  return attemptJudgedAdvance({
    ...input,
    ruleSet: input.historicalRuleSet,
  });
}

export function explainJudgeRejection(trace: JudgeTrace): string {
  const rejected = [...trace.guardsEvaluated]
    .reverse()
    .find((g) => g.result === "rejected");
  if (!rejected) return trace.reason;
  return (
    `Rechazo [${rejected.phase}] regla=${rejected.ruleId} ` +
    `ruleSet=${trace.ruleSetVersion} (${trace.ruleSetContentHash.slice(0, 8)}…): ` +
    `${rejected.reason}`
  );
}

function evalPredicate(
  pred: FieldPredicate,
  fields: TransactionFields,
): boolean {
  const raw = fields[pred.field];
  switch (pred.op) {
    case "present":
      return raw !== undefined && raw !== null && raw !== "";
    case "absent":
      return raw === undefined || raw === null || raw === "";
    case "eq":
      return raw === pred.value;
    case "neq":
      return raw !== pred.value;
    case "gt":
      return Number(raw) > Number(pred.value);
    case "gte":
      return Number(raw) >= Number(pred.value);
    case "lt":
      return Number(raw) < Number(pred.value);
    case "lte":
      return Number(raw) <= Number(pred.value);
    default:
      return false;
  }
}

function predicateLabel(pred: FieldPredicate): string {
  if (pred.op === "present" || pred.op === "absent") {
    return `${pred.field} ${pred.op}`;
  }
  return `${pred.field} ${pred.op} ${String(pred.value)}`;
}

function inferReferenceType(reference: string): string | undefined {
  const m = /^([a-zA-Z_][a-zA-Z0-9_]*):/.exec(reference);
  return m?.[1];
}

function resolveSeason(input: JudgedAdvanceInput): string | undefined {
  if (input.seasonId !== undefined) return input.seasonId;
  const cal = input.ruleSet.calendar;
  if (!cal) return undefined;
  const at = input.now ?? input.command.occurredAt;
  return activeSeasonId(cal, at);
}

/**
 * Evalúa metas del RuleSet contra hechos.
 * Informativo: NUNCA se usa como guarda (no bloquea transiciones).
 */
export function observeGoals(
  ruleSet: CompiledRuleSet,
  factValues: Readonly<Record<string, number>>,
): readonly GoalEvaluation[] {
  return evaluateGoals(ruleSet.goals, factValues);
}

/** Acceso tipado al calendario compilado. */
export function ruleSetCalendar(
  ruleSet: CompiledRuleSet,
): CompiledCalendar | undefined {
  return ruleSet.calendar;
}

/**
 * ¿Puede el actor consultar según reglas de visibilidad?
 * (Sin UI aún; define la regla de visibilidad compilada.)
 */
export function canActorConsult(
  ruleSet: CompiledRuleSet,
  actor: JudgeActor,
  scope: VisibilityScope,
  subjectAttrs?: {
    readonly sedeId?: string;
    readonly equipoId?: string;
    readonly actorId?: string;
  },
): boolean {
  const vis = ruleSet.rules.filter((r) => r.kind === "visibility");
  if (vis.length === 0) return true;
  const actorAttrs = ruleSet.actorDirectory[actor.id];
  for (const r of vis) {
    if (r.kind !== "visibility") continue;
    if (!r.allowedRoles.some((role) => actor.roles.includes(role))) continue;
    if (r.visibilityScope !== scope) continue;
    if (scope === "empresa") return true;
    if (scope === "sede") {
      if (
        actorAttrs &&
        subjectAttrs?.sedeId &&
        actorAttrs.sedeId === subjectAttrs.sedeId
      ) {
        return true;
      }
    }
    if (scope === "equipo") {
      if (
        actorAttrs &&
        subjectAttrs?.equipoId &&
        actorAttrs.equipoId === subjectAttrs.equipoId
      ) {
        return true;
      }
    }
    if (scope === "propia") {
      if (subjectAttrs?.actorId && actor.id === subjectAttrs.actorId) {
        return true;
      }
    }
  }
  return false;
}

/** Roles con force_grant sobre la transición (vía Observador). */
export function actorMayForceTransition(
  ruleSet: CompiledRuleSet,
  transitionId: string,
  actor: JudgeActor,
): boolean {
  return ruleSet.rules.some(
    (r) =>
      r.kind === "force_grant" &&
      r.transitionId === transitionId &&
      r.allowedRoles.some((role) => actor.roles.includes(role)),
  );
}
