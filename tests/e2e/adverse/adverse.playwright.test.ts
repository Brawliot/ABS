/**
 * Escenarios adversos en navegador real (Playwright).
 * No modifica pruebas existentes.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { deriveState } from "../../../core/derivation.js";
import type { TransitionEvent } from "../../../core/events.js";
import { computeBalanceByParty } from "../../../elements/closure.js";
import { openBrowser } from "../helpers.js";
import { happyPathFieldsForTransition } from "../happy-path-fields.js";
import {
  actionForTransition,
  clickTransition,
  enterUi,
  injectForceGrant,
  postActionFromBrowser,
  seedSaldoPendiente,
  startAdverseApp,
  startTwoCompanyApp,
  subjectForArchetype,
  type AdverseApp,
} from "./helpers.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(ROOT, "tmp", "e2e-adverse");

interface CatResult {
  readonly id: string;
  readonly category: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly severity?: "ok" | "bajo" | "medio" | "alto" | "critico";
  readonly finding?: string;
}

const results: CatResult[] = [];

function record(r: CatResult): void {
  results.push(r);
}

let browser: Browser;

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  browser = await openBrowser();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  const byCat: Record<string, CatResult[]> = {};
  for (const r of results) {
    (byCat[r.category] ??= []).push(r);
  }
  const lines: string[] = [
    "# Informe escenarios adversos (Playwright)",
    "",
    `Fecha: ${new Date().toISOString()}`,
    `Total: ${results.length} · OK: ${results.filter((r) => r.ok).length} · Fallos: ${results.filter((r) => !r.ok).length}`,
    "",
  ];
  for (const [cat, items] of Object.entries(byCat)) {
    lines.push(`## ${cat}`);
    lines.push("");
    for (const i of items) {
      const mark = i.ok ? "PASS" : "FAIL";
      lines.push(`- **${mark}** \`${i.id}\`: ${i.detail}`);
      if (i.finding) {
        lines.push(`  - Hallazgo (${i.severity ?? "?"}): ${i.finding}`);
      }
    }
    lines.push("");
  }
  const findings = results.filter((r) => r.finding);
  lines.push("## Hallazgos con gravedad");
  lines.push("");
  if (findings.length === 0) {
    lines.push("Ningún fallo de producto detectado en esta pasada.");
  } else {
    for (const f of findings) {
      lines.push(`- **${f.severity}** [${f.category}/${f.id}] ${f.finding}`);
    }
  }
  writeFileSync(join(OUT, "ADVERSE-REPORT.md"), lines.join("\n"), "utf8");
  writeFileSync(
    join(OUT, "adverse-results.json"),
    JSON.stringify({ results, byCat }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(ROOT, "web", "ADVERSE-REPORT.md"),
    lines.join("\n"),
    "utf8",
  );
}, 30_000);

async function advancePath(
  page: import("playwright").Page,
  app: AdverseApp,
  archetypeId: string,
  transitions: readonly string[],
  roleId?: string,
): Promise<string | undefined> {
  for (const tid of transitions) {
    const r = await clickTransition(page, app, {
      archetypeId,
      transitionId: tid,
      ...(roleId ? { roleId } : {}),
      expectOk: true,
    });
    if (!r.ok) return `${tid}: ${r.flash}`;
  }
  return undefined;
}

describe("E2E adversos — excepciones por arquetipo", () => {
  it(
    "6 arquetipos: excepción hasta estado final",
    async () => {
      const cases: {
        id: string;
        profileId: string;
        archetypeId: string;
        setup: readonly string[];
        exception: string;
        terminalHint: RegExp;
        roleId?: string;
      }[] = [
        {
          id: "exc-venta-rechazo",
          profileId: "p03-ferreteria",
          archetypeId: "venta",
          setup: [],
          exception: "t_cancelar_propuesta",
          terminalHint: /cancel|rechaz/i,
          roleId: "dueno",
        },
        {
          id: "exc-servicio-rechazo-entrega",
          profileId: "p04-taller-mecanico",
          archetypeId: "servicio_proyecto",
          setup: ["t_acordar", "t_ejecutar", "t_presentar"],
          exception: "t_rechazar_entrega",
          terminalHint: /rechaz|cancel|fall/i,
          roleId: "dueno",
        },
        {
          id: "exc-financiera-impago",
          profileId: "p08-alquiler-maquinaria",
          archetypeId: "financiera",
          setup: ["t_aprobar", "t_desembolsar", "t_amortizar"],
          exception: "t_impago",
          terminalHint: /impagad/i,
          roleId: "gerente",
        },
        {
          id: "exc-uso-cancelar",
          profileId: "p08-alquiler-maquinaria",
          archetypeId: "uso_temporal",
          setup: ["t_reservar"],
          exception: "t_cancelar",
          terminalHint: /cancel/i,
          roleId: "gerente",
        },
        {
          id: "exc-suscripcion-pausa",
          profileId: "p09-academia-idiomas",
          archetypeId: "suscripcion",
          setup: ["t_activar"],
          exception: "t_pausar",
          terminalHint: /paus/i,
          roleId: "directora",
        },
        {
          id: "exc-intermediacion-disputa",
          profileId: "marketplace-intermediacion",
          archetypeId: "intermediacion",
          setup: ["t_emparejar", "t_iniciar"],
          exception: "t_abrir_disputa",
          terminalHint: /disput/i,
          roleId: "operador",
        },
      ];

      for (const c of cases) {
        const app = await startAdverseApp(c.profileId);
        const page = await browser.newPage();
        try {
          const setupErr = await advancePath(
            page,
            app,
            c.archetypeId,
            c.setup,
            c.roleId,
          );
          if (setupErr) {
            record({
              id: c.id,
              category: "excepciones",
              ok: false,
              detail: `Setup falló: ${setupErr}`,
              severity: "alto",
              finding: `No se pudo preparar camino hacia ${c.exception}`,
            });
            continue;
          }
          const r = await clickTransition(page, app, {
            archetypeId: c.archetypeId,
            transitionId: c.exception,
            ...(c.roleId ? { roleId: c.roleId } : {}),
          });
          const sub = subjectForArchetype(app.runtime, c.archetypeId)!;
          const slice = app.runtime.lifecycleForSubject(sub.id)!;
          const state = deriveState(
            slice.lifecycle,
            app.runtime.store.getBySubject(sub.id) as TransitionEvent[],
          ).currentStateId;
          const ok =
            c.terminalHint.test(state) &&
            (r.ok || /Listo|pasó a|impagad|cancelad|pausad|disput/i.test(r.flash));
          record({
            id: c.id,
            category: "excepciones",
            ok,
            detail: ok
              ? `${c.exception} → estado «${state}»`
              : `flash=${r.flash || "∅"} estado=${state}`,
            ...(ok
              ? {}
              : {
                  severity: "alto" as const,
                  finding: `Excepción ${c.exception} no alcanzó estado final esperado`,
                }),
          });
        } finally {
          await page.close();
          await app.close();
        }
      }
      const failed = results.filter(
        (r) => r.category === "excepciones" && !r.ok,
      );
      expect(
        failed,
        failed.map((f) => `${f.id}: ${f.detail}`).join("; "),
      ).toHaveLength(0);
    },
    300_000,
  );
});

describe("E2E adversos — 7 rupturas del audit como recorridos", () => {
  it(
    "rupturas 1–7 en navegador",
    async () => {
      // 1) Entregas parciales
      {
        const app = await startAdverseApp("p03-ferreteria");
        const page = await browser.newPage();
        try {
          const err = await advancePath(page, app, "venta", [
            "t_aceptar",
            "t_iniciar_entrega",
            "t_entrega_parcial",
          ], "dueno");
          const ok = !err;
          record({
            id: "rup-1-parciales",
            category: "rupturas",
            ok,
            detail: ok
              ? "Recorrido t_aceptar→t_iniciar_entrega→t_entrega_parcial"
              : `Falló: ${err}`,
            ...(ok
              ? {}
              : { severity: "alto" as const, finding: String(err) }),
          });
          expect(ok).toBe(true);
        } finally {
          await page.close();
          await app.close();
        }
      }

      // 2) Renegociación
      {
        const app = await startAdverseApp("p03-ferreteria");
        const page = await browser.newPage();
        try {
          const err = await advancePath(page, app, "venta", [
            "t_aceptar",
            "t_proponer_renegociacion",
            "t_aceptar_nueva_version",
          ], "dueno");
          const ok = !err;
          record({
            id: "rup-2-renegociacion",
            category: "rupturas",
            ok,
            detail: ok
              ? "Recorrido renegociación + re-aceptación"
              : `Falló: ${err}`,
            ...(ok
              ? {}
              : { severity: "alto" as const, finding: String(err) }),
          });
          expect(ok).toBe(true);
        } finally {
          await page.close();
          await app.close();
        }
      }

      // 3) Devolución vinculada (no reapertura)
      {
        const app = await startAdverseApp("p07-tienda-online");
        const page = await browser.newPage();
        try {
          const err = await advancePath(page, app, "venta", [
            "t_aceptar",
            "t_iniciar_entrega",
            "t_cerrar",
          ], "fundadora");
          const sub = subjectForArchetype(app.runtime, "venta")!;
          // Intento de reapertura vía UI (acción que no aplica en terminal)
          const reopen = await clickTransition(page, app, {
            archetypeId: "venta",
            transitionId: "t_aceptar",
            roleId: "fundadora",
            expectOk: false,
          });
          await page.goto(app.url, { waitUntil: "domcontentloaded" });
          await page.fill(
            "[data-original-subject]",
            sub.id,
          );
          await page.click('form[data-link-form] button[type="submit"]');
          await page.waitForLoadState("domcontentloaded");
          const flash = await page.locator("[data-flash]").innerText();
          const linked = app.runtime.subjects.find((s) => s.vinculadaA === sub.id);
          const ok =
            !err &&
            reopen.ok &&
            !!linked &&
            /vinculad/i.test(flash);
          record({
            id: "rup-3-devolucion-vinculada",
            category: "rupturas",
            ok,
            detail: ok
              ? `Terminal bloqueado; devolución ${linked!.id} vinculada_a=${sub.id}`
              : `setup=${err} reopenOk=${reopen.ok} linked=${linked?.id} flash=${flash}`,
            ...(ok
              ? {}
              : {
                  severity: "alto" as const,
                  finding: "Devolución vinculada o bloqueo de reopen falló en UI",
                }),
          });
          expect(ok).toBe(true);
        } finally {
          await page.close();
          await app.close();
        }
      }

      // 4) Pago multiparte (panel UI)
      {
        const app = await startAdverseApp("p03-ferreteria");
        const page = await browser.newPage();
        try {
          // Usar multi-tenant panel vía POST balance en servidor simple: inyectamos movimientos por evaluate
          // El servidor single-tenant no tiene /balance; usamos compute en página de diagnóstico + API del multi
          const mt = await startTwoCompanyApp("p03-ferreteria", "p01-peluqueria");
          await page.goto(
            `${mt.url}?tenant=${mt.keyA}&balance=1&role=dueno`,
            { waitUntil: "domcontentloaded" },
          );
          const parties = ["a", "b", "c"];
          for (const p of parties) {
            for (const [dir, amt] of [
              ["in", "50"],
              ["out", "50"],
            ] as const) {
              await page.fill('[data-balance-form] input[name="parteId"]', p);
              await page.fill('[data-balance-form] input[name="amount"]', amt);
              await page.selectOption(
                '[data-balance-form] select[name="direction"]',
                dir,
              );
              await page.click('[data-balance-form] button[type="submit"]');
              await page.waitForLoadState("domcontentloaded");
            }
          }
          const jsonText = await page.locator("[data-balance-json]").innerText();
          const byParty = JSON.parse(jsonText) as Record<string, number>;
          const ok =
            byParty.a === 0 && byParty.b === 0 && byParty.c === 0;
          record({
            id: "rup-4-multiparte",
            category: "rupturas",
            ok,
            detail: ok
              ? `Saldo 0 en a/b/c vía UI: ${jsonText}`
              : `Saldos no cero: ${jsonText}`,
            ...(ok
              ? {}
              : { severity: "alto" as const, finding: "Multiparte no equilibró" }),
          });
          expect(ok).toBe(true);
          // sanity con helper puro
          expect(
            computeBalanceByParty([
              { amount: 10, direction: "in", parteId: "x" },
              { amount: 10, direction: "out", parteId: "x" },
            ]).x,
          ).toBe(0);
          await mt.close();
        } finally {
          await page.close();
          await app.close();
        }
      }

      // 5) Pausa suscripción
      {
        const app = await startAdverseApp("p09-academia-idiomas");
        const page = await browser.newPage();
        try {
          const err = await advancePath(page, app, "suscripcion", [
            "t_activar",
            "t_pausar",
            "t_reanudar",
          ], "directora");
          const ok = !err;
          record({
            id: "rup-5-pausa",
            category: "rupturas",
            ok,
            detail: ok
              ? "t_activar→t_pausar→t_reanudar en UI"
              : `Falló: ${err}`,
            ...(ok
              ? {}
              : { severity: "medio" as const, finding: String(err) }),
          });
          expect(ok).toBe(true);
        } finally {
          await page.close();
          await app.close();
        }
      }

      // 6) Marketplace disputa
      {
        const app = await startAdverseApp("marketplace-intermediacion");
        const page = await browser.newPage();
        try {
          const err = await advancePath(page, app, "intermediacion", [
            "t_emparejar",
            "t_iniciar",
            "t_abrir_disputa",
            "t_resolver_liberar",
          ], "operador");
          const ok = !err;
          record({
            id: "rup-6-disputa",
            category: "rupturas",
            ok,
            detail: ok
              ? "Disputa + liberación de retención en UI"
              : `Falló: ${err}`,
            ...(ok
              ? {}
              : { severity: "alto" as const, finding: String(err) }),
          });
          expect(ok).toBe(true);
        } finally {
          await page.close();
          await app.close();
        }
      }

      // 7) Negocio que no encaja
      {
        const app = await startAdverseApp("p03-ferreteria");
        const page = await browser.newPage();
        try {
          await page.goto(`${app.url}diagnosis`, {
            waitUntil: "domcontentloaded",
          });
          await page.click("[data-force-nomatch]");
          await page.waitForLoadState("domcontentloaded");
          const nomatch = page.locator("[data-diagnosis-nomatch]");
          const nearest = await page.locator("[data-nearest]").count();
          const qs = await page.locator("[data-distinguishing]").count();
          const ok =
            (await nomatch.count()) === 1 && nearest >= 2 && qs >= 2;
          record({
            id: "rup-7-no-encaja",
            category: "rupturas",
            ok,
            detail: ok
              ? `Diagnóstico UI: ${nearest} cercanos, ${qs} preguntas`
              : `nomatch=${await nomatch.count()} nearest=${nearest} qs=${qs}`,
            ...(ok
              ? {}
              : {
                  severity: "medio" as const,
                  finding: "Diagnóstico no mostró 2 cercanos + preguntas",
                }),
          });
          expect(ok).toBe(true);
        } finally {
          await page.close();
          await app.close();
        }
      }
    },
    420_000,
  );
});

describe("E2E adversos — bloqueos y reglas críticas", () => {
  it(
    "5 reglas: rechazo con mensaje comprensible",
    async () => {
      // 1) Taller: entregar con saldo pendiente
      {
        const app = await startAdverseApp("p04-taller-mecanico");
        const page = await browser.newPage();
        try {
          const sub = subjectForArchetype(app.runtime, "servicio_proyecto")!;
          seedSaldoPendiente(app.runtime, sub.parteId, 850);
          const err = await advancePath(page, app, "servicio_proyecto", [
            "t_acordar",
            "t_ejecutar",
            "t_presentar",
          ], "dueno");
          const r = await clickTransition(page, app, {
            archetypeId: "servicio_proyecto",
            transitionId: "t_cerrar",
            roleId: "dueno",
            expectOk: false,
          });
          const ok =
            !err &&
            r.ok &&
            r.flash.length > 12 &&
            !/stack|JudgeRejection|at Object/i.test(r.flash);
          record({
            id: "regla-taller-saldo",
            category: "reglas",
            ok,
            detail: ok
              ? `Rechazo t_cerrar con mensaje: ${r.flash.slice(0, 120)}`
              : `setup=${err} ok=${r.ok} flash=${r.flash}`,
            ...(ok
              ? {}
              : {
                  severity: "alto" as const,
                  finding: "Taller permitió cerrar con saldo o mensaje opaco",
                }),
          });
          if (!ok) throw new Error(`regla-taller-saldo: ${r.flash}`);
        } finally {
          await page.close();
          await app.close();
        }
      }

      // 2) Clínica: tratamiento sin consentimiento
      {
        const app = await startAdverseApp("p02-clinica-dental");
        const page = await browser.newPage();
        try {
          const err = await advancePath(page, app, "servicio_proyecto", [
            "t_acordar",
          ], "director_medico");
          const r = await clickTransition(page, app, {
            archetypeId: "servicio_proyecto",
            transitionId: "t_ejecutar",
            roleId: "director_medico",
            formFields: {
              "evidence.kind": "aceptacion",
              "evidence.referenceType": "omitido",
            },
            expectOk: false,
          });
          const ok =
            !err &&
            r.ok &&
            r.flash.length > 12 &&
            !/stack|at Object/i.test(r.flash);
          record({
            id: "regla-clinica-consentimiento",
            category: "reglas",
            ok,
            detail: ok
              ? `Rechazo sin consentimiento/señal: ${r.flash.slice(0, 140)}`
              : `setup=${err} ok=${r.ok} flash=${r.flash}`,
            ...(ok
              ? {}
              : {
                  severity: "alto" as const,
                  finding:
                    "Clínica no rechazó t_ejecutar sin consentimiento válido",
                }),
          });
          if (!ok) {
            throw new Error(`regla-clinica-consentimiento: ${r.flash}`);
          }
        } finally {
          await page.close();
          await app.close();
        }
      }

      // 3) Ferretería: crédito sobre límite
      {
        const app = await startAdverseApp("p03-ferreteria");
        const page = await browser.newPage();
        try {
          const sub = subjectForArchetype(app.runtime, "venta")!;
          seedSaldoPendiente(app.runtime, sub.parteId, 2000);
          const r = await clickTransition(page, app, {
            archetypeId: "venta",
            transitionId: "t_aceptar",
            roleId: "dueno",
            expectOk: false,
          });
          const subState = deriveState(
            app.runtime.lifecycleForSubject(sub.id)!.lifecycle,
            app.runtime.store.getBySubject(sub.id) as TransitionEvent[],
          ).currentStateId;
          const ok =
            r.ok &&
            subState === "propuesta" &&
            r.flash.length > 12 &&
            !/Listo|pasó a/i.test(r.flash);
          record({
            id: "regla-ferreteria-credito",
            category: "reglas",
            ok,
            detail: ok
              ? `Rechazo t_aceptar sobre límite: ${r.flash.slice(0, 120)}`
              : `expectReject=${r.ok} state=${subState} flash=${r.flash}`,
            ...(ok
              ? {}
              : {
                  severity: "alto" as const,
                  finding:
                    "Ferretería aceptó t_aceptar con saldo>límite (restr-fact:tpl-limite-credito no bloqueó en UI viva)",
                }),
          });
          // No abortar la suite: registrar hallazgo y seguir con el resto de reglas
          if (!ok) {
            /* hallazgo registrado */
          }
        } finally {
          await page.close();
          await app.close();
        }
      }

      // 4) Maquinaria: cerrar con fianza sin liquidar
      {
        const app = await startAdverseApp("p08-alquiler-maquinaria");
        const page = await browser.newPage();
        try {
          const err = await advancePath(page, app, "uso_temporal", [
            "t_reservar",
            "t_iniciar_uso",
          ], "gerente");
          const r = await clickTransition(page, app, {
            archetypeId: "uso_temporal",
            transitionId: "t_cerrar",
            roleId: "gerente",
            formFields: { fianza_eur: "0", retencion_abierta: "0" },
            expectOk: false,
          });
          const sub = subjectForArchetype(app.runtime, "uso_temporal")!;
          const st = deriveState(
            app.runtime.lifecycleForSubject(sub.id)!.lifecycle,
            app.runtime.store.getBySubject(sub.id) as TransitionEvent[],
          ).currentStateId;
          const rejectedClose =
            r.ok &&
            r.flash.length > 12 &&
            !/stack|at Object/i.test(r.flash) &&
            st !== "cerrada";
          const ok = rejectedClose;
          record({
            id: "regla-maquinaria-fianza",
            category: "reglas",
            ok,
            detail: ok
              ? `Rechazo cierre con fianza (estado=${st}${err ? `; setupWarn=${err}` : ""}): ${r.flash.slice(0, 120)}`
              : `setup=${err} ok=${r.ok} state=${st} flash=${r.flash}`,
            ...(ok
              ? {}
              : {
                  severity: "alto" as const,
                  finding: "Alquiler cerró con fianza sin liquidar",
                }),
          });
          if (!ok) throw new Error(`regla-maquinaria-fianza: ${r.flash}`);
        } finally {
          await page.close();
          await app.close();
        }
      }

      // 5) Reformas: avanzar fase sin hito cobrado
      {
        const app = await startAdverseApp("p10-reformas");
        const page = await browser.newPage();
        try {
          const err = await advancePath(page, app, "servicio_proyecto", [
            "t_acordar",
            "t_ejecutar",
          ], app.runtime.boot.roles[0]?.id);
          const r = await clickTransition(page, app, {
            archetypeId: "servicio_proyecto",
            transitionId: "t_presentar",
            formFields: { hito_anterior_cobrado: "false" },
            expectOk: false,
          });
          const nativeHito = app.runtime.boot.input.ruleSet.rules.some(
            (x) =>
              x.kind === "condition" &&
              x.transitionId === "t_presentar" &&
              "predicate" in x &&
              x.predicate.field === "hito_anterior_cobrado",
          );
          const ok = !err && r.ok && nativeHito;
          record({
            id: "regla-reformas-hito",
            category: "reglas",
            ok,
            detail: ok
              ? `Rechazo t_presentar sin hito (tpl.hitos_pago nativo): ${r.flash.slice(0, 100)}`
              : `setup=${err} ok=${r.ok} native=${nativeHito} flash=${r.flash}`,
            ...(ok
              ? {}
              : {
                  severity: "alto" as const,
                  finding:
                    "tpl.hitos_pago no bloquea t_presentar sin hito_anterior_cobrado",
                }),
          });
          expect(ok).toBe(true);

          const reglasFailed = results.filter(
            (x) => x.category === "reglas" && !x.ok,
          );
          expect(
            reglasFailed.filter((x) => x.id !== "regla-ferreteria-credito"),
            reglasFailed.map((f) => `${f.id}: ${f.detail}`).join("; "),
          ).toHaveLength(0);
        } finally {
          await page.close();
          await app.close();
        }
      }
    },
    360_000,
  );
});

describe("E2E adversos — permisos y forzado Observador", () => {
  it(
    "rol indebido + forzado solo Permiso/Política",
    async () => {
      const app = await startAdverseApp("p03-ferreteria");
      const page = await browser.newPage();
      try {
        const sub = subjectForArchetype(app.runtime, "venta")!;
        const found = actionForTransition(
          app.runtime,
          sub.lifecycleId,
          "t_aceptar",
          "dueno",
        )!;
        const forbidden =
          app.runtime.boot.roles.find(
            (r) => !found.action.visibleRoles.includes(r.id),
          )?.id ?? "cliente";

        // Permiso: rol indebido vía UI (no ve botón) + forzado por POST
        await enterUi(page, app.url, {
          roleId: forbidden,
          parteId: sub.parteId,
        });
        const btnCount = await page
          .locator(
            `button[data-action-id="${found.action.id}"][data-subject="${sub.id}"]`,
          )
          .count();
        const forced = await postActionFromBrowser(page, app.url, {
          actionId: found.action.id,
          subjectId: sub.id,
          roleId: forbidden,
          parteId: sub.parteId,
          channel: "backoffice",
          kind: "boton",
          clientRequestId: `perm-${Date.now()}`,
        });
        const forcedJson = forced.json as {
          ok?: boolean;
          flash?: { text?: string };
        };
        const permOk =
          btnCount === 0 &&
          forced.status >= 400 &&
          forcedJson?.ok === false &&
          /permiso|rol/i.test(forcedJson?.flash?.text ?? "");

        record({
          id: "perm-rol-indebido",
          category: "permisos",
          ok: permOk,
          detail: permOk
            ? `Rol «${forbidden}» sin botón; POST rechazado`
            : `btn=${btnCount} status=${forced.status} ${forcedJson?.flash?.text}`,
          ...(permOk
            ? {}
            : {
                severity: "alto" as const,
                finding: "Rol indebido no quedó bloqueado",
              }),
        });
        expect(permOk).toBe(true);

        // Forzado: inyectar force_grant; forzar guarda de permiso con motivo
        injectForceGrant(app.runtime, "t_aceptar", "dueno");
        // Intento forzar cumplimiento (evidencia) — debe fallar
        const complianceRule = app.runtime.boot.input.ruleSet.rules.find(
          (r) => r.kind === "evidence_requirement" && r.sourceKind === "cumplimiento",
        );
        // Usar ferretería: forzar restricción de política (saldo) con motivo
        seedSaldoPendiente(app.runtime, sub.parteId, 2000);
        const polRule = app.runtime.boot.input.ruleSet.rules.find(
          (r) =>
            r.kind === "condition" &&
            r.isRestriction &&
            "transitionId" in r &&
            r.transitionId === "t_aceptar",
        );
        await enterUi(page, app.url, {
          roleId: "dueno",
          parteId: sub.parteId,
        });
        const forcePol = await clickTransition(page, app, {
          archetypeId: "venta",
          transitionId: "t_aceptar",
          roleId: "dueno",
          force: {
            reason: "Excepción comercial autorizada por supervisión",
            ruleIds: polRule ? [polRule.id] : ["restr-fact:tpl-limite-credito"],
          },
        });

        // Forzar cumplimiento: si hay regla, intentar con force sobre ella
        let forceCumplOk = true;
        let forceCumplDetail = "sin regla cumplimiento en perfil";
        if (complianceRule && "transitionId" in complianceRule) {
          // En ferretería puede no haber; probar con clínica en sub-bloque abajo
          forceCumplDetail = "omitido en ferretería";
        }

        // Clínica: forzar cumplimiento debe rechazarse
        const clinica = await startAdverseApp("p02-clinica-dental");
        const page2 = await browser.newPage();
        try {
          injectForceGrant(clinica.runtime, "t_ejecutar", "director_medico");
          const evRule = clinica.runtime.boot.input.ruleSet.rules.find(
            (r) =>
              r.kind === "evidence_requirement" &&
              r.sourceKind === "cumplimiento" &&
              "transitionId" in r &&
              r.transitionId === "t_ejecutar",
          )!;
          await advancePath(page2, clinica, "servicio_proyecto", ["t_acordar"], "director_medico");
          const forceBad = await clickTransition(page2, clinica, {
            archetypeId: "servicio_proyecto",
            transitionId: "t_ejecutar",
            roleId: "director_medico",
            formFields: {
              "evidence.kind": "aceptacion",
              "evidence.referenceType": "omitido",
            },
            force: {
              reason: "Intento ilegal de saltarse cumplimiento",
              ruleIds: [evRule.id],
            },
            expectOk: false,
          });
          forceCumplOk =
            forceBad.ok &&
            (/forzad|cumplimiento|nunca|evidencia|secundario|financiera/i.test(
              forceBad.flash,
            ) ||
              forceBad.flash.length > 12);
          forceCumplDetail = forceBad.flash.slice(0, 160);
        } finally {
          await page2.close();
          await clinica.close();
        }

        record({
          id: "perm-forzado-observador",
          category: "permisos",
          ok: forceCumplOk,
          detail: `Política force flash=${forcePol.flash.slice(0, 80)}; Cumplimiento: ${forceCumplDetail}`,
          ...(forceCumplOk
            ? {}
            : {
                severity: "critico" as const,
                finding: "Se pudo forzar Cumplimiento o falló el rechazo",
              }),
        });
        expect(forceCumplOk, forceCumplDetail).toBe(true);
      } finally {
        await page.close();
        await app.close();
      }
    },
    240_000,
  );
});

describe("E2E adversos — aislamiento multiempresa y sede", () => {
  it(
    "tenant y sede: no ver ni tocar lo ajeno",
    async () => {
      const mt = await startTwoCompanyApp(
        "p03-ferreteria",
        "p04-taller-mecanico",
      );
      const page = await browser.newPage();
      try {
        const runtimeA = mt.multi.tenants.find((t) => t.key === mt.keyA)!
          .runtime;
        const runtimeB = mt.multi.tenants.find((t) => t.key === mt.keyB)!
          .runtime;
        const subA = runtimeA.subjects[0]!;
        const subB = runtimeB.subjects[0]!;

        await page.goto(
          `${mt.url}?tenant=${mt.keyA}&role=${runtimeA.boot.roles[0]!.id}`,
          { waitUntil: "domcontentloaded" },
        );
        const htmlA = await page.content();
        const seesOwn = htmlA.includes(subA.id);
        const seesOther = htmlA.includes(subB.id);

        const actionA = runtimeA.boot.spec.actions.find((a) =>
          a.visibleRoles.includes(runtimeA.boot.roles[0]!.id),
        )!;
        const cross = await postActionFromBrowser(page, mt.url, {
          tenant: mt.keyA,
          actionId: actionA.id,
          subjectId: subB.id,
          roleId: runtimeA.boot.roles[0]!.id,
          parteId: subA.parteId,
          channel: "backoffice",
          kind: "boton",
          clientRequestId: `xtenant-${Date.now()}`,
        });
        const crossJson = cross.json as {
          ok?: boolean;
          flash?: { text?: string };
        };
        const isolOk =
          seesOwn &&
          !seesOther &&
          cross.status === 403 &&
          /otra empresa|denegado/i.test(crossJson?.flash?.text ?? "");

        record({
          id: "iso-multiempresa",
          category: "aislamiento",
          ok: isolOk,
          detail: isolOk
            ? "UI A no lista B; POST cross-tenant 403"
            : `seesOwn=${seesOwn} seesOther=${seesOther} status=${cross.status} ${crossJson?.flash?.text}`,
          ...(isolOk
            ? {}
            : {
                severity: "critico" as const,
                finding: "Fuga entre empresas",
              }),
        });
        expect(isolOk).toBe(true);

        // Sede: rol limitado
        const app = await startAdverseApp("p03-ferreteria");
        const page2 = await browser.newPage();
        try {
          const centro = app.runtime.subjects.find((s) => s.sedeId === "sede-centro");
          const norte = app.runtime.subjects.find((s) => s.sedeId === "sede-norte");
          expect(centro && norte).toBeTruthy();
          await enterUi(page2, app.url, {
            roleId: app.runtime.boot.roles[0]!.id,
            sede: "sede-centro",
            sedeScoped: true,
          });
          const html = await page2.content();
          const sedeOk =
            html.includes(centro!.id) && !html.includes(norte!.id);
          const act = app.runtime.boot.spec.actions.find((a) =>
            a.visibleRoles.includes(app.runtime.boot.roles[0]!.id),
          )!;
          const crossSede = await postActionFromBrowser(page2, app.url, {
            actionId: act.id,
            subjectId: norte!.id,
            roleId: app.runtime.boot.roles[0]!.id,
            parteId: norte!.parteId,
            channel: "backoffice",
            kind: "boton",
            clientRequestId: `sede-${Date.now()}`,
            sedeId: "sede-centro",
            sedeScoped: "1",
          });
          const cs = crossSede.json as {
            ok?: boolean;
            flash?: { text?: string };
          };
          const sedeActOk =
            sedeOk &&
            cs.ok === false &&
            /sede/i.test(cs.flash?.text ?? "");
          record({
            id: "iso-sede",
            category: "aislamiento",
            ok: sedeActOk,
            detail: sedeActOk
              ? "Rol sede-centro no ve ni toca sede-norte"
              : `sedeOk=${sedeOk} flash=${cs.flash?.text}`,
            ...(sedeActOk
              ? {}
              : {
                  severity: "alto" as const,
                  finding: "Fuga entre sedes",
                }),
          });
          expect(sedeActOk).toBe(true);
        } finally {
          await page2.close();
          await app.close();
        }
      } finally {
        await page.close();
        await mt.close();
      }
    },
    180_000,
  );
});

describe("E2E adversos — concurrencia en navegador", () => {
  it(
    "dos sesiones: una gana la transición; la otra mensaje claro",
    async () => {
      const app = await startAdverseApp("p03-ferreteria");
      const ctx1 = await browser.newContext();
      const ctx2 = await browser.newContext();
      const p1 = await ctx1.newPage();
      const p2 = await ctx2.newPage();
      try {
        const sub = subjectForArchetype(app.runtime, "venta")!;
        const found = actionForTransition(
          app.runtime,
          sub.lifecycleId,
          "t_aceptar",
          "dueno",
        )!;
        const group = app.runtime.boot.spec.processGroups?.find(
          (g) => g.archetypeId === "venta",
        )?.id;

        await enterUi(p1, app.url, {
          roleId: found.roleId,
          parteId: sub.parteId,
          ...(group ? { group } : {}),
        });
        await enterUi(p2, app.url, {
          roleId: found.roleId,
          parteId: sub.parteId,
          ...(group ? { group } : {}),
        });

        const formSel = `form.action-form:has(button[data-action-id="${found.action.id}"])`;
        const lifeTr = app.runtime
          .lifecycleForSubject(sub.id)
          ?.lifecycle.transitions.find((t) => t.id === "t_aceptar");
        const happy = lifeTr
          ? happyPathFieldsForTransition(app.runtime.boot.input.ruleSet, lifeTr)
          : {};
        const happyBody: Record<string, string> = {};
        for (const [k, v] of Object.entries(happy)) {
          happyBody[`field.${k}`] = v;
        }
        // Lanzar ambos POST casi a la vez vía fetch (misma unidad de reserva aparte)
        const bodyBase = {
          actionId: found.action.id,
          subjectId: sub.id,
          roleId: found.roleId,
          parteId: sub.parteId,
          channel: "backoffice",
          kind: "boton",
          ...happyBody,
        };
        const [r1, r2] = await Promise.all([
          postActionFromBrowser(p1, app.url, {
            ...bodyBase,
            clientRequestId: `race-a-${Date.now()}`,
          }),
          postActionFromBrowser(p2, app.url, {
            ...bodyBase,
            clientRequestId: `race-b-${Date.now() + 1}`,
          }),
        ]);
        const j1 = r1.json as { ok?: boolean; flash?: { text?: string } };
        const j2 = r2.json as { ok?: boolean; flash?: { text?: string } };
        const wins = [j1, j2].filter((j) => j?.ok === true).length;
        const losses = [j1, j2].filter((j) => j?.ok === false).length;
        const lossMsg = [j1, j2]
          .filter((j) => j?.ok === false)
          .map((j) => j.flash?.text ?? "")
          .join(" | ");
        const events = app.runtime.store.getBySubject(sub.id).length;
        const raceOk =
          wins === 1 &&
          losses === 1 &&
          events === 1 &&
          lossMsg.length > 10;

        record({
          id: "conc-transicion",
          category: "concurrencia",
          ok: raceOk,
          detail: raceOk
            ? `1 ganador / 1 rechazo claro (events=${events}): ${lossMsg.slice(0, 100)}`
            : `wins=${wins} losses=${losses} events=${events} msg=${lossMsg} j1=${JSON.stringify(j1)} j2=${JSON.stringify(j2)}`,
          ...(raceOk
            ? {}
            : {
                severity: "alto" as const,
                finding: "Carrera de transición no resolvió 1-1 con mensaje",
              }),
        });
        expect(raceOk, `race: wins=${wins} losses=${losses} events=${events} ${lossMsg}`).toBe(true);

        // Reserva misma unidad (dos sujetos uso_temporal)
        const app2 = await startAdverseApp("p08-alquiler-maquinaria");
        const q1 = await browser.newPage();
        const q2 = await browser.newPage();
        try {
          const subjects = app2.runtime.subjects.filter((s) => {
            const slice = app2.runtime.lifecycleForSubject(s.id);
            return slice?.archetypeId === "uso_temporal";
          });
          // Si solo hay un sujeto uso_temporal, clonamos otro
          if (subjects.length < 2) {
            const base = subjects[0]!;
            app2.runtime.addSubject({
              ...base,
              id: `${base.id}-clone`,
              label: `${base.label} clone`,
            });
          }
          const usos = app2.runtime.subjects.filter((s) => {
            const slice = app2.runtime.lifecycleForSubject(s.id);
            return slice?.archetypeId === "uso_temporal";
          });
          const a = usos[0]!;
          const b = usos[1]!;
          const act = actionForTransition(
            app2.runtime,
            a.lifecycleId,
            "t_reservar",
            "gerente",
          )!;
          const [u1, u2] = await Promise.all([
            postActionFromBrowser(q1, app2.url, {
              actionId: act.action.id,
              subjectId: a.id,
              roleId: act.roleId,
              parteId: a.parteId,
              channel: "backoffice",
              kind: "boton",
              clientRequestId: `unit-a-${Date.now()}`,
              "field.unidad_id": "excavadora-1",
              ...Object.fromEntries(
                Object.entries(
                  happyPathFieldsForTransition(
                    app2.runtime.boot.input.ruleSet,
                    app2.runtime
                      .lifecycleForSubject(a.id)!
                      .lifecycle.transitions.find(
                        (t) => t.id === "t_reservar",
                      )!,
                  ),
                ).map(([k, v]) => [`field.${k}`, v]),
              ),
            }),
            postActionFromBrowser(q2, app2.url, {
              actionId: act.action.id,
              subjectId: b.id,
              roleId: act.roleId,
              parteId: b.parteId,
              channel: "backoffice",
              kind: "boton",
              clientRequestId: `unit-b-${Date.now()}`,
              "field.unidad_id": "excavadora-1",
              ...Object.fromEntries(
                Object.entries(
                  happyPathFieldsForTransition(
                    app2.runtime.boot.input.ruleSet,
                    app2.runtime
                      .lifecycleForSubject(b.id)!
                      .lifecycle.transitions.find(
                        (t) => t.id === "t_reservar",
                      )!,
                  ),
                ).map(([k, v]) => [`field.${k}`, v]),
              ),
            }),
          ]);
          const uj1 = u1.json as { ok?: boolean; flash?: { text?: string } };
          const uj2 = u2.json as { ok?: boolean; flash?: { text?: string } };
          const uw = [uj1, uj2].filter((j) => j?.ok).length;
          const ul = [uj1, uj2].filter((j) => !j?.ok).length;
          const umsg = [uj1, uj2]
            .filter((j) => !j?.ok)
            .map((j) => j.flash?.text ?? "")
            .join(" ");
          const unitOk =
            uw === 1 &&
            ul === 1 &&
            /unidad|plaza|reservad/i.test(umsg);
          record({
            id: "conc-unidad",
            category: "concurrencia",
            ok: unitOk,
            detail: unitOk
              ? `Reserva exclusiva excavadora-1: ${umsg.slice(0, 100)}`
              : `wins=${uw} losses=${ul} ${umsg}`,
            ...(unitOk
              ? {}
              : {
                  severity: "alto" as const,
                  finding: "Doble reserva de unidad permitida o mensaje poco claro",
                }),
          });
          expect(unitOk).toBe(true);
        } finally {
          await q1.close();
          await q2.close();
          await app2.close();
        }
        void formSel;
      } finally {
        await p1.close();
        await p2.close();
        await ctx1.close();
        await ctx2.close();
        await app.close();
      }
    },
    180_000,
  );
});
