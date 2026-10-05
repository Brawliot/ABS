/**
 * Rutas de API: /api/*
 * Gestiona endpoints de API (wizard, procesos, etc)
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readBody,
  sendJson,
  sendError,
  sendText,
} from "./http-utils.js";
import type { UserDecisions } from "./decision-screen-types.js";
import {
  getStoredWizardDraft,
  applyWizardDecisions,
} from "./cli.js";

export interface ApiRouteContext {
  // Contexto adicional si es necesario en el futuro
}

/**
 * Maneja todas las rutas de API.
 * Retorna true si la ruta fue manejada, false si debe continuar.
 */
export async function handleApiRoute(
  path: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiRouteContext,
): Promise<boolean> {
  // Rutas de Wizard
  if (path === "/api/wizard/draft" && method === "GET") {
    const draft = getStoredWizardDraft();
    if (!draft) {
      return sendError(res, 404, "No draft found. Run wizard first."), true;
    }
    return sendJson(res, 200, draft), true;
  }

  if (path === "/api/wizard/decision" && method === "POST") {
    const draft = getStoredWizardDraft();
    if (!draft) {
      return sendError(res, 404, "No draft found. Run wizard first."), true;
    }

    const body = await readBody(req);
    let decisions: UserDecisions;
    try {
      decisions = JSON.parse(body);
    } catch {
      return sendError(res, 400, "Invalid JSON"), true;
    }

    try {
      const result = applyWizardDecisions(draft, decisions);
      return sendJson(res, 200, result), true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return sendError(res, 500, msg), true;
    }
  }

  // No es una ruta de API
  return false;
}
