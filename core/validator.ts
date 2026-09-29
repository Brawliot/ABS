/**
 * Validador de máquinas de estados — reglas de validez no negociables.
 * Ninguna máquina inválida puede usarse (ni solo registrarse).
 */

import { EvidenceKinds, isSuccessTerminal, isTerminalKind } from "./grammar.js";
import {
  situationKey,
  type Lifecycle,
  type StateNode,
} from "./lifecycle.js";

export type ValidationIssue = {
  readonly code: ValidationCode;
  readonly message: string;
};

export type ValidationCode =
  | "EXACTLY_ONE_INITIAL"
  | "AT_LEAST_ONE_SUCCESS_TERMINAL"
  | "UNREACHABLE_STATE"
  | "NON_TERMINAL_WITHOUT_EXIT"
  | "TERMINAL_WITH_EXIT"
  | "TRANSITION_WITHOUT_EVIDENCE"
  | "UNKNOWN_TRANSITION_ENDPOINT"
  | "UNKNOWN_FULFILL_COMMITMENT"
  | "DUPLICATE_STATE_ID"
  | "DUPLICATE_TRANSITION_ID"
  | "INVALID_FIELD_VALUES"
  | "DUPLICATE_METAOBJECT_ID"
  | "STATE_WITHOUT_SITUATION"
  | "SITUATION_NOT_PARTITION"
  | "UNKNOWN_SITUATION_COMMITMENT"
  | "DUPLICATE_SITUATION"
  | "SUCCESS_WITH_PENDING";

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export function validateLifecycle(lifecycle: Lifecycle): ValidationResult {
  const issues: ValidationIssue[] = [];

  checkUniqueIds(lifecycle, issues);
  checkInitialAndTerminals(lifecycle, issues);
  checkSituations(lifecycle, issues);
  checkReachability(lifecycle, issues);
  checkExits(lifecycle, issues);
  checkEvidence(lifecycle, issues);
  checkEndpoints(lifecycle, issues);
  checkFulfills(lifecycle, issues);

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function checkUniqueIds(
  lifecycle: Lifecycle,
  issues: ValidationIssue[],
): void {
  const stateIds = new Set<string>();
  for (const s of lifecycle.states) {
    if (stateIds.has(s.id)) {
      issues.push({
        code: "DUPLICATE_STATE_ID",
        message: `Estado duplicado: ${s.id}`,
      });
    }
    stateIds.add(s.id);
  }

  const transitionIds = new Set<string>();
  for (const t of lifecycle.transitions) {
    if (transitionIds.has(t.id)) {
      issues.push({
        code: "DUPLICATE_TRANSITION_ID",
        message: `Transición duplicada: ${t.id}`,
      });
    }
    transitionIds.add(t.id);
  }
}

function checkInitialAndTerminals(
  lifecycle: Lifecycle,
  issues: ValidationIssue[],
): void {
  const initials = lifecycle.states.filter((s) => s.kind === "inicial");
  if (initials.length !== 1) {
    issues.push({
      code: "EXACTLY_ONE_INITIAL",
      message: `Se exige exactamente un estado inicial; hay ${initials.length}`,
    });
  }

  const successTerminals = lifecycle.states.filter(
    (s) => s.kind === "terminal_exito",
  );
  if (successTerminals.length < 1) {
    issues.push({
      code: "AT_LEAST_ONE_SUCCESS_TERMINAL",
      message: "Se exige al menos un terminal de éxito",
    });
  }
}

function checkSituations(
  lifecycle: Lifecycle,
  issues: ValidationIssue[],
): void {
  const commitmentIds = lifecycle.commitments.map((c) => c.id);
  const commitmentSet = new Set(commitmentIds);
  const seen = new Map<string, string>();

  for (const state of lifecycle.states) {
    if (!state.situations || state.situations.length === 0) {
      issues.push({
        code: "STATE_WITHOUT_SITUATION",
        message: `Estado sin situaciones de compromisos: ${state.id}`,
      });
      continue;
    }

    for (const situation of state.situations) {
      const declared = [...situation.fulfilled, ...situation.pending];
      for (const cid of declared) {
        if (!commitmentSet.has(cid)) {
          issues.push({
            code: "UNKNOWN_SITUATION_COMMITMENT",
            message: `Estado ${state.id} referencia compromiso desconocido: ${cid}`,
          });
        }
      }

      const union = new Set(declared);
      const overlap = situation.fulfilled.some((id) =>
        situation.pending.includes(id),
      );
      if (
        overlap ||
        union.size !== commitmentIds.length ||
        declared.length !== union.size
      ) {
        issues.push({
          code: "SITUATION_NOT_PARTITION",
          message: `Situación de ${state.id} no particiona los compromisos de la máquina`,
        });
      }

      if (isSuccessTerminal(state.kind) && situation.pending.length > 0) {
        issues.push({
          code: "SUCCESS_WITH_PENDING",
          message: `Terminal de éxito ${state.id} no puede tener compromisos pendientes`,
        });
      }

      const key = situationKey(situation);
      const owner = seen.get(key);
      if (owner !== undefined && owner !== state.id) {
        issues.push({
          code: "DUPLICATE_SITUATION",
          message: `Situación duplicada entre estados ${owner} y ${state.id}`,
        });
      } else {
        seen.set(key, state.id);
      }
    }
  }
}

function checkReachability(
  lifecycle: Lifecycle,
  issues: ValidationIssue[],
): void {
  const initial = lifecycle.states.find((s) => s.kind === "inicial");
  if (!initial) {
    return;
  }

  const reachable = new Set<string>();
  const queue: string[] = [initial.id];
  reachable.add(initial.id);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const t of lifecycle.transitions) {
      if (t.from === current && !reachable.has(t.to)) {
        reachable.add(t.to);
        queue.push(t.to);
      }
    }
  }

  for (const state of lifecycle.states) {
    if (!reachable.has(state.id)) {
      issues.push({
        code: "UNREACHABLE_STATE",
        message: `Estado no alcanzable desde el inicial: ${state.id}`,
      });
    }
  }
}

function checkExits(lifecycle: Lifecycle, issues: ValidationIssue[]): void {
  for (const state of lifecycle.states) {
    const outs = lifecycle.transitions.filter((t) => t.from === state.id);
    if (isTerminalKind(state.kind)) {
      if (outs.length > 0) {
        issues.push({
          code: "TERMINAL_WITH_EXIT",
          message: `Un terminal no puede tener salidas: ${state.id}`,
        });
      }
    } else if (outs.length < 1) {
      issues.push({
        code: "NON_TERMINAL_WITHOUT_EXIT",
        message: `Estado no terminal sin salida: ${state.id}`,
      });
    }
  }
}

function checkEvidence(
  lifecycle: Lifecycle,
  issues: ValidationIssue[],
): void {
  const allowed = new Set<string>(EvidenceKinds);
  for (const t of lifecycle.transitions) {
    if (!t.requiredEvidence || !allowed.has(t.requiredEvidence)) {
      issues.push({
        code: "TRANSITION_WITHOUT_EVIDENCE",
        message: `Toda transición exige evidencia: ${t.id}`,
      });
    }
  }
}

function checkEndpoints(
  lifecycle: Lifecycle,
  issues: ValidationIssue[],
): void {
  const ids = new Set(lifecycle.states.map((s) => s.id));
  for (const t of lifecycle.transitions) {
    if (!ids.has(t.from) || !ids.has(t.to)) {
      issues.push({
        code: "UNKNOWN_TRANSITION_ENDPOINT",
        message: `Transición con extremo desconocido: ${t.id}`,
      });
    }
  }
}

function checkFulfills(
  lifecycle: Lifecycle,
  issues: ValidationIssue[],
): void {
  const commitmentIds = new Set(lifecycle.commitments.map((c) => c.id));
  for (const t of lifecycle.transitions) {
    for (const cid of t.fulfills) {
      if (!commitmentIds.has(cid)) {
        issues.push({
          code: "UNKNOWN_FULFILL_COMMITMENT",
          message: `Transición ${t.id} cumple compromiso desconocido: ${cid}`,
        });
      }
    }
  }
}

export type { StateNode };
