import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootProfile, AppRuntime, executeUiAction } from "../web/index.js";
import { JudgeRejectionError, attemptJudgedAdvance, collectFactRequests } from "../policies/judge.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import { identityFromChannel, interpret } from "../interpreter/index.js";

const cases = [
  { profileId: "p07-tienda-online", tid: "t_aceptar", lc: "lc.compras" },
  { profileId: "p08-alquiler-maquinaria", tid: "t_reservar", lc: "lc.uso_temporal" },
  { profileId: "p09-academia-idiomas", tid: "t_activar", lc: "lc.suscripcion" },
  { profileId: "p04-taller-mecanico", tid: "t_cerrar", lc: "lc.compras", pre: ["t_aceptar", "t_iniciar_entrega"] },
];

const out: unknown[] = [];
for (const c of cases) {
  const dir = mkdtempSync(join(tmpdir(), "abs-d-"));
  const boot = bootProfile(c.profileId);
  const runtime = AppRuntime.open(boot, { dbPath: join(dir, "e.sqlite") });
  const subject = runtime.subjects.find((s) => s.lifecycleId === c.lc)!;
  for (const pre of c.pre ?? []) {
    const a = boot.spec.actions.find(
      (x) => x.transitionId === pre && x.lifecycleId === c.lc,
    )!;
    executeUiAction(runtime, {
      actionId: a.id,
      subjectId: subject.id,
      clientRequestId: `pre-${pre}`,
      roleId: a.visibleRoles[0]!,
      parteId: subject.parteId,
      channel: "backoffice",
    });
  }
  const action = boot.spec.actions.find(
    (x) => x.transitionId === c.tid && x.lifecycleId === c.lc,
  )!;
  const roleId = action.visibleRoles[0]!;
  // raw judge
  const slice = runtime.lifecycleForSubject(subject.id)!;
  const history = runtime.store.getBySubject(subject.id) as TransitionEvent[];
  const derived = deriveState(slice.lifecycle, history);
  const transition = slice.lifecycle.transitions.find((t) => t.id === c.tid)!;
  const actorKind = transition.allowedActor === "sistema" ? "sistema" : "humano";
  const identity = {
    ...identityFromChannel({
      channel: "backoffice",
      sessionActorId: actorKind === "sistema" ? "sys" : `actor-${roleId}`,
      sessionParteId: subject.parteId,
      tenantId: runtime.tenantId,
      roles: [roleId],
    }),
    actorKind: actorKind as "humano" | "sistema",
  };
  const outcome = interpret(
    {
      id: "ix",
      kind: "boton",
      channel: "backoffice",
      occurredAt: new Date().toISOString(),
      subjectId: subject.id,
      actionId: action.id,
      transitionId: c.tid,
      clientRequestId: `dbg-${c.tid}`,
    },
    {
      identity,
      allowedTransitionIds: slice.lifecycle.transitions.map((t) => t.id),
      actionsById: Object.fromEntries(boot.spec.actions.map((a) => [a.id, a])),
      ledger: runtime.ledger,
    },
  );
  let detail = "";
  if (outcome.kind === "solicitud") {
    const fields = { parte_id: subject.parteId, importe: 100, ...outcome.request.fields };
    const factReqs = collectFactRequests(boot.input.ruleSet, c.tid, fields);
    const bag =
      factReqs.length > 0
        ? runtime.facts.prepare(runtime.tenantId, factReqs)
        : undefined;
    try {
      attemptJudgedAdvance({
        subjectId: subject.id,
        lifecycle: slice.lifecycle,
        derived,
        command: {
          transitionId: c.tid,
          eventId: outcome.request.id,
          actorId: outcome.request.actorId,
          actorKind: outcome.request.actorKind,
          occurredAt: outcome.request.occurredAt,
          evidence: {
            kind: outcome.request.evidence.kind,
            reference: outcome.request.evidence.reference,
            recordedAt: outcome.request.evidence.recordedAt,
          },
        },
        actor: {
          id: outcome.request.actorId,
          kind: outcome.request.actorKind,
          roles: identity.roles,
        },
        evidence: {
          kind: outcome.request.evidence.kind,
          reference: outcome.request.evidence.reference,
          recordedAt: outcome.request.evidence.recordedAt,
          evidencingRoles: [...identity.roles],
        },
        fields,
        ruleSet: boot.input.ruleSet,
        tenantId: runtime.tenantId,
        ...(bag ? { facts: bag } : {}),
      });
      detail = "unexpected ok";
    } catch (err) {
      if (err instanceof JudgeRejectionError) {
        detail = JSON.stringify({
          reason: err.trace.reason,
          codes: err.trace.rejectionCodes,
          guards: err.trace.guardsEvaluated?.slice(-5),
          appliedRuleId: err.trace.appliedRuleId,
          evidenceKind: outcome.request.evidence.kind,
          actorKind: outcome.request.actorKind,
          roles: identity.roles,
          factReqs,
        });
      } else {
        detail = String(err);
      }
    }
  } else {
    detail = JSON.stringify(outcome);
  }
  out.push({ ...c, roles: action.visibleRoles, detail });
  runtime.close();
  rmSync(dir, { recursive: true, force: true });
}
writeFileSync("tmp/fail-detail.json", JSON.stringify(out, null, 2));
console.log("ok");
