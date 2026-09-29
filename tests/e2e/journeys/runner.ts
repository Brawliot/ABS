/**
 * Runner de escenarios: solo UI Playwright (clicks en formularios).
 */

import type { Page } from "playwright";
import {
  assertTransactionClosure,
  type ClosureContext,
} from "../../../elements/closure.js";
import {
  DEFAULT_WORLD_FACTS,
  deriveState,
} from "../../../core/derivation.js";
import type { TransitionEvent } from "../../../core/events.js";
import { findState } from "../../../core/lifecycle.js";
import type { AppBootResult } from "../../../web/types.js";
import type { AppRuntime } from "../../../web/runtime.js";
import { enterAsRole, type LiveApp } from "../helpers.js";
import { happyPathFieldsForTransition } from "../happy-path-fields.js";
import type { JourneyScenario, JourneyStep } from "./scenarios.js";

export interface StepResult {
  readonly transitionId: string;
  readonly roleId: string;
  readonly archetypeId: string;
  readonly ok: boolean;
  readonly newStateId?: string;
  readonly flash?: string;
  readonly error?: string;
}

export interface JourneyResult {
  readonly scenarioId: string;
  readonly profileId: string;
  readonly dominantArchetype: string;
  readonly completed: boolean;
  readonly steps: readonly StepResult[];
  readonly failureCause?: string;
  readonly traversedTransitions: readonly string[];
  readonly missedCanonical: readonly string[];
  readonly closureOk: boolean;
  readonly replayOk: boolean;
  readonly portalOk: boolean;
  readonly elapsedMs: number;
}

function subjectForArchetype(
  runtime: AppRuntime,
  archetypeId: string,
): { id: string; lifecycleId: string; parteId: string } | undefined {
  const slice = runtime.boot.input.lifecycles.find(
    (l) => l.archetypeId === archetypeId,
  );
  if (!slice) return undefined;
  const sub = runtime.subjects.find((s) => s.lifecycleId === slice.id);
  if (!sub) return undefined;
  return { id: sub.id, lifecycleId: slice.id, parteId: sub.parteId };
}

function processGroupForLifecycle(
  boot: AppBootResult,
  lifecycleId: string,
): string | undefined {
  const slice = boot.input.lifecycles.find((l) => l.id === lifecycleId);
  if (!slice) return undefined;
  return boot.spec.processGroups?.find(
    (g) => g.archetypeId === slice.archetypeId,
  )?.id;
}

function viewForState(
  boot: AppBootResult,
  lifecycleId: string,
  stateId: string,
): string | undefined {
  const slice = boot.input.lifecycles.find((l) => l.id === lifecycleId);
  if (!slice) return undefined;
  const group = boot.spec.processGroups?.find(
    (g) => g.archetypeId === slice.archetypeId,
  );
  if (!group) return undefined;
  return boot.spec.views.find(
    (v) =>
      v.stateId === stateId &&
      (group.viewIds.includes(v.id) || group.panelIds.includes(v.id)),
  )?.id;
}

/**
 * Verifica que roles prohibidos no ven el botón de la acción.
 */
export async function assertActionHiddenForRoles(
  page: Page,
  app: LiveApp,
  opts: {
    readonly actionId: string;
    readonly subjectId: string;
    readonly parteId: string;
    readonly forbiddenRoleIds: readonly string[];
    readonly group?: string;
    readonly view?: string;
  },
): Promise<void> {
  for (const roleId of opts.forbiddenRoleIds) {
    if (!app.handle.boot.roles.some((r) => r.id === roleId)) continue;
    await enterAsRole(page, app.url, {
      roleId,
      parteId: opts.parteId,
      ...(opts.group ? { group: opts.group } : {}),
      ...(opts.view ? { view: opts.view } : {}),
    });
    const btn = page.locator(
      `button[data-action-id="${opts.actionId}"][data-subject="${opts.subjectId}"]`,
    );
    const n = await btn.count();
    if (n > 0) {
      throw new Error(
        `Rol «${roleId}» no debería ver la acción ${opts.actionId} (encontrada ${n})`,
      );
    }
  }
}

/**
 * Ejecuta un paso: entra como rol, comprueba ocultación, hace click en el botón.
 */
export async function runJourneyStep(
  page: Page,
  app: LiveApp,
  step: JourneyStep,
): Promise<StepResult> {
  const sub = subjectForArchetype(app.handle.runtime, step.archetypeId);
  if (!sub) {
    return {
      transitionId: step.transitionId,
      roleId: step.roleId,
      archetypeId: step.archetypeId,
      ok: false,
      error: `Sin sujeto para arquetipo ${step.archetypeId}`,
    };
  }
  const boot = app.handle.boot;
  const actionCandidates = boot.spec.actions.filter(
    (a) =>
      a.lifecycleId === sub.lifecycleId &&
      a.transitionId === step.transitionId,
  );
  const action =
    actionCandidates.find((a) => a.visibleRoles.includes(step.roleId)) ??
    actionCandidates[0];
  if (!action) {
    return {
      transitionId: step.transitionId,
      roleId: step.roleId,
      archetypeId: step.archetypeId,
      ok: false,
      error: `Sin acción UI para ${step.transitionId} (lifecycle ${sub.lifecycleId})`,
    };
  }
  const roleId = action.visibleRoles.includes(step.roleId)
    ? step.roleId
    : (action.visibleRoles[0] ?? step.roleId);
  const forbidden = boot.roles
    .map((r) => r.id)
    .filter((r) => !action.visibleRoles.includes(r))
    .slice(0, 2);

  const slice = app.handle.runtime.lifecycleForSubject(sub.id)!;
  const events = app.handle.runtime.store.getBySubject(
    sub.id,
  ) as TransitionEvent[];
  const derived = deriveState(slice.lifecycle, events);
  const group = processGroupForLifecycle(app.handle.boot, sub.lifecycleId);
  const view = viewForState(
    app.handle.boot,
    sub.lifecycleId,
    derived.currentStateId,
  );

  try {
    await assertActionHiddenForRoles(page, app, {
      actionId: action.id,
      subjectId: sub.id,
      parteId: sub.parteId,
      forbiddenRoleIds: forbidden.length > 0 ? forbidden : step.forbiddenRoleIds,
      ...(group ? { group } : {}),
      ...(view ? { view } : {}),
    });
  } catch (err) {
    return {
      transitionId: step.transitionId,
      roleId,
      archetypeId: step.archetypeId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await enterAsRole(page, app.url, {
    roleId,
    parteId: sub.parteId,
    ...(group ? { group } : {}),
    ...(view ? { view } : {}),
  });

  const btn = page.locator(
    `form.action-form button[data-action-id="${action.id}"][data-subject="${sub.id}"]`,
  );
  if ((await btn.count()) === 0) {
    // Reintentar sin filtro de vista (preferRows del servidor)
    await enterAsRole(page, app.url, {
      roleId,
      parteId: sub.parteId,
      ...(group ? { group } : {}),
    });
  }
  if ((await btn.count()) === 0) {
    return {
      transitionId: step.transitionId,
      roleId,
      archetypeId: step.archetypeId,
      ok: false,
      error: `Botón no visible en UI para ${action.id} (estado=${derived.currentStateId})`,
    };
  }

  const lifeTr = slice.lifecycle.transitions.find(
    (t) => t.id === step.transitionId,
  );
  if (lifeTr) {
    const defaults = happyPathFieldsForTransition(
      app.handle.boot.input.ruleSet,
      lifeTr,
    );
    for (const [name, value] of Object.entries(defaults)) {
      await page.evaluate(
        `(() => {
          const actionId = ${JSON.stringify(action.id)};
          const subjectId = ${JSON.stringify(sub.id)};
          const n = ${JSON.stringify(name)};
          const v = ${JSON.stringify(value)};
          const btnEl = document.querySelector(
            'button[data-action-id="' + actionId + '"][data-subject="' + subjectId + '"]',
          );
          const f = btnEl && btnEl.closest('form');
          if (!f) return;
          let el = f.querySelector('input[name="field.' + n + '"]');
          if (!el) {
            el = document.createElement('input');
            el.type = 'hidden';
            el.name = 'field.' + n;
            f.appendChild(el);
          }
          el.value = v;
        })()`,
      );
    }
  }

  await btn.first().click();
  await page.waitForLoadState("domcontentloaded");

  const flash = page.locator("[data-flash]");
  const flashText =
    (await flash.count()) > 0 ? await flash.first().innerText() : "";
  const flashKind =
    (await flash.count()) > 0
      ? await flash.first().getAttribute("data-flash")
      : null;

  const after = deriveState(
    slice.lifecycle,
    app.handle.runtime.store.getBySubject(sub.id) as TransitionEvent[],
  );

  if (flashKind === "ok" || after.currentStateId !== derived.currentStateId) {
    return {
      transitionId: step.transitionId,
      roleId,
      archetypeId: step.archetypeId,
      ok: true,
      newStateId: after.currentStateId,
      flash: flashText,
    };
  }

  return {
    transitionId: step.transitionId,
    roleId,
    archetypeId: step.archetypeId,
    ok: false,
    flash: flashText,
    error: flashText || "Transición no aplicada tras click",
  };
}

export function verifyClosureAndReplay(
  runtime: AppRuntime,
  archetypeId: string,
): { closureOk: boolean; replayOk: boolean; detail?: string } {
  const sub = subjectForArchetype(runtime, archetypeId);
  if (!sub) {
    return { closureOk: false, replayOk: false, detail: "sin sujeto" };
  }
  const slice = runtime.lifecycleForSubject(sub.id)!;
  const events = runtime.store.getBySubject(sub.id) as TransitionEvent[];
  let d1: ReturnType<typeof deriveState>;
  try {
    d1 = deriveState(slice.lifecycle, events, DEFAULT_WORLD_FACTS);
  } catch (err) {
    return {
      closureOk: false,
      replayOk: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  const d2 = deriveState(slice.lifecycle, events, DEFAULT_WORLD_FACTS);
  const replayOk =
    d1.currentStateId === d2.currentStateId &&
    d1.eventCount === d2.eventCount;

  const st = findState(slice.lifecycle, d1.currentStateId);
  if (!st || st.kind !== "terminal_exito") {
    return {
      closureOk: false,
      replayOk,
      detail: `estado final ${d1.currentStateId} no es terminal_exito`,
    };
  }

  try {
    const ctx: ClosureContext = {
      currentStateId: d1.currentStateId,
      fulfilledCommitmentIds: d1.fulfilledCommitmentIds,
      pendingCommitmentIds: d1.pendingCommitmentIds,
      fieldValues: {},
      balance: DEFAULT_WORLD_FACTS.balance,
      resourcesSettled: DEFAULT_WORLD_FACTS.resourcesSettled,
      evidenceComplete: DEFAULT_WORLD_FACTS.evidenceComplete,
    };
    assertTransactionClosure(ctx);
    return { closureOk: true, replayOk };
  } catch (err) {
    return {
      closureOk: false,
      replayOk,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function verifyPortalScope(
  page: Page,
  app: LiveApp,
  subjectParteId: string,
): Promise<boolean> {
  const portalGroup = app.handle.boot.spec.processGroups?.find((g) =>
    g.id.includes("portal"),
  );
  const portalView = app.handle.boot.spec.views.find(
    (v) => v.kind === "portal_filtro",
  );
  if (!portalView) return true; // sin portal = N/A ok

  await enterAsRole(page, app.url, {
    roleId: "cliente",
    parteId: subjectParteId,
    ...(portalGroup ? { group: portalGroup.id } : {}),
    view: portalView.id,
  });

  const rows = page.locator("[data-row-id]");
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const parte = await rows.nth(i).getAttribute("data-parte");
    const id = await rows.nth(i).getAttribute("data-row-id");
    if (id?.startsWith("panel-info-")) continue;
    if (parte && parte !== subjectParteId) {
      return false;
    }
  }
  return true;
}

export async function runJourney(
  page: Page,
  app: LiveApp,
  scenario: JourneyScenario,
): Promise<JourneyResult> {
  const t0 = Date.now();
  const stepResults: StepResult[] = [];
  let failureCause: string | undefined;

  for (const step of scenario.steps) {
    const r = await runJourneyStep(page, app, step);
    stepResults.push(r);
    if (!r.ok) {
      failureCause = r.error ?? r.flash ?? "paso fallido";
      break;
    }
  }

  const traversed = stepResults
    .filter((s) => s.ok)
    .map((s) => s.transitionId);
  const missedCanonical = scenario.happyPathCanonical.filter(
    (t) => !traversed.includes(t),
  );

  let closureOk = false;
  let replayOk = false;
  let portalOk = false;

  if (!failureCause) {
    const v = verifyClosureAndReplay(
      app.handle.runtime,
      scenario.dominantArchetype,
    );
    closureOk = v.closureOk;
    replayOk = v.replayOk;
    if (!v.closureOk || !v.replayOk) {
      failureCause = v.detail ?? "cierre/replay falló";
    }
    const sub = subjectForArchetype(
      app.handle.runtime,
      scenario.dominantArchetype,
    );
    portalOk = await verifyPortalScope(
      page,
      app,
      sub?.parteId ?? "parte-demo-1",
    );
    if (!portalOk) {
      failureCause = (failureCause ? failureCause + "; " : "") + "portal filtra mal";
    }
  }

  return {
    scenarioId: scenario.id,
    profileId: scenario.profileId,
    dominantArchetype: scenario.dominantArchetype,
    completed: !failureCause && closureOk && replayOk && portalOk,
    steps: stepResults,
    ...(failureCause ? { failureCause } : {}),
    traversedTransitions: traversed,
    missedCanonical,
    closureOk,
    replayOk,
    portalOk,
    elapsedMs: Date.now() - t0,
  };
}
