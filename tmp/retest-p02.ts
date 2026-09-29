import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootProfile, AppRuntime, executeUiAction } from "../web/index.js";

const dir = mkdtempSync(join(tmpdir(), "abs-x-"));
const boot = bootProfile("p02-clinica-dental");
const runtime = AppRuntime.open(boot, { dbPath: join(dir, "e.sqlite") });

const fin = boot.input.lifecycles.find((l) => l.archetypeId === "financiera")!;
const finSub = runtime.subjects.find((s) => s.lifecycleId === fin.id)!;
for (const tid of ["t_aprobar", "t_desembolsar", "t_amortizar", "t_cerrar"]) {
  const a = boot.spec.actions.find(
    (x) => x.transitionId === tid && x.lifecycleId === fin.id,
  )!;
  const r = executeUiAction(runtime, {
    actionId: a.id,
    subjectId: finSub.id,
    clientRequestId: `f-${tid}`,
    roleId: a.visibleRoles[0]!,
    parteId: finSub.parteId,
    channel: "backoffice",
  });
  console.log("fin", tid, r.ok, r.flash.text.slice(0, 80), r.newStateId);
}

const srv = boot.input.lifecycles.find(
  (l) => l.archetypeId === "servicio_proyecto",
)!;
const srvSub = runtime.subjects.find((s) => s.lifecycleId === srv.id)!;
for (const tid of ["t_acordar", "t_ejecutar", "t_presentar", "t_cerrar"]) {
  const a = boot.spec.actions.find(
    (x) => x.transitionId === tid && x.lifecycleId === srv.id,
  )!;
  const r = executeUiAction(runtime, {
    actionId: a.id,
    subjectId: srvSub.id,
    clientRequestId: `s-${tid}`,
    roleId: a.visibleRoles[0]!,
    parteId: srvSub.parteId,
    channel: "backoffice",
  });
  console.log("srv", tid, r.ok, r.flash.text.slice(0, 100), r.newStateId);
}

runtime.close();
rmSync(dir, { recursive: true, force: true });
