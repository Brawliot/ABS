import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootProfile, AppRuntime, executeUiAction } from "../web/index.js";
import { enrichFormForTransition } from "../web/action-handler.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
} from "../policies/judge.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";

function deep(pid: string, tid: string, arch: string, pre: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "d-"));
  const boot = bootProfile(pid);
  const rt = AppRuntime.open(boot, { dbPath: join(dir, "e.sqlite") });
  const slice = boot.input.lifecycles.find(
    (l) => l.archetypeId === arch || l.id === arch,
  )!;
  const sub = rt.subjects.find((s) => s.lifecycleId === slice.id)!;
  for (const t of pre) {
    const a = boot.spec.actions.find(
      (x) => x.transitionId === t && x.lifecycleId === slice.id,
    )!;
    executeUiAction(rt, {
      actionId: a.id,
      subjectId: sub.id,
      clientRequestId: pre + t + Math.random(),
      roleId: a.visibleRoles[0]!,
      parteId: sub.parteId,
      channel: "backoffice",
    });
  }
  const transition = slice.lifecycle.transitions.find((t) => t.id === tid)!;
  const form = enrichFormForTransition(
    boot.input.ruleSet,
    transition,
    sub.parteId,
  );
  const derived = deriveState(
    slice.lifecycle,
    rt.store.getBySubject(sub.id) as TransitionEvent[],
  );
  const evidenceKind = form["evidence.kind"] as "aceptacion" | "sistema" | "fisica";
  try {
    attemptJudgedAdvance({
      subjectId: sub.id,
      lifecycle: slice.lifecycle,
      derived,
      command: {
        transitionId: tid,
        eventId: "e1" + Math.random(),
        actorId: "actor-x",
        actorKind: transition.allowedActor === "sistema" ? "sistema" : "humano",
        occurredAt: new Date().toISOString(),
        evidence: {
          kind: evidenceKind,
          reference: "ui:test",
          recordedAt: new Date().toISOString(),
        },
      },
      actor: {
        id: "actor-x",
        kind: transition.allowedActor === "sistema" ? "sistema" : "humano",
        roles: ["dueno", "gerente", "directora", "finanzas", "fundadora"],
      },
      evidence: {
        kind: evidenceKind,
        reference: "ui:test",
        recordedAt: new Date().toISOString(),
        ...(form["evidence.referenceType"]
          ? { referenceType: form["evidence.referenceType"] }
          : {}),
        evidencingRoles: ["dueno", "gerente", "directora", "finanzas"],
      },
      fields: form,
      ruleSet: boot.input.ruleSet,
      tenantId: rt.tenantId,
    });
    console.log(pid, tid, "OK", form);
  } catch (e) {
    if (e instanceof JudgeRejectionError) {
      console.log(pid, tid, "FAIL", e.trace.reason);
      console.log("  form", form);
      console.log(
        "  last guards",
        JSON.stringify(e.trace.guardsEvaluated?.slice(-4)),
      );
    }
  }
  rt.close();
  rmSync(dir, { recursive: true, force: true });
}

deep("p03-ferreteria", "t_aceptar", "venta");
deep("p09-academia-idiomas", "t_activar", "suscripcion");
deep("p08-alquiler-maquinaria", "t_cerrar", "financiera", [
  "t_aprobar",
  "t_desembolsar",
  "t_amortizar",
]);
