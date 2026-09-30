/**
 * Renderizador de aplicación: ValidatedUiSpec → HTML navegable.
 * Solo acepta UiSpec sellada. Acciones → POST /action (Intérprete→Juez).
 */

import { allowDevSession } from "../auth/env.js";
import { hashDesignSystem } from "../design/approve.js";
import { bindDesignToUiSpec } from "../presentation/bind-design.js";
import type {
  FormSpec,
  ProcessGroupSpec,
  UiSpec,
  ViewSpec,
} from "../presentation/types.js";
import { isValidatedUiSpec } from "../presentation/validated.js";
import { cssFromTokens } from "./css-from-tokens.js";
import { decidirModulos } from "../generator/rules/modules.js";
import {
  crearEtiquetador,
  humanizarId,
  pareceIdentificador,
  type Etiquetador,
} from "../presentation/etiquetas.js";
import { rowsForPortal } from "./sample-data.js";
import type { DevSession, RenderAppOptions, SampleRow } from "./types.js";
import {
  actionsForGroup,
  actionsForView,
  processGroupsForRole,
  viewsInGroups,
} from "./visibility.js";

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

function qs(session: DevSession, extra?: Record<string, string>): string {
  const p = new URLSearchParams();
  p.set("role", session.roleId);
  p.set("parte", session.parteId);
  if (session.processGroupId) p.set("group", session.processGroupId);
  if (session.viewId) p.set("view", session.viewId);
  if (session.tecnico) p.set("tecnico", "1");
  if (extra) {
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
  }
  return `?${p.toString()}`;
}

function pickChannel(
  bootChannels: readonly string[],
  roleId: string,
): DevSession["channel"] {
  if (roleId === "cliente") {
    if (bootChannels.includes("autoservicio")) return "autoservicio";
    if (bootChannels.includes("web")) return "web";
    return "autoservicio";
  }
  if (bootChannels.includes("backoffice")) return "backoffice";
  if (bootChannels.includes("taller")) return "taller";
  return (bootChannels[0] as DevSession["channel"]) ?? "backoffice";
}

export function resolveSession(
  boot: RenderAppOptions["boot"],
  query: {
    role?: string;
    parte?: string;
    group?: string;
    view?: string;
  },
  options?: {
    /** Preferir vista cuyo stateId coincida con filas vivas (modo EventStore). */
    readonly preferRows?: readonly SampleRow[];
  },
): DevSession {
  const roleId =
    query.role && boot.roles.some((r) => r.id === query.role)
      ? query.role
      : (boot.roles[0]?.id ?? "gerente");
  const parteId =
    query.parte && boot.samplePartes.some((p) => p.id === query.parte)
      ? query.parte
      : (boot.samplePartes[0]?.id ?? "parte-demo-1");
  const channel = pickChannel(boot.input.channels, roleId);
  if (!boot.spec) throw new Error("boot.spec is undefined");
  const groups = processGroupsForRole(boot.spec, roleId);
  if (!groups) throw new Error(`processGroupsForRole returned undefined. roleId=${roleId}, spec.processGroups=${boot.spec.processGroups?.length ?? 0}`);
  const processGroupId =
    query.group && groups.some((g) => g.id === query.group)
      ? query.group
      : groups[0]?.id;
  const group = groups.find((g) => g.id === processGroupId);
  const viewIds = group
    ? [...group.viewIds, ...group.panelIds]
    : [];

  let viewId =
    query.view && viewIds.includes(query.view)
      ? query.view
      : undefined;

  if (!viewId && options?.preferRows && group) {
    const rowStates = new Set(
      options.preferRows
        .map((r) => r.stateId)
        .filter((s): s is string => !!s),
    );
    const match = viewIds.find((id) => {
      const v = boot.spec.views.find((x) => x.id === id);
      return v?.stateId && rowStates.has(v.stateId);
    });
    if (match) viewId = match;
  }

  if (!viewId) viewId = viewIds[0];

  return {
    roleId,
    parteId,
    channel,
    ...(processGroupId !== undefined ? { processGroupId } : {}),
    ...(viewId !== undefined ? { viewId } : {}),
  };
}

function renderDevBar(
  boot: RenderAppOptions["boot"],
  session: DevSession,
  enabled: boolean,
): string {
  // Imposible en producción; también oculto con sesión auth real.
  if (!enabled || !allowDevSession()) {
    return "";
  }
  const roleOpts = boot.roles
    .map(
      (r) =>
        `<option value="${esc(r.id)}"${r.id === session.roleId ? " selected" : ""}>${esc(r.label)}</option>`,
    )
    .join("");
  const parteOpts = boot.samplePartes
    .map(
      (p) =>
        `<option value="${esc(p.id)}"${p.id === session.parteId ? " selected" : ""}>${esc(p.label)}</option>`,
    )
    .join("");
  return `
<aside class="dev-bar" data-dev-session="provisional" role="region" aria-label="Sesión de desarrollo provisional">
  <strong>⚠ Sesión de desarrollo provisional</strong>
  — no es el sistema de cuentas real. Selector de rol y Parte solo para pruebas.
  <form method="get" action="/">
    <label>Rol
      <select name="role" aria-label="Rol de desarrollo">${roleOpts}</select>
    </label>
    <label>Parte
      <select name="parte" aria-label="Parte de desarrollo">${parteOpts}</select>
    </label>
    <input type="hidden" name="group" value="${esc(session.processGroupId ?? "")}" />
    ${session.tecnico ? '<input type="hidden" name="tecnico" value="1" />' : ""}
    <button type="submit">Aplicar</button>
  </form>
  <a class="dev-tecnico" data-toggle-tecnico href="${esc(qs({ ...session, tecnico: !session.tecnico }))}">${session.tecnico ? "Ocultar detalles técnicos" : "Ver detalles técnicos"}</a>
</aside>`;
}

function renderQuestions(boot: RenderAppOptions["boot"], tecnico: boolean): string {
  if (boot.questions.length === 0) {
    return `<div class="questions-banner" hidden data-composer-questions="0"></div>`;
  }
  const items = boot.questions
    .map(
      (q) =>
        `<li data-question-id="${esc(q.id)}" data-field="${esc(q.field)}">${esc(q.question)}${tecnico ? ` <span class="meta">(${esc(q.field)})</span>` : ""}</li>`,
    )
    .join("\n");
  return `
<section class="questions-banner" data-composer-questions="${boot.questions.length}" role="status" aria-live="polite">
  <h2>Pendiente de confirmar</h2>
  <p>Mientras tanto se usan valores por defecto; confírmalos para dejar el sistema bien configurado.</p>
  <ul>${items}</ul>
</section>`;
}

function expedienteHref(session: DevSession, id: string, suffix = ""): string {
  const p = new URLSearchParams({ role: session.roleId, parte: session.parteId });
  return `/expedientes/${encodeURIComponent(id)}${suffix}?${p.toString()}`;
}

/** Botón «Nuevo» del proceso activo (solo personal interno, modo vivo). */
function renderNuevoExpediente(
  et: Etiquetador,
  group: ProcessGroupSpec | undefined,
  session: DevSession,
  live: boolean,
): string {
  if (!group || !live || session.roleId === "cliente" || session.channel === "autoservicio") {
    return "";
  }
  const p = new URLSearchParams({
    proceso: group.lifecycleId,
    role: session.roleId,
    parte: session.parteId,
  });
  return (
    `<p class="nuevo-expediente"><a class="btn-nuevo" href="${esc(`/expedientes/nuevo?${p.toString()}`)}" data-nuevo-expediente="${esc(group.lifecycleId)}">` +
    `+ Nuevo: ${esc(et.proceso(group.lifecycleId))}</a></p>`
  );
}

/** Datos maestros (clientes, catálogo): solo personal interno en modo vivo. */
function renderMaestrosNav(
  session: DevSession,
  live: boolean,
  boot: RenderAppOptions["boot"],
): string {
  if (!live || session.roleId === "cliente" || session.channel === "autoservicio") {
    return "";
  }
  const decision = decidirModulos(boot.input);
  const activo = (id: string) => decision.some((m) => m.id === id && m.activo);
  const tecnica = session.tecnico
    ? `<h2>Módulos decididos</h2><ul data-modulos>${decision
        .map(
          (m) =>
            `<li data-modulo="${m.id}" data-activo="${m.activo ? "1" : "0"}">${m.activo ? "✓" : "✗"} ${esc(m.nombre)}<span class="pg-role">${esc(m.motivo)}</span></li>`,
        )
        .join("")}</ul>`
    : "";
  const p = new URLSearchParams({ role: session.roleId, parte: session.parteId });
  const link = (path: string, label: string, hint: string, key: string) =>
    `<li><a href="${esc(`${path}?${p.toString()}`)}" data-maestros="${key}">` +
    `${esc(label)}<span class="pg-role">${esc(hint)}</span></a></li>`;
  return (
    `<h2 data-maestros-links>Datos</h2>` +
    `<ul>` +
    link("/partes", "Clientes y proveedores", "altas, fichas y contacto", "partes") +
    link("/ofertas", "Catálogo", "productos, servicios y precios", "ofertas") +
    (activo("stock") ? link("/stock", "Stock", "existencias y avisos", "stock") : "") +
    link("/dinero", "Dinero", "cobros, pagos y quién debe", "dinero") +
    (activo("facturas") ? link("/facturas", "Facturas", "expedidas, imprimir y rectificar", "facturas") : "") +
    `</ul>` +
    tecnica
  );
}

const ROL_EN_COMPOSICION: Readonly<Record<string, string>> = {
  dominant: "Principal",
  secondary: "Secundario",
};

function renderNav(
  spec: UiSpec,
  groups: readonly ProcessGroupSpec[],
  session: DevSession,
  live: boolean,
  et: Etiquetador,
  boot: RenderAppOptions["boot"],
): string {
  const items = groups
    .map((g) => {
      const current = g.id === session.processGroupId;
      const href = qs(session, { group: g.id, view: g.viewIds[0] ?? g.panelIds[0] ?? "" });
      return (
        `<li>` +
        `<a href="${esc(href)}" data-process-group="${esc(g.id)}"${current ? ' aria-current="page"' : ""}>` +
        `${esc(et.proceso(g.lifecycleId))}` +
        (session.tecnico
          ? `<span class="pg-role">${esc(labelOf(spec, g.id, g.labelKey))} · ${esc(g.role)} · ${esc(g.archetypeId)}</span>`
          : ROL_EN_COMPOSICION[g.role]
            ? `<span class="pg-role">${esc(ROL_EN_COMPOSICION[g.role]!)}</span>`
            : "") +
        `</a></li>`
      );
    })
    .join("\n");
  return `
<nav class="nav-process" aria-label="Procesos">
  ${live && session.roleId !== "cliente" && session.channel !== "autoservicio" ? `<p>
    <a class="btn-inicio" href="/hoy" data-nav-hoy>📅 Hoy</a>
    <a class="btn-inicio" href="${esc(`/inicio?${new URLSearchParams({ role: session.roleId, parte: session.parteId }).toString()}`)}" data-nav-inicio>← Inicio</a>
  </p>` : ""}
  <h2>Procesos</h2>
  <ul>${items || '<li class="empty">Ningún proceso visible para este rol</li>'}</ul>
  ${renderMaestrosNav(session, live, boot)}
</nav>`;
}

function renderViewTabs(
  spec: UiSpec,
  group: ProcessGroupSpec,
  session: DevSession,
  et: Etiquetador,
): string {
  const ids = [...new Set([...group.viewIds, ...group.panelIds])];
  const links = ids
    .map((id) => {
      const v = spec.views.find((x) => x.id === id);
      if (!v) return "";
      const current = id === session.viewId;
      const href = qs(session, { group: group.id, view: id });
      return (
        `<a href="${esc(href)}" data-view-tab="${esc(id)}"${current ? ' aria-current="page"' : ""}>` +
        `${esc(et.vista(v, labelOf(spec, v.id, v.labelKey)))}` +
        `</a>`
      );
    })
    .join("\n");
  return `<div class="view-tabs" aria-label="Vistas del proceso">${links}</div>`;
}

function renderFlash(
  flash: import("./runtime.js").FlashMessage | undefined,
  session: DevSession,
  et: Etiquetador,
): string {
  if (!flash) return "";
  const link =
    flash.kind === "block" && flash.blockProcessGroupId
      ? `<p><a data-block-link href="${esc(qs(session, { group: flash.blockProcessGroupId, view: "" }))}">Ir a ${esc(et.arquetipo(flash.blockArchetypeId ?? ""))}</a></p>`
      : "";
  return (
    `<div class="flash flash-${esc(flash.kind)}" role="alert" data-flash="${esc(flash.kind)}" ` +
    `data-idempotent="${flash.idempotentReplay ? "1" : "0"}">` +
    `<p>${esc(flash.text)}</p>${link}</div>`
  );
}

function renderActions(
  spec: UiSpec,
  view: ViewSpec,
  session: DevSession,
  subjectId: string | undefined,
  live: boolean,
  et: Etiquetador,
): string {
  const acts = actionsForView(spec, view, session.roleId);
  if (acts.length === 0) {
    return `<div class="actions" data-actions="0"><span class="empty">Sin acciones para este rol</span></div>`;
  }
  if (!live) {
    const buttons = acts
      .map(
        (a) =>
          `<button type="button" disabled data-action-id="${esc(a.id)}" data-transition="${esc(a.transitionId)}" title="solo lectura">` +
          `${esc(et.accion(a.lifecycleId, a.transitionId))} <span class="meta">(solo lectura)</span>` +
          `</button>`,
      )
      .join("\n");
    return `<div class="actions" data-actions="${acts.length}" data-readonly="1">${buttons}</div>`;
  }
  if (!subjectId) {
    return `<div class="actions" data-actions="${acts.length}"><span class="empty">Seleccione un expediente para actuar</span></div>`;
  }
  const buttons = acts
    .map((a) => {
      return (
        `<form method="post" action="/action" class="action-form" data-action-form="${esc(a.id)}">` +
        `<input type="hidden" name="actionId" value="${esc(a.id)}" />` +
        `<input type="hidden" name="subjectId" value="${esc(subjectId)}" />` +
        `<input type="hidden" name="roleId" value="${esc(session.roleId)}" />` +
        `<input type="hidden" name="parteId" value="${esc(session.parteId)}" />` +
        `<input type="hidden" name="channel" value="${esc(session.channel)}" />` +
        `<input type="hidden" name="group" value="${esc(session.processGroupId ?? "")}" />` +
        `<input type="hidden" name="view" value="${esc(session.viewId ?? view.id)}" />` +
        `<input type="hidden" name="kind" value="boton" />` +
        `<input type="hidden" name="clientRequestId" value="" data-client-request />` +
        `<button type="submit" data-action-id="${esc(a.id)}" data-transition="${esc(a.transitionId)}" data-subject="${esc(subjectId)}">` +
        `${esc(et.accion(a.lifecycleId, a.transitionId))}` +
        `</button></form>`
      );
    })
    .join("\n");
  return `<div class="actions" data-actions="${acts.length}">${buttons}</div>`;
}

function renderForm(
  spec: UiSpec,
  form: FormSpec | undefined,
  session: DevSession,
  actionId: string | undefined,
  subjectId: string | undefined,
  live: boolean,
): string {
  if (!form || !actionId || !subjectId) return "";
  if (!live) {
    return (
      `<section class="form-entity" data-form-id="${esc(form.id)}" data-entity="${esc(form.entityKind)}" data-readonly="1">` +
      `<h3>Datos del paso <span class="meta">(solo lectura)</span></h3>` +
      `<p class="meta">Los formularios se habilitan con el EventStore en vivo.</p>` +
      `</section>`
    );
  }
  const fields = form.fields
    .map((f) => {
      const raw = t(spec, f.labelKey);
      const label = pareceIdentificador(raw) ? humanizarId(f.name) : raw;
      const req = f.required ? " required" : "";
      if (f.type === "boolean") {
        return `<label>${esc(label)}<input type="checkbox" name="field.${esc(f.name)}" value="true"${req} /></label>`;
      }
      if (f.type === "enum" && f.enumValues) {
        const opts = f.enumValues
          .map((v) => `<option value="${esc(v)}">${esc(pareceIdentificador(v) ? humanizarId(v) : v)}</option>`)
          .join("");
        return `<label>${esc(label)}<select name="field.${esc(f.name)}"${req}>${opts}</select></label>`;
      }
      const inputType =
        f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
      return `<label>${esc(label)}<input type="${inputType}" name="field.${esc(f.name)}"${req} /></label>`;
    })
    .join("\n");
  return (
    `<section class="form-entity" data-form-id="${esc(form.id)}" data-entity="${esc(form.entityKind)}">` +
    `<h3>Datos del paso</h3>` +
    `<form method="post" action="/action" class="action-form" data-action-form="${esc(actionId)}">` +
    `<input type="hidden" name="actionId" value="${esc(actionId)}" />` +
    `<input type="hidden" name="subjectId" value="${esc(subjectId)}" />` +
    `<input type="hidden" name="roleId" value="${esc(session.roleId)}" />` +
    `<input type="hidden" name="parteId" value="${esc(session.parteId)}" />` +
    `<input type="hidden" name="channel" value="${esc(session.channel)}" />` +
    `<input type="hidden" name="group" value="${esc(session.processGroupId ?? "")}" />` +
    `<input type="hidden" name="view" value="${esc(session.viewId ?? "")}" />` +
    `<input type="hidden" name="kind" value="formulario" />` +
    `<input type="hidden" name="clientRequestId" value="" data-client-request />` +
    fields +
    `<button type="submit" data-action-id="${esc(actionId)}">Enviar</button>` +
    `</form></section>`
  );
}

function rowsForView(
  view: ViewSpec,
  allRows: readonly SampleRow[],
  session: DevSession,
): readonly SampleRow[] {
  if (view.kind === "portal_filtro") {
    return rowsForPortal(allRows, session.parteId);
  }
  if (view.kind === "tablero" && view.stateId) {
    // Mismo estado Y mismo proceso: dos procesos pueden tener un estado «propuesta».
    return allRows.filter(
      (r) =>
        r.stateId === view.stateId &&
        (!view.lifecycleId || !r.lifecycleId || r.lifecycleId === view.lifecycleId),
    );
  }
  if (view.kind.startsWith("panel_")) {
    return allRows.filter((r) => r.meta === view.kind);
  }
  return allRows.slice(0, 5);
}

function renderActiveBlocks(
  session: DevSession,
  blocks: RenderAppOptions["activeBlocks"],
  et: Etiquetador,
): string {
  if (!blocks || blocks.length === 0) return "";
  const items = blocks
    .map((b) => {
      const link = b.processGroupId
        ? `<a data-block-link href="${esc(qs(session, { group: b.processGroupId, view: "" }))}">Ir a ${esc(et.arquetipo(b.archetypeId))}</a>`
        : "";
      return (
        `<li data-block-archetype="${esc(b.archetypeId)}" data-block-state="${esc(b.blockedStateId)}">` +
        `${esc(b.text)} ${link}</li>`
      );
    })
    .join("\n");
  return (
    `<aside class="block-banner" role="status" data-block-indicator data-active-blocks="${blocks.length}">` +
    `<h2>Bloqueos activos</h2>` +
    `<p>Complete el proceso secundario indicado antes de avanzar en el principal.</p>` +
    `<ul>${items}</ul></aside>`
  );
}

function renderViewBody(
  spec: UiSpec,
  view: ViewSpec,
  session: DevSession,
  rows: readonly SampleRow[],
  bindingNav: string,
  bindingList: string,
  bindingBoard: string,
  live: boolean,
  activeBlocks: RenderAppOptions["activeBlocks"],
  et: Etiquetador,
): string {
  const title = et.vista(view, labelOf(spec, view.id, view.labelKey));
  const kind = view.kind;
  const className =
    kind === "tablero"
      ? "tablero"
      : kind === "formulario"
        ? "form-entity"
        : "panel";
  const form = view.formId
    ? spec.forms.find((f) => f.id === view.formId)
    : undefined;
  const primaryAction = actionsForView(spec, view, session.roleId)[0];

  const viewRows = rowsForView(view, rows, session);
  const rowItems = viewRows
    .map((r) => {
      const acts =
        kind === "tablero" || kind === "lista" || kind === "detalle"
          ? renderActions(spec, view, session, r.id, live, et)
          : "";
      return (
        `<li data-row-id="${esc(r.id)}" data-parte="${esc(r.parteId)}" data-row-state="${esc(r.stateId ?? "")}">` +
        (live && r.detalle
          ? `<span><a href="${esc(expedienteHref(session, r.id))}" data-expediente-link>${esc(r.label)}</a></span>` +
            `<span class="row-detalle" data-row-detalle>${esc(
              [r.detalle.cliente, r.detalle.referencia, r.detalle.fecha, r.detalle.total]
                .filter(Boolean)
                .join(" · "),
            )}</span>`
          : `<span>${esc(r.label)}</span>`) +
        `<span class="meta">${esc(
          session.tecnico
            ? (r.meta ?? r.stateId ?? "")
            : r.stateId
              ? et.estado(r.lifecycleId ?? view.lifecycleId, r.stateId)
              : "",
        )}</span>` +
        acts +
        `</li>`
      );
    })
    .join("\n");

  const presentation = view.presentation
    ? Object.entries(view.presentation)
        .map(([k, v]) => `${k}=${v}`)
        .join(" · ")
    : "";

  const fallbackSubject = viewRows[0]?.id;
  const sharedActions =
    kind.startsWith("panel_") || kind === "portal_filtro"
      ? renderActions(spec, view, session, fallbackSubject, live, et)
      : "";

  const blockHint =
    kind === "panel_bloqueo"
      ? (() => {
          const relevant = (activeBlocks ?? []).filter(
            (b) =>
              !view.presentation?.bloqueaStateId ||
              b.blockedStateId === view.presentation.bloqueaStateId,
          );
          if (relevant.length > 0) {
            return relevant
              .map((b) => {
                const link = b.processGroupId
                  ? ` <a data-block-link href="${esc(qs(session, { group: b.processGroupId, view: "" }))}">Abrir proceso secundario</a>`
                  : "";
                return `<p role="status" data-block-indicator>${esc(b.text)}${link}</p>`;
              })
              .join("\n");
          }
          if (view.presentation?.bloqueaStateId) {
            return `<p role="status" data-block-indicator>Hay que completarlo antes de pasar a <strong>${esc(et.estado(null, view.presentation.bloqueaStateId))}</strong>.</p>`;
          }
          return "";
        })()
      : "";

  return (
    `<section class="${className}" id="${esc(view.id)}" ` +
    `data-view-id="${esc(view.id)}" data-view-kind="${esc(kind)}" ` +
    `data-state="${esc(view.stateId ?? "")}" ` +
    `data-listados="${esc(bindingList)}" data-nav="${esc(bindingNav)}" data-tablero="${esc(bindingBoard)}">` +
    `<h3>${esc(title)}${session.tecnico ? `<span class="kind-badge">${esc(kind)}</span>` : ""}</h3>` +
    (presentation && session.tecnico
      ? `<p class="meta">${esc(presentation)}</p>`
      : "") +
    (kind === "portal_filtro"
      ? `<p>Aquí ves solo tus pedidos.${session.tecnico ? ` <span class="meta">(Parte: ${esc(session.parteId)})</span>` : ""}</p>`
      : "") +
    blockHint +
    `<ul class="row-list">${rowItems || `<li class="empty">${kind === "tablero" ? "No hay nada en esta situación ahora mismo." : "Nada que mostrar todavía."}</li>`}</ul>` +
    sharedActions +
    renderForm(
      spec,
      form,
      session,
      primaryAction?.id,
      fallbackSubject,
      live,
    ) +
    `</section>`
  );
}

/**
 * Genera el documento HTML completo de la app.
 * Lanza si la UiSpec no está sellada.
 */
export function renderAppHtml(options: RenderAppOptions): string {
  const { boot, session } = options;
  const spec = boot.spec;
  if (!isValidatedUiSpec(spec)) {
    throw new Error(
      "renderAppHtml exige UiSpec validada/sellada (salida de generateUiSpec)",
    );
  }

  const live = options.live === true || options.liveRows !== undefined;
  const rows = options.liveRows ?? boot.sampleRows;
  const flash = options.flash;
  const activeBlocks = options.activeBlocks;

  const binding = bindDesignToUiSpec({
    spec,
    designSystem: boot.designSystem,
    designContentHash: hashDesignSystem(boot.designSystem),
    roleId: session.roleId,
    channel: session.channel,
  });

  const et = crearEtiquetador(boot.input);
  const tecnico = session.tecnico === true;
  const groups = processGroupsForRole(spec, session.roleId);
  const activeGroup =
    groups.find((g) => g.id === session.processGroupId) ?? groups[0];
  const visibleViews = viewsInGroups(spec, groups);
  const activeView =
    (session.viewId
      ? spec.views.find((v) => v.id === session.viewId)
      : undefined) ??
    (activeGroup
      ? spec.views.find(
          (v) =>
            activeGroup.viewIds.includes(v.id) ||
            activeGroup.panelIds.includes(v.id),
        )
      : undefined);

    const vb = activeView && binding.views
    ? binding.views.find((x) => x.viewId === activeView.id)
    : undefined;
  const groupActions = activeGroup
    ? actionsForGroup(spec, activeGroup, session.roleId)
    : [];

  const mainBody = activeView
    ? renderViewBody(
        spec,
        activeView,
        session,
        rows,
        vb?.chosen.navegacion ?? "",
        vb?.chosen.listados ?? "",
        vb?.chosen.tableros ?? "",
        live,
        activeBlocks,
        et,
      )
    : `<p class="empty">No hay nada que mostrar para tu perfil.</p>`;

  const unrendered = boot.unrendered
    .filter((u) => !u.startsWith("acciones:"))
    .map((u) => `<li>${esc(u)}</li>`)
    .join("");

  const hasQuestions = boot.questions.length > 0;
  const liveAttr = live ? "1" : "0";
  const headerHint = live
    ? "EventStore vivo"
    : "vista previa (solo lectura)";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="${esc(binding.tokens.values["color.primario"])}" />
  <title>${esc(boot.brandName)} · ABS</title>
  <link rel="manifest" href="/manifest.webmanifest" />
  <style>${cssFromTokens(binding.tokens)}
.flash { padding: var(--espaciado-m); margin-bottom: var(--espaciado-m); border-radius: var(--radio-md); border: 1px solid var(--color-borde); }
.flash-ok { background: var(--color-superficie); border-color: var(--color-exito); }
.flash-error, .flash-block { background: var(--color-superficie); border-color: var(--color-peligro); }
.flash-info { background: var(--color-superficie); border-color: var(--color-aviso); }
.actions { display: flex; flex-wrap: wrap; gap: var(--espaciado-s); }
.action-form button { min-height: var(--tactil-minimo); padding: var(--espaciado-s) var(--espaciado-m); border-radius: var(--radio-md); border: 1px solid var(--color-borde); background: var(--color-primario); color: var(--color-fondo); font: inherit; font-weight: 600; cursor: pointer; }
.action-form button[aria-busy="true"] { opacity: 0.7; cursor: wait; }
.action-form button:disabled, .actions[data-readonly] button:disabled { opacity: 0.55; cursor: not-allowed; }
.block-banner { margin-bottom: var(--espaciado-m); padding: var(--espaciado-m); border: 1px solid var(--color-aviso); border-radius: var(--radio-md); }
.nuevo-expediente { margin: 0 0 var(--espaciado-m); }
.btn-nuevo { display: inline-block; padding: var(--espaciado-s) var(--espaciado-l); border-radius: var(--radio-md); background: var(--color-primario); color: var(--color-superficie); font-weight: 600; text-decoration: none; }
.btn-nuevo:hover { text-decoration: none; opacity: 0.9; }
.row-detalle { color: var(--color-texto); font-size: 0.9rem; }
.dev-tecnico { display: inline-block; margin-top: var(--espaciado-s); color: inherit; font-weight: 600; }
</style>
</head>
<body class="${hasQuestions ? "has-questions" : ""}" data-profile="${esc(boot.profileId)}" data-role="${esc(session.roleId)}" data-parte="${esc(session.parteId)}" data-channel="${esc(session.channel)}" data-density="${esc(binding.tokens.density)}" data-live="${liveAttr}">
  <a class="skip-link" href="#main">Saltar al contenido</a>
  <div class="app-shell">
    ${renderDevBar(boot, session, options.showDevSession !== false)}
    ${renderQuestions(boot, tecnico)}
    <header class="site-header">
      <div>
        <h1 data-brand>${esc(boot.brandName)}</h1>
        <p class="meta">${
          tecnico
            ? `UiSpec ${esc(spec.id)} · hash ${esc(spec.contentHash.slice(0, 12))} · rol ${esc(session.roleId)}`
            : esc(humanizarId(boot.roles.find((r) => r.id === session.roleId)?.label ?? session.roleId))
        }</p>
      </div>
      <p class="meta" data-visible-groups="${groups.length}" data-visible-views="${visibleViews.length}" data-group-actions="${groupActions.length}">
        ${tecnico ? `${groups.length} procesos · ${visibleViews.length} vistas · ${esc(headerHint)}` : ""}
      </p>
    </header>
    ${renderNav(spec, groups, session, live, et, boot)}
    <main class="main" id="main">
      ${renderFlash(flash, session, et)}
      ${live ? renderActiveBlocks(session, activeBlocks, et) : ""}
      ${renderNuevoExpediente(et, activeGroup, session, live)}
      ${activeGroup ? renderViewTabs(spec, activeGroup, session, et) : ""}
      ${mainBody}
      ${
        tecnico
          ? `<aside class="unrendered" data-unrendered>
        <strong>Notas</strong>
        <ul>${unrendered || (live ? "<li>Acciones conectadas a Intérprete → Juez</li>" : "<li>Modo solo lectura</li>")}</ul>
      </aside>`
          : ""
      }
    </main>
  </div>
  <script>
    (function () {
      function rid() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return "req-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      }
      document.querySelectorAll("[data-client-request]").forEach(function (el) {
        if (!el.value) el.value = rid();
      });
      document.querySelectorAll("form.action-form").forEach(function (form) {
        form.addEventListener("submit", function (e) {
          if (form.getAttribute("data-submitting") === "1") {
            e.preventDefault();
            return;
          }
          form.setAttribute("data-submitting", "1");
          var btn = form.querySelector('button[type="submit"]');
          if (btn) {
            btn.setAttribute("aria-busy", "true");
            btn.dataset.label = btn.textContent || "";
            btn.textContent = "Enviando…";
          }
        });
      });
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(function () {});
      }
    })();
  </script>
</body>
</html>`;
}

/** Lista ids de processGroups/views/panels presentes en el HTML (para tests). */
export function extractDomMarkers(html: string): {
  processGroups: string[];
  views: string[];
  actions: string[];
} {
  const processGroups = [...html.matchAll(/data-process-group="([^"]+)"/g)].map(
    (m) => m[1]!,
  );
  const views = [...html.matchAll(/data-view-id="([^"]+)"/g)].map((m) => m[1]!);
  const actions = [...html.matchAll(/data-action-id="([^"]+)"/g)].map(
    (m) => m[1]!,
  );
  return { processGroups, views, actions };
}
