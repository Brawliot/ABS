/**
 * App web desde UiSpec sellada — arranque 10 perfiles + concesionaria,
 * DOM por processGroup/vista/panel, visibilidad por rol.
 * (Pruebas nuevas — no modifica suites existentes.)
 */

import { describe, expect, it } from "vitest";
import { isValidatedUiSpec } from "../presentation/validated.js";
import {
  allBootableIds,
  bootProfile,
  extractDomMarkers,
  processGroupsForRole,
  renderAppHtml,
  resolveSession,
  startWebServer,
  viewsInGroups,
  actionVisibleForRole,
} from "../web/index.js";

describe("Web app — arranque por perfil", () => {
  it.each(allBootableIds().map((id) => [id] as const))(
    "%s: boot produce UiSpec sellada y HTML navegable",
    (id) => {
      const boot = bootProfile(id);
      expect(isValidatedUiSpec(boot.spec)).toBe(true);
      expect(boot.spec.processGroups?.length ?? 0).toBeGreaterThan(0);

      const session = resolveSession(boot, {});
      const html = renderAppHtml({ boot, session });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('data-dev-session="provisional"');
      expect(html).toContain("manifest.webmanifest");
      expect(html).toContain(`data-profile="${id}"`);
      expect(html).toContain("var(--color-primario)");
      // Sin literales de color hex en CSS generado (solo vars)
      expect(html).not.toMatch(/style="[^"]*#[0-9a-fA-F]{3,8}/);

      const groups = processGroupsForRole(boot.spec, session.roleId);
      for (const g of groups) {
        expect(html).toContain(`data-process-group="${g.id}"`);
      }

      if (session.viewId) {
        expect(html).toContain(`data-view-id="${session.viewId}"`);
      }

      // Acciones solo lectura
      if (html.includes("data-action-id=")) {
        expect(html).toContain("disabled");
        expect(html).toContain("solo lectura");
      }
    },
  );
});

describe("Web app — visibilidad por rol", () => {
  it("concesionaria: acciones de un rol no aparecen para otro sin permiso", () => {
    const boot = bootProfile("concesionaria");
    const roles = boot.roles.map((r) => r.id);
    expect(roles.length).toBeGreaterThan(1);

    const roleA = roles[0]!;
    const roleB = roles.find((r) => r !== roleA) ?? roles[0]!;

    const htmlA = renderAppHtml({
      boot,
      session: resolveSession(boot, { role: roleA }),
    });
    const htmlB = renderAppHtml({
      boot,
      session: resolveSession(boot, { role: roleB }),
    });

    const markersA = extractDomMarkers(htmlA);
    for (const actionId of markersA.actions) {
      const action = boot.spec.actions.find((a) => a.id === actionId);
      expect(action).toBeTruthy();
      expect(actionVisibleForRole(action!, roleA)).toBe(true);
    }

    // Ningún processGroup fuera de roleIds del rol B
    const groupsB = processGroupsForRole(boot.spec, roleB);
    const markersB = extractDomMarkers(htmlB);
    for (const gid of markersB.processGroups) {
      expect(groupsB.some((g) => g.id === gid)).toBe(true);
    }

    // Vistas en DOM de B ⊆ vistas de grupos visibles B
    const viewsB = new Set(viewsInGroups(boot.spec, groupsB).map((v) => v.id));
    for (const vid of markersB.views) {
      expect(viewsB.has(vid)).toBe(true);
    }

    void htmlA;
  });

  it("portal_filtro solo en HTML si el rol tiene el processGroup", () => {
    const boot = bootProfile("p01-peluqueria");
    const portalGroup = (boot.spec.processGroups ?? []).find(
      (g) => g.id === "proceso.portal_filtro",
    );
    if (!portalGroup) {
      // Perfil sin portal — ok
      return;
    }
    const portalRole = portalGroup.roleIds[0];
    const otherRole = boot.roles.find((r) => !portalGroup.roleIds.includes(r.id))
      ?.id;

    if (portalRole) {
      const htmlPortal = renderAppHtml({
        boot,
        session: resolveSession(boot, {
          role: portalRole,
          group: "proceso.portal_filtro",
        }),
      });
      expect(htmlPortal).toContain('data-process-group="proceso.portal_filtro"');
    }

    if (otherRole) {
      const htmlOther = renderAppHtml({
        boot,
        session: resolveSession(boot, { role: otherRole }),
      });
      // Nav no debe listar portal si el rol no está en roleIds
      if (!portalGroup.roleIds.includes(otherRole)) {
        expect(htmlOther).not.toContain(
          'data-process-group="proceso.portal_filtro"',
        );
      }
    }
  });
});

describe("Web app — servidor HTTP", () => {
  it("health + HTML 200 para concesionaria", async () => {
    const boot = bootProfile("concesionaria");
    const handle = await startWebServer(boot, { port: 0 });
    try {
      const health = await fetch(`${handle.url}health`);
      expect(health.status).toBe(200);
      const body = (await health.json()) as { ok: boolean; sealed: boolean };
      expect(body.ok).toBe(true);
      expect(body.sealed).toBe(true);

      const page = await fetch(handle.url);
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("data-dev-session");
      expect(html).toContain("Concesionaria");

      const man = await fetch(`${handle.url}manifest.webmanifest`);
      expect(man.status).toBe(200);
      const manifest = (await man.json()) as { theme_color: string };
      expect(manifest.theme_color).toMatch(/^#/);
    } finally {
      await handle.close();
    }
  });
});

describe("Web app — preguntas compositor visibles", () => {
  it("p10 muestra banner de preguntas si las hay", () => {
    const boot = bootProfile("p10-reformas");
    const html = renderAppHtml({
      boot,
      session: resolveSession(boot, {}),
    });
    if (boot.questions.length > 0) {
      expect(html).toContain("data-composer-questions=");
      expect(html).toContain("Pendiente de confirmar");
      for (const q of boot.questions) {
        expect(html).toContain(`data-question-id="${q.id}"`);
      }
    }
  });
});

describe("Web app — cada vista/panel del rol aparece al navegar", () => {
  it("p04: todas las vistas de grupos visibles están en algún HTML de sesión", () => {
    const boot = bootProfile("p04-taller-mecanico");
    const roleId = boot.roles[0]!.id;
    const groups = processGroupsForRole(boot.spec, roleId);
    const seenViews = new Set<string>();

    for (const g of groups) {
      const viewIds = [...new Set([...g.viewIds, ...g.panelIds])];
      for (const viewId of viewIds) {
        const html = renderAppHtml({
          boot,
          session: resolveSession(boot, {
            role: roleId,
            group: g.id,
            view: viewId,
          }),
        });
        expect(html).toContain(`data-view-id="${viewId}"`);
        seenViews.add(viewId);
      }
      expect(htmlHasProcessGroup(htmlForGroup(boot, roleId, g.id), g.id)).toBe(
        true,
      );
    }

    const expected = viewsInGroups(boot.spec, groups).map((v) => v.id);
    for (const id of expected) {
      expect(seenViews.has(id)).toBe(true);
    }
  });
});

function htmlForGroup(
  boot: ReturnType<typeof bootProfile>,
  role: string,
  group: string,
): string {
  return renderAppHtml({
    boot,
    session: resolveSession(boot, { role, group }),
  });
}

function htmlHasProcessGroup(html: string, id: string): boolean {
  return html.includes(`data-process-group="${id}"`);
}
