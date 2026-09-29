/**
 * Recorridos sintéticos: camino feliz y excepciones por arquetipo.
 */

import { isTerminalState, outgoing } from "../../core/lifecycle.js";
import type { Lifecycle, Transition } from "../../core/lifecycle.js";
import type { GeneratorInput, LifecycleSlice } from "../types.js";
import type { UiSpec } from "../../presentation/types.js";
import {
  createQaEngine,
  createSubject,
  type IsolatedEngine,
  type IsolatedSubject,
} from "./engine.js";
import {
  actorForTransition,
  allActors,
  makeEvidenceFactory,
  syntheticCreditFields,
  syntheticEvidence,
  syntheticUsers,
  type SyntheticUser,
} from "./synthetic.js";
import type { QaScenarioResult } from "./types.js";

export interface WalkContext {
  readonly engine: IsolatedEngine;
  readonly users: readonly SyntheticUser[];
  readonly now: string;
  readonly enabledActionIds: Set<string>;
  readonly visitedStates: Set<string>;
  readonly deadEndCandidates: {
    lifecycleId: string;
    stateId: string;
    subjectKey: string;
  }[];
}

export function createWalkContext(
  input: GeneratorInput,
  now: string,
): WalkContext {
  return {
    engine: createQaEngine(input.ruleSet),
    users: syntheticUsers(input.roles),
    now,
    enabledActionIds: new Set(),
    visitedStates: new Set(),
    deadEndCandidates: [],
  };
}

/**
 * Intenta aplicar una transición con cualquier usuario cuyo rol esté autorizado
 * (visibleRoles de la acción o todos si no hay filtro).
 */
export function tryTransitionWithRoles(
  ctx: WalkContext,
  subject: IsolatedSubject,
  transition: Transition,
  preferredRoleIds?: readonly string[],
): { ok: true; roleId: string } | { ok: false; reason: string } {
  const candidates = preferredRoleIds?.length
    ? ctx.users.filter((u) => preferredRoleIds.includes(u.roleId))
    : [...ctx.users];
  // Preferir roles con permiso; si vacío, probar todos
  const pool = candidates.length > 0 ? candidates : ctx.users;
  let lastReason = "sin roles";
  for (const user of pool) {
    const actor = actorForTransition(user, transition);
    const evidence = syntheticEvidence(
      transition,
      ctx.now,
      subject.events.length,
    );
    const fields =
      transition.id === "t_cerrar"
        ? { factura_id: "fac-qa-001" as const }
        : undefined;
    const r = ctx.engine.tryAdvance({
      subject,
      transitionId: transition.id,
      actor,
      evidence,
      now: ctx.now,
      eventId: `qa-${subject.subjectId}-${subject.events.length}-${transition.id}`,
      ...(fields ? { fields } : {}),
    });
    if (r.ok) {
      const d = ctx.engine.derived(subject);
      ctx.visitedStates.add(`${subject.lifecycleId}:${d.currentStateId}`);
      return { ok: true, roleId: user.roleId };
    }
    lastReason = r.reason;
  }
  return { ok: false, reason: lastReason };
}

function recordEnabledActions(
  ctx: WalkContext,
  spec: UiSpec,
  lifecycleId: string,
  transitionId: string,
): void {
  for (const a of spec.actions) {
    if (a.lifecycleId === lifecycleId && a.transitionId === transitionId) {
      ctx.enabledActionIds.add(a.id);
    }
  }
}

/**
 * Camino feliz de un lifecycle: sigue transiciones cuyo destino no es excepción,
 * priorizando las que avanzan hacia terminal_exito.
 */
export function walkHappyPath(
  ctx: WalkContext,
  slice: LifecycleSlice,
  spec: UiSpec,
  scenarioId: string,
  initialFields: Record<string, string | number | boolean>,
): QaScenarioResult {
  const subject = createSubject(
    `qa-${scenarioId}`,
    slice.id,
    slice.lifecycle,
    initialFields,
  );
  const rolesUsed: string[] = [];
  const transitionsApplied: string[] = [];
  const life = slice.lifecycle;

  const start = ctx.engine.derived(subject);
  ctx.visitedStates.add(`${slice.id}:${start.currentStateId}`);

  const maxSteps = life.transitions.length + 8;
  for (let i = 0; i < maxSteps; i++) {
    const d = ctx.engine.derived(subject);
    if (isTerminalState(life, d.currentStateId)) break;

    const outs = outgoing(life, d.currentStateId);
    const happy = preferHappy(outs, life);
    if (happy.length === 0) {
      ctx.deadEndCandidates.push({
        lifecycleId: slice.id,
        stateId: d.currentStateId,
        subjectKey: subject.subjectId,
      });
      break;
    }

    let advanced = false;
    for (const t of happy) {
      const action = spec.actions.find(
        (a) => a.lifecycleId === slice.id && a.transitionId === t.id,
      );
      const roles = action?.visibleRoles;
      const r = tryTransitionWithRoles(ctx, subject, t, roles);
      if (r.ok) {
        rolesUsed.push(r.roleId);
        transitionsApplied.push(t.id);
        recordEnabledActions(ctx, spec, slice.id, t.id);
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      // Ninguna salida aplicable → callejón
      ctx.deadEndCandidates.push({
        lifecycleId: slice.id,
        stateId: d.currentStateId,
        subjectKey: subject.subjectId,
      });
      break;
    }
  }

  const final = ctx.engine.derived(subject);
  const terminal = isTerminalState(life, final.currentStateId);
  return {
    id: scenarioId,
    label: `Camino feliz · ${slice.label ?? slice.archetypeId}`,
    reachedTerminal: terminal,
    terminalStateId: terminal ? final.currentStateId : null,
    rolesUsed: [...new Set(rolesUsed)],
    transitionsApplied,
  };
}

function preferHappy(
  outs: readonly Transition[],
  life: Lifecycle,
): Transition[] {
  const scored = outs.map((t) => {
    const to = life.states.find((s) => s.id === t.to);
    let score = 1;
    if (to?.kind === "terminal_exito") score = 3;
    else if (to?.kind === "terminal_excepcion") score = 0;
    else if (to?.kind === "intermedio" || to?.kind === "en_espera") score = 2;
    // Evitar bucles de renegociación en el camino feliz por defecto
    if (/renegoc|parcial/i.test(t.id)) score = 0.5;
    return { t, score };
  });
  return scored
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
}

/**
 * Excepciones estándar: desde estado origen, intentar cada transición a terminal_excepcion.
 */
export function walkExceptions(
  ctx: WalkContext,
  slice: LifecycleSlice,
  spec: UiSpec,
  scenarioPrefix: string,
): QaScenarioResult[] {
  const results: QaScenarioResult[] = [];
  const life = slice.lifecycle;
  const exceptionTs = life.transitions.filter((t) => {
    const to = life.states.find((s) => s.id === t.to);
    return to?.kind === "terminal_excepcion";
  });

  for (const ex of exceptionTs) {
    const subject = createSubject(
      `qa-${scenarioPrefix}-${ex.id}`,
      slice.id,
      life,
      syntheticCreditFields(),
    );
    // Llevar al estado origen si hace falta (camino feliz parcial)
    const brought = bringToState(ctx, subject, spec, slice, ex.from);
    if (!brought) {
      results.push({
        id: `${scenarioPrefix}-${ex.id}`,
        label: `Excepción ${ex.id} (no se alcanzó origen ${ex.from})`,
        reachedTerminal: false,
        terminalStateId: null,
        rolesUsed: [],
        transitionsApplied: [],
      });
      continue;
    }
    const action = spec.actions.find(
      (a) => a.lifecycleId === slice.id && a.transitionId === ex.id,
    );
    const r = tryTransitionWithRoles(ctx, subject, ex, action?.visibleRoles);
    if (r.ok) {
      recordEnabledActions(ctx, spec, slice.id, ex.id);
      const final = ctx.engine.derived(subject);
      results.push({
        id: `${scenarioPrefix}-${ex.id}`,
        label: `Excepción ${ex.id}`,
        reachedTerminal: isTerminalState(life, final.currentStateId),
        terminalStateId: final.currentStateId,
        rolesUsed: [r.roleId],
        transitionsApplied: [...brought, ex.id],
      });
    } else {
      results.push({
        id: `${scenarioPrefix}-${ex.id}`,
        label: `Excepción ${ex.id} (no aplicable: ${r.reason})`,
        reachedTerminal: false,
        terminalStateId: null,
        rolesUsed: [],
        transitionsApplied: brought,
      });
    }
  }
  return results;
}

function bringToState(
  ctx: WalkContext,
  subject: IsolatedSubject,
  spec: UiSpec,
  slice: LifecycleSlice,
  targetState: string,
): string[] | null {
  const life = slice.lifecycle;
  const applied: string[] = [];
  const max = life.transitions.length + 4;
  for (let i = 0; i < max; i++) {
    const d = ctx.engine.derived(subject);
    if (d.currentStateId === targetState) return applied;
    if (isTerminalState(life, d.currentStateId)) return null;
    const outs = preferHappy(outgoing(life, d.currentStateId), life);
    let ok = false;
    for (const t of outs) {
      if (t.to === targetState || preferHappy([t], life).length > 0) {
        const action = spec.actions.find(
          (a) => a.lifecycleId === slice.id && a.transitionId === t.id,
        );
        const r = tryTransitionWithRoles(ctx, subject, t, action?.visibleRoles);
        if (r.ok) {
          applied.push(t.id);
          recordEnabledActions(ctx, spec, slice.id, t.id);
          ok = true;
          break;
        }
      }
    }
    if (!ok) return null;
  }
  return ctx.engine.derived(subject).currentStateId === targetState
    ? applied
    : null;
}

/**
 * Venta con crédito: combina roles hasta cierre (criterio concesionaria).
 */
export function walkCreditSale(
  ctx: WalkContext,
  input: GeneratorInput,
  spec: UiSpec,
): QaScenarioResult {
  const venta = input.lifecycles.find((l) => l.archetypeId === "venta");
  if (!venta) {
    return {
      id: "credit-sale",
      label: "Venta con crédito",
      reachedTerminal: false,
      terminalStateId: null,
      rolesUsed: [],
      transitionsApplied: [],
    };
  }
  return walkHappyPath(
    ctx,
    venta,
    spec,
    "credit-sale",
    syntheticCreditFields(),
  );
}

/**
 * Exploración lineal: avanza por el camino feliz y marca callejones de política.
 */
export function exploreReachability(
  ctx: WalkContext,
  slice: LifecycleSlice,
  spec: UiSpec,
): void {
  const evidenceFor = makeEvidenceFactory(slice.lifecycle, ctx.now);
  const actors = allActors(ctx.users);
  const subject = createSubject(
    `explore-${slice.id}`,
    slice.id,
    slice.lifecycle,
    syntheticCreditFields(),
  );
  const start = ctx.engine.derived(subject);
  ctx.visitedStates.add(`${slice.id}:${start.currentStateId}`);

  const max = slice.lifecycle.transitions.length + 4;
  for (let i = 0; i < max; i++) {
    const d = ctx.engine.derived(subject);
    if (isTerminalState(slice.lifecycle, d.currentStateId)) return;

    const outs = preferHappy(
      outgoing(slice.lifecycle, d.currentStateId),
      slice.lifecycle,
    );
    let advanced = false;
    for (const t of outs) {
      const action = spec.actions.find(
        (a) => a.lifecycleId === slice.id && a.transitionId === t.id,
      );
      const r = tryTransitionWithRoles(ctx, subject, t, action?.visibleRoles);
      if (r.ok) {
        recordEnabledActions(ctx, spec, slice.id, t.id);
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      const can = ctx.engine.canAnyRoleAct(
        subject,
        actors,
        evidenceFor,
        ctx.now,
      );
      if (!can) {
        ctx.deadEndCandidates.push({
          lifecycleId: slice.id,
          stateId: d.currentStateId,
          subjectKey: subject.subjectId,
        });
      }
      return;
    }
  }
}
