import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootProfile, AppRuntime } from "../web/index.js";
import { enrichFormForTransition } from "../web/action-handler.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
  collectFactRequests,
} from "../policies/judge.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import { executeUiAction } from "../web/action-handler.js";

const dir = mkdtempSync(join(tmpdir(), "abs-y-"));
const boot = bootProfile("p02-clinica-dental");
const runtime = AppRuntime.open(boot, { dbPath: join(dir, "e.sqlite") });

const fin = boot.input.lifecycles.find((l) => l.archetypeId === "financiera")!;
const finSub = runtime.subjects.find((s) => s.lifecycleId === fin.id)!;
for (const tid of ["t_aprobar", "t_desembolsar", "t_amortizar", "t_cerrar"]) {
  const a = boot.spec.actions.find(
    (x) => x.transitionId === tid && x.lifecycleId === fin.id,
  )!;
  executeUiAction(runtime, {
    actionId: a.id,
    subjectId: finSub.id,
    clientRequestId: `f-${tid}`,
    roleId: a.visibleRoles[0]!,
    parteId: finSub.parteId,
    channel: "backoffice",
  });
}

const srv = boot.input.lifecycles.find(
  (l) => l.archetypeId === "servicio_proyecto",
)!;
const srvSub = runtime.subjects.find((s) => s.lifecycleId === srv.id)!;
const aAcordar = boot.spec.actions.find(
  (x) => x.transitionId === "t_acordar" && x.lifecycleId === srv.id,
)!;
executeUiAction(runtime, {
  actionId: aAcordar.id,
  subjectId: srvSub.id,
  clientRequestId: `s-acordar`,
  roleId: aAcordar.visibleRoles[0]!,
  parteId: srvSub.parteId,
  channel: "backoffice",
});

const transition = srv.lifecycle.transitions.find((t) => t.id === "t_ejecutar")!;
const form = enrichFormForTransition(
  boot.input.ruleSet,
  transition,
  srvSub.parteId,
);
const evidenceRules = boot.input.ruleSet.rules.filter(
  (r) =>
    r.kind === "evidence_requirement" && r.transitionId === "t_ejecutar",
);
const history = runtime.store.getBySubject(srvSub.id) as TransitionEvent[];
const derived = deriveState(srv.lifecycle, history);

const fields = { ...form };
const evidenceKind = form["evidence.kind"] as "aceptacion" | "sistema" | "fisica";
try {
  attemptJudgedAdvance({
    subjectId: srvSub.id,
    lifecycle: srv.lifecycle,
    derived,
    command: {
      transitionId: "t_ejecutar",
      eventId: "evt-test-ejecutar",
      actorId: "actor-director_medico",
      actorKind: "sistema",
      occurredAt: new Date().toISOString(),
      evidence: {
        kind: evidenceKind,
        reference: "ui:test",
        recordedAt: new Date().toISOString(),
      },
    },
    actor: {
      id: "actor-director_medico",
      kind: "sistema",
      roles: ["director_medico"],
    },
    evidence: {
      kind: evidenceKind,
      reference: "ui:test",
      recordedAt: new Date().toISOString(),
      referenceType: form["evidence.referenceType"],
      evidencingRoles: ["director_medico"],
    },
    fields,
    ruleSet: boot.input.ruleSet,
    tenantId: runtime.tenantId,
  });
  console.log("JUDGE OK with", evidenceKind);
} catch (e) {
  if (e instanceof JudgeRejectionError) {
    writeFileSync(
      "tmp/ejecutar-fail.json",
      JSON.stringify(
        {
          form,
          evidenceKind,
          transitionRequired: transition.requiredEvidence,
          evidenceRules,
          reason: e.trace.reason,
          guards: e.trace.guardsEvaluated,
        },
        null,
        2,
      ),
    );
    console.log("FAIL", e.trace.reason);
  }
}

// try with actorKind humano + evidence aceptacion
try {
  attemptJudgedAdvance({
    subjectId: srvSub.id,
    lifecycle: srv.lifecycle,
    derived,
    command: {
      transitionId: "t_ejecutar",
      eventId: "evt-test-ejecutar-2",
      actorId: "actor-director_medico",
      actorKind: "humano",
      occurredAt: new Date().toISOString(),
      evidence: {
        kind: "aceptacion",
        reference: "ui:test",
        recordedAt: new Date().toISOString(),
      },
    },
    actor: {
      id: "actor-director_medico",
      kind: "humano",
      roles: ["director_medico"],
    },
    evidence: {
      kind: "aceptacion",
      reference: "ui:test",
      recordedAt: new Date().toISOString(),
      referenceType: "consentimiento_informado",
      evidencingRoles: ["director_medico"],
    },
    fields,
    ruleSet: boot.input.ruleSet,
    tenantId: runtime.tenantId,
  });
  console.log("JUDGE OK humano+aceptacion");
} catch (e) {
  if (e instanceof JudgeRejectionError) {
    console.log("FAIL2", e.trace.reason);
  }
}

runtime.close();
rmSync(dir, { recursive: true, force: true });
