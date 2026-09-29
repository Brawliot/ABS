/**
 * Objetivos de capa 1: plazo (reloj del compromiso) y metas de volumen/valor/tasa.
 * Las metas se comparan con hechos y NUNCA bloquean una transición.
 */

import {
  addBusinessDuration,
  type CompiledCalendar,
} from "./calendario.js";

export type ClockStatus = "en_plazo" | "en_riesgo" | "vencido";

export type GoalKind = "volumen" | "valor" | "tasa";

/** Plazo hábil ligado a un compromiso estructural existente. */
export interface DeadlineObjective {
  readonly id: string;
  readonly kind: "plazo";
  /** Compromiso de capa 0 (no se crea; solo se anota el reloj). */
  readonly commitmentId: string;
  /** Duración hábil desde la creación / anclaje. */
  readonly businessDurationMs: number;
  /** Umbral de riesgo; por defecto el del calendario. */
  readonly atRiskBeforeMs?: number;
}

export interface MetricGoal {
  readonly id: string;
  readonly kind: GoalKind;
  readonly label: string;
  /** Hecho a comparar (catálogo). */
  readonly factId: string;
  readonly factParams: Readonly<Record<string, string>>;
  readonly op: "gte" | "lte" | "eq";
  readonly target: number;
}

export type ObjectiveDef = DeadlineObjective | MetricGoal;

export interface CompiledDeadline {
  readonly id: string;
  readonly kind: "plazo";
  readonly commitmentId: string;
  readonly businessDurationMs: number;
  readonly atRiskBeforeMs?: number;
}

export interface CompiledGoal {
  readonly id: string;
  readonly kind: GoalKind;
  readonly label: string;
  readonly factId: string;
  readonly factParams: Readonly<Record<string, string>>;
  readonly op: "gte" | "lte" | "eq";
  readonly target: number;
}

export interface CommitmentDeadline {
  readonly commitmentId: string;
  readonly objectiveId: string;
  readonly anchoredAt: string;
  readonly dueAt: string;
  readonly atRiskBeforeMs: number;
}

export interface GoalEvaluation {
  readonly goalId: string;
  readonly kind: GoalKind;
  readonly target: number;
  readonly actual: number;
  readonly met: boolean;
  /** Informativo: las metas no alimentan guardas. */
  readonly blocksTransition: false;
}

export class ObjectiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectiveError";
  }
}

export function compileObjectives(defs: readonly ObjectiveDef[]): {
  readonly deadlines: readonly CompiledDeadline[];
  readonly goals: readonly CompiledGoal[];
} {
  const deadlines: CompiledDeadline[] = [];
  const goals: CompiledGoal[] = [];
  const ids = new Set<string>();

  for (const d of defs) {
    if (ids.has(d.id)) {
      throw new ObjectiveError(`Objetivo duplicado: ${d.id}`);
    }
    ids.add(d.id);
    if (d.kind === "plazo") {
      if (d.businessDurationMs <= 0) {
        throw new ObjectiveError(`Plazo ${d.id}: duración debe ser > 0`);
      }
      deadlines.push({
        id: d.id,
        kind: "plazo",
        commitmentId: d.commitmentId,
        businessDurationMs: d.businessDurationMs,
        ...(d.atRiskBeforeMs !== undefined
          ? { atRiskBeforeMs: d.atRiskBeforeMs }
          : {}),
      });
    } else {
      goals.push({
        id: d.id,
        kind: d.kind,
        label: d.label,
        factId: d.factId,
        factParams: d.factParams,
        op: d.op,
        target: d.target,
      });
    }
  }

  return {
    deadlines: Object.freeze(deadlines),
    goals: Object.freeze(goals),
  };
}

/**
 * Fija la fecha límite del compromiso usando el calendario (tiempo hábil).
 * Alimenta el reloj: en_plazo / en_riesgo / vencido.
 */
export function anchorDeadline(
  calendar: CompiledCalendar,
  deadline: CompiledDeadline,
  anchoredAt: string,
): CommitmentDeadline {
  const dueAt = addBusinessDuration(
    calendar,
    anchoredAt,
    deadline.businessDurationMs,
  );
  return {
    commitmentId: deadline.commitmentId,
    objectiveId: deadline.id,
    anchoredAt,
    dueAt,
    atRiskBeforeMs:
      deadline.atRiskBeforeMs ?? calendar.atRiskBeforeMs,
  };
}

export function clockStatus(
  deadline: CommitmentDeadline,
  nowIso: string,
): ClockStatus {
  const now = Date.parse(nowIso);
  const due = Date.parse(deadline.dueAt);
  if (now >= due) return "vencido";
  if (now >= due - deadline.atRiskBeforeMs) return "en_riesgo";
  return "en_plazo";
}

/**
 * Evalúa metas contra valores de hechos.
 * Nunca produce rechazo de transición (`blocksTransition` siempre false).
 */
export function evaluateGoals(
  goals: readonly CompiledGoal[],
  factValues: Readonly<Record<string, number>>,
): readonly GoalEvaluation[] {
  return goals.map((g) => {
    const key = `${g.factId}:${stableParams(g.factParams)}`;
    const actual = factValues[key] ?? factValues[g.id] ?? 0;
    const met = compare(actual, g.op, g.target);
    return {
      goalId: g.id,
      kind: g.kind,
      target: g.target,
      actual,
      met,
      blocksTransition: false as const,
    };
  });
}

function compare(
  actual: number,
  op: MetricGoal["op"],
  target: number,
): boolean {
  switch (op) {
    case "gte":
      return actual >= target;
    case "lte":
      return actual <= target;
    case "eq":
      return actual === target;
  }
}

function stableParams(params: Readonly<Record<string, string>>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}
