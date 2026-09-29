/**
 * Sondea camino feliz mínimo vía executeUiAction (diagnóstico; no es la suite E2E).
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allBootableIds,
  AppRuntime,
  bootProfile,
  executeUiAction,
} from "../web/index.js";

mkdirSync("tmp", { recursive: true });

type Step = { transitionId: string; roleId: string };

/** Camino feliz mínimo por arquetipo (sin bucles opcionales). */
const MIN_PATH: Record<string, string[]> = {
  venta: ["t_aceptar", "t_iniciar_entrega", "t_cerrar"],
  servicio_proyecto: ["t_acordar", "t_ejecutar", "t_presentar", "t_cerrar"],
  uso_temporal: ["t_reservar", "t_iniciar_uso", "t_cerrar"],
  suscripcion: ["t_activar", "t_cerrar"],
  financiera: ["t_aprobar", "t_desembolsar", "t_amortizar", "t_cerrar"],
  intermediacion: [
    "t_emparejar",
    "t_iniciar",
    "t_cerrar",
  ],
};

const results: unknown[] = [];

for (const profileId of allBootableIds()) {
  const dir = mkdtempSync(join(tmpdir(), "abs-walk-"));
  const boot = bootProfile(profileId);
  const runtime = AppRuntime.open(boot, { dbPath: join(dir, "e.sqlite") });
  const compositionDominant = boot.input.composition?.dominant;
  const dominantSlice =
    boot.input.lifecycles.find(
      (l) => l.archetypeId === compositionDominant,
    ) ??
    boot.input.lifecycles.find((l) =>
      (boot.spec.processGroups ?? []).some(
        (g) => g.archetypeId === l.archetypeId && g.role === "standalone" || g.archetypeId === l.archetypeId,
      ),
    ) ??
    boot.input.lifecycles[0];

  if (!dominantSlice) {
    results.push({ profileId, error: "sin lifecycle" });
    runtime.close();
    rmSync(dir, { recursive: true, force: true });
    continue;
  }

  const path =
    MIN_PATH[dominantSlice.archetypeId] ??
    MIN_PATH[dominantSlice.archetypeId.replace("servicio", "servicio_proyecto")] ??
    [];
  const subject = runtime.subjects.find(
    (s) => s.lifecycleId === dominantSlice.id,
  )!;
  const walk: { transitionId: string; ok: boolean; text?: string; state?: string }[] =
    [];
  let failed: string | undefined;

  for (const tid of path) {
    const action = boot.spec.actions.find(
      (a) =>
        a.transitionId === tid && a.lifecycleId === dominantSlice.id,
    );
    if (!action) {
      walk.push({ transitionId: tid, ok: false, text: "sin acción UI" });
      failed = `sin acción para ${tid}`;
      break;
    }
    const roleId =
      action.visibleRoles.find((r) => r !== "cliente") ??
      action.visibleRoles[0] ??
      boot.roles[0]!.id;
    const r = executeUiAction(runtime, {
      actionId: action.id,
      subjectId: subject.id,
      clientRequestId: `walk-${profileId}-${tid}-${Date.now()}`,
      roleId,
      parteId: subject.parteId,
      channel: "backoffice",
      kind: "boton",
    });
    walk.push({
      transitionId: tid,
      ok: r.ok,
      text: r.flash.text,
      state: r.newStateId,
    });
    if (!r.ok) {
      failed = r.flash.text;
      break;
    }
  }

  results.push({
    profileId,
    dominant: dominantSlice.archetypeId,
    lifecycleId: dominantSlice.id,
    path,
    walk,
    failed: failed ?? null,
    finalEvents: runtime.store.getBySubject(subject.id).length,
  });
  runtime.close();
  rmSync(dir, { recursive: true, force: true });
}

writeFileSync("tmp/happy-walk-probe.json", JSON.stringify(results, null, 2));
console.log("done", results.length);
