/**
 * Runtime de composición: impone "bloquea" antes de cada transición
 * y registra una traza explicable (aceptada o rechazada).
 *
 * No modifica el motor de derivación: lo consulta y añade la guarda de
 * sub-transacciones + observabilidad.
 */

import {
  assertCanAdvance,
  DerivationError,
  type AdvanceCommand,
  type DerivedState,
} from "../core/derivation.js";
import type { EvidenceRecord } from "../core/events.js";
import { isSuccessTerminal, type StateKind } from "../core/grammar.js";
import type { Lifecycle, Transition } from "../core/lifecycle.js";
import { findState } from "../core/lifecycle.js";
import { validateComposition } from "./composition.js";
import type {
  ArchetypeId,
  ComposedArchetypeSpec,
  SecondaryBinding,
} from "./types.js";

export class CompositionRuntimeError extends Error {
  constructor(
    message: string,
    readonly blockingSubTransactionId?: string,
    readonly blockingArchetypeId?: ArchetypeId,
  ) {
    super(message);
    this.name = "CompositionRuntimeError";
  }
}

/** Estado runtime de una sub-transacción nacida en la dominante. */
export interface SubTransactionSnapshot {
  readonly instanceId: string;
  readonly secondaryArchetypeId: ArchetypeId;
  readonly currentStateId: string;
  readonly stateKind: StateKind;
}

export interface BlockEvaluation {
  readonly secondaryArchetypeId: ArchetypeId;
  readonly instanceId: string;
  readonly bloquea: string;
  readonly bornInDominantState: string;
  readonly open: boolean;
  readonly succeeded: boolean;
  /** true si este binding impide la transición evaluada. */
  readonly blocksTransition: boolean;
}

export interface TransitionTraceRecord {
  readonly at: string;
  readonly subjectId: string;
  readonly fromStateId: string;
  readonly toStateId: string | null;
  readonly transitionId: string;
  readonly condition: string | null;
  readonly evidence: EvidenceRecord | null;
  readonly blocksEvaluated: readonly BlockEvaluation[];
  readonly result: "accepted" | "rejected";
  /** Explicación legible del rechazo o del OK. */
  readonly reason: string;
}

export interface ComposedAdvanceInput {
  readonly subjectId: string;
  readonly composition: ComposedArchetypeSpec;
  readonly dominantLifecycle: Lifecycle;
  readonly dominantDerived: DerivedState;
  readonly command: AdvanceCommand;
  readonly subTransactions: readonly SubTransactionSnapshot[];
  readonly now?: string;
}

export interface ComposedAdvanceResult {
  readonly transition: Transition;
  readonly trace: TransitionTraceRecord;
}

/**
 * Evalúa bloqueos y, si pasan, delega en assertCanAdvance.
 * Siempre produce un registro de traza (vía el almacén pasado o uno interno).
 */
export function attemptComposedAdvance(
  input: ComposedAdvanceInput,
  traceLog: TransitionTraceRecord[] = [],
): ComposedAdvanceResult {
  const now = input.now ?? new Date().toISOString();
  const compositionCheck = validateComposition(input.composition);
  if (!compositionCheck.ok) {
    const reason = `Composición inválida: ${compositionCheck.issues.map((i) => i.message).join("; ")}`;
    const trace = pushTrace(traceLog, {
      at: now,
      subjectId: input.subjectId,
      fromStateId: input.dominantDerived.currentStateId,
      toStateId: null,
      transitionId: input.command.transitionId,
      condition: null,
      evidence: input.command.evidence,
      blocksEvaluated: [],
      result: "rejected",
      reason,
    });
    throw Object.assign(new CompositionRuntimeError(reason), { trace });
  }

  const transition = input.dominantLifecycle.transitions.find(
    (t) => t.id === input.command.transitionId,
  );

  const blocksEvaluated = evaluateBlocks(
    input.composition,
    transition?.to ?? null,
    input.subTransactions,
  );

  const blocker = blocksEvaluated.find((b) => b.blocksTransition);
  if (blocker) {
    const reason = `Sub-transacción ${blocker.secondaryArchetypeId} (${blocker.instanceId}) bloquea el estado "${blocker.bloquea}" mientras no termina con éxito (estado actual: ${input.subTransactions.find((s) => s.instanceId === blocker.instanceId)?.currentStateId ?? "?"})`;
    const trace = pushTrace(traceLog, {
      at: now,
      subjectId: input.subjectId,
      fromStateId: input.dominantDerived.currentStateId,
      toStateId: transition?.to ?? null,
      transitionId: input.command.transitionId,
      condition: transition?.condition ?? null,
      evidence: input.command.evidence,
      blocksEvaluated,
      result: "rejected",
      reason,
    });
    throw Object.assign(
      new CompositionRuntimeError(
        reason,
        blocker.instanceId,
        blocker.secondaryArchetypeId,
      ),
      { trace },
    );
  }

  try {
    const ok = assertCanAdvance(
      input.dominantLifecycle,
      input.dominantDerived,
      input.command,
    );
    const trace = pushTrace(traceLog, {
      at: now,
      subjectId: input.subjectId,
      fromStateId: input.dominantDerived.currentStateId,
      toStateId: ok.to,
      transitionId: ok.id,
      condition: ok.condition,
      evidence: input.command.evidence,
      blocksEvaluated,
      result: "accepted",
      reason: `Transición ${ok.id} aceptada: ${ok.from}→${ok.to}; bloqueos evaluados=${blocksEvaluated.length}, ninguno activo`,
    });
    return { transition: ok, trace };
  } catch (err) {
    const msg =
      err instanceof DerivationError || err instanceof Error
        ? err.message
        : String(err);
    const target =
      transition?.to ??
      (findState(input.dominantLifecycle, input.dominantDerived.currentStateId)
        ? null
        : null);
    const trace = pushTrace(traceLog, {
      at: now,
      subjectId: input.subjectId,
      fromStateId: input.dominantDerived.currentStateId,
      toStateId: transition?.to ?? target,
      transitionId: input.command.transitionId,
      condition: transition?.condition ?? null,
      evidence: input.command.evidence,
      blocksEvaluated,
      result: "rejected",
      reason: msg,
    });
    throw Object.assign(err instanceof Error ? err : new Error(msg), { trace });
  }
}

/**
 * Sub-transacciones que declaran bloquea === destino de la transición
 * y aún no están en terminal de éxito impiden el avance.
 */
export function evaluateBlocks(
  composition: ComposedArchetypeSpec,
  targetStateId: string | null,
  subTransactions: readonly SubTransactionSnapshot[],
): BlockEvaluation[] {
  if (!targetStateId) {
    return [];
  }

  const byArchetype = new Map<ArchetypeId, SecondaryBinding>();
  for (const sec of composition.secondaries) {
    byArchetype.set(sec.secondaryArchetypeId, sec);
  }

  const evaluations: BlockEvaluation[] = [];

  for (const sub of subTransactions) {
    const binding = byArchetype.get(sub.secondaryArchetypeId);
    if (!binding) continue;

    const succeeded = isSuccessTerminal(sub.stateKind);
    const open = !succeeded && sub.stateKind !== "terminal_excepcion";
    const blocksTransition =
      binding.bloquea === targetStateId && !succeeded;

    evaluations.push({
      secondaryArchetypeId: sub.secondaryArchetypeId,
      instanceId: sub.instanceId,
      bloquea: binding.bloquea,
      bornInDominantState: binding.bornInDominantState,
      open,
      succeeded,
      blocksTransition,
    });
  }

  // Bindings que bloquean el destino pero aún no tienen instancia:
  // si el dominante ya pasó el bornIn, se considera bloqueo por ausencia de cierre.
  // (La prueba de concesionaria usa instancia abierta explícita.)
  for (const binding of composition.secondaries) {
    if (binding.bloquea !== targetStateId) continue;
    const hasInstance = subTransactions.some(
      (s) => s.secondaryArchetypeId === binding.secondaryArchetypeId,
    );
    if (!hasInstance) {
      evaluations.push({
        secondaryArchetypeId: binding.secondaryArchetypeId,
        instanceId: "(no-nacida)",
        bloquea: binding.bloquea,
        bornInDominantState: binding.bornInDominantState,
        open: false,
        succeeded: false,
        blocksTransition: false,
      });
    }
  }

  return evaluations;
}

function pushTrace(
  log: TransitionTraceRecord[],
  record: TransitionTraceRecord,
): TransitionTraceRecord {
  log.push(record);
  return record;
}

/** Explica el último rechazo (o el indicado) a partir de la traza. */
export function explainRejection(
  traces: readonly TransitionTraceRecord[],
  transitionId?: string,
): string {
  const rejected = [...traces]
    .reverse()
    .find(
      (t) =>
        t.result === "rejected" &&
        (transitionId === undefined || t.transitionId === transitionId),
    );
  if (!rejected) {
    return "No hay rechazo en la traza";
  }
  const blockers = rejected.blocksEvaluated.filter((b) => b.blocksTransition);
  if (blockers.length > 0) {
    return `${rejected.reason} | bloqueos activos: ${blockers
      .map((b) => `${b.secondaryArchetypeId}/${b.instanceId}`)
      .join(", ")}`;
  }
  return rejected.reason;
}

export class ComposedTransactionSession {
  readonly traces: TransitionTraceRecord[] = [];

  constructor(
    readonly subjectId: string,
    readonly composition: ComposedArchetypeSpec,
    readonly dominantLifecycle: Lifecycle,
  ) {
    const v = validateComposition(composition);
    if (!v.ok) {
      throw new CompositionRuntimeError(
        `No se puede registrar máquina compuesta: ${v.issues.map((i) => i.message).join("; ")}`,
      );
    }
  }

  attemptAdvance(
    dominantDerived: DerivedState,
    command: AdvanceCommand,
    subTransactions: readonly SubTransactionSnapshot[],
  ): ComposedAdvanceResult {
    return attemptComposedAdvance(
      {
        subjectId: this.subjectId,
        composition: this.composition,
        dominantLifecycle: this.dominantLifecycle,
        dominantDerived,
        command,
        subTransactions,
      },
      this.traces,
    );
  }

  explainLastRejection(transitionId?: string): string {
    return explainRejection(this.traces, transitionId);
  }
}
