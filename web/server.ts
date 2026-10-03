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
import { resolveTokenMap } from "../presentation/resolve-tokens.js";
import { createDevolucionVinculada } from "../archetypes/linked-transaction.js";
import { allowDevSession } from "../auth/env.js";
import type { PresentationChannel } from "../presentation/types.js";
import type { UserDecisions } from "./decision-screen-types.js";
import { executeUiAction } from "./action-handler.js";
import {
  answersFromForm,
  renderDiagnosisHtml,
  runDiagnosis,
} from "./diagnosis-page.js";
import { renderAppHtml, resolveSession } from "./render-app.js";
import { renderInicioHtml } from "./inicio.js";
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
import {
  getStoredWizardDraft,
  applyWizardDecisions,
} from "./cli.js";

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
 * Renderiza la página HTML del DECISION SCREEN
 */
function renderDecisionScreenHtml(draftJson: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Revisar Configuración — Wizard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f5;
      padding: 20px;
      line-height: 1.6;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 30px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h1 { font-size: 28px; margin-bottom: 10px; color: #1f2937; }
    .subtitle { color: #6b7280; font-size: 16px; }
    
    .section {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h2 {
      font-size: 20px;
      margin-bottom: 20px;
      color: #1f2937;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }
    
    .modules-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 15px;
    }
    
    .module-card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 15px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .module-card:hover {
      border-color: #3b82f6;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
    }
    .module-card.checked {
      border-color: #10b981;
      background: #f0fdf4;
    }
    .module-card input[type="checkbox"] {
      margin-right: 10px;
    }
    .module-card label {
      cursor: pointer;
      display: flex;
      align-items: center;
    }
    .module-info {
      margin-top: 8px;
      margin-left: 28px;
      font-size: 14px;
      color: #6b7280;
    }
    
    .design-preview {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .color-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .color-swatch {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .color-box {
      width: 100%;
      height: 60px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    .color-label {
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
    
    .controls {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      position: sticky;
      bottom: 0;
    }
    
    button {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button.primary {
      background: #3b82f6;
      color: white;
    }
    button.primary:hover {
      background: #2563eb;
    }
    button.secondary {
      background: #e5e7eb;
      color: #1f2937;
    }
    button.secondary:hover {
      background: #d1d5db;
    }
    
    .loading {
      opacity: 0.5;
      pointer-events: none;
    }
    .error {
      background: #fee2e2;
      color: #991b1b;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📋 Revisa tu configuración</h1>
      <p class="subtitle">Confirma o edita lo que hemos generado para ti</p>
    </header>
    
    <div id="error-container"></div>
    
    <!-- MÓDULOS -->
    <div class="section">
      <h2>📦 Módulos</h2>
      <div class="modules-grid" id="modules-container"></div>
    </div>
    
    <!-- DISEÑO -->
    <div class="section">
      <h2>🎨 Diseño</h2>
      <div class="design-preview">
        <div>
          <h3 style="font-size: 14px; margin-bottom: 10px; color: #6b7280;">Paleta de colores</h3>
          <div class="color-grid" id="colors-container"></div>
        </div>
        <div>
          <h3 style="font-size: 14px; margin-bottom: 10px; color: #6b7280;">Tipografía</h3>
          <div id="typography-container"></div>
        </div>
      </div>
    </div>
    
    <!-- CONFIGURACIÓN -->
    <div class="section">
      <h2>⚙️ Configuración</h2>
      <div id="config-container"></div>
    </div>
    
    <!-- BOTONES DE ACCIÓN -->
    <div class="controls">
      <button class="secondary" onclick="window.location.href='/'">← Volver</button>
      <button class="primary" id="confirm-btn" onclick="submitDecisions()">Confirmar y Generar ✓</button>
    </div>
  </div>
  
  <script>
    const draft = ${draftJson};
    
    function renderModules() {
      const container = document.getElementById('modules-container');
      const allModules = [
        ...draft.modules.detected,
        ...draft.modules.recommended,
        ...draft.modules.optional,
      ];
      
      container.innerHTML = allModules.map(m => \`
        <div class="module-card checked">
          <label>
            <input type="checkbox" name="module-\${m.id}" value="\${m.id}" checked />
            <strong>\${m.name}</strong>
          </label>
          <div class="module-info">
            \${m.description}
            <br/>
            <strong style="color: \${m.importance === 'critical' ? '#ef4444' : m.importance === 'high' ? '#f59e0b' : '#6b7280'}">\${m.importance}</strong>
          </div>
        </div>
      \`).join('');
    }
    
    function renderDesign() {
      const colorsContainer = document.getElementById('colors-container');
      colorsContainer.innerHTML = Object.entries(draft.design.colors).map(([name, value]) => \`
        <div class="color-swatch">
          <div class="color-box" style="background: \${value};"></div>
          <span class="color-label">\${name}</span>
        </div>
      \`).join('');
      
      const typographyContainer = document.getElementById('typography-container');
      typographyContainer.innerHTML = \`
        <p><strong>Familia:</strong> \${draft.design.typography.fontFamily}</p>
        <p><strong>Tema:</strong> \${draft.design.theme === 'light' ? '☀️ Claro' : '🌙 Oscuro'}</p>
        <div style="margin-top: 15px; padding: 15px; background: #f9fafb; border-radius: 6px;">
          <p style="font-size: 14px;">Preview:</p>
          <p style="font-family: \${draft.design.typography.fontFamily}; font-size: 16px; margin-top: 8px;">
            Ejemplo de texto con esta tipografía
          </p>
        </div>
      \`;
    }
    
    function renderConfig() {
      const container = document.getElementById('config-container');
      const config = draft.config;
      const labels = {
        language: '🌐 Idioma',
        timezone: '🕐 Zona horaria',
        currency: '💱 Moneda',
        region: '📍 Región'
      };
      
      container.innerHTML = \`
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          \${Object.entries(config).map(([key, value]) => \`
            <div>
              <label style="display: block; margin-bottom: 8px; color: #6b7280; font-size: 14px;">
                \${labels[key] || key}
              </label>
              <input type="text" value="\${value}" readonly style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 4px; background: #f9fafb;" />
            </div>
          \`).join('')}
        </div>
      \`;
    }
    
    async function submitDecisions() {
      const btn = document.getElementById('confirm-btn');
      btn.classList.add('loading');
      
      const decisions = {
        modules: {
          approved: Array.from(document.querySelectorAll('input[name^="module-"]:checked')).map(e => e.value),
          rejected: Array.from(document.querySelectorAll('input[name^="module-"]:not(:checked)')).map(e => e.value),
          added: []
        }
      };
      
      try {
        const response = await fetch('/api/wizard/decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(decisions)
        });
        
        if (!response.ok) {
          throw new Error(\`Error: \${response.statusText}\`);
        }
        
        const result = await response.json();
        console.log('✅ Decisiones aplicadas:', result);
        
        // Redirigir a la app con el primer rol
        const roleId = result.roles?.[0]?.id || 'gerente';
        window.location.href = \`/?role=\${roleId}&parte=parte-demo-1\`;
      } catch (error) {
        const errorContainer = document.getElementById('error-container');
        errorContainer.innerHTML = \`<div class="error">❌ Error: \${error.message}</div>\`;
        btn.classList.remove('loading');
      }
    }
    
    // Renderizar al cargar
    renderModules();
    renderDesign();
    renderConfig();
  </script>
</body>
</html>`;
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

      // ✅ NUEVA RUTA: GET /api/wizard/draft
      if (path === "/api/wizard/draft" && method === "GET") {
        const draft = getStoredWizardDraft();
        if (!draft) {
          return send(
            res,
            404,
            JSON.stringify({ error: "No draft found. Run wizard first." }),
            "application/json; charset=utf-8"
          );
        }
        return send(
          res,
          200,
          JSON.stringify(draft),
          "application/json; charset=utf-8"
        );
      }

      // ✅ NUEVA RUTA: POST /api/wizard/decision
      if (path === "/api/wizard/decision" && method === "POST") {
        const draft = getStoredWizardDraft();
        if (!draft) {
          return send(
            res,
            404,
            JSON.stringify({ error: "No draft found. Run wizard first." }),
            "application/json; charset=utf-8"
          );
        }
        
        const body = await readBody(req);
        let decisions: UserDecisions;
        try {
          decisions = JSON.parse(body);
        } catch {
          return send(
            res,
            400,
            JSON.stringify({ error: "Invalid JSON" }),
            "application/json; charset=utf-8"
          );
        }

        try {
          const result = applyWizardDecisions(draft, decisions);
          return send(
            res,
            200,
            JSON.stringify(result),
            "application/json; charset=utf-8"
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          return send(
            res,
            500,
            JSON.stringify({ error: msg }),
            "application/json; charset=utf-8"
          );
        }
      }

      // ✅ NUEVA RUTA: GET /wizard/decision (página HTML)
      if (path === "/wizard/decision" && method === "GET") {
        const draft = getStoredWizardDraft();
        if (!draft) {
          return send(
            res,
            404,
            "No draft found. Run wizard first.",
            "text/plain"
          );
        }
        
        const draftJson = JSON.stringify(draft, null, 2)
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e");
        
        return send(
          res,
          200,
          renderDecisionScreenHtml(draftJson),
          "text/html; charset=utf-8"
        );
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

      if (path === "/inicio" && method === "GET") {
        try {
          const { renderHubDashboardWithData } = await import("./handlers/inicio-handler.js");
          const ident = resolveRequestIdentity(auth, req, boot, parseQuery(url));

          // Datos del usuario
          const userId = ident.session?.accountId ?? "guest";

          // Usar roles válidos del boot (ya contiene los roles del perfil)
          const requestedRole = ident.dev.roleId ?? parseQuery(url).role;
          const validRoles = boot.roles.map(r => r.id);
          const roleId = validRoles.includes(requestedRole) ? requestedRole : boot.roles[0]?.id ?? "gerente";

          const userName = ident.session?.displayName ?? "Usuario";

          // Renderizar con datos dinámicos
          const html = renderHubDashboardWithData(boot.input, userId, roleId, userName);
          return send(res, 200, html, "text/html; charset=utf-8");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return send(res, 500, `Error: ${msg}`, "text/plain; charset=utf-8");
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