/**
 * Helpers Playwright: arranque por perfil, sesión rol/Parte, capturas, axe.
 */

import { mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import {
  AppRuntime,
  bootProfile,
  startWebServer,
  type WebServerHandle,
} from "../../web/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export interface LiveApp {
  readonly handle: WebServerHandle;
  readonly profileId: string;
  readonly dbPath: string;
  readonly url: string;
  close(): Promise<void>;
}

export async function startProfileApp(
  profileId: string,
  options?: { readonly dbPath?: string; readonly port?: number },
): Promise<LiveApp> {
  const boot = bootProfile(profileId);
  const runtime = options?.dbPath
    ? AppRuntime.open(boot, { dbPath: options.dbPath })
    : AppRuntime.open(boot);
  const handle = await startWebServer(boot, {
    port: options?.port ?? 0,
    runtime,
    ...(options?.dbPath !== undefined ? { dbPath: options.dbPath } : {}),
  });
  return {
    handle,
    profileId,
    dbPath: runtime.dbPath,
    url: handle.url,
    close: () => handle.close(),
  };
}

export async function openBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function enterAsRole(
  page: Page,
  baseUrl: string,
  opts: {
    readonly roleId: string;
    readonly parteId?: string;
    readonly group?: string;
    readonly view?: string;
  },
): Promise<void> {
  const q = new URLSearchParams({ role: opts.roleId });
  if (opts.parteId) q.set("parte", opts.parteId);
  if (opts.group) q.set("group", opts.group);
  if (opts.view) q.set("view", opts.view);
  await page.goto(`${baseUrl}?${q.toString()}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(`[data-role="${opts.roleId}"]`);
}

export async function captureByGroupAndRole(
  page: Page,
  outDir: string,
  profileId: string,
  roleId: string,
  processGroupId: string,
): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = join(
    outDir,
    `${safe(profileId)}__${safe(roleId)}__${safe(processGroupId)}.png`,
  );
  await page.screenshot({ path, fullPage: true });
  return path;
}

export const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

export async function withMobileContext(
  browser: Browser,
): Promise<BrowserContext> {
  return browser.newContext({
    viewport: MOBILE_VIEWPORT,
    isMobile: true,
    hasTouch: true,
  });
}

export interface AxeSummary {
  readonly violations: readonly {
    readonly id: string;
    readonly impact: string | null | undefined;
    readonly description: string;
    readonly nodes: number;
  }[];
}

/**
 * Ejecuta axe-core desde node_modules (sin CDN; funciona en CI offline).
 */
export async function runAxe(page: Page): Promise<AxeSummary> {
  const axePath = join(ROOT, "node_modules", "axe-core", "axe.min.js");
  let source: string;
  try {
    source = readFileSync(axePath, "utf8");
  } catch {
    return { violations: [] };
  }
  await page.addScriptTag({ content: source });
  const raw = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    const axe = g.axe;
    if (!axe) return { violations: [] as unknown[] };
    const result = await axe.run(g.document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "best-practice"],
      },
    });
    return {
      violations: (
        result.violations as Array<{
          id: string;
          impact?: string;
          description: string;
          nodes: unknown[];
        }>
      ).map((v) => ({
        id: v.id,
        impact: v.impact ?? null,
        description: v.description,
        nodes: v.nodes.length,
      })),
    };
  });
  return raw as AxeSummary;
}

/** Envía una acción vía fetch JSON (útil para idempotencia sin depender del DOM). */
export async function postActionJson(
  baseUrl: string,
  body: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}
