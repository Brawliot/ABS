/**
 * E2E Playwright: login real (sin selector) para 10 perfiles + concesionaria.
 * Suplantación: cookies / actor / empresa / sesión cerrada → rechazo.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Browser } from "playwright";
import {
  allBootableIds,
  bootProfile,
  startWebServer,
  type WebServerHandle,
} from "../../web/index.js";
import { createAuthRuntime, loginWithPassword } from "../../web/auth-bridge.js";
import {
  DEMO_PASSWORD,
  seedProfileAccounts,
} from "../../accounts/index.js";
import {
  SESSION_COOKIE,
  signSessionId,
  securityHeaders,
  isProduction,
  allowDevSession,
} from "../../auth/index.js";
import { openBrowser } from "./helpers.js";

describe.sequential("Auth E2E — login real por perfil", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await openBrowser();
  });

  afterAll(async () => {
    await browser.close();
  });

  const profiles = allBootableIds();

  for (const profileId of profiles) {
    it(`login real: ${profileId}`, async () => {
      const boot = bootProfile(profileId);
      const auth = createAuthRuntime();
      const primaryRole = boot.roles[0]!;
      const specs = seedProfileAccounts(
        auth.accounts,
        profileId,
        [primaryRole],
        {
          parteId: boot.samplePartes[0]?.id ?? "parte-demo-1",
        },
      );
      const primary = specs[0]!;
      const handle = await startWebServer(boot, {
        port: 0,
        enableAuth: true,
        auth,
      });
      const page = await browser.newPage();
      try {
        const loginRes = await page.request.post(`${handle.url}auth/login`, {
          form: {
            email: primary.email,
            password: primary.password,
            companyId: profileId,
          },
        });
        expect(loginRes.ok()).toBe(true);
        await page.goto(handle.url, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(`[data-role="${primary.roleId}"]`);
        expect(await page.locator("[data-dev-session]").count()).toBe(0);
        const headers = await page.request.get(handle.url).then((r) => r.headers());
        expect(headers["content-security-policy"]).toBeTruthy();
        expect(headers["x-content-type-options"]).toBe("nosniff");
      } finally {
        await page.close();
        await handle.close();
      }
    }, 60_000);
  }
});

describe("Auth — suplantación y aislamiento HTTP", () => {
  it("cookie firmada falsa / sesión revocada / form spoof en prod", async () => {
    const boot = bootProfile("concesionaria");
    const auth = createAuthRuntime();
    seedProfileAccounts(auth.accounts, "concesionaria", [
      { id: "gerente" },
    ]);
    const handle = await startWebServer(boot, {
      port: 0,
      enableAuth: true,
      auth,
    });
    try {
      const { session, cookies } = loginWithPassword(auth, {
        email: `gerente@concesionaria.demo.local`,
        password: DEMO_PASSWORD,
        companyId: "concesionaria",
      });
      // Cookie manipulada
      const bad = await fetch(`${handle.url}action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSessionId("ses_fake"))}`,
        },
        body: new URLSearchParams({
          actionId: "x",
          subjectId: "y",
          roleId: "hacker",
          parteId: "otra-empresa",
          csrfToken: "nope",
        }).toString(),
      });
      expect([401, 403, 422]).toContain(bad.status);

      const cookieHeader = cookies
        .map((c) => c.split(";")[0])
        .join("; ");
      await fetch(`${handle.url}auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieHeader,
        },
        body: new URLSearchParams({
          csrfToken: session.csrfToken,
          allDevices: "1",
        }).toString(),
      });
      expect(auth.sessions.get(session.sessionId)?.revokedAt).toBeTruthy();

      const authB = createAuthRuntime();
      seedProfileAccounts(authB.accounts, "empresa-a", [
        { id: "gerente" },
      ]);
      expect(() =>
        loginWithPassword(authB, {
          email: "gerente@empresa-a.demo.local",
          password: DEMO_PASSWORD,
          companyId: "empresa-b",
        }),
      ).toThrow(/Sin acceso/);
      authB.accounts.close();
    } finally {
      await handle.close();
    }
  }, 90_000);

  it("cabeceras de seguridad presentes", () => {
    const h = securityHeaders();
    expect(h["Content-Security-Policy"]).toMatch(/frame-ancestors 'none'/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("isProduction bloquea allowDevSession", () => {
    const prev = process.env.ABS_ENV;
    process.env.ABS_ENV = "production";
    process.env.ABS_ALLOW_DEV_SESSION = "1";
    expect(isProduction()).toBe(true);
    expect(allowDevSession()).toBe(false);
    if (prev === undefined) delete process.env.ABS_ENV;
    else process.env.ABS_ENV = prev;
    delete process.env.ABS_ALLOW_DEV_SESSION;
  });
});
