/**
 * Renderizador de página de inicio /inicio
 * Estructura: Header global + 3 columnas (nav | contenido | ficha usuario)
 */

import type { RenderAppOptions, DevSession } from "./types.js";
import type { UiSpec } from "../presentation/types.js";
import { cssFromTokens } from "./css-from-tokens.js";
import { bindDesignToUiSpec } from "../presentation/bind-design.js";
import { hashDesignSystem } from "../design/approve.js";
import { isValidatedUiSpec } from "../presentation/validated.js";
import { processGroupsForRole } from "./visibility.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function t(spec: UiSpec, key: string): string {
  const bundle = spec.localization[0];
  return bundle?.strings[key] ?? key;
}

function labelOf(spec: UiSpec, id: string, key: string): string {
  return spec.content[id]?.title ?? t(spec, key);
}

/**
 * Renderiza el header global con:
 * - Izquierda: botón Inicio
 * - Centro: iconos (notificaciones, reportes, configuración)
 * - Derecha: nombre de usuario + selector de rol
 */
function renderInicioHeader(
  boot: RenderAppOptions["boot"],
  session: DevSession,
): string {
  const roleLabel = boot.roles.find((r) => r.id === session.roleId)?.label ?? session.roleId;
  const roleOpts = boot.roles
    .map(
      (r) =>
        `<option value="${esc(r.id)}"${r.id === session.roleId ? " selected" : ""}>${esc(r.label)}</option>`,
    )
    .join("");

  return `
<header class="inicio-header" role="banner">
  <div class="header-left">
    <a href="/" class="header-title" aria-label="Volver a inicio">← Inicio</a>
  </div>

  <div class="header-center">
    <div class="header-icons">
      <button class="icon-btn" type="button" title="Notificaciones" aria-label="Notificaciones">
        🔔
      </button>
      <button class="icon-btn" type="button" title="Reportes" aria-label="Reportes">
        📊
      </button>
      <button class="icon-btn" type="button" title="Configuración" aria-label="Configuración">
        ⚙️
      </button>
    </div>
  </div>

  <div class="header-right">
    <div class="user-card">
      <span class="user-name" data-role-label="${esc(roleLabel)}">Tu rol: ${esc(roleLabel)}</span>
      <select class="role-selector" aria-label="Selector de rol">
        ${roleOpts}
      </select>
    </div>
  </div>
</header>`;
}

/**
 * Renderiza la navegación (columna izquierda)
 */
function renderNavColumn(
  spec: UiSpec,
  boot: RenderAppOptions["boot"],
  session: DevSession,
): string {
  const groups = processGroupsForRole(spec, session.roleId);
  const items = groups
    .map((g) => {
      const label = labelOf(spec, g.id, g.labelKey);
      const href = `?role=${esc(session.roleId)}&parte=${esc(session.parteId)}&group=${esc(g.id)}&view=${esc(g.viewIds[0] ?? g.panelIds[0] ?? "")}`;
      return `
        <li>
          <a href="${href}" class="nav-item" data-process-group="${esc(g.id)}">
            <span class="nav-label">${esc(label)}</span>
            <span class="nav-meta">${esc(g.role)} • ${esc(g.archetypeId)}</span>
          </a>
        </li>`;
    })
    .join("\n");

  return `
<nav class="column-nav" aria-label="Procesos">
  <h2 class="column-title">Procesos</h2>
  <ul class="process-list">
    ${items || '<li class="empty-state"><em>Ningún proceso disponible</em></li>'}
  </ul>
</nav>`;
}

/**
 * Renderiza el contenido principal (columna central)
 */
function renderContentColumn(
  spec: UiSpec,
  boot: RenderAppOptions["boot"],
  session: DevSession,
): string {
  const groups = processGroupsForRole(spec, session.roleId);
  const firstGroup = groups[0];

  if (!firstGroup) {
    return `
<main class="column-content" role="main">
  <div class="empty-state">
    <h2>No hay procesos disponibles</h2>
    <p>Tu rol actual no tiene acceso a ningún proceso en el sistema.</p>
  </div>
</main>`;
  }

  const views = firstGroup.viewIds.concat(firstGroup.panelIds);
  const firstView = views[0];
  const groupLabel = labelOf(spec, firstGroup.id, firstGroup.labelKey);

  // Get stats
  const totalProcesses = groups.length;
  const totalViews = groups.reduce((acc, g) => acc + g.viewIds.length + g.panelIds.length, 0);

  return `
<main class="column-content" role="main">
  <div class="content-header">
    <h1 class="content-title">Bienvenido</h1>
    <p class="content-meta">Proceso sugerido: <strong>${esc(groupLabel)}</strong></p>
  </div>

  <section class="content-body">
    <div class="welcome-content">
      <div class="stat-card">
        <div class="stat-number">${totalProcesses}</div>
        <div class="stat-label">Procesos Disponibles</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${totalViews}</div>
        <div class="stat-label">Vistas/Paneles</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${esc(session.channel)}</div>
        <div class="stat-label">Canal</div>
      </div>
    </div>

    <div class="actions-section">
      <h3>Acciones Rápidas</h3>
      <ul class="quick-actions">
        <li>
          <a href="?role=${esc(session.roleId)}&parte=${esc(session.parteId)}&group=${esc(firstGroup.id)}&view=${esc(firstView ?? '')}" class="quick-action-btn">
            Abrir ${esc(groupLabel)}
          </a>
        </li>
        <li>
          <button type="button" class="quick-action-btn secondary" title="Próximamente">Ver Documentación</button>
        </li>
      </ul>
    </div>
  </section>
</main>`;
}

/**
 * Renderiza la ficha del usuario (columna derecha)
 */
function renderUserCard(
  boot: RenderAppOptions["boot"],
  session: DevSession,
): string {
  const roleLabel = boot.roles.find((r) => r.id === session.roleId)?.label ?? session.roleId;
  const parteLabel = boot.samplePartes.find((p) => p.id === session.parteId)?.label ?? session.parteId;

  return `
<aside class="column-user" aria-label="Información del usuario">
  <div class="user-card-full">
    <h2 class="column-title">Tu Perfil</h2>

    <div class="card-section">
      <h3 class="card-label">Rol Actual</h3>
      <p class="card-value">${esc(roleLabel)}</p>
    </div>

    <div class="card-section">
      <h3 class="card-label">Parte/Empresa</h3>
      <p class="card-value">${esc(parteLabel)}</p>
    </div>

    <div class="card-section">
      <h3 class="card-label">Canal</h3>
      <p class="card-value">${esc(session.channel)}</p>
    </div>

    ${session.sedeId ? `
      <div class="card-section">
        <h3 class="card-label">Sede</h3>
        <p class="card-value">${esc(session.sedeId)}</p>
      </div>
    ` : ""}

    <div class="card-section">
      <h3 class="card-label">Perfil</h3>
      <p class="card-value meta">${esc(boot.profileId)}</p>
    </div>

    <div class="card-actions">
      <button type="button" class="action-btn secondary">Editar Perfil</button>
      <button type="button" class="action-btn secondary">Cerrar Sesión</button>
    </div>
  </div>
</aside>`;
}

/**
 * Renderiza estilos CSS para el layout de inicio
 */
function renderInicioStyles(tokens: any): string {
  return `
/* ============================================
   LAYOUT INICIO: Header + 3 Columnas
   ============================================ */

html, body {
  margin: 0;
  padding: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, sans-serif;
}

.inicio-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: var(--espaciado-m, 1rem) var(--espaciado-l, 2rem);
  border-bottom: 1px solid var(--color-borde, #e0e0e0);
  background: var(--color-superficie, white);
  gap: var(--espaciado-l, 2rem);
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header-left {
  justify-self: start;
}

.header-title {
  font-size: 1.25rem;
  font-weight: 600;
  text-decoration: none;
  color: var(--color-texto, #333);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background 0.2s;
}

.header-title:hover {
  background: rgba(0, 0, 0, 0.05);
}

.header-center {
  justify-self: center;
}

.header-icons {
  display: flex;
  gap: var(--espaciado-m, 1rem);
  justify-content: center;
  align-items: center;
}

.icon-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 50%;
  transition: background 0.2s;
  min-height: var(--tactil-minimo, 44px);
  min-width: var(--tactil-minimo, 44px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.icon-btn:active {
  background: rgba(0, 0, 0, 0.12);
}

.header-right {
  justify-self: end;
}

.user-card {
  display: flex;
  align-items: center;
  gap: var(--espaciado-m, 1rem);
  padding: 0.5rem 1rem;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 6px;
  border: 1px solid var(--color-borde, #e0e0e0);
}

.user-name {
  font-weight: 500;
  color: var(--color-texto, #333);
  white-space: nowrap;
}

.role-selector {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-borde, #ccc);
  border-radius: 4px;
  background: var(--color-superficie, white);
  color: var(--color-texto, #333);
  font: inherit;
  cursor: pointer;
  min-height: var(--tactil-minimo, 44px);
}

.role-selector:hover {
  border-color: var(--color-primario, #0066cc);
}

.role-selector:focus {
  outline: none;
  border-color: var(--color-primario, #0066cc);
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
}

/* ============================================
   BODY: 3 Columnas
   ============================================ */

.inicio-body {
  display: grid;
  grid-template-columns: 250px 1fr 300px;
  gap: 0;
  flex: 1;
  overflow: hidden;
}

/* Columna 1: Navegación */
.column-nav {
  border-right: 1px solid var(--color-borde, #e0e0e0);
  overflow-y: auto;
  padding: var(--espaciado-m, 1rem);
  background: var(--color-superficie, white);
}

.column-title {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-texto-secundario, #666);
  letter-spacing: 0.05em;
  margin: 0 0 var(--espaciado-m, 1rem) 0;
  padding-bottom: var(--espaciado-s, 0.5rem);
  border-bottom: 1px solid var(--color-borde, #e0e0e0);
}

.process-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--espaciado-s, 0.5rem);
}

.nav-item {
  display: block;
  padding: var(--espaciado-s, 0.5rem) var(--espaciado-m, 1rem);
  text-decoration: none;
  color: var(--color-texto, #333);
  border-radius: 4px;
  transition: all 0.2s;
  border-left: 3px solid transparent;
}

.nav-item:hover {
  background: rgba(0, 0, 0, 0.05);
  border-left-color: var(--color-primario, #0066cc);
}

.nav-item[aria-current="page"] {
  background: rgba(0, 102, 204, 0.1);
  border-left-color: var(--color-primario, #0066cc);
  font-weight: 500;
  color: var(--color-primario, #0066cc);
}

.nav-label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.nav-meta {
  display: block;
  font-size: 0.75rem;
  color: var(--color-texto-secundario, #666);
  line-height: 1.3;
}

/* Columna 2: Contenido */
.column-content {
  overflow-y: auto;
  padding: var(--espaciado-m, 1rem);
  background: var(--color-fondo, #fafafa);
}

.content-header {
  margin-bottom: var(--espaciado-l, 2rem);
  border-bottom: 1px solid var(--color-borde, #e0e0e0);
  padding-bottom: var(--espaciado-m, 1rem);
}

.content-title {
  font-size: 1.75rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: var(--color-texto, #333);
}

.content-meta {
  font-size: 0.875rem;
  color: var(--color-texto-secundario, #666);
  margin: 0;
}

.content-body {
  background: var(--color-superficie, white);
  border-radius: var(--radio-md, 8px);
  padding: var(--espaciado-l, 2rem);
  border: 1px solid var(--color-borde, #e0e0e0);
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-content {
  text-align: center;
  color: var(--color-texto-secundario, #666);
}

.placeholder-content p {
  margin: 0.5rem 0;
}

.welcome-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--espaciado-m, 1rem);
  margin-bottom: var(--espaciado-l, 2rem);
}

.stat-card {
  text-align: center;
  padding: var(--espaciado-m, 1rem);
  border-radius: var(--radio-md, 8px);
  background: rgba(0, 102, 204, 0.05);
  border: 1px solid var(--color-borde, #e0e0e0);
}

.stat-number {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-primario, #0066cc);
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 0.875rem;
  color: var(--color-texto-secundario, #666);
  font-weight: 500;
}

.actions-section {
  margin-top: var(--espaciado-l, 2rem);
  padding-top: var(--espaciado-m, 1rem);
  border-top: 1px solid var(--color-borde, #e0e0e0);
}

.actions-section h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-texto, #333);
  margin: 0 0 var(--espaciado-m, 1rem) 0;
}

.quick-actions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--espaciado-s, 0.5rem);
}

.quick-action-btn {
  display: block;
  padding: var(--espaciado-m, 1rem);
  text-align: center;
  text-decoration: none;
  font-weight: 500;
  border-radius: 4px;
  transition: all 0.2s;
  min-height: var(--tactil-minimo, 44px);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-primario, #0066cc);
  background: var(--color-primario, #0066cc);
  color: white;
}

.quick-action-btn:hover {
  background: #0052a3;
  border-color: #0052a3;
}

.quick-action-btn.secondary {
  background: transparent;
  color: var(--color-primario, #0066cc);
  border: 1px solid var(--color-primario, #0066cc);
}

.quick-action-btn.secondary:hover {
  background: rgba(0, 102, 204, 0.1);
}

/* Columna 3: Ficha Usuario */
.column-user {
  border-left: 1px solid var(--color-borde, #e0e0e0);
  overflow-y: auto;
  padding: var(--espaciado-m, 1rem);
  background: var(--color-fondo, #fafafa);
}

.user-card-full {
  background: var(--color-superficie, white);
  border-radius: var(--radio-md, 8px);
  border: 1px solid var(--color-borde, #e0e0e0);
  padding: var(--espaciado-m, 1rem);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.card-section {
  margin-bottom: var(--espaciado-m, 1rem);
  padding-bottom: var(--espaciado-m, 1rem);
  border-bottom: 1px solid var(--color-borde, #e0e0e0);
}

.card-section:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.card-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-texto-secundario, #666);
  letter-spacing: 0.05em;
  margin: 0 0 0.5rem 0;
}

.card-value {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-texto, #333);
  margin: 0;
  word-break: break-word;
}

.card-actions {
  display: flex;
  flex-direction: column;
  gap: var(--espaciado-s, 0.5rem);
  margin-top: var(--espaciado-m, 1rem);
  padding-top: var(--espaciado-m, 1rem);
  border-top: 1px solid var(--color-borde, #e0e0e0);
}

.action-btn {
  padding: var(--espaciado-s, 0.5rem) var(--espaciado-m, 1rem);
  border: 1px solid var(--color-borde, #ccc);
  border-radius: 4px;
  background: var(--color-superficie, white);
  color: var(--color-texto, #333);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  min-height: var(--tactil-minimo, 44px);
}

.action-btn:hover {
  border-color: var(--color-primario, #0066cc);
  color: var(--color-primario, #0066cc);
  background: rgba(0, 102, 204, 0.05);
}

.action-btn:active {
  background: rgba(0, 102, 204, 0.1);
}

.empty-state {
  text-align: center;
  color: var(--color-texto-secundario, #666);
  padding: var(--espaciado-l, 2rem);
  font-style: italic;
}

/* ============================================
   RESPONSIVE
   ============================================ */

/* Tablet: 2 columnas */
@media (max-width: 1199px) {
  .inicio-body {
    grid-template-columns: 200px 1fr;
  }

  .column-user {
    display: none;
  }
}

/* Móvil: 1 columna */
@media (max-width: 768px) {
  .inicio-header {
    grid-template-columns: 1fr;
    gap: var(--espaciado-m, 1rem);
    padding: var(--espaciado-s, 0.5rem);
  }

  .header-left,
  .header-center,
  .header-right {
    justify-self: start;
    width: 100%;
  }

  .header-title {
    font-size: 1.1rem;
  }

  .header-icons {
    width: 100%;
    justify-content: space-around;
  }

  .user-card {
    width: 100%;
    flex-wrap: wrap;
  }

  .inicio-body {
    grid-template-columns: 1fr;
  }

  .column-nav {
    display: none;
  }

  .column-user {
    display: none;
  }

  .column-content {
    padding: var(--espaciado-s, 0.5rem);
  }

  .content-body {
    padding: var(--espaciado-m, 1rem);
  }
}

/* Très petit écran */
@media (max-width: 480px) {
  .header-title {
    font-size: 1rem;
  }

  .header-icons {
    gap: 0.5rem;
  }

  .icon-btn {
    font-size: 1.25rem;
    padding: 0.25rem;
    min-height: 40px;
    min-width: 40px;
  }

  .content-title {
    font-size: 1.5rem;
  }
}
`;
}

/**
 * Renderiza la página de inicio completa
 */
export function renderInicioHtml(options: RenderAppOptions): string {
  const { boot, session } = options;
  const spec = boot.spec;

  if (!isValidatedUiSpec(spec)) {
    throw new Error(
      "renderInicioHtml exige UiSpec validada/sellada",
    );
  }

  const binding = bindDesignToUiSpec({
    spec,
    designSystem: boot.designSystem,
    designContentHash: hashDesignSystem(boot.designSystem),
    roleId: session.roleId,
    channel: session.channel,
  });

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="${esc(binding.tokens.values["color.primario"])}" />
  <title>Inicio · ${esc(boot.brandName)}</title>
  <link rel="manifest" href="/manifest.webmanifest" />
  <style>
    ${cssFromTokens(binding.tokens)}
    ${renderInicioStyles(binding.tokens)}
  </style>
</head>
<body data-profile="${esc(boot.profileId)}" data-role="${esc(session.roleId)}" data-parte="${esc(session.parteId)}" data-channel="${esc(session.channel)}" data-density="${esc(binding.tokens.density)}">
  <a class="skip-link" href="#main">Saltar al contenido</a>

  ${renderInicioHeader(boot, session)}

  <div class="inicio-body">
    ${renderNavColumn(spec, boot, session)}
    ${renderContentColumn(spec, boot, session)}
    ${renderUserCard(boot, session)}
  </div>

  <script>
    (function () {
      // Cambiar de rol
      const roleSelector = document.querySelector('.role-selector');
      if (roleSelector) {
        roleSelector.addEventListener('change', function () {
          const newRole = this.value;
          const url = new URL(window.location);
          url.searchParams.set('role', newRole);
          window.location = url.toString();
        });
      }

      // Service Worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      }
    })();
  </script>
</body>
</html>`;
}
