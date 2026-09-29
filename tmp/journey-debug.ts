import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootProfile, AppRuntime, executeUiAction } from "../web/index.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
  collectFactRequests,
} from "../policies/judge.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import { identityFromChannel, interpret } from "../interpreter/index.js";
import { enrichFormForTransition } from "../web/action-handler.js";

function debug(profileId: string, steps: { arch: string; tid: string; role: string }[]) {
  const dir = mkdtempSync(join(tmpdir(), "abs-dj-"));
  const boot = bootProfile(profileId);
  const runtime = AppRuntime.open(boot, { dbPath: join(dir, "e.sqlite") });
  const log: unknown[] = [];
  for (const step of steps) {
    const slice = boot.input.lifecycles.find((l) => l.archetypeId === step.arch)!;
    const sub = runtime.subjects.find((s) => s.lifecycleId === slice.id)!;
    const action = boot.spec.actions.find(
      (a) => a.transitionId === step.tid && a.lifecycleId === slice.id,
    );
    if (!action) {
      log.push({ step, error: "no action", actions: boot.spec.actions.filter(a=>a.lifecycleId===slice.id).map(a=>a.transitionId) });
      break;
    }
    const role = action.visibleRoles.includes(step.role)
      ? step.role
      : action.visibleRoles[0]!;
    const r = executeUiAction(runtime, {
      actionId: action.id,
      subjectId: sub.id,
      clientRequestId: `d-${step.tid}-${Date.now()}-${Math.random()}`,
      roleId: role,
      parteId: sub.parteId,
      channel: "backoffice",
    });
    if (!r.ok) {
      // deeper
      const transition = slice.lifecycle.transitions.find((t) => t.id === step.tid)!;
      const history = runtime.store.getBySubject(sub.id) as TransitionEvent[];
      const derived = deriveState(slice.lifecycle, history);
      const form = enrichFormForTransition(
        boot.input.ruleSet,
        transition,
        sub.parteId,
      );
      const actorKind =
        transition.allowedActor === "sistema" ? "sistema" : "humano";
      const identity = {
        ...identityFromChannel({
          channel: "backoffice",
          sessionActorId: `actor-${role}`,
          sessionParteId: sub.parteId,
          tenantId: runtime.tenantId,
          roles: [role],
        }),
        actorKind: actorKind as "humano" | "sistema",
      };
      const outcome = interpret(
        {
          id: "ix",
          kind: "boton",
          channel: "backoffice",
          occurredAt: new Date().toISOString(),
          subjectId: sub.id,
          actionId: action.id,
          transitionId: step.tid,
          clientRequestId: `deep-${step.tid}`,
          formValues: form,
        },
        {
          identity,
          allowedTransitionIds: slice.lifecycle.transitions.map((t) => t.id),
          actionsById: Object.fromEntries(boot.spec.actions.map((a) => [a.id, a])),
          ledger: runtime.ledger,
        },
      );
      let deep = "";
      if (outcome.kind === "solicitud") {
        const fields = { ...form, ...outcome.request.fields };
        try {
          attemptJudgedAdvance({
            subjectId: sub.id,
            lifecycle: slice.lifecycle,
            derived,
            command: {
              transitionId: step.tid,
              eventId: outcome.request.id + "-x",
              actorId: outcome.request.actorId,
              actorKind: outcome.request.actorKind,
              occurredAt: outcome.request.occurredAt,
              evidence: {
                kind: transition.requiredEvidence,
                reference: "ref",
                recordedAt: outcome.request.occurredAt,
              },
            },
            actor: {
              id: outcome.request.actorId,
              kind: outcome.request.actorKind,
              roles: [role],
            },
            evidence: {
              kind: transition.requiredEvidence,
              reference: "ref",
              recordedAt: outcome.request.occurredAt,
              ...(form["evidence.referenceType"]
                ? { referenceType: form["evidence.referenceType"] }
                : {}),
              evidencingRoles: [role],
            },
            fields,
            ruleSet: boot.input.ruleSet,
            tenantId: runtime.tenantId,
            facts:
              collectFactRequests(boot.input.ruleSet, step.tid, fields).length >
              0
                ? runtime.facts.prepare(
                    runtime.tenantId,
                    collectFactRequests(boot.input.ruleSet, step.tid, fields),
                  )
                : undefined,
          });
        } catch (e) {
          if (e instanceof JudgeRejectionError) {
            deep = JSON.stringify({
              reason: e.trace.reason,
              guards: e.trace.guardsEvaluated?.slice(-3),
              form,
            });
          } else deep = String(e);
        }
      }
      log.push({ step, flash: r.flash.text, deep, state: derived.currentStateId });
      break;
    }
    log.push({ step, ok: true, state: r.newStateId });
  }
  runtime.close();
  rmSync(dir, { recursive: true, force: true });
  return log;
}

const out = {
  p02: debug("p02-clinica-dental", [
    { arch: "financiera", tid: "t_aprobar", role: "director_medico" },
    { arch: "financiera", tid: "t_desembolsar", role: "director_medico" },
    { arch: "financiera", tid: "t_amortizar", role: "director_medico" },
    { arch: "financiera", tid: "t_cerrar", role: "director_medico" },
    { arch: "servicio_proyecto", tid: "t_acordar", role: "director_medico" },
    { arch: "servicio_proyecto", tid: "t_ejecutar", role: "director_medico" },
  ]),
  p08: debug("p08-alquiler-maquinaria", [
    { arch: "financiera", tid: "t_aprobar", role: "gerente" },
    { arch: "financiera", tid: "t_desembolsar", role: "gerente" },
    { arch: "financiera", tid: "t_amortizar", role: "gerente" },
    { arch: "financiera", tid: "t_cerrar", role: "gerente" },
  ]),
  p10: debug("p10-reformas", [
    { arch: "servicio_proyecto", tid: "t_acordar", role: "gerente" },
    { arch: "servicio_proyecto", tid: "t_ejecutar", role: "gerente" },
  ]),
  market: (() => {
    const b = bootProfile("marketplace-intermediacion");
    return {
      actions: b.spec.actions.map((a) => ({
        id: a.id,
        tid: a.transitionId,
        roles: a.visibleRoles,
        lc: a.lifecycleId,
      })),
      roles: b.roles,
      views: b.spec.views.length,
    };
  })(),
};
writeFileSync("tmp/journey-debug.json", JSON.stringify(out, null, 2));
console.log("ok");
