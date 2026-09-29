/**
 * Datos maestros (capa 0 viva): Partes y catálogo de Ofertas.
 *
 *   GET  /partes            listado (filtro ?tipo=cliente|proveedor…)
 *   GET  /partes/nueva      formulario de alta
 *   POST /partes            alta
 *   GET  /partes/:id        ficha / edición
 *   POST /partes/:id        guardar cambios
 *   GET  /ofertas           catálogo
 *   GET  /ofertas/nueva     formulario de alta
 *   POST /ofertas           alta
 *   GET  /ofertas/:id       ficha / edición + historial de versiones
 *   POST /ofertas/:id       guardar cambios (versión nueva)
 *   POST /ofertas/:id/activa  activar / desactivar
 *
 * Solo roles internos: el portal de cliente no gestiona maestros.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { AccountsError } from "../accounts/index.js";
import { CsrfError, isProduction } from "../auth/index.js";
import {
  PARTE_SUBTYPE_LABELS,
  parseParteForm,
} from "../elements/parte.js";
import {
  IVA_TIPOS,
  OFERTA_SUBTYPE_LABELS,
  formatCentimos,
  parseOfertaForm,
  type OfertaRecord,
} from "../elements/oferta.js";
import { OfertaSubtypes, ParteSubtypes } from "../elements/subtypes.js";
import type { ParteIdentityRecord } from "../policies/identity.js";
import {
  identityForAction,
  requireCsrf,
  resolveRequestIdentity,
  type AuthRuntime,
} from "./auth-bridge.js";
import type { AppRuntime } from "./runtime.js";
import type { AppBootResult } from "./types.js";
import { moduloActivo, type ModuloId } from "../generator/rules/modules.js";

export interface MaestrosResponse {
  readonly status: number;
  readonly body: string;
  readonly contentType: string;
  readonly headers?: Record<string, string>;
}

export interface MaestrosContext {
  readonly runtime: AppRuntime;
  readonly boot: AppBootResult;
  readonly auth: AuthRuntime | undefined;
}

export interface Viewer {
  readonly roleId: string;
  readonly parteId: string;
  /** Token CSRF si hay sesión real. */
  readonly csrfToken?: string;
  /** En modo desarrollo, el rol viaja en la URL / formulario. */
  readonly devMode: boolean;
}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** ¿El decisor ha puesto este módulo en la app del negocio? */
export function moduloEnApp(ctx: MaestrosContext, id: ModuloId): boolean {
  return moduloActivo(ctx.boot.input, id);
}

/** Respuesta para una parte que este negocio no tiene. */
export function noDisponible(ctx: MaestrosContext, viewer: Viewer, nombre: string): MaestrosResponse {
  return html(
    404,
    page(ctx, viewer, "No disponible", `<p class="meta" data-modulo-inactivo>${esc(nombre)} no forma parte de la aplicación de este negocio.</p>`),
  );
}

/** clientRequestId → id creado (evita duplicados por doble envío). */
const createdByRequest = new WeakMap<AppRuntime, Map<string, string>>();

export function isMaestrosPath(path: string): boolean {
  return (
    path === "/partes" ||
    path.startsWith("/partes/") ||
    path === "/ofertas" ||
    path.startsWith("/ofertas/")
  );
}

export async function handleMaestros(
  ctx: MaestrosContext,
  req: IncomingMessage,
  readForm: () => Promise<Record<string, string>>,
): Promise<MaestrosResponse> {
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.pathname;
  const method = (req.method ?? "GET").toUpperCase();
  const query = Object.fromEntries(url.searchParams.entries());

  if (method === "GET") {
    const who = identifyGet(ctx, req, query);
    if ("response" in who) return who.response;
    return routeGet(ctx, who.viewer, path, query);
  }

  if (method === "POST") {
    const form = await readForm();
    const who = identifyPost(ctx, req, form);
    if ("response" in who) return who.response;
    return routePost(ctx, who.viewer, path, form);
  }

  return text(405, "Método no permitido");
}

/** Quién mira (GET): sesión real o, en desarrollo, rol de la URL. Solo internos. */
export function identifyGet(
  ctx: MaestrosContext,
  req: IncomingMessage,
  query: Record<string, string>,
): { viewer: Viewer; accountId: string } | { response: MaestrosResponse } {
  const ident = resolveRequestIdentity(ctx.auth, req, ctx.boot, query);
  if (isProduction() && !ident.session) {
    return { response: redirect("/login") };
  }
  if (!isInternal(ident.dev.roleId, ident.dev.channel)) {
    return { response: forbidden() };
  }
  return {
    viewer: {
      roleId: ident.dev.roleId,
      parteId: ident.dev.parteId,
      ...(ident.session ? { csrfToken: ident.session.csrfToken } : {}),
      devMode: !ident.session,
    },
    accountId: ident.session?.accountId ?? `dev:${ident.dev.roleId}`,
  };
}

/** Quién escribe (POST): sesión + CSRF, o rol del formulario en desarrollo. */
export function identifyPost(
  ctx: MaestrosContext,
  req: IncomingMessage,
  form: Record<string, string>,
): { viewer: Viewer; accountId: string } | { response: MaestrosResponse } {
  try {
    const identity = identityForAction(ctx.auth, req, form, ctx.boot);
    requireCsrf(identity.session, form, req.headers);
    if (!isInternal(identity.roleId, identity.channel)) {
      return { response: forbidden() };
    }
    return {
      viewer: {
        roleId: identity.roleId,
        parteId: identity.parteId,
        ...(identity.session ? { csrfToken: identity.session.csrfToken } : {}),
        devMode: !identity.session,
      },
      accountId: identity.session?.accountId ?? `dev:${identity.roleId}`,
    };
  } catch (e) {
    if (e instanceof CsrfError) return { response: text(403, e.message) };
    if (e instanceof AccountsError) return { response: text(401, e.message) };
    throw e;
  }
}

function isInternal(roleId: string, channel: string): boolean {
  return roleId !== "cliente" && channel !== "autoservicio";
}

// ─── GET ────────────────────────────────────────────────────────────────

function routeGet(
  ctx: MaestrosContext,
  viewer: Viewer,
  path: string,
  query: Record<string, string>,
): MaestrosResponse {
  const { runtime } = ctx;
  const tenant = runtime.tenantId;

  if (path === "/partes") {
    const tipo = query.tipo;
    const all = runtime.partes.list(tenant);
    const rows =
      tipo && (ParteSubtypes as readonly string[]).includes(tipo)
        ? all.filter((p) => p.subtype === tipo)
        : all;
    return html(200, page(ctx, viewer, "Clientes y proveedores", parteList(viewer, rows, tipo)));
  }
  if (path === "/partes/nueva") {
    return html(
      200,
      page(ctx, viewer, "Nueva parte", parteForm(viewer, "/partes", {
        subtype: query.tipo ?? "cliente",
      })),
    );
  }
  if (path.startsWith("/partes/")) {
    const id = path.slice("/partes/".length);
    const rec = ID_RE.test(id) ? runtime.partes.get(tenant, id) : undefined;
    if (!rec) return notFound(ctx, viewer, "Esa parte no existe.");
    return html(
      200,
      page(
        ctx,
        viewer,
        parteName(rec),
        okNotice(query.ok) + parteDetail(viewer, rec) + parteExpedientes(ctx, viewer, rec.parteId),
      ),
    );
  }

  if (path === "/ofertas") {
    const rows = runtime.ofertas.list(tenant);
    return html(200, page(ctx, viewer, "Catálogo", ofertaList(viewer, rows)));
  }
  if (path === "/ofertas/nueva") {
    return html(
      200,
      page(ctx, viewer, "Nueva oferta", ofertaForm(viewer, "/ofertas", {
        subtype: "bien",
        ivaPct: "21",
        unidad: "ud",
      })),
    );
  }
  if (path.startsWith("/ofertas/")) {
    const id = path.slice("/ofertas/".length);
    const rec = ID_RE.test(id) ? runtime.ofertas.get(tenant, id) : undefined;
    if (!rec) return notFound(ctx, viewer, "Esa oferta no existe.");
    const history = runtime.ofertas.history(tenant, id);
    return html(
      200,
      page(ctx, viewer, rec.nombre, okNotice(query.ok) + ofertaDetail(ctx, viewer, rec, history)),
    );
  }

  return notFound(ctx, viewer, "Página no encontrada.");
}

// ─── POST ───────────────────────────────────────────────────────────────

function routePost(
  ctx: MaestrosContext,
  viewer: Viewer,
  path: string,
  form: Record<string, string>,
): MaestrosResponse {
  const { runtime } = ctx;
  const tenant = runtime.tenantId;
  const now = new Date().toISOString();

  if (path === "/partes") {
    const previous = seenRequest(runtime, form.clientRequestId);
    if (previous) return redirect(withDev(viewer, `/partes/${previous}`));
    const parsed = parseParteForm(form);
    if (!parsed.ok) {
      return html(
        422,
        page(ctx, viewer, "Nueva parte", parteForm(viewer, "/partes", form, parsed.errors)),
      );
    }
    const parteId = `parte-${randomUUID()}`;
    runtime.partes.put(tenant, parteId, parsed.value.personal, now, parsed.value.subtype);
    rememberRequest(runtime, form.clientRequestId, parteId);
    return redirect(withDev(viewer, `/partes/${parteId}`, { ok: "creada" }));
  }

  if (path.startsWith("/partes/")) {
    const id = path.slice("/partes/".length);
    const rec = ID_RE.test(id) ? runtime.partes.get(tenant, id) : undefined;
    if (!rec) return notFound(ctx, viewer, "Esa parte no existe.");
    if (rec.erasedAt) {
      return html(
        409,
        page(ctx, viewer, "Parte borrada", `<p class="err">Los datos de esta parte se borraron (RGPD) y no se pueden editar.</p>`),
      );
    }
    const parsed = parseParteForm(form);
    if (!parsed.ok) {
      return html(
        422,
        page(ctx, viewer, parteName(rec), parteForm(viewer, `/partes/${id}`, form, parsed.errors)),
      );
    }
    runtime.partes.put(tenant, id, parsed.value.personal, now, parsed.value.subtype);
    return redirect(withDev(viewer, `/partes/${id}`, { ok: "guardada" }));
  }

  if (path === "/ofertas") {
    const previous = seenRequest(runtime, form.clientRequestId);
    if (previous) return redirect(withDev(viewer, `/ofertas/${previous}`));
    const parsed = parseOfertaForm(form);
    if (!parsed.ok) {
      return html(
        422,
        page(ctx, viewer, "Nueva oferta", ofertaForm(viewer, "/ofertas", form, parsed.errors)),
      );
    }
    const ofertaId = `oferta-${randomUUID()}`;
    runtime.ofertas.create(tenant, ofertaId, parsed.value, now);
    rememberRequest(runtime, form.clientRequestId, ofertaId);
    return redirect(withDev(viewer, `/ofertas/${ofertaId}`, { ok: "creada" }));
  }

  const activa = /^\/ofertas\/([^/]+)\/activa$/.exec(path);
  if (activa) {
    const id = activa[1]!;
    const rec = ID_RE.test(id) ? runtime.ofertas.get(tenant, id) : undefined;
    if (!rec) return notFound(ctx, viewer, "Esa oferta no existe.");
    runtime.ofertas.setActiva(tenant, id, form.activa === "1", now);
    return redirect(withDev(viewer, `/ofertas/${id}`, { ok: "guardada" }));
  }

  if (path.startsWith("/ofertas/")) {
    const id = path.slice("/ofertas/".length);
    const rec = ID_RE.test(id) ? runtime.ofertas.get(tenant, id) : undefined;
    if (!rec) return notFound(ctx, viewer, "Esa oferta no existe.");
    const parsed = parseOfertaForm(form);
    if (!parsed.ok) {
      return html(
        422,
        page(ctx, viewer, rec.nombre, ofertaForm(viewer, `/ofertas/${id}`, form, parsed.errors)),
      );
    }
    runtime.ofertas.update(tenant, id, parsed.value, now);
    return redirect(withDev(viewer, `/ofertas/${id}`, { ok: "guardada" }));
  }

  return notFound(ctx, viewer, "Página no encontrada.");
}

export function seenRequest(runtime: AppRuntime, requestId: string | undefined): string | undefined {
  if (!requestId) return undefined;
  return createdByRequest.get(runtime)?.get(requestId);
}

export function rememberRequest(runtime: AppRuntime, requestId: string | undefined, id: string): void {
  if (!requestId) return;
  let m = createdByRequest.get(runtime);
  if (!m) {
    m = new Map();
    createdByRequest.set(runtime, m);
  }
  m.set(requestId, id);
}

// ─── Vistas ─────────────────────────────────────────────────────────────

function parteName(rec: ParteIdentityRecord): string {
  return rec.erasedAt || !rec.personal ? "[borrado]" : rec.personal.displayName;
}

function parteList(
  viewer: Viewer,
  rows: readonly ParteIdentityRecord[],
  tipo: string | undefined,
): string {
  const filters = [
    `<a href="${esc(withDev(viewer, "/partes"))}"${!tipo ? ' aria-current="page"' : ""}>Todas</a>`,
    ...ParteSubtypes.map(
      (s) =>
        `<a href="${esc(withDev(viewer, "/partes", { tipo: s }))}"${tipo === s ? ' aria-current="page"' : ""}>${esc(PARTE_SUBTYPE_LABELS[s])}</a>`,
    ),
  ].join(" · ");
  const body =
    rows.length === 0
      ? `<p class="empty" data-partes-empty>Todavía no hay ninguna. Da de alta la primera.</p>`
      : `<table data-partes-table><thead><tr><th>Nombre</th><th>Tipo</th><th>NIF</th><th>Teléfono</th><th>Correo</th></tr></thead><tbody>` +
        rows
          .map((p) => {
            const per = p.erasedAt ? null : p.personal;
            return (
              `<tr data-parte-id="${esc(p.parteId)}">` +
              `<td><a href="${esc(withDev(viewer, `/partes/${p.parteId}`))}">${esc(parteName(p))}</a></td>` +
              `<td>${esc(p.subtype ? PARTE_SUBTYPE_LABELS[p.subtype] : "—")}</td>` +
              `<td>${esc(per?.taxId ?? "")}</td>` +
              `<td>${esc(per?.phone ?? "")}</td>` +
              `<td>${esc(per?.email ?? "")}</td>` +
              `</tr>`
            );
          })
          .join("") +
        `</tbody></table>`;
  return (
    `<p class="toolbar"><a class="btn" href="${esc(withDev(viewer, "/partes/nueva", tipo ? { tipo } : {}))}" data-parte-nueva>+ Nueva parte</a></p>` +
    `<p class="filters">${filters}</p>` +
    body
  );
}

/** Lo que esta Parte debe / se le debe, y sus expedientes. */
function parteExpedientes(ctx: MaestrosContext, viewer: Viewer, parteId: string): string {
  const exps = ctx.runtime.expedientesDinero().filter((e) => e.parteId === parteId);
  if (exps.length === 0) {
    return `<h2>Expedientes</h2><p class="empty">Todavía no tiene expedientes.</p>`;
  }
  const pend = (dir: "entra" | "sale") =>
    exps
      .filter((e) => e.direccion === dir && e.situacion === "pendiente")
      .reduce((s, e) => s + e.totalCentimos, 0);
  const debe = pend("entra");
  const leDebes = pend("sale");
  const resumen =
    `<p class="dinero" data-parte-saldo>` +
    `Te debe: <strong data-te-debe>${esc(formatCentimos(debe))}</strong>` +
    (leDebes > 0 ? ` · Le debes: <strong data-le-debes>${esc(formatCentimos(leDebes))}</strong>` : "") +
    `</p>`;
  const situacion: Record<string, string> = {
    presupuesto: "Presupuesto",
    pendiente: "Pendiente",
    liquidado: "Liquidado",
    sin_importe: "Anulado",
  };
  const rows = [...exps]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map(
      (e) =>
        `<tr><td><a href="${esc(withDev(viewer, `/expedientes/${e.id}`))}">${esc(e.label)}</a></td>` +
        `<td>${esc(e.fecha)}</td><td>${esc(e.estadoLabel)}</td><td>${esc(situacion[e.situacion] ?? "")}</td>` +
        `<td class="num">${esc(formatCentimos(e.totalCentimos))}</td></tr>`,
    )
    .join("");
  return (
    `<h2>Expedientes</h2>` +
    resumen +
    `<table data-parte-expedientes><thead><tr><th>Expediente</th><th>Fecha</th><th>Estado</th><th>Cobro</th><th class="num">Total</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`
  );
}

function parteDetail(viewer: Viewer, rec: ParteIdentityRecord): string {
  if (rec.erasedAt || !rec.personal) {
    return `<p class="err">Los datos personales de esta parte se borraron el ${esc(fecha(rec.erasedAt ?? rec.updatedAt))}. Su historial se conserva de forma anónima.</p>`;
  }
  return (
    parteForm(viewer, `/partes/${rec.parteId}`, {
      subtype: rec.subtype ?? "cliente",
      displayName: rec.personal.displayName,
      email: rec.personal.email ?? "",
      taxId: rec.personal.taxId ?? "",
      phone: rec.personal.phone ?? "",
      address: rec.personal.address ?? "",
    }) +
    `<p class="meta">Alta: ${esc(fecha(rec.createdAt))} · Última modificación: ${esc(fecha(rec.updatedAt))}</p>`
  );
}

function parteForm(
  viewer: Viewer,
  action: string,
  values: Record<string, string | undefined>,
  errors: readonly string[] = [],
): string {
  const v = (k: string) => esc(values[k] ?? "");
  const options = ParteSubtypes.map(
    (s) =>
      `<option value="${s}"${values.subtype === s ? " selected" : ""}>${esc(PARTE_SUBTYPE_LABELS[s])}</option>`,
  ).join("");
  return (
    errorList(errors) +
    `<form method="post" action="${esc(action)}" data-parte-form>` +
    hiddenIdentity(viewer) +
    `<input type="hidden" name="clientRequestId" value="${esc(values.clientRequestId ?? randomUUID())}" />` +
    `<label>Tipo <select name="subtype">${options}</select></label>` +
    `<label>Nombre o razón social * <input name="displayName" required maxlength="200" value="${v("displayName")}" /></label>` +
    `<label>NIF / CIF <input name="taxId" value="${v("taxId")}" /></label>` +
    `<label>Teléfono <input name="phone" type="tel" value="${v("phone")}" /></label>` +
    `<label>Correo <input name="email" type="email" value="${v("email")}" /></label>` +
    `<label>Dirección <input name="address" value="${v("address")}" /></label>` +
    `<button type="submit">Guardar</button>` +
    `</form>`
  );
}

function ofertaList(viewer: Viewer, rows: readonly OfertaRecord[]): string {
  const body =
    rows.length === 0
      ? `<p class="empty" data-ofertas-empty>El catálogo está vacío. Añade tu primer producto o servicio.</p>`
      : `<table data-ofertas-table><thead><tr><th>Nombre</th><th>Tipo</th><th>Precio (sin IVA)</th><th>IVA</th><th>Unidad</th><th>Estado</th></tr></thead><tbody>` +
        rows
          .map(
            (o) =>
              `<tr data-oferta-id="${esc(o.ofertaId)}"${o.activa ? "" : ' class="inactive"'}>` +
              `<td><a href="${esc(withDev(viewer, `/ofertas/${o.ofertaId}`))}">${esc(o.nombre)}</a></td>` +
              `<td>${esc(OFERTA_SUBTYPE_LABELS[o.subtype])}</td>` +
              `<td class="num">${esc(formatCentimos(o.precioCentimos))}</td>` +
              `<td class="num">${o.ivaPct} %</td>` +
              `<td>${esc(o.unidad)}</td>` +
              `<td>${o.activa ? "Activa" : "Desactivada"}</td>` +
              `</tr>`,
          )
          .join("") +
        `</tbody></table>`;
  return (
    `<p class="toolbar"><a class="btn" href="${esc(withDev(viewer, "/ofertas/nueva"))}" data-oferta-nueva>+ Nueva oferta</a></p>` +
    body
  );
}

function ofertaDetail(
  ctx: MaestrosContext,
  viewer: Viewer,
  rec: OfertaRecord,
  history: readonly OfertaRecord[],
): string {
  const toggle =
    `<form method="post" action="${esc(`/ofertas/${rec.ofertaId}/activa`)}" data-oferta-activa>` +
    hiddenIdentity(viewer) +
    `<input type="hidden" name="activa" value="${rec.activa ? "0" : "1"}" />` +
    `<button type="submit" class="secondary">${rec.activa ? "Desactivar (dejar de ofrecerla)" : "Volver a activar"}</button>` +
    `</form>`;
  const hist =
    `<h2>Historial de cambios</h2><table data-oferta-historial><thead><tr><th>Versión</th><th>Fecha</th><th>Nombre</th><th>Precio</th><th>IVA</th><th>Estado</th></tr></thead><tbody>` +
    [...history]
      .reverse()
      .map(
        (h) =>
          `<tr><td class="num">${h.version}</td><td>${esc(fecha(h.updatedAt))}</td><td>${esc(h.nombre)}</td>` +
          `<td class="num">${esc(formatCentimos(h.precioCentimos))}</td><td class="num">${h.ivaPct} %</td>` +
          `<td>${h.activa ? "Activa" : "Desactivada"}</td></tr>`,
      )
      .join("") +
    `</tbody></table>`;
  return (
    (rec.subtype === "bien" && moduloEnApp(ctx, "stock")
      ? `<p class="toolbar"><a href="${esc(withDev(viewer, `/stock/${rec.ofertaId}`))}" data-ver-stock>Ver y controlar su stock</a></p>`
      : "") +
    ofertaForm(viewer, `/ofertas/${rec.ofertaId}`, {
      subtype: rec.subtype,
      nombre: rec.nombre,
      descripcion: rec.descripcion ?? "",
      precio: formatCentimos(rec.precioCentimos).replace(" €", ""),
      ivaPct: String(rec.ivaPct),
      unidad: rec.unidad,
    }) +
    toggle +
    hist
  );
}

function ofertaForm(
  viewer: Viewer,
  action: string,
  values: Record<string, string | undefined>,
  errors: readonly string[] = [],
): string {
  const v = (k: string) => esc(values[k] ?? "");
  const tipos = OfertaSubtypes.map(
    (s) =>
      `<option value="${s}"${values.subtype === s ? " selected" : ""}>${esc(OFERTA_SUBTYPE_LABELS[s])}</option>`,
  ).join("");
  const ivas = IVA_TIPOS.map(
    (i) =>
      `<option value="${i}"${values.ivaPct === String(i) ? " selected" : ""}>${i} %</option>`,
  ).join("");
  return (
    errorList(errors) +
    `<form method="post" action="${esc(action)}" data-oferta-form>` +
    hiddenIdentity(viewer) +
    `<input type="hidden" name="clientRequestId" value="${esc(values.clientRequestId ?? randomUUID())}" />` +
    `<label>Tipo <select name="subtype">${tipos}</select></label>` +
    `<label>Nombre * <input name="nombre" required maxlength="200" value="${v("nombre")}" /></label>` +
    `<label>Descripción <input name="descripcion" value="${v("descripcion")}" /></label>` +
    `<label>Precio sin IVA (€) * <input name="precio" required inputmode="decimal" placeholder="12,50" value="${v("precio")}" /></label>` +
    `<label>IVA <select name="ivaPct">${ivas}</select></label>` +
    `<label>Unidad <input name="unidad" maxlength="20" placeholder="ud, hora, mes…" value="${v("unidad")}" /></label>` +
    `<button type="submit">Guardar</button>` +
    `</form>`
  );
}

// ─── Utilidades de página ───────────────────────────────────────────────

export function page(
  ctx: MaestrosContext,
  viewer: Viewer,
  title: string,
  body: string,
): string {
  const nav =
    `<nav class="top" data-maestros-nav>` +
    `<a href="${esc(withDev(viewer, "/inicio"))}" data-nav-inicio>Inicio</a>` +
    `<a href="${esc(withDev(viewer, "/"))}">Procesos</a>` +
    `<a href="${esc(withDev(viewer, "/partes"))}">Clientes y proveedores</a>` +
    `<a href="${esc(withDev(viewer, "/ofertas"))}">Catálogo</a>` +
    `<a href="${esc(withDev(viewer, "/dinero"))}">Dinero</a>` +
    (moduloEnApp(ctx, "stock") ? `<a href="${esc(withDev(viewer, "/stock"))}">Stock</a>` : "") +
    (moduloEnApp(ctx, "facturas")
      ? `<a href="${esc(withDev(viewer, "/facturas"))}">Facturas</a>` +
        `<a href="${esc(withDev(viewer, "/empresa"))}">Datos de la empresa</a>`
      : "") +
    `</nav>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)} · ${esc(ctx.boot.brandName)}</title>
<style>
  :root { --fg:#0f172a; --muted:#64748b; --line:#e2e8f0; --bg:#f8fafc; --card:#fff; --accent:#2563eb; --err:#b91c1c; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:var(--bg); color:var(--fg); line-height:1.5; }
  main { max-width: 960px; margin: 0 auto; padding: 16px; }
  nav.top { display:flex; flex-wrap:wrap; gap:16px; padding:12px 16px; background:var(--card); border-bottom:1px solid var(--line); }
  a { color: var(--accent); }
  h1 { font-size: 1.5rem; margin: 16px 0; }
  h2 { font-size: 1.1rem; margin: 24px 0 8px; }
  table { width:100%; border-collapse: collapse; background:var(--card); }
  th, td { text-align:left; padding:8px; border-bottom:1px solid var(--line); }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; }
  tr.inactive td { color: var(--muted); }
  form { display:grid; gap:12px; max-width: 520px; background:var(--card); padding:16px; border:1px solid var(--line); border-radius:8px; margin-bottom:12px; }
  label { display:grid; gap:4px; font-weight:600; font-size:.9rem; }
  input, select { font: inherit; padding:8px; border:1px solid var(--line); border-radius:6px; font-weight:400; }
  button, .btn { font: inherit; padding:8px 14px; border-radius:6px; border:0; background:var(--accent); color:#fff; cursor:pointer; text-decoration:none; justify-self:start; display:inline-block; }
  button.secondary { background:#fff; color:var(--fg); border:1px solid var(--line); }
  .err { color: var(--err); }
  .ok { color: #15803d; }
  .meta, .empty { color: var(--muted); }
  .filters a[aria-current] { font-weight:700; color: var(--fg); text-decoration:none; }
  form.wide { max-width: none; }
  .grid2 { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .scroll { overflow-x:auto; }
  table.lineas td { padding:4px; }
  table.lineas input, table.lineas select { width:100%; min-width:80px; }
  textarea { font: inherit; padding:8px; border:1px solid var(--line); border-radius:6px; font-weight:400; }
  dl.ficha { display:grid; grid-template-columns: max-content 1fr; gap:6px 16px; background:var(--card); padding:16px; border:1px solid var(--line); border-radius:8px; }
  dl.ficha dt { color:var(--muted); }
  dl.ficha dd { margin:0; }
  .notas { white-space: pre-wrap; }
  tfoot td { font-weight:600; }
  tfoot tr.total td { font-size:1.1rem; border-top:2px solid var(--fg); }
  .toolbar { display:flex; flex-wrap:wrap; gap:16px; align-items:center; }
  .tiles { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); margin: 8px 0 16px; }
  .tile { display:grid; gap:4px; background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px 16px; }
  .tile-label { color:var(--muted); font-size:.85rem; font-weight:600; }
  .tile-value { font-size:1.5rem; font-weight:700; font-variant-numeric: tabular-nums; }
  .tile-hint { color:var(--muted); font-size:.8rem; }
  .tarjetas { display:grid; gap:12px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); margin-bottom:8px; }
  .tarjeta { display:grid; gap:6px; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; text-decoration:none; color:var(--fg); }
  .tarjeta:hover { border-color:var(--accent); box-shadow:0 2px 8px rgba(37,99,235,.12); }
  .tarjeta-titulo { font-weight:700; font-size:1.05rem; color:var(--accent); }
  .tarjeta-que { color:var(--muted); font-size:.9rem; }
  .tarjeta-dato { font-weight:600; font-size:.9rem; }
  .dinero { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px 16px; margin: 12px 0; }
  .factura { background:#fff; border:1px solid var(--line); border-radius:8px; padding:24px; margin:12px 0; }
  .factura-cab { display:flex; flex-wrap:wrap; justify-content:space-between; gap:16px; margin-bottom:16px; }
  .factura-num { text-align:right; }
  .factura-tipo { font-size:1.2rem; font-weight:700; }
  .factura-cliente { border:1px solid var(--line); border-radius:6px; padding:10px 12px; margin-bottom:16px; max-width:360px; }
  .factura-totales { width:auto; margin-left:auto; min-width:280px; margin-top:12px; }
  .factura-totales tr.total td { font-weight:700; font-size:1.1rem; border-top:2px solid var(--fg); }
  .factura-pie { margin-top:16px; font-size:.75rem; }
  @media print {
    nav.top, .no-print, h1 { display:none !important; }
    body { background:#fff; }
    main { max-width:none; padding:0; }
    .factura { border:0; padding:0; margin:0; }
  }
  @media (max-width: 640px) { table { font-size:.85rem; } th, td { padding:6px 4px; } }
</style></head>
<body data-page="maestros">${nav}<main id="main"><h1>${esc(title)}</h1>${body}</main></body></html>`;
}

export function hiddenIdentity(viewer: Viewer): string {
  return (
    (viewer.csrfToken
      ? `<input type="hidden" name="csrfToken" value="${esc(viewer.csrfToken)}" />`
      : "") +
    (viewer.devMode
      ? `<input type="hidden" name="roleId" value="${esc(viewer.roleId)}" />` +
        `<input type="hidden" name="parteId" value="${esc(viewer.parteId)}" />`
      : "")
  );
}

/** En modo desarrollo el rol viaja en la URL (no hay sesión). */
export function withDev(
  viewer: Viewer,
  path: string,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams(extra);
  if (viewer.devMode) {
    params.set("role", viewer.roleId);
    params.set("parte", viewer.parteId);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function okNotice(ok: string | undefined): string {
  if (ok === "creada") return `<p class="ok" role="status" data-ok>Alta guardada.</p>`;
  if (ok === "guardada") return `<p class="ok" role="status" data-ok>Cambios guardados.</p>`;
  if (ok === "factura") return `<p class="ok no-print" role="status" data-ok>Factura expedida.</p>`;
  return "";
}

export function errorList(errors: readonly string[]): string {
  if (errors.length === 0) return "";
  return `<ul class="err" role="alert" data-form-errors>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
}

export function fecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  });
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function html(status: number, body: string): MaestrosResponse {
  return { status, body, contentType: "text/html; charset=utf-8" };
}

export function text(status: number, body: string): MaestrosResponse {
  return { status, body, contentType: "text/plain; charset=utf-8" };
}

export function redirect(location: string): MaestrosResponse {
  return { status: 303, body: "", contentType: "text/plain", headers: { Location: location } };
}

function forbidden(): MaestrosResponse {
  return text(403, "Prohibido: solo el personal del negocio gestiona clientes y catálogo.");
}

export function notFound(ctx: MaestrosContext, viewer: Viewer, msg: string): MaestrosResponse {
  return html(404, page(ctx, viewer, "No encontrado", `<p class="err">${esc(msg)}</p>`));
}
