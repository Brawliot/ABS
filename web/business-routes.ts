/**
 * Rutas de negocio: /wizard/decision, /diagnosis, /link-devolucion, /action, /inicio, /login
 * Gestiona la lógica principal del sistema: diagnóstico, acciones, inicio, login
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readBody,
  formToRecord,
  parseQuery,
  sendHtml,
  sendText,
  send,
  sendJson,
} from "./http-utils.js";
import type { PresentationChannel } from "../presentation/types.js";
import type { AppBootResult, DevSession } from "./types.js";
import type { AppRuntime } from "./runtime.js";
import { allowDevSession } from "../auth/env.js";
import {
  answersFromForm,
  renderDiagnosisHtml,
  runDiagnosis,
} from "./diagnosis-page.js";
import { renderDecisionScreenHtml } from "./decision-screen.js";
import { createDevolucionVinculada } from "../archetypes/linked-transaction.js";
import {
  identityForAction,
  requireCsrf,
  resolveRequestIdentity,
  type AuthRuntime,
} from "./auth-bridge.js";
import { AccountsError } from "../accounts/index.js";
import { CsrfError } from "../auth/index.js";
import { executeUiAction } from "./action-handler.js";
import {
  getStoredWizardDraft,
} from "./cli.js";

export interface BusinessRouteContext {
  auth: AuthRuntime | undefined;
  boot: AppBootResult;
  runtime: AppRuntime;
}

/**
 * Maneja todas las rutas de negocio.
 * Retorna true si la ruta fue manejada, false si debe continuar.
 */
export async function handleBusinessRoute(
  path: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  ctx: BusinessRouteContext,
  url: string,
): Promise<boolean> {
  const { auth, boot, runtime } = ctx;

  // GET /wizard/decision — Página HTML del wizard
  if (path === "/wizard/decision" && method === "GET") {
    const draft = getStoredWizardDraft();
    if (!draft) {
      return sendText(res, 404, "No draft found. Run wizard first."), true;
    }

    const draftJson = JSON.stringify(draft, null, 2)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e");

    return sendHtml(res, 200, renderDecisionScreenHtml(draftJson)), true;
  }

  // GET/POST /diagnosis — Diagnóstico del sistema
  if (path === "/diagnosis") {
    if (method === "GET") {
      return sendHtml(res, 200, renderDiagnosisHtml("")), true;
    }
    if (method === "POST") {
      const form = formToRecord(await readBody(req));
      const result = await runDiagnosis(answersFromForm(form));
      return sendHtml(res, 200, renderDiagnosisHtml(result.htmlBody)), true;
    }
  }

  // POST /link-devolucion — Crear devolución vinculada
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
    }), true;
  }

  // POST /action — Ejecutar acción en el sistema
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
        return sendJson(res, status, {
          ok: false,
          flash: { kind: "error", text: msg },
        }), true;
      }
      return sendText(res, status, msg), true;
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
      return sendJson(res, result.ok ? 200 : 422, result), true;
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
    }), true;
  }

  // GET /inicio — Dashboard/Hub principal
  if (path === "/inicio" && method === "GET") {
    try {
      const { renderHubDashboardWithData } = await import("./handlers/inicio-handler.js");
      const ident = resolveRequestIdentity(auth, req, boot, parseQuery(url));

      const userId = ident.session?.accountId ?? "guest";
      const userName = (ident.session as any)?.displayName ?? "Usuario";

      // Extraer roles disponibles del spec (desde processGroups)
      const rolesFromSpec = new Set<string>();
      if (boot.spec?.processGroups) {
        for (const group of boot.spec.processGroups) {
          for (const rid of group.roleIds) {
            rolesFromSpec.add(rid);
          }
        }
      }

      // Si no hay roles en spec, usar roles de boot
      const validRoles = rolesFromSpec.size > 0
        ? Array.from(rolesFromSpec)
        : boot.roles.map(r => r.id);

      // Intentar obtener rol de: URL query > sesión dev > first available role
      const query = parseQuery(url);
      const requestedRole = query.role ?? ident.dev.roleId;

      // Validar y asegurar que el rol existe
      let roleId = validRoles.includes(requestedRole) ? requestedRole : validRoles[0];

      if (!roleId) {
        return send(res, 500, `
          <h1>Error: No hay roles disponibles</h1>
          <p>boot.spec.processGroups y boot.roles están vacíos.</p>
          <p>Roles encontrados: ${JSON.stringify(validRoles)}</p>
        `, "text/html; charset=utf-8"), true;
      }

      // Renderizar con datos dinámicos
      const html = renderHubDashboardWithData(boot.spec, userId, roleId, userName, runtime);
      return sendHtml(res, 200, html), true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return sendText(res, 500, `Error: ${msg}`), true;
    }
  }

  // GET /login — Página de login
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
    return sendHtml(res, 200, html), true;
  }

  // No es una ruta de negocio
  return false;
}
