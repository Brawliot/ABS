import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootProfile, AppRuntime, executeUiAction } from "../web/index.js";

function once(pid: string, tid: string, archOrLc: string) {
  const dir = mkdtempSync(join(tmpdir(), "t-"));
  const boot = bootProfile(pid);
  const rt = AppRuntime.open(boot, { dbPath: join(dir, "e.sqlite") });
  const slice =
    boot.input.lifecycles.find((l) => l.id === archOrLc) ??
    boot.input.lifecycles.find((l) => l.archetypeId === archOrLc)!;
  const sub = rt.subjects.find((s) => s.lifecycleId === slice.id)!;
  if (archOrLc === "financiera" || slice.archetypeId === "financiera") {
    for (const t of ["t_aprobar", "t_desembolsar", "t_amortizar", "t_cerrar"]) {
      const a = boot.spec.actions.find(
        (x) => x.transitionId === t && x.lifecycleId === slice.id,
      )!;
      const r = executeUiAction(rt, {
        actionId: a.id,
        subjectId: sub.id,
        clientRequestId: t + Math.random(),
        roleId: a.visibleRoles[0]!,
        parteId: sub.parteId,
        channel: "backoffice",
      });
      console.log(pid, t, r.ok, r.flash.text.slice(0, 100));
      if (!r.ok) break;
    }
  } else {
    const a = boot.spec.actions.find(
      (x) => x.transitionId === tid && x.lifecycleId === slice.id,
    )!;
    const r = executeUiAction(rt, {
      actionId: a.id,
      subjectId: sub.id,
      clientRequestId: "x" + Math.random(),
      roleId: a.visibleRoles[0]!,
      parteId: sub.parteId,
      channel: "backoffice",
    });
    console.log(pid, tid, r.ok, r.flash.text.slice(0, 120));
    const ev = boot.input.ruleSet.rules.filter(
      (rule) =>
        rule.kind === "evidence_requirement" && rule.transitionId === tid,
    );
    console.log("  evid", JSON.stringify(ev));
  }
  rt.close();
  rmSync(dir, { recursive: true, force: true });
}

once("p03-ferreteria", "t_aceptar", "lc.compras");
once("p09-academia-idiomas", "t_activar", "lc.suscripcion");
once("p08-alquiler-maquinaria", "t_cerrar", "financiera");
once("concesionaria", "t_cerrar", "financiera");
