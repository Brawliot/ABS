/**
 * Rutas de autenticación: /auth/*
 * Gestiona login, logout, magic links, reset de contraseña, invitaciones
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readBody,
  formToRecord,
  parseQuery,
  sendJson,
  sendError,
  sendText,
  send,
} from "./http-utils.js";
import { allowDevSession } from "../auth/env.js";
import { CsrfError } from "../auth/index.js";
import {
  acceptInvite,
  completePasswordReset,
  loginWithMagicToken,
  loginWithPassword,
  logoutSession,
  readAuthSession,
  requestMagicLink,
  requestPasswordReset,
  requireCsrf,
  revokeEmployeeAccess,
  switchActiveCompany,
  type AuthRuntime,
} from "./auth-bridge.js";

export interface AuthRouteContext {
  auth: AuthRuntime | undefined;
  boot: { profileId: string };
}

/**
 * Maneja todas las rutas de autenticación.
 * Retorna true si la ruta fue manejada, false si debe continuar.
 */
export async function handleAuthRoute(
  path: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  ctx: AuthRouteContext,
  url: string,
): Promise<boolean> {
  const { auth, boot } = ctx;

  if (path === "/auth/login" && method === "POST") {
    if (!auth) {
      return sendText(res, 503, "Auth no habilitado"), true;
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
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookies }), true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de login";
      return sendError(res, 401, msg), true;
    }
  }

  if (path === "/auth/logout" && method === "POST") {
    if (!auth) return sendText(res, 503, "Auth no habilitado"), true;
    const form = formToRecord(await readBody(req));
    const sessionAuth = readAuthSession(auth, req);
    if (sessionAuth) {
      try {
        requireCsrf(sessionAuth, form, req.headers);
      } catch {
        return sendText(res, 403, "CSRF"), true;
      }
      const cookies = logoutSession(
        auth,
        sessionAuth,
        form.allDevices === "1",
      );
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookies }), true;
    }
    return sendJson(res, 200, { ok: true }), true;
  }

  if (path === "/auth/magic-request" && method === "POST") {
    if (!auth) return sendText(res, 503, "Auth no habilitado"), true;
    const form = formToRecord(await readBody(req));
    try {
      const { token } = requestMagicLink(
        auth,
        form.email ?? "",
        form.companyId ?? boot.profileId,
        req.socket.remoteAddress ?? "local",
      );
      return sendJson(res, 200, {
        ok: true,
        ...(allowDevSession() ? { token } : {}),
      }), true;
    } catch (e) {
      return sendError(res, 429, e instanceof Error ? e.message : "Error"), true;
    }
  }

  if (path === "/auth/magic" && method === "GET") {
    if (!auth) return sendText(res, 503, "Auth no habilitado"), true;
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
      }), true;
    } catch (e) {
      return sendText(res, 401, e instanceof Error ? e.message : "Enlace inválido"), true;
    }
  }

  if (path === "/auth/reset-request" && method === "POST") {
    if (!auth) return sendText(res, 503, "Auth no habilitado"), true;
    const form = formToRecord(await readBody(req));
    try {
      const { token } = requestPasswordReset(
        auth,
        form.email ?? "",
        req.socket.remoteAddress ?? "local",
      );
      return sendJson(res, 200, {
        ok: true,
        ...(allowDevSession() && token ? { token } : {}),
      }), true;
    } catch (e) {
      return sendError(res, 429, e instanceof Error ? e.message : "Error"), true;
    }
  }

  if (path === "/auth/reset" && method === "POST") {
    if (!auth) return sendText(res, 503, "Auth no habilitado"), true;
    const form = formToRecord(await readBody(req));
    try {
      completePasswordReset(auth, form.token ?? "", form.password ?? "");
      return sendJson(res, 200, { ok: true }), true;
    } catch (e) {
      return sendError(res, 400, e instanceof Error ? e.message : "Error"), true;
    }
  }

  if (path === "/auth/invite" && method === "POST") {
    if (!auth) return sendText(res, 503, "Auth no habilitado"), true;
    const form = formToRecord(await readBody(req));
    const sessionAuth = readAuthSession(auth, req);
    if (!sessionAuth) return sendText(res, 401, "No autorizado"), true;
    try {
      requireCsrf(sessionAuth, form, req.headers);
      const { token } = await import("./auth-bridge.js").then(m =>
        m.inviteEmployee(auth, sessionAuth, {
          email: form.email ?? "",
          roleId: form.roleId ?? "",
          ...(form.kind === "portal_cliente" || form.kind === "empleado" || form.kind === "dueno"
            ? { kind: form.kind }
            : {}),
          ...(form.sedeId ? { sedeId: form.sedeId } : {}),
          ...(form.equipoId ? { equipoId: form.equipoId } : {}),
          ...(form.parteId ? { parteId: form.parteId } : {}),
        })
      );
      return sendJson(res, 200, {
        ok: true,
        ...(allowDevSession() ? { token } : {}),
      }), true;
    } catch (e) {
      const status = e instanceof CsrfError ? 403 : 400;
      return sendError(res, status, e instanceof Error ? e.message : "Error"), true;
    }
  }

  if (path === "/auth/invite/accept" && method === "POST") {
    if (!auth) return sendText(res, 503, "Auth no habilitado"), true;
    const form = formToRecord(await readBody(req));
    try {
      const { cookies } = acceptInvite(auth, form.token ?? "", {
        ...(form.password ? { password: form.password } : {}),
        ...(form.displayName ? { displayName: form.displayName } : {}),
      });
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookies }), true;
    } catch (e) {
      return sendError(res, 400, e instanceof Error ? e.message : "Error"), true;
    }
  }

  if (path === "/auth/revoke" && method === "POST") {
    if (!auth) return sendText(res, 503, "Auth no habilitado"), true;
    const form = formToRecord(await readBody(req));
    const sessionAuth = readAuthSession(auth, req);
    if (!sessionAuth) return sendText(res, 401, "No autorizado"), true;
    try {
      requireCsrf(sessionAuth, form, req.headers);
      revokeEmployeeAccess(auth, sessionAuth, form.accountId ?? "");
      return sendJson(res, 200, { ok: true }), true;
    } catch (e) {
      return sendError(res, 403, e instanceof Error ? e.message : "Error"), true;
    }
  }

  if (path === "/auth/switch-company" && method === "POST") {
    if (!auth) return sendText(res, 503, "Auth no habilitado"), true;
    const form = formToRecord(await readBody(req));
    const sessionAuth = readAuthSession(auth, req);
    if (!sessionAuth) return sendText(res, 401, "No autorizado"), true;
    try {
      requireCsrf(sessionAuth, form, req.headers);
      const { cookies } = switchActiveCompany(
        auth,
        sessionAuth,
        form.companyId ?? "",
      );
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookies }), true;
    } catch (e) {
      return sendError(res, 403, e instanceof Error ? e.message : "Error"), true;
    }
  }

  // No es una ruta de auth
  return false;
}
