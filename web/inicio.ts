/**
 * Inicio: el software del negocio de un vistazo. Una tarjeta por parte que
 * el decisor ha puesto en esta app (nada más), con qué hace y un dato vivo.
 *
 *   GET /inicio
 */

import type { IncomingMessage } from "node:http";
import { processGroupsForRole } from "./visibility.js";
import {
  esc,
  html,
  identifyGet,
  page,
  text,
  withDev,
  type MaestrosContext,
  type MaestrosResponse,
  type Viewer,
} from "./maestros.js";
import { bootHubDashboard } from "./handlers/inicio-handler.js";
import type { HubDashboardSpec } from "../presentation/types.js";

export function isInicioPath(path: string): boolean {
  return path === "/inicio";
}

/**
 * Renderiza el Hub Dashboard.
 * Integra el nuevo sistema bootHubDashboard() para control de roles.
 */
export async function handleInicio(ctx: MaestrosContext, req: IncomingMessage): Promise<MaestrosResponse> {
  if ((req.method ?? "GET").toUpperCase() !== "GET") return text(405, "Método no permitido");
  const url = new URL(req.url ?? "/", "http://local");
  const who = identifyGet(ctx, req, Object.fromEntries(url.searchParams.entries()));
  if ("response" in who) return who.response;

  // Generar Hub Dashboard con nuevo handler
  try {
    const hub = bootHubDashboard(
      ctx.boot.spec,
      who.viewer.parteId,
      who.viewer.roleId,
      ctx.boot.profileId
    );
    return html(200, page(ctx, who.viewer, "", renderHubDashboard(hub, ctx, who.viewer), "inicio"));
  } catch (err) {
    console.error("Error en bootHubDashboard:", err);
    // Fallback a versión antigua
    return html(200, page(ctx, who.viewer, "", inicioHtml(ctx, who.viewer), "inicio"));
  }
}

/**
 * Maneja solicitudes a API de roles.
 */
export function isApiRolesPath(path: string): boolean {
  return path === "/api/roles";
}

export async function handleApiRoles(ctx: MaestrosContext, req: IncomingMessage): Promise<MaestrosResponse> {
  if ((req.method ?? "GET").toUpperCase() !== "GET") return text(405, "Método no permitido");
  const url = new URL(req.url ?? "/", "http://local");
  const who = identifyGet(ctx, req, Object.fromEntries(url.searchParams.entries()));
  if ("response" in who) return who.response;

  try {
    const hub = bootHubDashboard(
      ctx.boot.spec,
      who.viewer.parteId,
      who.viewer.roleId,
      ctx.boot.profileId
    );

    return {
      status: 200,
      body: JSON.stringify({
        currentRole: hub.currentRole,
        availableRoles: hub.availableRoles,
      }),
      contentType: "application/json",
    };
  } catch (err) {
    return {
      status: 500,
      body: JSON.stringify({ error: "Error al obtener roles" }),
      contentType: "application/json",
    };
  }
}

/**
 * Maneja cambio de rol de usuario.
 */
export function isApiUserRolePath(path: string): boolean {
  return path === "/api/user/role";
}

export async function handleApiUserRole(ctx: MaestrosContext, req: IncomingMessage): Promise<MaestrosResponse> {
  const method = (req.method ?? "GET").toUpperCase();

  if (method === "GET") {
    const url = new URL(req.url ?? "/", "http://local");
    const newRole = url.searchParams.get("role") ?? url.searchParams.get("roleId");

    if (!newRole) {
      return text(400, JSON.stringify({ error: "Rol requerido" }));
    }

    // Validar que el rol existe en la spec
    const groups = ctx.boot.spec.processGroups ?? [];
    const validRoles = new Set<string>();
    for (const g of groups) {
      for (const r of g.roleIds) validRoles.add(r);
    }

    if (!validRoles.has(newRole)) {
      return text(400, JSON.stringify({ error: "Rol inválido" }));
    }

    // Cambiar rol en sesión dev (en producción, se cambiaría en auth real)
    // Por ahora, redireccionamos con el nuevo rol
    const redirectUrl = `/inicio?role=${encodeURIComponent(newRole)}`;
    return {
      status: 303,
      body: "",
      contentType: "text/plain",
      headers: { Location: redirectUrl },
    };
  }

  return text(405, "Método no permitido");
}

/**
 * Renderiza versión simplificada del hub (fallback).
 * Se usa si bootHubDashboard falla.
 */
function inicioHtml(ctx: MaestrosContext, viewer: Viewer): string {
  const { boot } = ctx;

  // Procesos disponibles para el rol
  const enlaces: Array<{ titulo: string; href: string; clave: string }> = [];

  // Procesos dinámicos
  processGroupsForRole(boot.spec, viewer.roleId).forEach((g) => {
    enlaces.push({
      clave: `proceso:${g.lifecycleId}`,
      titulo: g.labelKey,
      href: withDev(viewer, "/", { group: g.id }),
    });
  });

  // Menú
  const menuIzq = enlaces
    .map((e) => `<a class="menu-enlace" href="${esc(e.href)}" data-enlace="${esc(e.clave)}">${esc(e.titulo)}</a>`)
    .join("");

  const primerEnlace = enlaces[0];
  const contenidoDerecha = primerEnlace
    ? `<div class="enlace-contenido">
      <h2>${esc(primerEnlace.titulo)}</h2>
      <a class="btn" href="${esc(primerEnlace.href)}" data-enlace="${esc(primerEnlace.clave)}">Ir a ${esc(primerEnlace.titulo)}</a>
    </div>`
    : `<div class="enlace-contenido"><p class="meta">Sin enlaces disponibles</p></div>`;

  return (
    `<div class="inicio-grid">` +
    `<aside class="menu-izq">${menuIzq}</aside>` +
    `<main class="contenido-der">${contenidoDerecha}</main>` +
    `</div>`
  );
}

/**
 * Renderiza el Hub Dashboard usando HubDashboardSpec.
 * Genera HTML responsivo con grids de procesos, acciones rápidas y widgets.
 */
function renderHubDashboard(hub: HubDashboardSpec, ctx: MaestrosContext, viewer: Viewer): string {
  const {
    currentRole,
    availableRoles,
    processCards,
    quickActions,
    summary,
    auxiliaryLinks,
  } = hub;

  // Selector de roles
  const roleOptionsHtml = availableRoles
    .map(
      (role) =>
        `<option value="${esc(role.roleId)}" ${role.roleId === currentRole.roleId ? "selected" : ""} title="${esc(role.description || "")}">
          ${esc(role.label)}
        </option>`
    )
    .join("");

  // Acciones rápidas
  const quickActionsHtml = quickActions
    .map(
      (action) =>
        `<a href="${esc(action.href)}" class="quick-action" data-action-id="${esc(action.id)}" title="${esc(action.label)}">
          <span class="quick-action-icon">${esc(action.icon)}</span>
          <span>${esc(action.label)}</span>
        </a>`
    )
    .join("");

  // Widgets de resumen
  const summaryHtml = summary
    .map(
      (widget) =>
        `<div class="summary-widget ${widget.colorSemantic || "info"}" data-widget-id="${esc(widget.id)}">
          <div class="widget-header">
            <span class="widget-label">${esc(widget.label)}</span>
            <span class="widget-icon">${esc(widget.icon)}</span>
          </div>
          <div class="widget-value">${esc(widget.value)}</div>
          <div class="widget-trend trend-${widget.trend}">
            <span>${widget.trend === "up" ? "↑" : widget.trend === "down" ? "↓" : "→"} ${widget.trend}</span>
          </div>
        </div>`
    )
    .join("");

  // Tarjetas de procesos
  const processCardsHtml = processCards
    .map(
      (card) =>
        `<a href="${esc(card.href)}" class="process-card ${card.isEnabled ? "" : "disabled"}" data-process-id="${esc(card.lifecycleId)}" ${!card.isEnabled ? 'aria-disabled="true"' : ""}>
          <div class="process-header">
            <span class="process-icon">${esc(card.icon)}</span>
            <div class="process-info">
              <h3 class="process-title">${esc(card.label)}</h3>
              <p class="process-desc">${esc(card.description)}</p>
            </div>
          </div>
          ${card.count ? `<span class="process-count">${card.count} items</span>` : ""}
          <button class="process-action" type="button" onclick="window.location.href='${esc(card.href)}'">
            Acceder →
          </button>
        </a>`
    )
    .join("");

  // Enlaces auxiliares
  const auxLinksHtml = auxiliaryLinks
    ? auxiliaryLinks
        .map(
          (link) =>
            `<a href="${esc(link.href)}" class="auxiliary-link" data-link-id="${esc(link.id)}">
              ${link.icon ? `<span>${esc(link.icon)}</span>` : ""}
              <span>${esc(link.label)}</span>
            </a>`
        )
        .join("")
    : "";

  return `
    <div class="hub-dashboard">
      <header class="hub-header" role="banner">
        <div class="header-content">
          <div class="header-welcome">
            <h1>Bienvenido, ${esc(viewer.parteId)}</h1>
            <p>Tu panel de control personalizado</p>
          </div>
          <div class="role-selector">
            <label for="role-select">Tu rol actual:</label>
            <select id="role-select" onchange="document.location.href='/api/user/role?role=' + encodeURIComponent(this.value)">
              ${roleOptionsHtml}
            </select>
          </div>
        </div>
      </header>

      <main class="hub-container">
        ${
          quickActions.length > 0
            ? `
          <section>
            <h2 class="section-title">⚡ Acciones Rápidas</h2>
            <div class="quick-actions">${quickActionsHtml}</div>
          </section>
        `
            : ""
        }

        ${
          summary.length > 0
            ? `
          <section>
            <h2 class="section-title">📊 Resumen del Negocio</h2>
            <div class="summary-widgets">${summaryHtml}</div>
          </section>
        `
            : ""
        }

        <section>
          <h2 class="section-title">🔄 Procesos Disponibles</h2>
          <div class="process-grid">${processCardsHtml}</div>
        </section>

        ${
          auxLinksHtml
            ? `
          <nav class="auxiliary-links">
            ${auxLinksHtml}
          </nav>
        `
            : ""
        }
      </main>
    </div>

    <style>
      .hub-dashboard {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }

      .hub-header {
        background-color: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        padding: 1.5rem;
        box-shadow: var(--shadow-sm);
        position: sticky;
        top: 0;
        z-index: 100;
      }

      .header-content {
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 2rem;
      }

      .header-welcome h1 {
        font-size: 1.875rem;
        font-weight: 700;
        margin-bottom: 0.25rem;
      }

      .header-welcome p {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
      }

      .role-selector {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .role-selector select {
        padding: 0.5rem 1rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
        color: var(--color-text-primary);
        cursor: pointer;
      }

      .hub-container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 2rem 1.5rem;
        flex: 1;
      }

      .section-title {
        font-size: 1.125rem;
        font-weight: 600;
        margin-bottom: 1rem;
        color: var(--color-text-primary);
      }

      .quick-actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
        margin-bottom: 3rem;
      }

      .quick-action {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 1.5rem;
        background-color: var(--color-surface);
        border: 2px solid var(--color-border);
        border-radius: var(--radius-md);
        text-decoration: none;
        color: var(--color-text-primary);
        cursor: pointer;
        transition: all 200ms ease;
        text-align: center;
        font-weight: 500;
        font-size: 0.875rem;
      }

      .quick-action:hover {
        border-color: var(--color-primary);
        background-color: var(--color-bg);
        transform: translateY(-2px);
      }

      .quick-action-icon {
        font-size: 2rem;
      }

      .summary-widgets {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        margin-bottom: 3rem;
      }

      .summary-widget {
        padding: 1.5rem;
        background-color: var(--color-surface);
        border-radius: var(--radius-md);
        border-left: 4px solid var(--color-primary);
      }

      .widget-value {
        font-size: 1.875rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
      }

      .widget-trend {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
      }

      .process-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1.5rem;
      }

      .process-card {
        display: flex;
        flex-direction: column;
        padding: 1.5rem;
        background-color: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        text-decoration: none;
        color: var(--color-text-primary);
        transition: all 200ms ease;
        cursor: pointer;
      }

      .process-card:hover {
        transform: translateY(-4px);
        box-shadow: var(--shadow-lg);
        border-color: var(--color-primary);
      }

      .process-card.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      .process-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .process-icon {
        font-size: 2.5rem;
        line-height: 1;
      }

      .process-title {
        font-weight: 600;
        margin-bottom: 0.25rem;
      }

      .process-desc {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
      }

      .process-count {
        display: inline-block;
        background-color: var(--color-primary);
        color: white;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        margin-top: 0.5rem;
      }

      .process-action {
        align-self: flex-start;
        margin-top: auto;
        padding: 0.5rem 1rem;
        background-color: var(--color-primary);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        transition: all 200ms ease;
      }

      .process-action:hover {
        background-color: #2563eb;
      }

      .auxiliary-links {
        display: flex;
        gap: 1rem;
        margin-top: 2rem;
        padding-top: 2rem;
        border-top: 1px solid var(--color-border);
        flex-wrap: wrap;
      }

      .auxiliary-link {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        text-decoration: none;
        color: var(--color-primary);
        font-size: 0.875rem;
        font-weight: 500;
      }

      .auxiliary-link:hover {
        color: #2563eb;
      }

      @media (max-width: 768px) {
        .header-content {
          flex-direction: column;
          align-items: flex-start;
        }

        .quick-actions {
          grid-template-columns: repeat(2, 1fr);
        }

        .process-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `;
}
