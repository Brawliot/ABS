/**
 * Orquestador: interacción UI → Intérprete → Juez → EventStore.
 * Ninguna otra ruta escribe en el store.
 */

import type { ArchetypeId } from "../archetypes/types.js";
import {
  evaluateBlocks,
  type SubTransactionSnapshot,
} from "../archetypes/composed-runtime.js";
import type { ComposedArchetypeSpec } from "../archetypes/types.js";
import { deriveState, type DerivedState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import { calcularTotales } from "../elements/transaccion.js";
import { direccionDe } from "../elements/movimientos.js";
import type { ActorKind } from "../core/grammar.js";
import { findState } from "../core/lifecycle.js";
import type { Lifecycle, Transition } from "../core/lifecycle.js";
import { resolveJudgeError } from "../design/copy/index.js";
import { z } from "zod";
import {
  collectFactRequests,
  attemptJudgedAdvance,
  actorMayForceTransition,
  ForceNotAllowedError,
  JudgeRejectionError,
  JudgeTrace,
  reconstructFieldsFromEvents,
} from "../policies/judge.js";
import {
  identityFromChannel,
  interpret,
  type ChannelIdentity,
  type Interaction,
} from "../interpreter/index.js";
import type { PresentationChannel } from "../presentation/types.js";
import type { AppRuntime, FlashMessage } from "./runtime.js";
import type { CompiledRuleSet } from "../policies/types.js";

function findLifeTransition(
  lifecycle: Lifecycle,
  transitionId: string,
): Transition | undefined {
  return lifecycle.transitions.find((t) => t.id === transitionId);
}

/** Anclas legales + evidencia de cumplimiento exigida por el RuleSet. */
export function enrichFormForTransition(
  ruleSet: CompiledRuleSet,
  transition: Transition,
  parteId: string,
  formValues?: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {
    parte_id: parteId,
    ...(formValues ?? {}),
  };

  // Preferir always el kind del lifecycle (núcleo); referenceType de política solo si coincide el kind
  let evidenceKind: string = transition.requiredEvidence;
  for (const rule of ruleSet.rules) {
    if (
      rule.kind === "evidence_requirement" &&
      rule.transitionId === transition.id
    ) {
      if (rule.evidenceKind === transition.requiredEvidence) {
        evidenceKind = rule.evidenceKind;
        if (rule.referenceType && !out["evidence.referenceType"]) {
          out["evidence.referenceType"] = rule.referenceType;
        }
      } else if (
        rule.referenceType &&
        !out["evidence.referenceType"] &&
        rule.evidenceKind === transition.requiredEvidence
      ) {
        out["evidence.referenceType"] = rule.referenceType;
      }
    }
    // Producción: no inventar anclas ni campos de política. Si faltan, el Juez rechaza.
  }
  // Respetar evidencia explícita del formulario (p. ej. intento adverso sin consentimiento)
  if (!formValues?.["evidence.kind"]) {
    out["evidence.kind"] = evidenceKind;
  }
  return out;
}

function inferReferenceType(
  ruleSet: CompiledRuleSet,
  transitionId: string,
  evidenceKind: string,
): string | undefined {
  for (const rule of ruleSet.rules) {
    if (
      rule.kind === "evidence_requirement" &&
      rule.transitionId === transitionId &&
      rule.evidenceKind === evidenceKind &&
      rule.referenceType
    ) {
      return rule.referenceType;
    }
  }
  return undefined;
}

export interface ActionRequestBody {
  readonly actionId: string;
  readonly subjectId: string;
  readonly clientRequestId: string;
  readonly roleId: string;
  readonly parteId: string;
  readonly channel: PresentationChannel;
  readonly kind?: "boton" | "formulario";
  readonly formValues?: Readonly<Record<string, string>>;
  readonly interactionId?: string;
  /** Forzado Observador: solo Permiso/Política + motivo + reglas autorizadas. */
  readonly forceReason?: string;
  readonly forceRuleIds?: readonly string[];
  readonly forceEnabled?: boolean;
  /** Sede de sesión (aislamiento organizativo). */
  readonly sedeId?: string;
  readonly sedeScoped?: boolean;
}

export interface ActionResult {
  readonly ok: boolean;
  readonly flash: FlashMessage;
  readonly idempotentReplay: boolean;
  readonly eventId?: string;
  readonly newStateId?: string;
}

function actionsByIdMap(
  runtime: AppRuntime,
): Record<string, (typeof runtime.boot.spec.actions)[number]> {
  const m: Record<string, (typeof runtime.boot.spec.actions)[number]> = {};
  for (const a of runtime.boot.spec.actions) m[a.id] = a;
  return m;
}

function processGroupForArchetype(
  runtime: AppRuntime,
  archetypeId: string,
): string | undefined {
  return runtime.boot.spec.processGroups?.find(
    (g) => g.archetypeId === archetypeId,
  )?.id;
}

function subSnapshots(
  runtime: AppRuntime,
  composition: ComposedArchetypeSpec | undefined,
): SubTransactionSnapshot[] {
  if (!composition) return [];
  const out: SubTransactionSnapshot[] = [];
  for (const sub of runtime.subjects) {
    const slice = runtime.boot.input.lifecycles.find(
      (l) => l.id === sub.lifecycleId,
    );
    if (!slice) continue;
    const isSec = composition.secondaries.some(
      (s) => s.secondaryArchetypeId === slice.archetypeId,
    );
    if (!isSec) continue;
    const events = runtime.store.getBySubject(sub.id) as TransitionEvent[];
    const derived = deriveState(slice.lifecycle, events);
    const st = findState(slice.lifecycle, derived.currentStateId);
    if (!st) continue;
    out.push({
      instanceId: sub.id,
      secondaryArchetypeId: slice.archetypeId as ArchetypeId,
      currentStateId: derived.currentStateId,
      stateKind: st.kind,
    });
  }
  return out;
}

/**
 * Ejecuta una acción de UI. Única vía de escritura al EventStore.
 */
export async function executeUiAction(
  runtime: AppRuntime,
  body: ActionRequestBody,
): Promise<ActionResult> {
  const action = runtime.actionById(body.actionId);
  if (!action) {
    const flash: FlashMessage = {
      kind: "error",
      text: "No encontramos esa acción en la interfaz. Pruebe de nuevo o contacte con soporte.",
    };
    runtime.setFlash(flash);
    return Promise.resolve({ ok: false, flash, idempotentReplay: false });
  }

  if (!action.visibleRoles.includes(body.roleId)) {
    const flash: FlashMessage = {
      kind: "error",
      text: "Su rol no tiene permiso para esta acción.",
    };
    runtime.setFlash(flash);
    return Promise.resolve({ ok: false, flash, idempotentReplay: false });
  }

  const subjectMeta = runtime.subjects.find((s) => s.id === body.subjectId);
  if (
    body.sedeScoped &&
    body.sedeId &&
    subjectMeta?.sedeId &&
    subjectMeta.sedeId !== body.sedeId
  ) {
    const flash: FlashMessage = {
      kind: "error",
      text: "Este expediente pertenece a otra sede. Su rol no puede verlo ni modificarlo.",
    };
    runtime.setFlash(flash);
    return Promise.resolve({ ok: false, flash, idempotentReplay: false });
  }

  const slice = runtime.lifecycleForSubject(body.subjectId);
  if (!slice) {
    const flash: FlashMessage = {
      kind: "error",
      text: "No encontramos el expediente indicado.",
    };
    runtime.setFlash(flash);
    return Promise.resolve({ ok: false, flash, idempotentReplay: false });
  }

  if (!runtime.tryLockSubject(body.subjectId)) {
    const flash: FlashMessage = {
      kind: "error",
      text: "Otro usuario está actuando sobre este expediente en este momento. Recargue e inténtelo de nuevo.",
    };
    runtime.setFlash(flash);
    return Promise.resolve({ ok: false, flash, idempotentReplay: false });
  }

  try {
    return await executeUiActionLocked(runtime, body, action, slice);
  } finally {
    runtime.unlockSubject(body.subjectId);
  }
}

async function executeUiActionLocked(
  runtime: AppRuntime,
  body: ActionRequestBody,
  action: (typeof runtime.boot.spec.actions)[number],
  slice: NonNullable<ReturnType<AppRuntime["lifecycleForSubject"]>>,
): Promise<ActionResult> {

  const transition = findLifeTransition(slice.lifecycle, action.transitionId);
  if (!transition) {
    const availableActions = slice.lifecycle.transitions
      .map(t => t.id)
      .join(", ");
    const flash: FlashMessage = {
      kind: "error",
      text: `La acción «${action.transitionId}» no existe en el ciclo de vida actual de este expediente. Acciones disponibles: ${availableActions || "ninguna (estado terminal)"}`,
    };
    runtime.setFlash(flash);
    return { ok: false, flash, idempotentReplay: false };
  }

  const history = runtime.store.getBySubject(
    body.subjectId,
  ) as TransitionEvent[];
  const derived: DerivedState = deriveState(slice.lifecycle, history);

  // Bloqueos de composición (secundarios) antes del Juez
  const composition = runtime.boot.input.composition;
  if (composition && composition.dominant === slice.archetypeId) {
    const blocks = evaluateBlocks(
      composition,
      transition.to,
      subSnapshots(runtime, composition),
    ).filter((b) => b.blocksTransition);
    if (blocks.length > 0) {
      const b = blocks[0]!;
      const pgId = processGroupForArchetype(runtime, b.secondaryArchetypeId);
      
      // Usar plantilla de copy inteligente
      let text: string;
      try {
        text = resolveJudgeError(runtime.copyPack, {
          transitionId: action.transitionId,
          subjectId: body.subjectId,
          reason: `Bloqueo de composición: ${b.secondaryArchetypeId}`,
          guardsEvaluated: [],
          appliedRuleId: undefined,
          factsUsed: {},
          calculations: {},
        } as unknown as JudgeTrace, {
          estado_destino: transition.to,
          secundario: b.secondaryArchetypeId,
          instancia: b.instanceId,
        });
      } catch {
        text = `No se puede avanzar a «${transition.to}»: falta completar el proceso secundario «${b.secondaryArchetypeId}» (expediente ${b.instanceId}).`;
      }
      
      const flash: FlashMessage = {
        kind: "block",
        text,
        ...(pgId !== undefined ? { blockProcessGroupId: pgId } : {}),
        blockArchetypeId: b.secondaryArchetypeId,
      };
      runtime.setFlash(flash);
      return { ok: false, flash, idempotentReplay: false };
    }
  }

  const actorKind: ActorKind =
    transition.allowedActor === "sistema" ? "sistema" : "humano";
  const baseIdentity = identityFromChannel({
    channel: body.channel,
    sessionActorId:
      actorKind === "sistema" ? "sys-runtime" : `actor-${body.roleId}`,
    sessionParteId: body.parteId,
    tenantId: runtime.tenantId,
    roles: [body.roleId],
  });
  const identity: ChannelIdentity = { ...baseIdentity, actorKind };

  const occurredAt = new Date().toISOString();
  const ruleSet = runtime.effectiveRuleSet();
  const enrichedForm = enrichFormForTransition(
    ruleSet,
    transition,
    body.parteId,
    body.formValues,
  );

  const unitId =
    enrichedForm.unidad_id ||
    enrichedForm.plaza_id ||
    enrichedForm.recurso_id ||
    undefined;
  if (
    unitId &&
    (transition.id === "t_reservar" || transition.id === "t_iniciar_uso")
  ) {
    if (!runtime.tryReserveUnit(unitId, body.subjectId)) {
      const holder = runtime.unitHolder(unitId);
      const flash: FlashMessage = {
        kind: "error",
        text: `La unidad o plaza «${unitId}» ya está reservada${holder ? ` (expediente ${holder})` : ""}. Elija otra o espere a que se libere.`,
      };
      runtime.setFlash(flash);
      return { ok: false, flash, idempotentReplay: false };
    }
  }

  const interaction: Interaction = {
    id: body.interactionId ?? `ix-${body.clientRequestId}`,
    kind: body.kind ?? "boton",
    channel: body.channel,
    occurredAt,
    subjectId: body.subjectId,
    actionId: body.actionId,
    transitionId: action.transitionId,
    clientRequestId: body.clientRequestId,
    formValues: enrichedForm,
  };

  const allowed = slice.lifecycle.transitions.map((t) => t.id);

  const outcome = interpret(interaction, {
    identity,
    allowedTransitionIds: allowed,
    actionsById: actionsByIdMap(runtime),
    ledger: runtime.ledger,
  });

  if (outcome.kind !== "solicitud") {
    const flash: FlashMessage = {
      kind: "info",
      text:
        outcome.kind === "confirmacion"
          ? outcome.question
          : outcome.reason,
    };
    runtime.setFlash(flash);
    return { ok: false, flash, idempotentReplay: false };
  }

  const { request, idempotentReplay } = outcome;

  // Idempotencia de persistencia: mismo request.id ya appendado → no duplicar
  const existing = runtime.store.getById(request.id);
  if (existing) {
    const flash: FlashMessage = {
      kind: "ok",
      text: "La acción ya se había registrado (envio duplicado ignorado).",
      idempotentReplay: true,
    };
    runtime.setFlash(flash);
    const again = deriveState(
      slice.lifecycle,
      runtime.store.getBySubject(body.subjectId) as TransitionEvent[],
    );
    return {
      ok: true,
      flash,
      idempotentReplay: true,
      eventId: existing.id,
      newStateId: again.currentStateId,
    };
  }

  const priorFields = reconstructFieldsFromEvents(
    runtime.store.getBySubject(body.subjectId) as TransitionEvent[],
    { parte_id: body.parteId },
  );
  const fields: Record<string, unknown> = {
    ...priorFields,
    parte_id: body.parteId,
    ...enrichedForm,
    ...request.fields,
  };
  // Coerción numérica / fechas ya en string
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) {
      fields[k] = Number(v);
    }
    if (typeof v === "string" && (v === "true" || v === "false")) {
      fields[k] = v === "true";
    }
  }
  if (fields.importe === "" || fields.importe === undefined) {
    delete fields.importe;
  }
  // Expediente con datos: su cliente y su total mandan (no la Parte de quien
  // pulsa). Un importe escrito en el formulario (cobro parcial) se respeta.
  fields.subject_id = body.subjectId;
  const tx = runtime.datosDe(body.subjectId);
  if (tx) {
    fields.parte_id = tx.datos.parteId;
    fields.sentido = direccionDe(slice.exchangeDirection);
    const typed = request.fields.importe ?? enrichedForm.importe;
    if (typed === undefined || typed === "") {
      fields.importe = calcularTotales(tx.datos.lineas).total / 100;
    }
  }

  const factReqs = collectFactRequests(
    ruleSet,
    request.transitionId,
    fields,
  );
  const bag =
    factReqs.length > 0
      ? runtime.facts.prepare(runtime.tenantId, factReqs)
      : undefined;

  const evidenceKind =
    (enrichedForm["evidence.kind"] as
      | "aceptacion"
      | "sistema"
      | "fisica"
      | undefined) ?? transition.requiredEvidence;
  const evidenceRefType =
    (typeof enrichedForm["evidence.referenceType"] === "string"
      ? enrichedForm["evidence.referenceType"]
      : undefined) ??
    request.evidence.referenceType ??
    inferReferenceType(ruleSet, transition.id, evidenceKind);

  const wantsForce = body.forceEnabled === true;
  let force:
    | { reason: string; allowedForceRuleIds: readonly string[] }
    | undefined;
  if (wantsForce) {
    const reason = (body.forceReason ?? "").trim();
    if (!reason) {
      const flash: FlashMessage = {
        kind: "error",
        text: "Forzado rechazado: indique un motivo en texto libre.",
      };
      runtime.setFlash(flash);
      return { ok: false, flash, idempotentReplay };
    }
    const mayNative = actorMayForceTransition(
      ruleSet,
      request.transitionId,
      {
        id: request.actorId,
        kind: request.actorKind,
        roles: identity.roles,
      },
    );
    const mayInjected = runtime.observerForceGrants.some(
      (g) =>
        g.transitionId === request.transitionId &&
        g.allowedRoles.some((r) => identity.roles.includes(r)),
    );
    const may = mayNative || mayInjected;
    if (!may) {
      const flash: FlashMessage = {
        kind: "error",
        text: "Forzado rechazado: su rol no tiene permiso de Observador para forzar esta transición (solo Permiso/Política).",
      };
      runtime.setFlash(flash);
      return { ok: false, flash, idempotentReplay };
    }
    force = {
      reason,
      allowedForceRuleIds: body.forceRuleIds ?? [],
    };
  }

  try {
    // Re-derivar bajo lock: segunda sesión concurrente ve el estado actualizado
    const freshDerived = deriveState(
      slice.lifecycle,
      runtime.store.getBySubject(body.subjectId) as TransitionEvent[],
    );
    const judged = attemptJudgedAdvance({
      subjectId: request.subjectId,
      lifecycle: slice.lifecycle,
      derived: freshDerived,
      command: {
        transitionId: request.transitionId,
        eventId: request.id,
        actorId: request.actorId,
        actorKind: request.actorKind,
        occurredAt: request.occurredAt,
        evidence: {
          kind: evidenceKind,
          reference: request.evidence.reference,
          recordedAt: request.evidence.recordedAt,
        },
      },
      actor: {
        id: request.actorId,
        kind: request.actorKind,
        roles: identity.roles,
      },
      evidence: {
        kind: evidenceKind,
        reference: request.evidence.reference,
        recordedAt: request.evidence.recordedAt,
        ...(evidenceRefType ? { referenceType: evidenceRefType } : {}),
        evidencingRoles: [...identity.roles],
      },
      fields,
      ruleSet,
      tenantId: runtime.tenantId,
      ...(bag ? { facts: bag } : {}),
      ...(force ? { force } : {}),
    });

    runtime.store.append(judged.event);
    runtime.facts.applyEvent(runtime.tenantId, judged.event);

    const flash: FlashMessage = {
      kind: "ok",
      text: idempotentReplay
        ? "Acción reenviada: se reutilizó la misma solicitud (sin duplicar)."
        : `Listo: el expediente pasó a «${judged.event.toStateId}».`,
      ...(idempotentReplay ? { idempotentReplay: true } : {}),
    };
    runtime.setFlash(flash);
    return {
      ok: true,
      flash,
      idempotentReplay,
      eventId: judged.event.id,
      newStateId: judged.event.toStateId,
    };
  } catch (err) {
    if (err instanceof ForceNotAllowedError) {
      const flash: FlashMessage = {
        kind: "error",
        text: err.message.includes("Cumplimiento") || err.message.includes("cumplimiento") || err.message.includes("núcleo") || err.message.includes("nucleo")
          ? err.message
          : err.message.startsWith("Forzado")
            ? err.message
            : `Forzado rechazado: ${err.message}`,
      };
      runtime.setFlash(flash);
      return { ok: false, flash, idempotentReplay };
    }
    if (err instanceof JudgeRejectionError) {
      let text: string;
      try {
        const accionLabel =
          runtime.boot.spec.content[action.id]?.title ??
          action.transitionId.replace(/^t_/, "").replace(/_/g, " ");
        text = resolveJudgeError(runtime.copyPack, err.trace, {
          accion: action.transitionId,
          accion_label: accionLabel,
          pedido: body.subjectId,
        });
      } catch {
        // Fallback a LLM para explicación clara
        try {
          const llmResult = await runtime.llmClient.completeStructured({
            componentId: "diagnosis",
            callKind: "diagnosis.extract_answers",
            system: "Eres un asistente que explica en lenguaje claro y profesional por qué se rechazó una transición comercial. Sé conciso (máximo 2 líneas).",
            userPayload: {
              razon: err.trace.reason || "Rechazado por política",
              transicion: action.transitionId,
              regla: err.trace.appliedRuleId,
            },
            schema: z.object({ explicacion: z.string() }),
            schemaName: "rejection_explanation",  // ← AQUÍ
            jsonSchema: {
              type: "object",
              properties: {
                explicacion: { type: "string", description: "Explicación clara" },
              },
              required: ["explicacion"],
            },
            failureMode: "ask_clarification",
          });
          
          if (llmResult.kind === "ok") {
            text = llmResult.data.explicacion;
          } else {
            const reason = err.trace.reason || err.message;
            text =
              reason && !/Error|at Object|stack/i.test(reason)
                ? reason
                : "No se pudo completar la acción con las reglas actuales. Revise permisos, documentos o saldos pendientes.";
          }
        } catch {
          const reason = err.trace.reason || err.message;
          text =
            reason && !/Error|at Object|stack/i.test(reason)
              ? reason
              : "No se pudo completar la acción con las reglas actuales. Revise permisos, documentos o saldos pendientes.";
        }
      }
      const flash: FlashMessage = { kind: "error", text };
      runtime.setFlash(flash);
      return { ok: false, flash, idempotentReplay };
    }
    const msg = err instanceof Error ? err.message : String(err);
    const flash: FlashMessage = {
      kind: "error",
      text:
        /estado|transición|terminal|deriv/i.test(msg)
          ? "No se pudo completar: el expediente cambió de estado (posible acción concurrente). Recargue y revise el estado actual."
          : "No se pudo completar la acción. Revise los datos e inténtelo de nuevo.",
    };
    runtime.setFlash(flash);
    return { ok: false, flash, idempotentReplay };
  }
}