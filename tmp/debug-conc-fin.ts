import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootProfile, AppRuntime, executeUiAction } from "../web/index.js";
import { enrichFormForTransition } from "../web/action-handler.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
  collectFactRequests,
} from "../policies/judge.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";

const dir = mkdtempSync(join(tmpdir(), "c-"));
const boot = bootProfile("concesionaria");
const rt = AppRuntime.open(boot, { dbPath: join(dir, "e.sqlite") });
const slice = boot.input.lifecycles.find((l) => l.archetypeId === "financiera")!;
const sub = rt.subjects.find((s) => s.lifecycleId === slice.id)!;
for (const t of ["t_aprobar", "t_desembolsar", "t_amortizar"]) {
  const a = boot.spec.actions.find(
    (x) => x.transitionId === t && x.lifecycleId === slice.id,
  )!;
  executeUiAction(rt, {
    actionId: a.id,
    subjectId: sub.id,
    clientRequestId: t,
    roleId: a.visibleRoles[0]!,
    parteId: sub.parteId,
    channel: "backoffice",
  });
}
const transition = slice.lifecycle.transitions.find((t) => t.id === "t_cerrar")!;
const form = enrichFormForTransition(
  boot.input.ruleSet,
  transition,
  sub.parteId,
);
const derived = deriveState(
  slice.lifecycle,
  rt.store.getBySubject(sub.id) as TransitionEvent[],
);
const rules = boot.input.ruleSet.rules.filter(
  (r) => "transitionId" in r && (r as { transitionId: string }).transitionId === "t_cerrar",
);
console.log("form", form);
console.log(
  "rules",
  rules.map((r) => ({
    kind: r.kind,
    id: r.id,
    ...(r.kind === "condition"
      ? { pred: r.predicate, restr: r.isRestriction }
      : {}),
  })),
);
try {
  const fields = { ...form };
  const bagReqs = collectFactRequests(boot.input.ruleSet, "t_cerrar", fields);
  attemptJudgedAdvance({
    subjectId: sub.id,
    lifecycle: slice.lifecycle,
    derived,
    command: {
      transitionId: "t_cerrar",
      eventId: "e-close",
      actorId: "actor-finanzas",
      actorKind: "sistema",
      occurredAt: new Date().toISOString(),
      evidence: {
        kind: "sistema",
        reference: "ui",
        recordedAt: new Date().toISOString(),
      },
    },
    actor: { id: "actor-finanzas", kind: "sistema", roles: ["finanzas"] },
    evidence: {
      kind: "sistema",
      reference: "ui",
      recordedAt: new Date().toISOString(),
      evidencingRoles: ["finanzas"],
    },
    fields,
    ruleSet: boot.input.ruleSet,
    tenantId: rt.tenantId,
    ...(bagReqs.length
      ? { facts: rt.facts.prepare(rt.tenantId, bagReqs) }
      : {}),
  });
  console.log("OK");
} catch (e) {
  if (e instanceof JudgeRejectionError) {
    console.log("FAIL", e.trace.reason);
    console.log(JSON.stringify(e.trace.guardsEvaluated?.slice(-5), null, 2));
  }
}
rt.close();
rmSync(dir, { recursive: true, force: true });
