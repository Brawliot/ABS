/**
 * Rutas de GDPR: /gdpr/*
 * Gestiona exportación de datos personales, borrado, rectificación
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readBody,
  formToRecord,
  sendJson,
  sendText,
  send,
} from "./http-utils.js";
import type { ParteIdentityStore } from "../policies/identity.js";
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
import {
  readAuthSession,
  requireCsrf,
  type AuthRuntime,
} from "./auth-bridge.js";

export interface GdprRouteContext {
  auth: AuthRuntime | undefined;
  boot: { profileId: string };
  identities: ParteIdentityStore;
}

/**
 * Maneja todas las rutas de GDPR.
 * Retorna true si la ruta fue manejada, false si debe continuar.
 */
export async function handleGdprRoute(
  path: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  ctx: GdprRouteContext,
): Promise<boolean> {
  const { auth, boot, identities } = ctx;

  if (path === "/gdpr/export" && method === "GET" && auth) {
    const sessionAuth = readAuthSession(auth, req);
    if (!sessionAuth?.parteId) {
      return sendText(res, 401, "No autorizado"), true;
    }
    const bundle = exportPartePersonal(
      identities,
      sessionAuth.companyId,
      sessionAuth.parteId,
      sessionAuth.accountId,
    );
    return sendJson(res, 200, bundle), true;
  }

  if (path === "/gdpr/erase" && method === "POST" && auth) {
    const form = formToRecord(await readBody(req));
    const sessionAuth = readAuthSession(auth, req);
    if (!sessionAuth) return sendText(res, 401, "No autorizado"), true;
    try {
      requireCsrf(sessionAuth, form, req.headers);
    } catch {
      return sendText(res, 403, "CSRF"), true;
    }
    const parteId = form.parteId ?? sessionAuth.parteId;
    if (!parteId) return sendText(res, 400, "parteId requerido"), true;
    if (sessionAuth.kind === "portal_cliente" && sessionAuth.parteId !== parteId) {
      return sendText(res, 403, "Prohibido"), true;
    }
    try {
      erasePartePersonal(identities, sessionAuth.companyId, parteId);
    } catch (e) {
      return sendText(res, 404, e instanceof Error ? e.message : "Error"), true;
    }
    return sendJson(res, 200, { ok: true }), true;
  }

  if (path === "/gdpr/rectify" && method === "POST" && auth) {
    const form = formToRecord(await readBody(req));
    const sessionAuth = readAuthSession(auth, req);
    if (!sessionAuth) return sendText(res, 401, "No autorizado"), true;
    try {
      requireCsrf(sessionAuth, form, req.headers);
    } catch {
      return sendText(res, 403, "CSRF"), true;
    }
    const parteId = form.parteId ?? sessionAuth.parteId;
    if (!parteId) return sendText(res, 400, "parteId requerido"), true;
    if (sessionAuth.kind === "portal_cliente" && sessionAuth.parteId !== parteId) {
      return sendText(res, 403, "Prohibido"), true;
    }
    rectifyPartePersonal(identities, sessionAuth.companyId, parteId, {
      displayName: form.displayName ?? "",
      ...(form.email ? { email: form.email } : {}),
      ...(form.taxId ? { taxId: form.taxId } : {}),
      ...(form.phone ? { phone: form.phone } : {}),
      ...(form.address ? { address: form.address } : {}),
    });
    return sendJson(res, 200, { ok: true }), true;
  }

  if (path === "/gdpr/rat" && method === "GET") {
    return sendJson(res, 200, draftRatFromConfig(boot.profileId)), true;
  }

  if (path === "/gdpr/legal-drafts" && method === "GET") {
    return sendJson(res, 200, {
      disclaimer: "PENDIENTE DE REVISIÓN POR ABOGADO",
      privacyPolicy: PRIVACY_POLICY_DRAFT,
      dpa: DPA_DRAFT,
      hostingEu: HOSTING_EU_CHECKLIST,
      breachProcedure: BREACH_PROCEDURE,
    }), true;
  }

  // No es una ruta de GDPR
  return false;
}
