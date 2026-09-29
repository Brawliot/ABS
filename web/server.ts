/**
 * Servidor HTTP: UiSpec sellada + runtime SQLite.
 * POST /action es la única vía de escritura (Intérprete → Juez → EventStore).
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTokenMap } from "../presentation/resolve-tokens.js";
import { createDevolucionVinculada } from "../archetypes/linked-transaction.js";
import { allowDevSession } from "../auth/env.js";
import type { PresentationChannel } from "../presentation/types.js";
import { executeUiAction } from "./action-handler.js";
import {
  answersFromForm,
  renderDiagnosisHtml,
  runDiagnosis,
} from "./diagnosis-page.js";
import { renderAppHtml, resolveSession } from "./render-app.js";
import { AppRuntime } from "./runtime.js";
import type { AppBootResult, DevSession } from "./types.js";
import {
  acceptInvite,
  completePasswordReset,
  createAuthRuntime,
  identityForAction,
  inviteEmployee,
  loginWithMagicToken,
  loginWithPassword,
  logoutSession,
  readAuthSession,
  requestMagicLink,
  requestPasswordReset,
  requireCsrf,
  resolveRequestIdentity,
  revokeEmployeeAccess,
  switchActiveCompany,
  type AuthRuntime,
} from "./auth-bridge.js";
import { AccountsError } from "../accounts/index.js";
import {
  assertProductionSecurityConfig,
  CsrfError,
  isProduction,
  securityHeaders,
} from "../auth/index.js";
import { ParteIdentityStore } from "../policies/identity.js";
import {
  erasePartePersonal,
  exportPartePersonal,
  draftRatFromConfig,
  rectifyPartePersonal,
  HOSTING_EU_CHECKLIST,
  PRIVACY_POLICY_DRAFT,
  DPA_DRAFT,
  BREACH_PROCEDURE,
} from "../gdpr/index.js";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "public");

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
  headers?: Record<string, string | string[]>,
): void {
  const merged: Record<string, string | string[]> = {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...(headers ?? {}),
  };
  res.statusCode = status;
  for (const [k, v] of Object.entries(merged)) {
    if (k === "Set-Cookie" && Array.isArray(v)) {
      for (const c of v) res.appendHeader("Set-Cookie", c);
    } else if (typeof v === "string") {
      res.setHeader(k, v);
    }
  }
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

export interface WebServerHandle {
  readonly port: number;
  readonly url: string;
  readonly boot: AppBootResult;
  readonly runtime: AppRuntime;
  readonly auth?: AuthRuntime;
  readonly identities: ParteIdentityStore;
  close(): Promise<void>;
}

/**
 * Arranca servidor con boot + EventStore SQLite persistente.
 */
export function startWebServer(
  boot: AppBootResult,
  options?: {
    readonly port?: number;
    readonly host?: string;
    readonly dbPath?: string;
    readonly runtime?: AppRuntime;
    readonly auth?: AuthRuntime;
    readonly enableAuth?: boolean;
    readonly accountsDbPath?: string;
  },
): Promise<WebServerHandle> {
  assertProductionSecurityConfig();
  const host = options?.host ?? "127.0.0.1";
  const preferred = options?.port ?? 4173;
  const runtime =
    options?.runtime ??
    AppRuntime.open(boot, {
      ...(options?.dbPath !== undefined ? { dbPath: options.dbPath } : {}),
    });
  const auth =
    options?.auth ??
    (options?.enableAuth || isProduction()
      ? createAuthRuntime(options?.accountsDbPath)
      : undefined);
  const identities = new ParteIdentityStore();

  const renderPage = (
    session: DevSession,
    liveRows?: ReturnType<AppRuntime["projectRows"]>,
    showDevSession = true,
  ): string => {
    const flash = runtime.flash;
    runtime.setFlash(undefined);
    try {
      return renderAppHtml({
        boot,
        session,
        live: true,
        liveRows:
          liveRows ??
          runtime.projectRows({
            ...(session.sedeId ? { sedeId: session.sedeId } : {}),
            sedeScoped: session.sedeScoped === true,
          }),
        activeBlocks: runtime.activeBlocks(),
        showDevSession: showDevSession && allowDevSession(),
        ...(flash !== undefined ? { flash } : {}),
      });
    } catch (e) {
      console.error("ERROR en renderAppHtml:", e);
      throw e;
    };
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = req.url ?? "/";
      const path = url.split("?")[0] ?? "/";
      const method = (req.method ?? "GET").toUpperCase();

      if (path === "/manifest.webmanifest") {
        try {
          const body = readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf8");
          const tokens = resolveTokenMap({
            designSystem: boot.designSystem,
            roleId: boot.roles[0]?.id ?? "oficina",
            channel: boot.input.channels[0] ?? "backoffice",
          });
          const filled = body
            .replace(/__BRAND__/g, boot.brandName)
            .replace(/__PROFILE__/g, boot.profileId)
            .replace(/__BG__/g, tokens.values["color.fondo"])
            .replace(/__THEME__/g, tokens.values["color.primario"]);
          return send(
            res,
            200,
            filled,
            "application/manifest+json; charset=utf-8",
          );
        } catch {
          return send(res, 404, "manifest missing", "text/plain");
        }
      }

      if (path === "/sw.js") {
        try {
          const body = readFileSync(join(PUBLIC, "sw.js"), "utf8");
          return send(res, 200, body, "application/javascript; charset=utf-8");
        } catch {
          return send(res, 404, "sw missing", "text/plain");
        }
      }

      if (path === "/health") {
        return send(
          res,
          200,
          JSON.stringify({
            ok: true,
            profileId: boot.profileId,
            sealed: true,
            contentHash: boot.spec.contentHash,
            dbPath: runtime.dbPath,
            subjects: runtime.subjects.length,
            events: runtime.store.all().length,
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
          const result = await runDiagnosis(answersFromForm(form));
          return send(
            res,
            200,
            renderDiagnosisHtml(result.htmlBody),
            "text/html; charset=utf-8",
          );
        }
      }

      if (path === "/link-devolucion" && method === "POST") {
        const form = formToRecord(await readBody(req));
        const originalId = form.originalSubjectId ?? "";
        const original = runtime.subjects.find((s) => s.id === originalId);
        if (!original) {
          runtime.setFlash({
            kind: "error",
            text: "No se puede vincular: el expediente original no existe.",
          });
        } else {
          const newId = form.newSubjectId || `${originalId}-devolucion`;
          const linked = createDevolucionVinculada(originalId, newId);
          const ventaSlice = boot.input.lifecycles[0];
          if (ventaSlice) {
            runtime.addSubject({
              id: linked.spec.identity.id,
              lifecycleId: ventaSlice.id,
              label: `Devolución vinculada a ${originalId}`,
              parteId: original.parteId,
              ...(original.sedeId ? { sedeId: original.sedeId } : {}),
              vinculadaA: linked.vinculadaA,
            });
            runtime.setFlash({
              kind: "ok",
              text: `Devolución «${linked.spec.identity.id}» vinculada a «${linked.vinculadaA}» (sin reabrir el terminal).`,
            });
          } else {
            runtime.setFlash({
              kind: "error",
              text: "Este perfil no tiene ciclo de venta para devoluciones.",
            });
          }
        }
        const loc = new URLSearchParams({
          role: form.roleId ?? "",
          parte: form.parteId ?? "",
        });
        return send(res, 303, "", "text/plain", {
          Location: `/?${loc.toString()}`,
        });
      }

      if (path === "/action" && method === "POST") {
        const raw = await readBody(req);
        const form = formToRecord(raw);
        let identity;
        try {
          identity = identityForAction(auth, req, form, boot);
          requireCsrf(identity.session, form, req.headers);
        } catch (e) {
          const msg =
            e instanceof CsrfError || e instanceof AccountsError
              ? e.message
              : "No autorizado";
          const status = e instanceof CsrfError ? 403 : 401;
          const accept = req.headers.accept ?? "";
          if (accept.includes("application/json")) {
            return send(
              res,
              status,
              JSON.stringify({
                ok: false,
                flash: { kind: "error", text: msg },
              }),
              "application/json; charset=utf-8",
            );
          }
          return send(res, status, msg, "text/plain");
        }
        const channel = (identity.channel ??
          form.channel ??
          "backoffice") as PresentationChannel;
        const forceRuleIds = (form.forceRuleIds ?? "")
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const result = await executeUiAction(runtime, {
          actionId: form.actionId ?? "",
          subjectId: form.subjectId ?? "",
          clientRequestId: form.clientRequestId || `auto-${Date.now()}`,
          roleId: identity.roleId,
          parteId: identity.parteId,
          channel,
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
          ...(identity.sedeId ? { sedeId: identity.sedeId } : {}),
          sedeScoped: identity.sedeScoped === true,
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
          role: identity.roleId,
          parte: identity.parteId,
          group: form.group ?? "",
          view: form.view ?? "",
          ...(identity.sedeId ? { sede: identity.sedeId } : {}),
          ...(identity.sedeScoped ? { sedeScoped: "1" } : {}),
        });
        return send(res, 303, "", "text/plain", {
          Location: `/?${loc.toString()}`,
        });
      }

      if (path === "/auth/login" && method === "POST") {
        if (!auth) {
          return send(res, 503, "Auth no habilitado", "text/plain");
        }
        const form = formToRecord(await readBody(req));
        try {
          const { cookies } = loginWithPassword(auth, {
            email: form.email ?? "",
            password: form.password ?? "",
            companyId: form.companyId ?? boot.profileId,
            ...(form.totpCode ? { totpCode: form.totpCode } : {}),
            ipKey: req.socket.remoteAddress ?? "local",
          });
          return send(res, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8", {
            "Set-Cookie": cookies,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error de login";
          return send(
            res,
            401,
            JSON.stringify({ ok: false, error: msg }),
            "application/json; charset=utf-8",
          );
        }
      }

      if (path === "/auth/logout" && method === "POST") {
        if (!auth) return send(res, 503, "Auth no habilitado", "text/plain");
        const form = formToRecord(await readBody(req));
        const sessionAuth = readAuthSession(auth, req);
        if (sessionAuth) {
          try {
            requireCsrf(sessionAuth, form, req.headers);
          } catch {
            return send(res, 403, "CSRF", "text/plain");
          }
          const cookies = logoutSession(
            auth,
            sessionAuth,
            form.allDevices === "1",
          );
          return send(res, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8", {
            "Set-Cookie": cookies,
          });
        }
        return send(res, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8");
      }

      if (path === "/auth/magic-request" && method === "POST") {
        if (!auth) return send(res, 503, "Auth no habilitado", "text/plain");
        const form = formToRecord(await readBody(req));
        try {
          const { token } = requestMagicLink(
            auth,
            form.email ?? "",
            form.companyId ?? boot.profileId,
            req.socket.remoteAddress ?? "local",
          );
          // En prod el token solo iría por correo; en tests se expone.
          return send(
            res,
            200,
            JSON.stringify({
              ok: true,
              ...(allowDevSession() ? { token } : {}),
            }),
            "application/json; charset=utf-8",
          );
        } catch (e) {
          return send(
            res,
            429,
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : "Error",
            }),
            "application/json; charset=utf-8",
          );
        }
      }

      if (path === "/auth/magic" && method === "GET") {
        if (!auth) return send(res, 503, "Auth no habilitado", "text/plain");
        const q = parseQuery(url);
        try {
          const { cookies } = loginWithMagicToken(
            auth,
            q.token ?? "",
            q.companyId ?? boot.profileId,
          );
          return send(res, 303, "", "text/plain", {
            Location: "/",
            "Set-Cookie": cookies,
          });
        } catch (e) {
          return send(
            res,
            401,
            e instanceof Error ? e.message : "Enlace inválido",
            "text/plain",
          );
        }
      }

      if (path === "/auth/reset-request" && method === "POST") {
        if (!auth) return send(res, 503, "Auth no habilitado", "text/plain");
        const form = formToRecord(await readBody(req));
        try {
          const { token } = requestPasswordReset(
            auth,
            form.email ?? "",
            req.socket.remoteAddress ?? "local",
          );
          return send(
            res,
            200,
            JSON.stringify({
              ok: true,
              ...(allowDevSession() && token ? { token } : {}),
            }),
            "application/json; charset=utf-8",
          );
        } catch (e) {
          return send(
            res,
            429,
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : "Error",
            }),
            "application/json; charset=utf-8",
          );
        }
      }

      if (path === "/auth/reset" && method === "POST") {
        if (!auth) return send(res, 503, "Auth no habilitado", "text/plain");
        const form = formToRecord(await readBody(req));
        try {
          completePasswordReset(auth, form.token ?? "", form.password ?? "");
          return send(
            res,
            200,
            JSON.stringify({ ok: true }),
            "application/json; charset=utf-8",
          );
        } catch (e) {
          return send(
            res,
            400,
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : "Error",
            }),
            "application/json; charset=utf-8",
          );
        }
      }

      if (path === "/auth/invite" && method === "POST") {
        if (!auth) return send(res, 503, "Auth no habilitado", "text/plain");
        const form = formToRecord(await readBody(req));
        const sessionAuth = readAuthSession(auth, req);
        if (!sessionAuth) return send(res, 401, "No autorizado", "text/plain");
        try {
          requireCsrf(sessionAuth, form, req.headers);
          const { token } = inviteEmployee(auth, sessionAuth, {
            email: form.email ?? "",
            roleId: form.roleId ?? "",
            ...(form.kind === "portal_cliente" || form.kind === "empleado" || form.kind === "dueno"
              ? { kind: form.kind }
              : {}),
            ...(form.sedeId ? { sedeId: form.sedeId } : {}),
            ...(form.equipoId ? { equipoId: form.equipoId } : {}),
            ...(form.parteId ? { parteId: form.parteId } : {}),
          });
          return send(
            res,
            200,
            JSON.stringify({
              ok: true,
              ...(allowDevSession() ? { token } : {}),
            }),
            "application/json; charset=utf-8",
          );
        } catch (e) {
          const status = e instanceof CsrfError ? 403 : 400;
          return send(
            res,
            status,
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : "Error",
            }),
            "application/json; charset=utf-8",
          );
        }
      }

      if (path === "/auth/invite/accept" && method === "POST") {
        if (!auth) return send(res, 503, "Auth no habilitado", "text/plain");
        const form = formToRecord(await readBody(req));
        try {
          const { cookies } = acceptInvite(auth, form.token ?? "", {
            ...(form.password ? { password: form.password } : {}),
            ...(form.displayName ? { displayName: form.displayName } : {}),
          });
          return send(
            res,
            200,
            JSON.stringify({ ok: true }),
            "application/json; charset=utf-8",
            { "Set-Cookie": cookies },
          );
        } catch (e) {
          return send(
            res,
            400,
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : "Error",
            }),
            "application/json; charset=utf-8",
          );
        }
      }

      if (path === "/auth/revoke" && method === "POST") {
        if (!auth) return send(res, 503, "Auth no habilitado", "text/plain");
        const form = formToRecord(await readBody(req));
        const sessionAuth = readAuthSession(auth, req);
        if (!sessionAuth) return send(res, 401, "No autorizado", "text/plain");
        try {
          requireCsrf(sessionAuth, form, req.headers);
          revokeEmployeeAccess(auth, sessionAuth, form.accountId ?? "");
          return send(
            res,
            200,
            JSON.stringify({ ok: true }),
            "application/json; charset=utf-8",
          );
        } catch (e) {
          return send(
            res,
            403,
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : "Error",
            }),
            "application/json; charset=utf-8",
          );
        }
      }

      if (path === "/auth/switch-company" && method === "POST") {
        if (!auth) return send(res, 503, "Auth no habilitado", "text/plain");
        const form = formToRecord(await readBody(req));
        const sessionAuth = readAuthSession(auth, req);
        if (!sessionAuth) return send(res, 401, "No autorizado", "text/plain");
        try {
          requireCsrf(sessionAuth, form, req.headers);
          const { cookies } = switchActiveCompany(
            auth,
            sessionAuth,
            form.companyId ?? "",
          );
          return send(
            res,
            200,
            JSON.stringify({ ok: true }),
            "application/json; charset=utf-8",
            { "Set-Cookie": cookies },
          );
        } catch (e) {
          return send(
            res,
            403,
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : "Error",
            }),
            "application/json; charset=utf-8",
          );
        }
      }

      if (path === "/login" && method === "GET") {
        const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Acceso — ${boot.brandName}</title></head><body>
<h1>Acceso</h1>
<form method="post" action="/auth/login">
<label>Correo <input name="email" type="email" required /></label>
<label>Contraseña <input name="password" type="password" required /></label>
<label>Empresa <input name="companyId" value="${boot.profileId}" /></label>
<label>2FA (si aplica) <input name="totpCode" /></label>
<button type="submit">Entrar</button>
</form>
${allowDevSession() ? "<p data-dev-login-hint>Modo desarrollo: selector provisional en /</p>" : ""}
</body></html>`;
        return send(res, 200, html, "text/html; charset=utf-8");
      }

      if (path === "/gdpr/export" && method === "GET" && auth) {
        const sessionAuth = readAuthSession(auth, req);
        if (!sessionAuth?.parteId) {
          return send(res, 401, "No autorizado", "text/plain");
        }
        const bundle = exportPartePersonal(
          identities,
          sessionAuth.companyId,
          sessionAuth.parteId,
          sessionAuth.accountId,
        );
        return send(
          res,
          200,
          JSON.stringify(bundle, null, 2),
          "application/json; charset=utf-8",
        );
      }

      if (path === "/gdpr/erase" && method === "POST" && auth) {
        const form = formToRecord(await readBody(req));
        const sessionAuth = readAuthSession(auth, req);
        if (!sessionAuth) return send(res, 401, "No autorizado", "text/plain");
        try {
          requireCsrf(sessionAuth, form, req.headers);
        } catch {
          return send(res, 403, "CSRF", "text/plain");
        }
        const parteId = form.parteId ?? sessionAuth.parteId;
        if (!parteId) return send(res, 400, "parteId requerido", "text/plain");
        if (sessionAuth.kind === "portal_cliente" && sessionAuth.parteId !== parteId) {
          return send(res, 403, "Prohibido", "text/plain");
        }
        try {
          erasePartePersonal(identities, sessionAuth.companyId, parteId);
        } catch (e) {
          return send(
            res,
            404,
            e instanceof Error ? e.message : "Error",
            "text/plain",
          );
        }
        return send(
          res,
          200,
          JSON.stringify({ ok: true }),
          "application/json; charset=utf-8",
        );
      }

      if (path === "/gdpr/rectify" && method === "POST" && auth) {
        const form = formToRecord(await readBody(req));
        const sessionAuth = readAuthSession(auth, req);
        if (!sessionAuth) return send(res, 401, "No autorizado", "text/plain");
        try {
          requireCsrf(sessionAuth, form, req.headers);
        } catch {
          return send(res, 403, "CSRF", "text/plain");
        }
        const parteId = form.parteId ?? sessionAuth.parteId;
        if (!parteId) return send(res, 400, "parteId requerido", "text/plain");
        if (sessionAuth.kind === "portal_cliente" && sessionAuth.parteId !== parteId) {
          return send(res, 403, "Prohibido", "text/plain");
        }
        rectifyPartePersonal(identities, sessionAuth.companyId, parteId, {
          displayName: form.displayName ?? "",
          ...(form.email ? { email: form.email } : {}),
          ...(form.taxId ? { taxId: form.taxId } : {}),
          ...(form.phone ? { phone: form.phone } : {}),
          ...(form.address ? { address: form.address } : {}),
        });
        return send(
          res,
          200,
          JSON.stringify({ ok: true }),
          "application/json; charset=utf-8",
        );
      }

      if (path === "/gdpr/rat" && method === "GET") {
        return send(
          res,
          200,
          JSON.stringify(draftRatFromConfig(boot.profileId), null, 2),
          "application/json; charset=utf-8",
        );
      }

      if (path === "/gdpr/legal-drafts" && method === "GET") {
        return send(
          res,
          200,
          JSON.stringify(
            {
              disclaimer: "PENDIENTE DE REVISIÓN POR ABOGADO",
              privacyPolicy: PRIVACY_POLICY_DRAFT,
              dpa: DPA_DRAFT,
              hostingEu: HOSTING_EU_CHECKLIST,
              breachProcedure: BREACH_PROCEDURE,
            },
            null,
            2,
          ),
          "application/json; charset=utf-8",
        );
      }

      if (path !== "/" && path !== "/index.html") {
        return send(res, 404, "Not found", "text/plain");
      }

      const q = parseQuery(url);
      const ident = resolveRequestIdentity(auth, req, boot, q);
      if (isProduction() && !ident.session) {
        return send(res, 303, "", "text/plain", { Location: "/login" });
      }
      const liveRows = runtime.projectRows({
        ...(ident.dev.sedeId ? { sedeId: ident.dev.sedeId } : {}),
        sedeScoped: ident.dev.sedeScoped === true,
      });
      // preferRows: elige vista cuyo stateId tenga expedientes (como antes)
      const session: DevSession =
        ident.mode === "auth"
          ? ident.dev
          : {
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
              ...(ident.dev.sedeId ? { sedeId: ident.dev.sedeId } : {}),
              sedeScoped: ident.dev.sedeScoped === true,
              ...(ident.dev.tenantId
                ? { tenantId: ident.dev.tenantId }
                : {}),
            };

      try {
        let html = renderPage(session, liveRows, ident.mode !== "auth");
        if (ident.session) {
          const csrf = `<input type="hidden" name="csrfToken" value="${ident.session.csrfToken}" data-csrf />`;
          html = html.replace(
            /(<form method="post"[^>]*>)/g,
            `$1${csrf}`,
          );
        }
        html = html.replace(
          /(<form method="post" action="\/action"[^>]*>)/g,
          `$1<details data-force-panel><summary>Forzar (Observador)</summary>` +
            `<label>Motivo <input name="forceReason" data-force-reason /></label>` +
            `<label>Reglas <input name="forceRuleIds" data-force-rules placeholder="id-regla" /></label>` +
            `<label><input type="checkbox" name="forceEnabled" value="1" data-force-enabled /> Activar forzado</label>` +
            `</details>`,
        );
        html = html.replace(
          "<main class=\"main\" id=\"main\">",
          `<main class="main" id="main"><p><a href="/diagnosis" data-diagnosis-link>Diagnóstico</a></p>` +
            `<section data-link-devolucion><h3>Devolución vinculada</h3>` +
            `<form method="post" action="/link-devolucion" data-link-form>` +
            (ident.session
              ? `<input type="hidden" name="csrfToken" value="${ident.session.csrfToken}" />`
              : "") +
            `<input type="hidden" name="roleId" value="${session.roleId}" />` +
            `<input type="hidden" name="parteId" value="${session.parteId}" />` +
            `<label>Original <input name="originalSubjectId" data-original-subject /></label>` +
            `<button type="submit">Crear devolución</button></form></section>`,
        );
        return send(res, 200, html, "text/html; charset=utf-8");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return send(
          res,
          500,
          `Error de render: ${msg}`,
          "text/plain; charset=utf-8",
        );
      }
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
        boot,
        runtime,
        ...(auth ? { auth } : {}),
        identities,
        close: () =>
          new Promise((resClose, rejClose) => {
            server.close((err) => {
              runtime.close();
              auth?.accounts.close();
              if (err) rejClose(err);
              else resClose();
            });
          }),
      });
    });
  });
}
