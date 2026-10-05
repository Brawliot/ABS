/**
 * Servidor HTTP: UiSpec sellada + runtime SQLite.
 * POST /action es la única vía de escritura (Intérprete → Juez → EventStore).
 * NUEVO: Rutas para DECISION SCREEN del Wizard
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseQuery,
  send,
  readBody,
  formToRecord,
  sendJson,
  sendHtml,
  sendText,
} from "./http-utils.js";
import { resolveTokenMap } from "../presentation/resolve-tokens.js";
import { allowDevSession } from "../auth/env.js";
import { renderAppHtml, resolveSession } from "./render-app.js";
import { renderInicioHtml } from "./inicio.js";
import { AppRuntime } from "./runtime.js";
import { ParteIdentityStore } from "../policies/identity.js";
import {
  isExpedientesPath,
  handleExpedientes,
} from "./expedientes.js";
import {
  isFacturasPath,
  handleFacturas,
} from "./facturas.js";
import {
  isDineroPath,
  handleDinero,
} from "./dinero.js";
import {
  isContabilidadPath,
  handleContabilidad,
} from "./contabilidad.js";
import {
  isHoyPath,
  handleHoy,
  type HoyContext,
  type HoyResponse,
} from "./hoy.js";
import {
  isStockPath,
  handleStock,
} from "./stock.js";
import {
  isMaestrosPath,
  handleMaestros,
  type MaestrosContext,
  type Viewer,
} from "./maestros.js";
import type { AppBootResult, DevSession } from "./types.js";
import {
  createAuthRuntime,
  resolveRequestIdentity,
  type AuthRuntime,
} from "./auth-bridge.js";
import {
  assertProductionSecurityConfig,
  isProduction,
} from "../auth/index.js";
import type { ParteIdentityStore } from "../policies/identity.js";
import { handleAuthRoute } from "./auth-routes.js";
import { handleGdprRoute } from "./gdpr-routes.js";
import { handleApiRoute } from "./api-routes.js";
import { handleBusinessRoute } from "./business-routes.js";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "public");
const LANDING_HTML = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "templates", "landing.html"),
  "utf-8"
);

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
 * Renderiza la página HTML del DECISION SCREEN
 */
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

  const renderInicioPage = (
    session: DevSession,
    liveRows?: ReturnType<AppRuntime["projectRows"]>,
    showDevSession = true,
  ): string => {
    try {
      return renderInicioHtml({
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
      });
    } catch (e) {
      console.error("ERROR en renderInicioHtml:", e);
      throw e;
    };
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = req.url ?? "/";
      const path = url.split("?")[0] ?? "/";
      const method = (req.method ?? "GET").toUpperCase();

      // Rutas de API
      if (path.startsWith("/api/")) {
        const handled = await handleApiRoute(path, method, req, res, {});
        if (handled) return;
      }

      // Rutas de negocio (wizard, diagnosis, inicio, etc)
      if (path === "/wizard/decision" || path === "/diagnosis" || path === "/link-devolucion" || path === "/action" || path === "/inicio" || path === "/login") {
        const handled = await handleBusinessRoute(path, method, req, res, { auth, boot, runtime }, url);
        if (handled) return;
      }

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
        return sendJson(res, 200, {
          ok: true,
          profileId: boot.profileId,
          sealed: true,
          contentHash: boot.spec.contentHash,
          dbPath: runtime.dbPath,
          subjects: runtime.subjects.length,
          events: runtime.store.all().length,
        });
      }


      // Rutas de autenticación
      if (path.startsWith("/auth/")) {
        const handled = await handleAuthRoute(path, method, req, res, { auth, boot }, url);
        if (handled) return;
      }


      // Rutas de GDPR
      if (path.startsWith("/gdpr/")) {
        const handled = await handleGdprRoute(path, method, req, res, { auth, boot, identities });
        if (handled) return;
      }

      // ==================== MAESTROS PAGES ====================
      if (isMaestrosPath(path)) {
        const q = parseQuery(url);
        const ident = resolveRequestIdentity(auth, req, boot, q);
        if (!ident.session && isProduction()) {
          return send(res, 303, "", "text/plain", { Location: "/login" });
        }

        const maestrosCtx: MaestrosContext = {
          runtime,
          boot,
          auth,
        };

        try {
          const readForm = async () => formToRecord(await readBody(req));
          const response = await handleMaestros(maestrosCtx, req, readForm);
          return send(res, response.status, response.body, response.contentType, response.headers);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return send(res, 500, msg, "text/plain");
        }
      }

      // ==================== EXPEDIENTES ====================
      if (isExpedientesPath(path)) {
        const q = parseQuery(url);
        const ident = resolveRequestIdentity(auth, req, boot, q);
        if (!ident.session && isProduction()) {
          return send(res, 303, "", "text/plain", { Location: "/login" });
        }

        const maestrosCtx: MaestrosContext = {
          runtime,
          boot,
          auth,
        };

        try {
          const readForm = async () => formToRecord(await readBody(req));
          const response = await handleExpedientes(maestrosCtx, req, readForm);
          return send(res, response.status, response.body, response.contentType, response.headers);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return send(res, 500, msg, "text/plain");
        }
      }

      // ==================== FACTURAS ====================
      if (isFacturasPath(path)) {
        const q = parseQuery(url);
        const ident = resolveRequestIdentity(auth, req, boot, q);
        if (!ident.session && isProduction()) {
          return send(res, 303, "", "text/plain", { Location: "/login" });
        }

        const maestrosCtx: MaestrosContext = {
          runtime,
          boot,
          auth,
        };

        try {
          const readForm = async () => formToRecord(await readBody(req));
          const response = await handleFacturas(maestrosCtx, req, readForm);
          return send(res, response.status, response.body, response.contentType, response.headers);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return send(res, 500, msg, "text/plain");
        }
      }

      // ==================== DINERO ====================
      if (isDineroPath(path)) {
        const q = parseQuery(url);
        const ident = resolveRequestIdentity(auth, req, boot, q);
        if (!ident.session && isProduction()) {
          return send(res, 303, "", "text/plain", { Location: "/login" });
        }

        const maestrosCtx: MaestrosContext = {
          runtime,
          boot,
          auth,
        };

        try {
          const response = await handleDinero(maestrosCtx, req);
          return send(res, response.status, response.body, response.contentType, response.headers);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return send(res, 500, msg, "text/plain");
        }
      }

      // ==================== CONTABILIDAD ====================
      if (isContabilidadPath(path)) {
        const q = parseQuery(url);
        const ident = resolveRequestIdentity(auth, req, boot, q);
        if (!ident.session && isProduction()) {
          return send(res, 303, "", "text/plain", { Location: "/login" });
        }

        const maestrosCtx: MaestrosContext = {
          runtime,
          boot,
          auth,
        };

        try {
          const response = await handleContabilidad(maestrosCtx, req);
          return send(res, response.status, response.body, response.contentType, response.headers);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return send(res, 500, msg, "text/plain");
        }
      }

      // ==================== HOY ====================
      if (isHoyPath(path)) {
        const q = parseQuery(url);
        const ident = resolveRequestIdentity(auth, req, boot, q);
        if (!ident.session && isProduction()) {
          return send(res, 303, "", "text/plain", { Location: "/login" });
        }

        const viewer: Viewer = {
          roleId: ident.dev.roleId ?? "gerente",
          parteId: ident.dev.parteId ?? "self",
          csrfToken: ident.session?.csrfToken,
          devMode: ident.mode !== "auth",
        };

        const hoyCtx: HoyContext = {
          runtime,
          boot,
        };

        try {
          const response = handleHoy(hoyCtx, viewer);
          return send(res, response.status, response.body, response.contentType);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return send(res, 500, msg, "text/plain");
        }
      }

      // ==================== STOCK ====================
      if (isStockPath(path)) {
        const q = parseQuery(url);
        const ident = resolveRequestIdentity(auth, req, boot, q);
        if (!ident.session && isProduction()) {
          return send(res, 303, "", "text/plain", { Location: "/login" });
        }

        const maestrosCtx: MaestrosContext = {
          runtime,
          boot,
          auth,
        };

        try {
          const readForm = async () => formToRecord(await readBody(req));
          const response = await handleStock(maestrosCtx, req, readForm);
          return send(res, response.status, response.body, response.contentType, response.headers);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return send(res, 500, msg, "text/plain");
        }
      }

      // Serve landing page for unauthenticated users
      if (path === "/" || path === "/index.html") {
        const q = parseQuery(url);
        const ident = resolveRequestIdentity(auth, req, boot, q);

        // Unauthenticated user: serve landing page
        if (!ident.session) {
          return send(res, 200, LANDING_HTML, "text/html; charset=utf-8");
        }

        // Authenticated user continues to dashboard
        const liveRows = runtime.projectRows({
          ...(ident.dev.sedeId ? { sedeId: ident.dev.sedeId } : {}),
          sedeScoped: ident.dev.sedeScoped === true,
        });
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
          // Use renderInicioPage for the homepage layout
          let html = renderInicioPage(session, liveRows, ident.mode !== "auth");
          if (ident.session) {
            const csrf = `<input type="hidden" name="csrfToken" value="${ident.session.csrfToken}" data-csrf />`;
            html = html.replace(
              /(<form method="post"[^>]*>)/g,
              `$1${csrf}`,
            );
          }
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
      }

      // Default 404 for all other routes
      return sendText(res, 404, "Not found");
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