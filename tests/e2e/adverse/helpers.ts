/**
 * Helpers E2E adversos: arranque, fuerza Observador, saldo, clicks UI.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { withFactPayload } from "../../../facts/projection.js";
import type { TransitionEvent } from "../../../core/events.js";
import {
  AppRuntime,
  bootProfile,
  startMultiTenantWebServer,
  startWebServer,
  type MultiTenantHandle,
  type WebServerHandle,
} from "../../../web/index.js";
import { happyPathFieldsForTransition } from "../happy-path-fields.js";
import type { Transition } from "../../../core/lifecycle.js";

export interface AdverseApp {
  readonly handle: WebServerHandle;
  readonly runtime: AppRuntime;
  readonly url: string;
  readonly profileId: string;
  close(): Promise<void>;
}

export function injectForceGrant(
  runtime: AppRuntime,
  transitionId: string,
  roleId: string,
): string {
  const id = `force:adverse-${transitionId}-${roleId}`;
  runtime.observerForceGrants.push({
    transitionId,
    allowedRoles: [roleId],
  });
  return id;
}

/** Deuda abierta para activar parte.saldo_pendiente. */
export function seedSaldoPendiente(
  runtime: AppRuntime,
  parteId: string,
  importe: number,
): void {
  const ev = withFactPayload(
    {
      id: `seed-deuda-${parteId}-${Date.now()}`,
      kind: "transicion",
      subjectId: `tx-deuda-seed-${parteId}`,
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: "seed",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "seed",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      transitionId: "t_acordar",
      fromStateId: "propuesta",
      toStateId: "acordado",
    } as TransitionEvent,
    { parteId, importe },
  );
  runtime.store.append(ev);
  runtime.facts.applyEvent(runtime.tenantId, ev);
}

export async function startAdverseApp(
  profileId: string,
): Promise<AdverseApp> {
  const dir = mkdtempSync(join(tmpdir(), "abs-adv-"));
  const boot = bootProfile(profileId);
  const runtime = AppRuntime.open(boot, {
    dbPath: join(dir, "events.sqlite"),
    tenantId: `tenant-${profileId}`,
  });
  const handle = await startWebServer(boot, {
    port: 0,
    runtime,
  });
  return {
    handle,
    runtime,
    url: handle.url,
    profileId,
    close: () => handle.close(),
  };
}

export async function startTwoCompanyApp(
  profileA: string,
  profileB: string,
): Promise<{
  readonly multi: MultiTenantHandle;
  readonly url: string;
  readonly keyA: string;
  readonly keyB: string;
  close(): Promise<void>;
}> {
  const dir = mkdtempSync(join(tmpdir(), "abs-mt-"));
  const bootA = bootProfile(profileA);
  const bootB = bootProfile(profileB);
  const keyA = "empresa-a";
  const keyB = "empresa-b";
  const runtimeA = AppRuntime.open(bootA, {
    dbPath: join(dir, "a.sqlite"),
    tenantId: keyA,
  });
  const runtimeB = AppRuntime.open(bootB, {
    dbPath: join(dir, "b.sqlite"),
    tenantId: keyB,
  });
  const multi = await startMultiTenantWebServer(
    [
      { key: keyA, boot: bootA, runtime: runtimeA },
      { key: keyB, boot: bootB, runtime: runtimeB },
    ],
    { port: 0 },
  );
  return {
    multi,
    url: multi.url,
    keyA,
    keyB,
    close: () => multi.close(),
  };
}

export function subjectForArchetype(
  runtime: AppRuntime,
  archetypeId: string,
) {
  const slice = runtime.boot.input.lifecycles.find(
    (l) => l.archetypeId === archetypeId,
  );
  if (!slice) return undefined;
  return runtime.subjects.find((s) => s.lifecycleId === slice.id);
}

export function actionForTransition(
  runtime: AppRuntime,
  lifecycleId: string,
  transitionId: string,
  preferredRole?: string,
) {
  const candidates = runtime.boot.spec.actions.filter(
    (a) => a.lifecycleId === lifecycleId && a.transitionId === transitionId,
  );
  if (preferredRole) {
    const hit = candidates.find((a) => a.visibleRoles.includes(preferredRole));
    if (hit) return { action: hit, roleId: preferredRole };
  }
  const action = candidates[0];
  if (!action) return undefined;
  return { action, roleId: action.visibleRoles[0] ?? "gerente" };
}

export async function enterUi(
  page: Page,
  baseUrl: string,
  opts: {
    readonly roleId: string;
    readonly parteId?: string;
    readonly group?: string;
    readonly view?: string;
    readonly tenant?: string;
    readonly sede?: string;
    readonly sedeScoped?: boolean;
  },
): Promise<void> {
  const q = new URLSearchParams({ role: opts.roleId });
  if (opts.parteId) q.set("parte", opts.parteId);
  if (opts.group) q.set("group", opts.group);
  if (opts.view) q.set("view", opts.view);
  if (opts.tenant) q.set("tenant", opts.tenant);
  if (opts.sede) q.set("sede", opts.sede);
  if (opts.sedeScoped) q.set("sedeScoped", "1");
  await page.goto(`${baseUrl}?${q.toString()}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(`[data-role="${opts.roleId}"]`);
}

export async function clickTransition(
  page: Page,
  app: AdverseApp,
  opts: {
    readonly archetypeId: string;
    readonly transitionId: string;
    readonly roleId?: string;
    readonly formFields?: Readonly<Record<string, string>>;
    readonly force?: {
      readonly reason: string;
      readonly ruleIds: readonly string[];
    };
    readonly expectOk?: boolean;
  },
): Promise<{ ok: boolean; flash: string; flashKind: string | null }> {
  const sub = subjectForArchetype(app.runtime, opts.archetypeId);
  if (!sub) {
    return { ok: false, flash: "sin sujeto", flashKind: "error" };
  }
  const found = actionForTransition(
    app.runtime,
    sub.lifecycleId,
    opts.transitionId,
    opts.roleId,
  );
  if (!found) {
    return { ok: false, flash: "sin acción", flashKind: "error" };
  }
  const lifeTr = app.runtime.lifecycleForSubject(sub.id)?.lifecycle.transitions.find(
    (t: Transition) => t.id === opts.transitionId,
  );
  const happy =
    opts.expectOk === false
      ? {}
      : lifeTr
        ? happyPathFieldsForTransition(app.runtime.boot.input.ruleSet, lifeTr)
        : {};
  const mergedFields = { ...happy, ...(opts.formFields ?? {}) };
  const group = app.runtime.boot.spec.processGroups?.find(
    (g) => g.archetypeId === opts.archetypeId,
  )?.id;

  await enterUi(page, app.url, {
    roleId: found.roleId,
    parteId: sub.parteId,
    ...(group ? { group } : {}),
  });

  let form = page.locator(
    `form.action-form:has(button[data-action-id="${found.action.id}"][data-subject="${sub.id}"])`,
  );
  if ((await form.count()) === 0) {
    form = page.locator(
      `form.action-form:has(button[data-action-id="${found.action.id}"])`,
    );
  }
  if ((await form.count()) === 0) {
    form = page.locator(
      `form.action-form:has(button[data-transition="${opts.transitionId}"])`,
    );
  }
  if ((await form.count()) === 0) {
    // Reentrar sin vista fija
    await enterUi(page, app.url, {
      roleId: found.roleId,
      parteId: sub.parteId,
      ...(group ? { group } : {}),
    });
    form = page.locator(
      `form.action-form:has(button[data-transition="${opts.transitionId}"])`,
    );
  }
  if ((await form.count()) === 0) {
    // Fallback: petición desde el navegador (misma origen; fuerza URL/acción)
    const body: Record<string, string> = {
      actionId: found.action.id,
      subjectId: sub.id,
      roleId: found.roleId,
      parteId: sub.parteId,
      channel: "backoffice",
      kind: "boton",
      clientRequestId: `ui-fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    };
    if (Object.keys(mergedFields).length > 0) {
      for (const [k, v] of Object.entries(mergedFields)) {
        body[`field.${k}`] = v;
      }
    }
    if (opts.force) {
      body.forceEnabled = "1";
      body.forceReason = opts.force.reason;
      body.forceRuleIds = opts.force.ruleIds.join(",");
    }
    const res = await postActionFromBrowser(page, app.url, body);
    const json = res.json as {
      ok?: boolean;
      flash?: { kind?: string; text?: string };
    };
    const actionOk = json?.ok === true;
    const flashText = json?.flash?.text ?? res.text;
    const flashKind = json?.flash?.kind ?? (actionOk ? "ok" : "error");
    return interpretExpect(actionOk, flashText, flashKind, opts.expectOk);
  }
  const target = form.first();

  if (Object.keys(mergedFields).length > 0) {
    for (const [name, value] of Object.entries(mergedFields)) {
      const input = target.locator(`[name="field.${name}"]`);
      if ((await input.count()) > 0) {
        await input.fill(value);
      } else {
        await page.evaluate(
          `(() => {
            const n = ${JSON.stringify(name)};
            const v = ${JSON.stringify(value)};
            const f = document.querySelector('form.action-form input[name="actionId"]')?.closest('form');
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
  }

  // Forzado / campos ocultos: POST desde el navegador (details cerrado no es clicable)
  if (opts.force || Object.keys(mergedFields).length > 0) {
    const body: Record<string, string> = {
      actionId: found.action.id,
      subjectId: sub.id,
      roleId: found.roleId,
      parteId: sub.parteId,
      channel: "backoffice",
      kind: "boton",
      clientRequestId: `ui-post-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    };
    if (Object.keys(mergedFields).length > 0) {
      for (const [k, v] of Object.entries(mergedFields)) {
        body[`field.${k}`] = v;
      }
    }
    if (opts.force) {
      body.forceEnabled = "1";
      body.forceReason = opts.force.reason;
      body.forceRuleIds = opts.force.ruleIds.join(",");
    }
    const res = await postActionFromBrowser(page, app.url, body);
    const json = res.json as {
      ok?: boolean;
      flash?: { kind?: string; text?: string };
    };
    const actionOk = json?.ok === true;
    const flashText = json?.flash?.text ?? res.text;
    const flashKind = json?.flash?.kind ?? (actionOk ? "ok" : "error");
    return interpretExpect(actionOk, flashText, flashKind, opts.expectOk);
  }

  await target.locator('button[type="submit"]').first().click();
  await page.waitForLoadState("domcontentloaded");

  const flash = page.locator("[data-flash]");
  const flashText =
    (await flash.count()) > 0 ? (await flash.first().innerText()).trim() : "";
  const flashKind =
    (await flash.count()) > 0
      ? await flash.first().getAttribute("data-flash")
      : null;
  const actionOk = flashKind === "ok";
  return interpretExpect(actionOk, flashText, flashKind, opts.expectOk);
}

/** ok=true = la expectativa del escenario se cumplió (éxito o rechazo, según expectOk). */
function interpretExpect(
  actionOk: boolean,
  flashText: string,
  flashKind: string | null,
  expectOk: boolean | undefined,
): { ok: boolean; flash: string; flashKind: string | null } {
  if (expectOk === true) {
    return {
      ok: actionOk,
      flash: actionOk ? flashText : flashText || "esperaba ok",
      flashKind,
    };
  }
  if (expectOk === false) {
    return {
      ok: !actionOk,
      flash: actionOk
        ? flashText || "esperaba rechazo pero la acción tuvo éxito"
        : flashText,
      flashKind,
    };
  }
  return { ok: actionOk, flash: flashText, flashKind };
}

/** POST /action vía fetch del navegador (forzar URL / subject ajeno). */
export async function postActionFromBrowser(
  page: Page,
  baseUrl: string,
  body: Record<string, string>,
): Promise<{ status: number; json?: unknown; text: string }> {
  // Asegurar origen (fetch relativo falla si about:blank)
  if (!page.url().startsWith(baseUrl.replace(/\/$/, ""))) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  }
  const res = await page.request.post(new URL("/action", baseUrl).toString(), {
    form: body,
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status(), json, text };
}

export async function withBrowser<T>(
  browser: Browser,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    return await fn(page);
  } finally {
    await ctx.close();
  }
}
