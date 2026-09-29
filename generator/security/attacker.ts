/**
 * Atacante: un solo actor busca secuencias que desvíen dinero/stock
 * sobre copia aislada del motor.
 */

import type { Lifecycle, Transition } from "../../core/lifecycle.js";
import { isTerminalState, outgoing } from "../../core/lifecycle.js";
import type { GeneratorInput } from "../types.js";
import {
  createQaEngine,
  createSubject,
  type IsolatedSubject,
} from "../qa/engine.js";
import {
  actorForTransition,
  syntheticEvidence,
  syntheticUsers,
} from "../qa/synthetic.js";
import { resolveFraudSteps } from "./catalog.js";
import { allTransitionIds, rolesForTransition } from "./rules.js";
import { proposalFor } from "./propose.js";
import type { SecurityFinding } from "./types.js";

function findLifecycleForTransitions(
  input: GeneratorInput,
  transitionIds: readonly string[],
): { lifecycleId: string; lifecycle: Lifecycle } | null {
  for (const slice of input.lifecycles) {
    const ids = new Set(slice.lifecycle.transitions.map((t) => t.id));
    if (transitionIds.every((t) => ids.has(t))) {
      return { lifecycleId: slice.id, lifecycle: slice.lifecycle };
    }
  }
  return null;
}

/**
 * Si la config permite la cadena proveedor ficticio a un solo rol,
 * intenta ejecutarla en motor aislado y reporta la secuencia.
 */
export function findSupplierFraudSequences(
  input: GeneratorInput,
  now: string,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const resolved = resolveFraudSteps(allTransitionIds(input));
  if (!resolved) return findings;

  const transitionIds = resolved.map((r) => r.transitionId);
  const loc = findLifecycleForTransitions(input, transitionIds);
  if (!loc) return findings;

  // Roles que pueden TODAS las transiciones de la cadena
  let common: Set<string> | null = null;
  for (const tid of transitionIds) {
    const roles = rolesForTransition(input.ruleSet, tid);
    if (!common) common = new Set(roles);
    else {
      for (const r of [...common]) {
        if (!roles.has(r)) common.delete(r);
      }
    }
  }
  if (!common || common.size === 0) return findings;

  const users = syntheticUsers(
    [...common].map((id) => ({ id, label: id })),
  );
  const engine = createQaEngine(input.ruleSet);

  for (const user of users) {
    const subject = createSubject(
      `attack-fraud-${user.roleId}`,
      loc.lifecycleId,
      loc.lifecycle,
      {
        importe: 9999,
        parte_id: "parte:proveedor-ficticio",
        factura_id: "fac-fraud",
      },
    );
    const fraudApplied: string[] = [];
    let ok = true;

    for (const step of resolved) {
      const transition = loc.lifecycle.transitions.find(
        (t) => t.id === step.transitionId,
      );
      if (!transition) {
        ok = false;
        break;
      }
      const scratch: string[] = [];
      if (
        !bringToState(
          engine,
          subject,
          loc.lifecycle,
          transition.from,
          user,
          now,
          scratch,
        )
      ) {
        ok = false;
        break;
      }
      const actor = actorForTransition(user, transition);
      const evidence = syntheticEvidence(
        transition,
        now,
        fraudApplied.length,
      );
      const r = engine.tryAdvance({
        subject,
        transitionId: transition.id,
        actor,
        evidence,
        now,
        eventId: `fraud-${user.roleId}-${fraudApplied.length}`,
        ...( /pagar/i.test(transition.id)
          ? { fields: { factura_id: "fac-fraud" } }
          : { fields: { parte_id: "parte:proveedor-ficticio" } }),
      });
      if (!r.ok) {
        ok = false;
        break;
      }
      fraudApplied.push(transition.id);
    }

    if (ok && fraudApplied.length === transitionIds.length) {
      const id = `sec.fraud.supplier.${user.roleId}`;
      findings.push({
        id,
        kind: "fraud_sequence",
        severity: "critical",
        message: `Un solo actor («${user.roleId}») puede crear proveedor, pedir, recibir y pagar — desvío de dinero/stock`,
        step: {
          roleId: user.roleId,
          transitionIds: fraudApplied,
          sequenceId: "fraud_supplier",
        },
        demonstration: fraudApplied,
        proposal: proposalFor(id, {
          description:
            "Separar permisos: alta de proveedor ≠ pedido ≠ recepción ≠ pago (distintos roles)",
          suggestedPermissionPatch: {
            removeRoleFromTransitions: {
              [user.roleId]: fraudApplied.slice(
                Math.ceil(fraudApplied.length / 2),
              ),
            },
          },
        }),
      });
    }
  }

  return findings;
}

function bringToState(
  engine: ReturnType<typeof createQaEngine>,
  subject: IsolatedSubject,
  lifecycle: Lifecycle,
  target: string,
  user: ReturnType<typeof syntheticUsers>[number],
  now: string,
  applied: string[],
): boolean {
  const max = lifecycle.transitions.length + 4;
  for (let i = 0; i < max; i++) {
    const d = engine.derived(subject);
    if (d.currentStateId === target) return true;
    if (isTerminalState(lifecycle, d.currentStateId)) return false;
    const outs = outgoing(lifecycle, d.currentStateId);
    let moved = false;
    for (const t of outs) {
      // Evitar excepciones al acercarnos
      const to = lifecycle.states.find((s) => s.id === t.to);
      if (to?.kind === "terminal_excepcion") continue;
      const actor = actorForTransition(user, t);
      const evidence = syntheticEvidence(t, now, applied.length + i);
      const r = engine.tryAdvance({
        subject,
        transitionId: t.id,
        actor,
        evidence,
        now,
        eventId: `fraud-bring-${user.roleId}-${applied.length}-${i}-${t.id}`,
      });
      if (r.ok) {
        applied.push(t.id);
        moved = true;
        break;
      }
    }
    if (!moved) return false;
  }
  return engine.derived(subject).currentStateId === target;
}

export type { Transition };
