/**
 * Scaffold Playwright — NO marca verde el nivel 3.
 * Por defecto solo genera HTML. Browser: ABS_PLAYWRIGHT=1 (opcional).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateUiSpec,
  buildConcesionariaGeneratorInput,
} from "../../generator/index.js";
import { renderUiSpecHtml } from "../../presentation/index.js";
import { proposeDesignSystems } from "../../design/index.js";

describe("Adaptador Playwright (scaffold)", () => {
  it("genera HTML de concesionaria (E2E navegador = not_built hasta ABS_PLAYWRIGHT=1)", () => {
    const spec = generateUiSpec(buildConcesionariaGeneratorInput());
    const ds = proposeDesignSystems({
      companyId: "c",
      businessDescription: "Concesionaria",
      identity: { brandName: "Demo" },
    }).proposals[0]!;
    const html = renderUiSpecHtml(spec, {
      roleId: "comercial",
      designSystem: ds,
    });
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain("mod.");

    const dir = resolve("tmp");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "concesionaria-preview.html"), html, "utf8");
  });

  it.skipIf(process.env.ABS_PLAYWRIGHT !== "1")(
    "opcional: carga HTML en Chromium (no cuenta como E2E de flujos)",
    async () => {
      const { chromium } = await import("playwright");
      const path = resolve("tmp/concesionaria-preview.html");
      const html = existsSync(path)
        ? readFileSync(path, "utf8")
        : renderUiSpecHtml(generateUiSpec(buildConcesionariaGeneratorInput()), {
            roleId: "comercial",
          });
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent(html);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );
});
