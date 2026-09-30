/**
 * Fichas generadas de cada negocio.
 *
 *   GET  /fichas/<fichaId>           listado
 *   GET  /fichas/<fichaId>/nueva     formulario de alta
 *   POST /fichas/<fichaId>           alta
 *   GET  /fichas/<fichaId>/<id>      ficha / edición + historial
 *   POST /fichas/<fichaId>/<id>      guardar cambios
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  type DefinicionFicha,
  parseFichaForm,
  type FichaRecord,
} from "../elements/ficha.js";
import { formatCentimos } from "../elements/oferta.js";
import {
  esc,
  errorList,
  html,
  identifyGet,
  identifyPost,
  notFound,
  okNotice,
  page,
  redirect,
  text,
  withDev,
  type MaestrosContext,
  type MaestrosResponse,
  type Viewer,
  fecha,
} from "./maestros.js";

export interface FichasResponse {
  readonly status: number;
  readonly body: string;
  readonly contentType: string;
  readonly headers?: Record<string, string>;
}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

export function isFichasPath(path: string): boolean {
  return path === "/fichas" || path.startsWith("/fichas/");
}

export async function handleFichas(
  ctx: MaestrosContext,
  req: IncomingMessage,
  readForm: () => Promise<Record<string, string>>,
): Promise<FichasResponse> {
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

// ─── GET ────────────────────────────────────────────────────────────────

function routeGet(
  ctx: MaestrosContext,
  viewer: Viewer,
  path: string,
  query: Record<string, string>,
): FichasResponse {
  const { runtime, boot } = ctx;
  const tenant = runtime.tenantId;

  // GET /fichas/<fichaId>
  const listMatch = path.match(/^\/fichas\/([a-z0-9_-]+)$/i);
  if (listMatch) {
    const fichaId = listMatch[1];
    const def = definicionFicha(boot, fichaId);
    if (!def) {
      return html(404, page(ctx, viewer, "No disponible", `<p class="meta">Esa ficha no existe.</p>`));
    }
    const fichas = runtime.fichas.listar(tenant, fichaId);
    return html(200, page(ctx, viewer, def.plural, fichaList(viewer, def, fichas)));
  }

  // GET /fichas/<fichaId>/nueva
  if (path.match(/^\/fichas\/([a-z0-9_-]+)\/nueva$/i)) {
    const fichaId = path.split("/")[2];
    const def = definicionFicha(boot, fichaId);
    if (!def) {
      return html(404, page(ctx, viewer, "No disponible", `<p class="meta">Esa ficha no existe.</p>`));
    }
    return html(
      200,
      page(ctx, viewer, `Nueva ${def.nombre.toLowerCase()}`, fichaForm(viewer, def, `/fichas/${fichaId}`, {}))
    );
  }

  // GET /fichas/<fichaId>/<id>
  const detailMatch = path.match(/^\/fichas\/([a-z0-9_-]+)\/([a-z0-9_-]+)$/i);
  if (detailMatch) {
    const fichaId = detailMatch[1];
    const id = detailMatch[2];
    const def = definicionFicha(boot, fichaId);
    if (!def) {
      return html(404, page(ctx, viewer, "No disponible", `<p class="meta">Esa ficha no existe.</p>`));
    }
    const rec = ID_RE.test(id) ? runtime.fichas.get(tenant, fichaId, id) : undefined;
    if (!rec) {
      return notFound(ctx, viewer, "Esa ficha no existe.");
    }
    const history = runtime.fichas.historial(tenant, fichaId, id);
    return html(
      200,
      page(ctx, viewer, def.nombre, okNotice(query.ok) + fichaDetail(ctx, viewer, def, rec, history))
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
): FichasResponse {
  const { runtime, boot } = ctx;
  const tenant = runtime.tenantId;
  const now = new Date().toISOString();

  // POST /fichas/<fichaId>
  const createMatch = path.match(/^\/fichas\/([a-z0-9_-]+)$/i);
  if (createMatch) {
    const fichaId = createMatch[1];
    const def = definicionFicha(boot, fichaId);
    if (!def) {
      return html(404, page(ctx, viewer, "No disponible", `<p class="meta">Esa ficha no existe.</p>`));
    }
    const parsed = parseFichaForm(def, form);
    if (!parsed.ok) {
      return html(
        422,
        page(ctx, viewer, `Nueva ${def.nombre.toLowerCase()}`, fichaForm(viewer, def, `/fichas/${fichaId}`, form, parsed.errors))
      );
    }
    const id = `${fichaId}-${randomUUID()}`;
    runtime.fichas.crear(tenant, fichaId, id, parsed.valores, now);
    return redirect(withDev(viewer, `/fichas/${fichaId}/${id}`, { ok: "creada" }));
  }

  // POST /fichas/<fichaId>/<id>
  const updateMatch = path.match(/^\/fichas\/([a-z0-9_-]+)\/([a-z0-9_-]+)$/i);
  if (updateMatch) {
    const fichaId = updateMatch[1];
    const id = updateMatch[2];
    const def = definicionFicha(boot, fichaId);
    if (!def) {
      return html(404, page(ctx, viewer, "No disponible", `<p class="meta">Esa ficha no existe.</p>`));
    }
    const rec = ID_RE.test(id) ? runtime.fichas.get(tenant, fichaId, id) : undefined;
    if (!rec) {
      return notFound(ctx, viewer, "Esa ficha no existe.");
    }
    const parsed = parseFichaForm(def, form);
    if (!parsed.ok) {
      return html(
        422,
        page(ctx, viewer, def.nombre, fichaForm(viewer, def, `/fichas/${fichaId}/${id}`, form, parsed.errors))
      );
    }
    runtime.fichas.actualizar(tenant, fichaId, id, parsed.valores, now);
    return redirect(withDev(viewer, `/fichas/${fichaId}/${id}`, { ok: "guardada" }));
  }

  return notFound(ctx, viewer, "Página no encontrada.");
}

// ─── HTML ───────────────────────────────────────────────────────────────

function definicionFicha(boot: typeof ctx.boot, fichaId: string): DefinicionFicha | undefined {
  return (boot.input.fichas as DefinicionFicha[] | undefined)?.find((f) => f.id === fichaId);
}

function fichaList(viewer: Viewer, def: DefinicionFicha, fichas: readonly FichaRecord[]): string {
  if (fichas.length === 0) {
    return `<p class="empty">No hay ${def.plural.toLowerCase()} registradas.</p>`;
  }

  const cols = def.campos.slice(0, 4);
  let html = `<table><thead><tr><th>ID</th>`;
  for (const col of cols) {
    html += `<th>${esc(col.nombre)}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (const ficha of fichas) {
    html += `<tr><td><a href="${esc(withDev(viewer, `/fichas/${def.id}/${ficha.id}`))}">${esc(ficha.id)}</a></td>`;
    for (const col of cols) {
      const val = ficha.valores[col.id];
      if (col.tipo === "importe" && typeof val === "number") {
        html += `<td class="num">${esc(formatCentimos(val))}</td>`;
      } else if (val !== null && val !== undefined) {
        html += `<td>${esc(String(val))}</td>`;
      } else {
        html += `<td class="empty">—</td>`;
      }
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;

  return `<p><a href="${esc(withDev(viewer, `/fichas/${def.id}/nueva`))}" class="btn">Nueva ${esc(def.nombre.toLowerCase())}</a></p>` + html;
}

function fichaForm(
  viewer: Viewer,
  def: DefinicionFicha,
  action: string,
  values: Record<string, string> = {},
  errors: string[] = [],
): string {
  let html = `<form method="POST" action="${esc(withDev(viewer, action))}">`;
  html += hiddenIdentity(viewer);
  html += errorList(errors);

  for (const campo of def.campos) {
    const val = values[campo.id] ?? "";
    const required = campo.obligatorio ? " required" : "";

    html += `<label>
      ${esc(campo.nombre)}${campo.obligatorio ? " <span class="err">*</span>" : ""}`;

    if (campo.tipo === "texto") {
      html += `<input type="text" name="${esc(campo.id)}" value="${esc(val)}"${required} />`;
    } else if (campo.tipo === "numero") {
      html += `<input type="number" name="${esc(campo.id)}" value="${esc(val)}"${required} />`;
    } else if (campo.tipo === "importe") {
      html += `<input type="text" name="${esc(campo.id)}" value="${esc(val)}" placeholder="12,50"${required} />`;
    } else if (campo.tipo === "si_no") {
      const checked = val === "true" ? " checked" : "";
      html += `<input type="checkbox" name="${esc(campo.id)}" value="true"${checked} />`;
    } else if (campo.tipo === "fecha") {
      html += `<input type="date" name="${esc(campo.id)}" value="${esc(val)}"${required} />`;
    } else if (campo.tipo === "opcion" && campo.opciones) {
      html += `<select name="${esc(campo.id)}"${required}>
        <option value="">— Selecciona —</option>`;
      for (const opt of campo.opciones) {
        const selected = val === opt ? " selected" : "";
        html += `<option value="${esc(opt)}"${selected}>${esc(opt)}</option>`;
      }
      html += `</select>`;
    }

    html += `</label>`;
  }

  html += `<button type="submit">Guardar</button>`;
  html += `</form>`;

  return html;
}

function fichaDetail(
  ctx: MaestrosContext,
  viewer: Viewer,
  def: DefinicionFicha,
  rec: FichaRecord,
  history: readonly FichaRecord[],
): string {
  let html = `<dl class="ficha">`;

  for (const campo of def.campos) {
    const val = rec.valores[campo.id];
    html += `<dt>${esc(campo.nombre)}</dt>`;

    if (val === null || val === undefined) {
      html += `<dd class="empty">—</dd>`;
    } else if (campo.tipo === "importe" && typeof val === "number") {
      html += `<dd>${esc(formatCentimos(val))}</dd>`;
    } else if (typeof val === "boolean") {
      html += `<dd>${val ? "Sí" : "No"}</dd>`;
    } else {
      html += `<dd>${esc(String(val))}</dd>`;
    }
  }

  html += `</dl>`;

  html += `<p><a href="${esc(withDev(viewer, `/fichas/${def.id}/${rec.id}`, {}))}" class="btn secondary">Editar</a></p>`;

  if (history.length > 1) {
    html += `<h2>Historial de versiones</h2>`;
    html += `<table><thead><tr><th>Versión</th><th>Fecha</th></tr></thead><tbody>`;
    for (const v of history) {
      html += `<tr><td>${v.version}</td><td>${esc(fecha(v.updatedAt))}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  return html;
}

function hiddenIdentity(viewer: Viewer): string {
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
