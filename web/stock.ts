/**
 * Stock: existencias de los productos con control activado.
 *
 *   GET  /stock                       listado + añadir producto al control
 *   POST /stock                       activar control de un producto
 *   GET  /stock/:ofertaId             ficha: situación, ajustes, historial
 *   POST /stock/:ofertaId/config      activar / desactivar y mínimo
 *   POST /stock/:ofertaId/ajuste      entrada, salida o recuento (con motivo)
 *
 * Solo roles internos.
 */

import type { IncomingMessage } from "node:http";
import type { OfertaRecord } from "../elements/oferta.js";
import type { EstadoStock, ResumenProducto } from "../elements/stock.js";
import { formatCantidad, parseCantidadMilesimas } from "../elements/transaccion.js";
import {
  errorList,
  esc,
  fecha,
  hiddenIdentity,
  html,
  identifyGet,
  identifyPost,
  moduloEnApp,
  noDisponible,
  notFound,
  okNotice,
  page,
  redirect,
  text,
  withDev,
  type MaestrosContext,
  type MaestrosResponse,
  type Viewer,
} from "./maestros.js";

const ID_RE = /^[A-Za-z0-9._-]{1,120}$/;

export function isStockPath(path: string): boolean {
  return path === "/stock" || path.startsWith("/stock/");
}

export async function handleStock(
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
    if (!moduloEnApp(ctx, "stock")) return noDisponible(ctx, who.viewer, "El stock");
    return routeGet(ctx, who.viewer, path, query);
  }
  if (method === "POST") {
    const form = await readForm();
    const who = identifyPost(ctx, req, form);
    if ("response" in who) return who.response;
    if (!moduloEnApp(ctx, "stock")) return noDisponible(ctx, who.viewer, "El stock");
    return routePost(ctx, who.viewer, who.accountId, path, form);
  }
  return text(405, "Método no permitido");
}

/** Cantidad vacía = 0 (para el mínimo); null si no es válida. */
function parseMinimo(raw: string | undefined): number | null {
  const t = (raw ?? "").trim();
  if (t === "" || t === "0") return 0;
  return parseCantidadMilesimas(t);
}

function routeGet(
  ctx: MaestrosContext,
  viewer: Viewer,
  path: string,
  query: Record<string, string>,
): MaestrosResponse {
  if (path === "/stock") {
    return html(200, page(ctx, viewer, "Stock", okNotice(query.ok) + listado(ctx, viewer)));
  }
  const m = /^\/stock\/([^/]+)$/.exec(path);
  if (m) {
    const id = m[1]!;
    const oferta = ID_RE.test(id) ? ctx.runtime.ofertas.get(ctx.runtime.tenantId, id) : undefined;
    if (!oferta) return notFound(ctx, viewer, "Ese producto no existe.");
    return html(200, page(ctx, viewer, `Stock: ${oferta.nombre}`, okNotice(query.ok) + ficha(ctx, viewer, oferta)));
  }
  return notFound(ctx, viewer, "Página no encontrada.");
}

function routePost(
  ctx: MaestrosContext,
  viewer: Viewer,
  accountId: string,
  path: string,
  form: Record<string, string>,
): MaestrosResponse {
  const { runtime } = ctx;
  if (path === "/stock") {
    const minimo = parseMinimo(form.minimo);
    const r =
      minimo === null
        ? { ok: false as const, error: "El mínimo no es válido (ejemplo: 5)." }
        : runtime.configurarStock(form.ofertaId ?? "", true, minimo);
    if (!r.ok) return html(422, page(ctx, viewer, "Stock", errorList([r.error]) + listado(ctx, viewer)));
    return redirect(withDev(viewer, `/stock/${form.ofertaId}`, { ok: "guardada" }));
  }
  const m = /^\/stock\/([^/]+)\/(config|ajuste)$/.exec(path);
  if (m) {
    const id = m[1]!;
    const oferta = ID_RE.test(id) ? runtime.ofertas.get(runtime.tenantId, id) : undefined;
    if (!oferta) return notFound(ctx, viewer, "Ese producto no existe.");
    const title = `Stock: ${oferta.nombre}`;
    if (m[2] === "config") {
      const minimo = parseMinimo(form.minimo);
      const r =
        minimo === null
          ? { ok: false as const, error: "El mínimo no es válido (ejemplo: 5)." }
          : runtime.configurarStock(id, form.control === "1", minimo);
      if (!r.ok) return html(422, page(ctx, viewer, title, ficha(ctx, viewer, oferta, [r.error])));
      return redirect(withDev(viewer, `/stock/${id}`, { ok: "guardada" }));
    }
    const tipo = form.tipo === "salida" || form.tipo === "recuento" ? form.tipo : "entrada";
    const cantRaw = (form.cantidad ?? "").trim();
    const cantidad = tipo === "recuento" && (cantRaw === "0" || cantRaw === "") ? 0 : parseCantidadMilesimas(cantRaw);
    const r =
      cantidad === null
        ? { ok: false as const, error: "La cantidad no es válida (ejemplo: 3 o 2,5)." }
        : runtime.ajustarStock(id, tipo, cantidad, form.motivo ?? "", accountId);
    if (!r.ok) return html(422, page(ctx, viewer, title, ficha(ctx, viewer, oferta, [r.error])));
    return redirect(withDev(viewer, `/stock/${id}`, { ok: "guardada" }));
  }
  return notFound(ctx, viewer, "Página no encontrada.");
}

// ─── Vistas ─────────────────────────────────────────────────────────────

const ESTADO_LABEL: Readonly<Record<EstadoStock, string>> = {
  ok: "Bien",
  bajo: "Bajo mínimo",
  agotado: "Agotado",
};

function q(milesimas: number, unidad: string): string {
  return `${formatCantidad(Math.abs(milesimas))}${milesimas < 0 ? " (negativo)" : ""} ${unidad}`;
}

function listado(ctx: MaestrosContext, viewer: Viewer): string {
  const { runtime } = ctx;
  const { productos } = runtime.stock();
  const ofertas = new Map(runtime.ofertas.list(runtime.tenantId).map((o) => [o.ofertaId, o]));
  const bajo = productos.filter((p) => p.estado === "bajo").length;
  const agotados = productos.filter((p) => p.estado === "agotado").length;

  const tiles =
    `<div class="tiles">` +
    `<div class="tile" data-kpi="controlados"><span class="tile-label">Productos controlados</span><span class="tile-value">${productos.length}</span></div>` +
    `<div class="tile" data-kpi="bajo"><span class="tile-label">Bajo mínimo</span><span class="tile-value">${bajo}</span><span class="tile-hint">conviene pedir</span></div>` +
    `<div class="tile" data-kpi="agotados"><span class="tile-label">Agotados</span><span class="tile-value">${agotados}</span><span class="tile-hint">sin disponible</span></div>` +
    `</div>`;

  const orden: Record<EstadoStock, number> = { agotado: 0, bajo: 1, ok: 2 };
  const rows = [...productos]
    .sort((a, b) => orden[a.estado] - orden[b.estado] || (ofertas.get(a.ofertaId)?.nombre ?? "").localeCompare(ofertas.get(b.ofertaId)?.nombre ?? "", "es"))
    .map((p) => fila(viewer, p, ofertas.get(p.ofertaId)))
    .join("");
  const tabla =
    productos.length === 0
      ? `<p class="empty" data-stock-vacio>Ningún producto controla stock todavía. Añade el primero abajo.</p>`
      : `<table data-stock><thead><tr><th>Producto</th><th class="num">Stock</th><th class="num">Reservado</th><th class="num">Disponible</th><th class="num">En camino</th><th class="num">Mínimo</th><th>Situación</th></tr></thead><tbody>${rows}</tbody></table>`;

  const candidatas = runtime.ofertas
    .list(runtime.tenantId)
    .filter((o) => o.activa && o.subtype === "bien" && !productos.some((p) => p.ofertaId === o.ofertaId));
  const alta =
    candidatas.length === 0
      ? `<p class="meta">Para controlar stock, el producto tiene que estar en el <a href="${esc(withDev(viewer, "/ofertas"))}">catálogo</a> como «Producto».</p>`
      : `<h2>Controlar el stock de un producto</h2>` +
        `<form method="post" action="/stock" data-stock-alta>` +
        hiddenIdentity(viewer) +
        `<label>Producto <select name="ofertaId" required>${candidatas
          .map((o) => `<option value="${esc(o.ofertaId)}">${esc(o.nombre)}</option>`)
          .join("")}</select></label>` +
        `<label>Avisar cuando queden (mínimo) <input name="minimo" inputmode="decimal" placeholder="0" /></label>` +
        `<button type="submit">Empezar a controlar</button>` +
        `</form>`;

  return (
    tiles +
    tabla +
    alta +
    `<p class="meta">El stock baja al entregar una venta o cerrar un trabajo, y sube al recibir una compra. Nada impide vender sin stock: solo avisa.</p>`
  );
}

function fila(viewer: Viewer, p: ResumenProducto, o: OfertaRecord | undefined): string {
  const u = o?.unidad ?? "ud";
  return (
    `<tr data-stock-producto="${esc(p.ofertaId)}" data-estado="${p.estado}">` +
    `<td><a href="${esc(withDev(viewer, `/stock/${p.ofertaId}`))}">${esc(o?.nombre ?? "Producto")}</a></td>` +
    `<td class="num">${esc(q(p.stock, u))}</td>` +
    `<td class="num">${esc(q(p.reservado, u))}</td>` +
    `<td class="num"><strong>${esc(q(p.disponible, u))}</strong></td>` +
    `<td class="num">${esc(q(p.enCamino, u))}</td>` +
    `<td class="num">${esc(q(p.minimo, u))}</td>` +
    `<td class="${p.estado === "ok" ? "" : "err"}">${esc(ESTADO_LABEL[p.estado])}</td>` +
    `</tr>`
  );
}

function ficha(
  ctx: MaestrosContext,
  viewer: Viewer,
  oferta: OfertaRecord,
  errors: readonly string[] = [],
): string {
  const { runtime } = ctx;
  const { productos, movimientos } = runtime.stock();
  const p = productos.find((x) => x.ofertaId === oferta.ofertaId);
  const conf = runtime.stockStore.config(runtime.tenantId, oferta.ofertaId);
  const u = oferta.unidad;

  const resumen = p
    ? `<div class="tiles">` +
      `<div class="tile" data-kpi="stock"><span class="tile-label">Stock</span><span class="tile-value">${esc(q(p.stock, u))}</span></div>` +
      `<div class="tile" data-kpi="reservado"><span class="tile-label">Reservado</span><span class="tile-value">${esc(q(p.reservado, u))}</span><span class="tile-hint">aceptado sin entregar</span></div>` +
      `<div class="tile" data-kpi="disponible"><span class="tile-label">Disponible</span><span class="tile-value">${esc(q(p.disponible, u))}</span><span class="tile-hint">${esc(ESTADO_LABEL[p.estado])}</span></div>` +
      `<div class="tile" data-kpi="en-camino"><span class="tile-label">En camino</span><span class="tile-value">${esc(q(p.enCamino, u))}</span><span class="tile-hint">compras sin recibir</span></div>` +
      `</div>`
    : `<p class="meta" data-stock-off>Este producto no controla stock.</p>`;

  const config =
    `<h2>Control</h2>` +
    `<form method="post" action="${esc(`/stock/${oferta.ofertaId}/config`)}" data-stock-config>` +
    hiddenIdentity(viewer) +
    `<label><span><input type="checkbox" name="control" value="1"${conf?.control ? " checked" : ""} /> Controlar el stock de este producto</span></label>` +
    `<label>Avisar cuando queden (mínimo) <input name="minimo" inputmode="decimal" value="${esc(conf ? formatCantidad(conf.minimo) : "0")}" /></label>` +
    `<button type="submit" class="secondary">Guardar</button>` +
    `</form>`;

  const ajuste = p
    ? `<h2>Ajustar</h2>` +
      `<form method="post" action="${esc(`/stock/${oferta.ofertaId}/ajuste`)}" data-stock-ajuste>` +
      hiddenIdentity(viewer) +
      `<label>Tipo <select name="tipo">` +
      `<option value="entrada">Entrada (llega mercancía sin compra registrada)</option>` +
      `<option value="salida">Salida (rotura, pérdida, uso propio)</option>` +
      `<option value="recuento">Recuento (lo que hay de verdad)</option>` +
      `</select></label>` +
      `<label>Cantidad (${esc(u)}) * <input name="cantidad" required inputmode="decimal" placeholder="3" /></label>` +
      `<label>Motivo * <input name="motivo" required maxlength="200" placeholder="Inventario inicial, rotura…" /></label>` +
      `<button type="submit">Registrar ajuste</button>` +
      `</form>`
    : "";

  const propios = movimientos.filter((m) => m.ofertaId === oferta.ofertaId);
  const labelExp = (id: string) => runtime.subjects.find((s) => s.id === id)?.label ?? "Expediente";
  const historial =
    `<h2>Movimientos</h2>` +
    (propios.length === 0
      ? `<p class="empty">Sin movimientos todavía.</p>`
      : `<table data-stock-movimientos><thead><tr><th>Fecha</th><th>Origen</th><th>Detalle</th><th class="num">Cantidad</th></tr></thead><tbody>` +
        [...propios]
          .reverse()
          .map(
            (m) =>
              `<tr><td>${esc(fecha(m.at))}</td>` +
              `<td>${m.origen === "ajuste" ? "Ajuste" : m.delta < 0 ? "Entrega" : "Recepción"}</td>` +
              `<td>${
                m.origen === "ajuste"
                  ? esc(m.motivo ?? "")
                  : `<a href="${esc(withDev(viewer, `/expedientes/${m.expedienteId}`))}">${esc(labelExp(m.expedienteId!))}</a>`
              }</td>` +
              `<td class="num">${m.delta > 0 ? "+" : "−"}${esc(formatCantidad(Math.abs(m.delta)))} ${esc(u)}</td></tr>`,
          )
          .join("") +
        `</tbody></table>`);

  return (
    errorList(errors) +
    `<p class="toolbar"><a href="${esc(withDev(viewer, "/stock"))}">← Todo el stock</a><a href="${esc(withDev(viewer, `/ofertas/${oferta.ofertaId}`))}">Ficha del producto</a></p>` +
    resumen +
    ajuste +
    config +
    historial
  );
}
