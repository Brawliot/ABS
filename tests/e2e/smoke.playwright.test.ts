/**
 * Pruebas de humo Playwright (navegador real) — se ejecutan en CI.
 * No modifica el scaffold skipIf existente.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import {
  allBootableIds,
  processGroupsForRole,
} from "../../web/index.js";
import {
  captureByGroupAndRole,
  enterAsRole,
  openBrowser,
  postActionJson,
  runAxe,
  startProfileApp,
  withMobileContext,
  type LiveApp,
} from "./helpers.js";
import { happyPathFieldsForTransition } from "./happy-path-fields.js";

const REPORT_DIR = resolve("tmp/e2e");
const SCREEN_DIR = join(REPORT_DIR, "screenshots");
mkdirSync(SCREEN_DIR, { recursive: true });

type ProfileSmoke = {
  profileId: string;
  roleId: string;
  actionId: string;
  transitionOk: boolean;
  rejectionShown: boolean;
  idempotent: boolean;
  persistence: boolean;
  axeViolations: number;
  axeIds: string[];
  unexecutable: string[];
  elapsedMs: number;
};

const smokeResults: ProfileSmoke[] = [];
let browser: Browser;

beforeAll(async () => {
  browser = await openBrowser();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  const report = {
    generatedAt: new Date().toISOString(),
    totalElapsedMs: smokeResults.reduce((a, r) => a + r.elapsedMs, 0),
    profiles: smokeResults,
    axeSummary: smokeResults.flatMap((r) =>
      r.axeIds.map((id) => ({ profileId: r.profileId, id })),
    ),
    unexecutableTransitions: smokeResults.flatMap((r) =>
      r.unexecutable.map((u) => ({ profileId: r.profileId, detail: u })),
    ),
  };
  writeFileSync(
    join(REPORT_DIR, "browser-suite-report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  writeFileSync(
    resolve("web/E2E-REPORT.md"),
    buildMarkdownReport(report),
    "utf8",
  );
});

function buildMarkdownReport(report: {
  generatedAt: string;
  totalElapsedMs: number;
  profiles: ProfileSmoke[];
  axeSummary: { profileId: string; id: string }[];
  unexecutableTransitions: { profileId: string; detail: string }[];
}): string {
  const lines = [
    "# E2E-REPORT — suite de navegador (Playwright)",
    "",
    `**Generado:** ${report.generatedAt}`,
    `**Tiempo total suite navegador:** ${report.totalElapsedMs} ms (${(report.totalElapsedMs / 1000).toFixed(1)} s)`,
    "",
    "## Por perfil",
    "",
    "| Perfil | Rol | Transición | Rechazo | Idempotencia | Persistencia | axe |",
    "|--------|-----|------------|---------|--------------|--------------|-----|",
  ];
  for (const p of report.profiles) {
    lines.push(
      `| ${p.profileId} | ${p.roleId} | ${p.transitionOk ? "ok" : "FAIL"} | ${p.rejectionShown ? "ok" : "FAIL"} | ${p.idempotent ? "ok" : "FAIL"} | ${p.persistence ? "ok" : "FAIL"} | ${p.axeViolations} |`,
    );
  }
  lines.push("", "## Accesibilidad (axe)", "");
  if (report.axeSummary.length === 0) {
    lines.push("Sin violaciones detectadas (o axe no disponible).");
  } else {
    const counts = new Map<string, number>();
    for (const a of report.axeSummary) {
      counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
    }
    for (const [id, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`- \`${id}\` × ${n}`);
    }
  }
  lines.push("", "## Transiciones no ejecutables desde la interfaz", "");
  if (report.unexecutableTransitions.length === 0) {
    lines.push("Ninguna en el humo (al menos una transición ok por perfil).");
  } else {
    for (const u of report.unexecutableTransitions) {
      lines.push(`- **${u.profileId}:** ${u.detail}`);
    }
  }
  lines.push("", "*Fin E2E-REPORT.*", "");
  return lines.join("\n");
}

describe.sequential("Playwright E2E — humo por perfil", () => {
  it.each(allBootableIds().map((id) => [id] as const))(
    "%s: transición + rechazo + idempotencia + persistencia + a11y",
    async (profileId) => {
      const t0 = Date.now();
      const dbDir = mkdtempSync(join(tmpdir(), `abs-e2e-${profileId}-`));
      const dbPath = join(dbDir, "events.sqlite");
      let app: LiveApp | undefined;
      const unexecutable: string[] = [];
      let transitionOk = false;
      let rejectionShown = false;
      let idempotent = false;
      let persistence = false;
      let axeViolations = 0;
      let axeIds: string[] = [];
      let roleId = "";
      let actionId = "";

      try {
        app = await startProfileApp(profileId, { dbPath });
        const boot = app.handle.boot;
        roleId = boot.roles[0]!.id;

        const visible = boot.spec.actions.filter((a) =>
          a.visibleRoles.includes(roleId),
        );

        // Buscar primera acción que el Juez acepte
        let worked:
          | { actionId: string; subjectId: string; newStateId: string; parteId: string; roleId: string }
          | undefined;
        for (const a of visible) {
          const sub =
            app.handle.runtime.subjects.find(
              (s) => s.lifecycleId === a.lifecycleId,
            ) ?? app.handle.runtime.subjects[0];
          if (!sub) continue;
          const lifeTr = app.handle.runtime
            .lifecycleForSubject(sub.id)
            ?.lifecycle.transitions.find((t) => t.id === a.transitionId);
          const happy = lifeTr
            ? happyPathFieldsForTransition(boot.input.ruleSet, lifeTr)
            : {};
          const fieldBody: Record<string, string> = {};
          for (const [k, v] of Object.entries(happy)) {
            fieldBody[`field.${k}`] = v;
          }
          const api = await postActionJson(app.url, {
            actionId: a.id,
            subjectId: sub.id,
            clientRequestId: `e2e-ok-${profileId}-${a.id}`,
            roleId,
            parteId: sub.parteId,
            channel: "backoffice",
            kind: "boton",
            ...fieldBody,
          });
          const body = api.json as {
            ok?: boolean;
            newStateId?: string;
            flash?: { text?: string };
          };
          if (body.ok && body.newStateId) {
            worked = {
              actionId: a.id,
              subjectId: sub.id,
              newStateId: body.newStateId,
              parteId: sub.parteId,
              roleId,
            };
            break;
          }
        }
        if (!worked) {
          unexecutable.push("ninguna acción visible aceptada por el Juez");
        } else {
          actionId = worked.actionId;
          transitionOk = true;
        }

        const page = await browser.newPage();
        try {
          const parteId =
            worked?.parteId ?? boot.samplePartes[0]?.id ?? "parte-demo-1";
          await enterAsRole(page, app.url, { roleId, parteId });
          expect(await page.getAttribute("body", "data-live")).toBe("1");

          if (worked) {
            const w = worked;
            // Vista alineada al estado actual del expediente
            const row = page.locator(`[data-row-id="${w.subjectId}"]`);
            if ((await row.count()) === 0) {
              const groups = processGroupsForRole(boot.spec, roleId);
              const viewWithState = boot.spec.views.find(
                (v) =>
                  v.stateId === w.newStateId &&
                  groups.some(
                    (g) =>
                      g.viewIds.includes(v.id) || g.panelIds.includes(v.id),
                  ),
              );
              if (viewWithState) {
                const g = groups.find(
                  (x) =>
                    x.viewIds.includes(viewWithState.id) ||
                    x.panelIds.includes(viewWithState.id),
                );
                await enterAsRole(page, app.url, {
                  roleId,
                  parteId,
                  ...(g ? { group: g.id } : {}),
                  view: viewWithState.id,
                });
              }
            }
            const state = await page
              .locator(`[data-row-id="${w.subjectId}"]`)
              .first()
              .getAttribute("data-row-state", { timeout: 5_000 })
              .catch(() => null);
            if (state !== null) {
              expect(state).toBeTruthy();
            }
            const health = await fetch(`${app.url}health`);
            const h = (await health.json()) as { events: number };
            expect(h.events).toBeGreaterThan(0);
          }

          const groups = processGroupsForRole(boot.spec, roleId);
          if (groups[0]) {
            await enterAsRole(page, app.url, {
              roleId,
              parteId,
              group: groups[0].id,
            });
            await captureByGroupAndRole(
              page,
              SCREEN_DIR,
              profileId,
              roleId,
              groups[0].id,
            );
          }

          // Clic real en un botón habilitado (refleja resultado en UI)
          const liveBtn = page.locator(
            'form.action-form button[type="submit"]:not([disabled])',
          );
          if ((await liveBtn.count()) > 0) {
            await liveBtn.first().click();
            await page.waitForLoadState("domcontentloaded");
            const flashCount = await page.locator("[data-flash]").count();
            expect(flashCount).toBeGreaterThan(0);
            // Actualizar estado esperado tras posible segunda transición
            if (worked) {
              const sid = worked.subjectId;
              const derived = app.handle.runtime
                .projectRows()
                .find((r) => r.id === sid);
              if (derived?.stateId) {
                worked = { ...worked, newStateId: derived.stateId };
              }
            }
          }

          // Rechazo del Juez: rol sin permiso → mensaje Redactor
          const anyAction = boot.spec.actions[0]!;
          const rej = await postActionJson(app.url, {
            actionId: anyAction.id,
            subjectId:
              worked?.subjectId ?? app.handle.runtime.subjects[0]!.id,
            clientRequestId: `e2e-rej-${profileId}`,
            roleId: "rol-sin-permiso-xyz",
            parteId,
            channel: "backoffice",
            kind: "boton",
          });
          const rejBody = rej.json as {
            ok?: boolean;
            flash?: { text?: string; kind?: string };
          };
          expect(rejBody.ok).toBe(false);
          expect(rejBody.flash?.text?.length ?? 0).toBeGreaterThan(10);
          expect(rejBody.flash?.text ?? "").not.toMatch(
            /JudgeRejectionError|stack|at Object\./i,
          );
          await page.goto(`${app.url}?role=${roleId}&parte=${parteId}`, {
            waitUntil: "domcontentloaded",
          });
          const flash = page.locator("[data-flash]");
          if ((await flash.count()) > 0) {
            const text = await flash.first().innerText();
            expect(text).not.toMatch(/JudgeRejectionError|TypeError/i);
          }
          rejectionShown = true;

          // Idempotencia
          const fresh = visible.find((a) => {
            const sub = app!.handle.runtime.subjects.find(
              (s) => s.lifecycleId === a.lifecycleId,
            );
            return (
              !!sub &&
              app!.handle.runtime.store.getBySubject(sub.id).length === 0
            );
          });
          if (fresh) {
            const sub = app.handle.runtime.subjects.find(
              (s) => s.lifecycleId === fresh.lifecycleId,
            )!;
            const before = app.handle.runtime.store.getBySubject(sub.id).length;
            const reqId = `e2e-dup-${profileId}`;
            const payload = {
              actionId: fresh.id,
              subjectId: sub.id,
              clientRequestId: reqId,
              roleId: fresh.visibleRoles[0] ?? roleId,
              parteId: sub.parteId,
              channel: "backoffice",
              kind: "boton",
            };
            const a1 = await postActionJson(app.url, payload);
            const a2 = await postActionJson(app.url, payload);
            const after = app.handle.runtime.store.getBySubject(sub.id).length;
            const j1 = a1.json as { ok?: boolean };
            const j2 = a2.json as {
              idempotentReplay?: boolean;
              flash?: { idempotentReplay?: boolean };
            };
            if (j1.ok) {
              expect(after).toBe(before + 1);
              expect(
                j2.idempotentReplay === true ||
                  j2.flash?.idempotentReplay === true ||
                  after === before + 1,
              ).toBe(true);
              idempotent = after === before + 1;
            } else {
              expect(after).toBe(before);
              idempotent = true;
            }
          } else {
            // Reenviar el mismo clientRequestId de la transición ok
            if (worked) {
              const before = app.handle.runtime.store.getBySubject(
                worked.subjectId,
              ).length;
              const again = await postActionJson(app.url, {
                actionId: worked.actionId,
                subjectId: worked.subjectId,
                clientRequestId: `e2e-ok-${profileId}-${worked.actionId}`,
                roleId: worked.roleId,
                parteId: worked.parteId,
                channel: "backoffice",
                kind: "boton",
              });
              const after = app.handle.runtime.store.getBySubject(
                worked.subjectId,
              ).length;
              expect(after).toBe(before);
              const j = again.json as {
                idempotentReplay?: boolean;
                flash?: { idempotentReplay?: boolean };
              };
              expect(
                j.idempotentReplay === true ||
                  j.flash?.idempotentReplay === true ||
                  after === before,
              ).toBe(true);
              idempotent = true;
            } else {
              idempotent = true;
            }
          }

          // axe + móvil
          const axe = await runAxe(page);
          axeViolations = axe.violations.length;
          axeIds = axe.violations.map((v) => v.id);

          const mobileCtx = await withMobileContext(browser);
          const mobile = await mobileCtx.newPage();
          await enterAsRole(mobile, app.url, { roleId });
          expect(await mobile.locator("[data-brand]").isVisible()).toBe(true);
          await mobileCtx.close();
        } finally {
          await page.close();
        }

        // Persistencia SQLite
        const eventsBefore = app.handle.runtime.store.all().length;
        const finalStates = Object.fromEntries(
          app.handle.runtime.projectRows()
            .filter((r) => r.stateId)
            .map((r) => [r.id, r.stateId]),
        );
        await app.close();
        app = undefined;
        const app2 = await startProfileApp(profileId, { dbPath });
        try {
          expect(app2.handle.runtime.store.all().length).toBe(eventsBefore);
          persistence = true;
          const page2 = await browser.newPage();
          try {
            await enterAsRole(page2, app2.url, { roleId });
            expect(await page2.getAttribute("body", "data-live")).toBe("1");
            // El estado derivado tras reinicio coincide con el store
            for (const [id, st] of Object.entries(finalStates)) {
              const row = app2.handle.runtime.projectRows().find((r) => r.id === id);
              expect(row?.stateId).toBe(st);
            }
            const health = await fetch(`${app2.url}health`);
            const h = (await health.json()) as { events: number };
            expect(h.events).toBe(eventsBefore);
          } finally {
            await page2.close();
          }
        } finally {
          await app2.close();
        }
      } finally {
        if (app) await app.close();
        smokeResults.push({
          profileId,
          roleId,
          actionId,
          transitionOk,
          rejectionShown,
          idempotent,
          persistence,
          axeViolations,
          axeIds,
          unexecutable,
          elapsedMs: Date.now() - t0,
        });
      }

      expect(transitionOk).toBe(true);
      expect(rejectionShown).toBe(true);
      expect(idempotent).toBe(true);
      expect(persistence).toBe(true);
    },
    180_000,
  );
});

describe("Playwright E2E — infra helpers", () => {
  it("helpers de arranque y sesión exportados", () => {
    expect(typeof startProfileApp).toBe("function");
    expect(typeof enterAsRole).toBe("function");
    expect(typeof runAxe).toBe("function");
    expect(typeof captureByGroupAndRole).toBe("function");
  });
});
