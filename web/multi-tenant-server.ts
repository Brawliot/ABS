/**
 * Servidor multiempresa: dos (o más) AppRuntime en la misma instancia HTTP.
 * El aislamiento se fuerza por tenant en URL y en POST /action.
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createDevolucionVinculada } from "../archetypes/linked-transaction.js";
import {
  computeBalanceByParty,
  type PartyMovement,
} from "../elements/closure.js";
import type { PresentationChannel } from "../presentation/types.js";
import { executeUiAction } from "./action-handler.js";
import {
  answersFromForm,
  renderDiagnosisHtml,
  runDiagnosis,
} from "./diagnosis-page.js";
import { renderAppHtml, resolveSession } from "./render-app.js";
import type { AppRuntime } from "./runtime.js";
import type { AppBootResult, DevSession } from "./types.js";

export interface TenantSlot {
  readonly key: string;
  readonly boot: AppBootResult;
  readonly runtime: AppRuntime;
}

export interface MultiTenantHandle {
  readonly port: number;
  readonly url: string;
  readonly tenants: readonly TenantSlot[];
  close(): Promise<void>;
}

function parseQuery(url: string): Record<string, string> {
  const i = url.indexOf("?");
  if (i < 0) return {};
  const out: Record<string, string> = {};
  new URLSearchParams(url.slice(i + 1)).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  type: string,
  headers?: Record<string, string>,
): void {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...(headers ?? {}),
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function formToRecord(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  new URLSearchParams(raw).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function pickTenant(
  tenants: readonly TenantSlot[],
  key: string | undefined,
): TenantSlot | undefined {
  if (!key) return tenants[0];
  return tenants.find((t) => t.key === key);
}

/** Movimientos multiparte en memoria por tenant (ruptura #4). */
const balanceBooks = new Map<string, PartyMovement[]>();

export function startMultiTenantWebServer(
  tenants: readonly TenantSlot[],
  options?: { readonly port?: number; readonly host?: string },
): Promise<MultiTenantHandle> {
  if (tenants.length < 1) {
    throw new Error("Se requiere al menos un tenant");
  }
  const host = options?.host ?? "127.0.0.1";
  const preferred = options?.port ?? 0;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = req.url ?? "/";
      const path = url.split("?")[0] ?? "/";
      const method = (req.method ?? "GET").toUpperCase();
      const q = parseQuery(url);

      if (path === "/health") {
        return send(
          res,
          200,
          JSON.stringify({
            ok: true,
            multiTenant: true,
            tenants: tenants.map((t) => ({
              key: t.key,
              profileId: t.boot.profileId,
              subjects: t.runtime.subjects.length,
            })),
          }),
          "application/json; charset=utf-8",
        );
      }

      if (path === "/diagnosis") {
        if (method === "GET") {
          return send(
            res,
            200,
            renderDiagnosisHtml(""),
            "text/html; charset=utf-8",
          );
        }
        if (method === "POST") {
          const form = formToRecord(await readBody(req));
          const result = runDiagnosis(answersFromForm(form));
          return send(
            res,
            200,
            renderDiagnosisHtml(result.htmlBody),
            "text/html; charset=utf-8",
          );
        }
      }

      if (path === "/balance" && method === "POST") {
        const form = formToRecord(await readBody(req));
        const slot = pickTenant(tenants, form.tenant || q.tenant);
        if (!slot) {
          return send(res, 404, "Tenant desconocido", "text/plain");
        }
        const book = balanceBooks.get(slot.key) ?? [];
        const amount = Number(form.amount);
        const parteId = form.parteId || "a";
        const direction = form.direction === "out" ? "out" : "in";
        if (!Number.isFinite(amount) || amount <= 0) {
          return send(res, 422, "Importe inválido", "text/plain");
        }
        book.push({ amount, direction, parteId });
        balanceBooks.set(slot.key, book);
        const byParty = computeBalanceByParty(book);
        const loc = new URLSearchParams({
          tenant: slot.key,
          role: form.roleId ?? "",
          parte: form.parteIdSession ?? form.parteId ?? "",
          balance: "1",
        });
        if (form.accept === "json" || (req.headers.accept ?? "").includes("json")) {
          return send(
            res,
            200,
            JSON.stringify({ ok: true, byParty, movements: book.length }),
            "application/json; charset=utf-8",
          );
        }
        return send(res, 303, "", "text/plain", {
          Location: `/?${loc.toString()}`,
        });
      }

      if (path === "/link-devolucion" && method === "POST") {
        const form = formToRecord(await readBody(req));
        const slot = pickTenant(tenants, form.tenant || q.tenant);
        if (!slot) {
          return send(res, 404, "Tenant desconocido", "text/plain");
        }
        const originalId = form.originalSubjectId ?? "";
        const original = slot.runtime.subjects.find((s) => s.id === originalId);
        if (!original) {
          slot.runtime.setFlash({
            kind: "error",
            text: "No se puede vincular: el expediente original no existe en esta empresa.",
          });
          return send(res, 303, "", "text/plain", {
            Location: `/?tenant=${encodeURIComponent(slot.key)}`,
          });
        }
        const newId = form.newSubjectId || `${originalId}-devolucion`;
        const linked = createDevolucionVinculada(originalId, newId);
        const ventaSlice = slot.runtime.boot.input.lifecycles[0];
        if (!ventaSlice) {
          slot.runtime.setFlash({
            kind: "error",
            text: "Este perfil no tiene ciclo de venta para devoluciones vinculadas.",
          });
          return send(res, 303, "", "text/plain", {
            Location: `/?tenant=${encodeURIComponent(slot.key)}`,
          });
        }
        slot.runtime.addSubject({
          id: linked.spec.identity.id,
          lifecycleId: ventaSlice.id,
          label: `Devolución vinculada a ${originalId}`,
          parteId: original.parteId,
          ...(original.sedeId ? { sedeId: original.sedeId } : {}),
          vinculadaA: linked.vinculadaA,
        });
        slot.runtime.setFlash({
          kind: "ok",
          text: `Devolución creada como expediente nuevo «${linked.spec.identity.id}» vinculado a «${linked.vinculadaA}» (el terminal original no se reabre).`,
        });
        const loc = new URLSearchParams({
          tenant: slot.key,
          role: form.roleId ?? "",
          parte: form.parteId ?? original.parteId,
        });
        return send(res, 303, "", "text/plain", {
          Location: `/?${loc.toString()}`,
        });
      }

      if (path === "/action" && method === "POST") {
        const raw = await readBody(req);
        const form = formToRecord(raw);
        const slot = pickTenant(tenants, form.tenant || q.tenant);
        if (!slot) {
          return send(
            res,
            403,
            JSON.stringify({
              ok: false,
              flash: {
                kind: "error",
                text: "Empresa desconocida: no puede actuar fuera de su tenant.",
              },
            }),
            "application/json; charset=utf-8",
          );
        }
        const subjectId = form.subjectId ?? "";
        if (
          subjectId &&
          !slot.runtime.subjects.some((s) => s.id === subjectId)
        ) {
          // ¿Existe en otro tenant?
          const other = tenants.find(
            (t) =>
              t.key !== slot.key &&
              t.runtime.subjects.some((s) => s.id === subjectId),
          );
          const flash = {
            kind: "error" as const,
            text: other
              ? "Acceso denegado: ese expediente pertenece a otra empresa. No puede verlo ni modificarlo."
              : "No encontramos el expediente indicado.",
          };
          slot.runtime.setFlash(flash);
          const accept = req.headers.accept ?? "";
          if (accept.includes("application/json")) {
            return send(
              res,
              403,
              JSON.stringify({ ok: false, flash }),
              "application/json; charset=utf-8",
            );
          }
          const loc = new URLSearchParams({
            tenant: slot.key,
            role: form.roleId ?? "",
            parte: form.parteId ?? "",
          });
          return send(res, 303, "", "text/plain", {
            Location: `/?${loc.toString()}`,
          });
        }

        const forceRuleIds = (form.forceRuleIds ?? "")
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const result = await executeUiAction(slot.runtime, {
          actionId: form.actionId ?? "",
          subjectId,
          clientRequestId: form.clientRequestId || `auto-${Date.now()}`,
          roleId: form.roleId ?? slot.boot.roles[0]?.id ?? "gerente",
          parteId: form.parteId ?? "parte-demo-1",
          channel: (form.channel ?? "backoffice") as PresentationChannel,
          kind: form.kind === "formulario" ? "formulario" : "boton",
          formValues: Object.fromEntries(
            Object.entries(form)
              .filter(([k]) => k.startsWith("field."))
              .map(([k, v]) => [k.slice("field.".length), v]),
          ),
          forceEnabled: form.forceEnabled === "1",
          ...(form.forceReason !== undefined
            ? { forceReason: form.forceReason }
            : {}),
          ...(forceRuleIds.length > 0 ? { forceRuleIds } : {}),
          ...(form.sedeId ? { sedeId: form.sedeId } : {}),
          sedeScoped: form.sedeScoped === "1",
        });

        const accept = req.headers.accept ?? "";
        if (accept.includes("application/json")) {
          return send(
            res,
            result.ok ? 200 : 422,
            JSON.stringify(result),
            "application/json; charset=utf-8",
          );
        }
        const loc = new URLSearchParams({
          tenant: slot.key,
          role: form.roleId ?? "",
          parte: form.parteId ?? "",
          group: form.group ?? "",
          view: form.view ?? "",
          ...(form.sedeId ? { sede: form.sedeId } : {}),
          ...(form.sedeScoped === "1" ? { sedeScoped: "1" } : {}),
        });
        return send(res, 303, "", "text/plain", {
          Location: `/?${loc.toString()}`,
        });
      }

      if (path !== "/" && path !== "/index.html") {
        return send(res, 404, "Not found", "text/plain");
      }

      const slot = pickTenant(tenants, q.tenant);
      if (!slot) {
        return send(res, 404, "Tenant desconocido", "text/plain");
      }
      const { boot, runtime } = slot;
      const sedeScoped = q.sedeScoped === "1";
      const sedeId = q.sede;
      const liveRows = runtime.projectRows({
        ...(sedeId ? { sedeId } : {}),
        sedeScoped,
      });
      const session: DevSession = {
        ...resolveSession(
          boot,
          {
            ...(q.role !== undefined ? { role: q.role } : {}),
            ...(q.parte !== undefined ? { parte: q.parte } : {}),
            ...(q.group !== undefined ? { group: q.group } : {}),
            ...(q.view !== undefined ? { view: q.view } : {}),
          },
          { preferRows: liveRows },
        ),
        tenantId: slot.key,
        ...(sedeId ? { sedeId } : {}),
        sedeScoped,
      };

      const flash = runtime.flash;
      runtime.setFlash(undefined);
      const book = balanceBooks.get(slot.key) ?? [];
      const byParty =
        q.balance === "1" || book.length > 0
          ? computeBalanceByParty(book)
          : undefined;

      let html = renderAppHtml({
        boot,
        session,
        live: true,
        liveRows,
        activeBlocks: runtime.activeBlocks(),
        ...(flash !== undefined ? { flash } : {}),
      });

      // Paneles auxiliares adversos (devolución / multiparte / tenants)
      const tenantSwitcher = tenants
        .map(
          (t) =>
            `<a data-tenant-link="${t.key}" href="/?tenant=${encodeURIComponent(t.key)}&role=${encodeURIComponent(session.roleId)}">${t.key}</a>`,
        )
        .join(" · ");
      const balancePanel =
        byParty !== undefined
          ? `<section data-balance-panel><h3>Saldo multiparte</h3><pre data-balance-json>${JSON.stringify(byParty)}</pre>` +
            `<form method="post" action="/balance" data-balance-form>` +
            `<input type="hidden" name="tenant" value="${slot.key}" />` +
            `<input type="hidden" name="roleId" value="${session.roleId}" />` +
            `<label>Parte <input name="parteId" value="a" /></label>` +
            `<label>Importe <input name="amount" type="number" value="10" /></label>` +
            `<label>Dir <select name="direction"><option value="in">in</option><option value="out">out</option></select></label>` +
            `<button type="submit">Registrar movimiento</button></form></section>`
          : `<p><a data-open-balance href="/?tenant=${encodeURIComponent(slot.key)}&balance=1&role=${encodeURIComponent(session.roleId)}">Abrir saldo multiparte</a></p>`;

      const linkPanel =
        `<section data-link-devolucion>` +
        `<h3>Devolución vinculada</h3>` +
        `<form method="post" action="/link-devolucion" data-link-form>` +
        `<input type="hidden" name="tenant" value="${slot.key}" />` +
        `<input type="hidden" name="roleId" value="${session.roleId}" />` +
        `<input type="hidden" name="parteId" value="${session.parteId}" />` +
        `<label>Expediente original <input name="originalSubjectId" data-original-subject /></label>` +
        `<button type="submit">Crear devolución vinculada</button>` +
        `</form></section>`;

      html = html.replace(
        "<main class=\"main\" id=\"main\">",
        `<main class="main" id="main">` +
          `<nav data-tenant-bar>Empresas: ${tenantSwitcher} · <a href="/diagnosis" data-diagnosis-link>Diagnóstico</a></nav>` +
          balancePanel +
          linkPanel,
      );

      // Inyectar tenant + sede + force en formularios
      html = html.replace(
        /(<form method="post" action="\/action"[^>]*>)/g,
        `$1<input type="hidden" name="tenant" value="${slot.key}" />` +
          (sedeId
            ? `<input type="hidden" name="sedeId" value="${sedeId}" />`
            : "") +
          (sedeScoped
            ? `<input type="hidden" name="sedeScoped" value="1" />`
            : "") +
          `<details data-force-panel><summary>Forzar (Observador)</summary>` +
          `<label>Motivo <input name="forceReason" data-force-reason /></label>` +
          `<label>Reglas <input name="forceRuleIds" data-force-rules placeholder="id-regla" /></label>` +
          `<label><input type="checkbox" name="forceEnabled" value="1" data-force-enabled /> Activar forzado</label>` +
          `</details>`,
      );

      return send(res, 200, html, "text/html; charset=utf-8");
    })().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        send(res, 500, msg, "text/plain; charset=utf-8");
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(preferred, host, () => {
      const addr = server.address();
      const port =
        typeof addr === "object" && addr ? addr.port : preferred;
      resolve({
        port,
        url: `http://${host}:${port}/`,
        tenants,
        close: () =>
          new Promise((resClose, rejClose) => {
            server.close((err) => {
              for (const t of tenants) t.runtime.close();
              if (err) rejClose(err);
              else resClose();
            });
          }),
      });
    });
  });
}
