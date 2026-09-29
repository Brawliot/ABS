/**
 * E2E adversos — plantillas débiles: datos ausentes deben rechazar con motivo claro.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { openBrowser } from "../helpers.js";
import {
  actionForTransition,
  clickTransition,
  startAdverseApp,
  subjectForArchetype,
} from "./helpers.js";

let browser: Browser;

beforeAll(async () => {
  browser = await openBrowser();
}, 60_000);

afterAll(async () => {
  await browser?.close();
}, 30_000);

/** Cadena vacía = dato ausente (present / eq fallan); distinto de omitir el campo. */
function absentField(name: string): Record<string, string> {
  return { [name]: "" };
}

describe("E2E adversos — plantillas débiles", () => {
  it(
    "tpl.bloqueo_por_impago: sin dias_impago rechaza; con impago activo rechaza",
    async () => {
      const app = await startAdverseApp("p03-ferreteria");
      const page = await browser.newPage();
      try {
        const missing = await clickTransition(page, app, {
          archetypeId: "venta",
          transitionId: "t_aceptar",
          roleId: "dueno",
          formFields: absentField("dias_impago"),
          expectOk: false,
        });
        const missingOk =
          missing.ok &&
          missing.flash.length > 12 &&
          /dias_impago|present|dato|importe|impago/i.test(missing.flash) &&
          !/stack|at Object/i.test(missing.flash);

        const blocked = await clickTransition(page, app, {
          archetypeId: "venta",
          transitionId: "t_aceptar",
          roleId: "dueno",
          formFields: { dias_impago: "60" },
          expectOk: false,
        });
        const blockedOk =
          blocked.ok &&
          blocked.flash.length > 12 &&
          !/Listo|pasó a/i.test(blocked.flash) &&
          !/stack|at Object/i.test(blocked.flash);

        expect(missingOk, `sin dato: ${missing.flash}`).toBe(true);
        expect(blockedOk, `con impago: ${blocked.flash}`).toBe(true);
      } finally {
        await page.close();
        await app.close();
      }
    },
    120_000,
  );

  it(
    "tpl.importe_requiere_aprobacion: sin importe rechaza en UI",
    async () => {
      const app = await startAdverseApp("p02-clinica-dental");
      const page = await browser.newPage();
      try {
        const sub = subjectForArchetype(app.runtime, "servicio_proyecto")!;
        const found = actionForTransition(
          app.runtime,
          sub.lifecycleId,
          "t_acordar",
        )!;
        const roleId = found.roleId;

        const missing = await clickTransition(page, app, {
          archetypeId: "servicio_proyecto",
          transitionId: "t_acordar",
          roleId,
          formFields: absentField("importe"),
          expectOk: false,
        });
        const missingOk =
          missing.ok &&
          missing.flash.length > 12 &&
          /importe|present|dato|aprob/i.test(missing.flash) &&
          !/stack|at Object/i.test(missing.flash);

        expect(missingOk, `sin importe: ${missing.flash}`).toBe(true);
      } finally {
        await page.close();
        await app.close();
      }
    },
    120_000,
  );
});
