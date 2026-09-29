/**
 * Facturas: expedir desde un expediente, ver / imprimir, rectificar, y datos
 * fiscales de la empresa emisora.
 *
 *   GET  /facturas                        listado (+ comprobación de la cadena)
 *   GET  /facturas/:id                    factura imprimible
 *   POST /facturas/:id/rectificar         rectificativa total (motivo)
 *   POST /expedientes/:id/factura         expedir la factura del expediente
 *   GET  /empresa · POST /empresa          datos fiscales del emisor
 *
 * Solo roles internos.
 */

import type { IncomingMessage } from "node:http";
import { formatCentimos } from "../elements/oferta.js";
import {
  nifValido,
  normalizarNif,
  validarEmisor,
  verificarCadena,
  type Factura,
} from "../elements/factura.js";
import { formatCantidad, totalesLinea } from "../elements/transaccion.js";
import {
  errorList,
  esc,
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

/** Script del botón Imprimir (archivo propio: la CSP de producción no admite JS en línea). */
export const IMPRIMIR_JS =
  'document.querySelectorAll("[data-imprimir]").forEach(function (b) { b.addEventListener("click", function () { window.print(); }); });\n';

export function isFacturasPath(path: string): boolean {
  return (
    path === "/facturas" ||
    path.startsWith("/facturas/") ||
    path === "/empresa" ||
    /^\/expedientes\/[^/]+\/factura$/.test(path)
  );
}

export async function handleFacturas(
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
    if (!moduloEnApp(ctx, "facturas")) return noDisponible(ctx, who.viewer, "La facturación");
    return routeGet(ctx, who.viewer, path, query);
  }
  if (method === "POST") {
    const form = await readForm();
    const who = identifyPost(ctx, req, form);
    if ("response" in who) return who.response;
    if (!moduloEnApp(ctx, "facturas")) return noDisponible(ctx, who.viewer, "La facturación");
    return routePost(ctx, who.viewer, who.accountId, path, form);
  }
  return text(405, "Método no permitido");
}

function routeGet(
  ctx: MaestrosContext,
  viewer: Viewer,
  path: string,
  query: Record<string, string>,
): MaestrosResponse {
  const { runtime } = ctx;
  if (path === "/facturas") {
    return html(200, page(ctx, viewer, "Facturas", listado(ctx, viewer)));
  }
  if (path === "/empresa") {
    const e = runtime.facturas.getEmisor(runtime.tenantId);
    return html(
      200,
      page(ctx, viewer, "Datos de la empresa", okNotice(query.ok) + empresaForm(viewer, {
        razonSocial: e?.razonSocial ?? "",
        nif: e?.nif ?? "",
        domicilio: e?.domicilio ?? "",
      })),
    );
  }
  const m = /^\/facturas\/([^/]+)$/.exec(path);
  if (m) {
    const f = ID_RE.test(m[1]!) ? runtime.facturas.get(runtime.tenantId, m[1]!) : undefined;
    if (!f) return notFound(ctx, viewer, "Esa factura no existe.");
    return html(200, page(ctx, viewer, `Factura ${f.codigo}`, documento(ctx, viewer, f, query)));
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

  if (path === "/empresa") {
    const values = {
      razonSocial: (form.razonSocial ?? "").trim(),
      nif: normalizarNif(form.nif ?? ""),
      domicilio: (form.domicilio ?? "").trim(),
    };
    const errors = validarEmisor(values);
    if (errors.length > 0) {
      return html(422, page(ctx, viewer, "Datos de la empresa", empresaForm(viewer, values, errors)));
    }
    runtime.facturas.putEmisor(runtime.tenantId, values, new Date().toISOString());
    return redirect(withDev(viewer, "/empresa", { ok: "guardada" }));
  }

  const exp = /^\/expedientes\/([^/]+)\/factura$/.exec(path);
  if (exp) {
    const id = exp[1]!;
    if (!ID_RE.test(id) || !runtime.datosDe(id)) return notFound(ctx, viewer, "Ese expediente no existe.");
    const r = runtime.expedirFactura(id, accountId);
    if (!r.ok) {
      return html(
        409,
        page(ctx, viewer, "No se puede facturar", `<p class="err" role="alert">${esc(r.error)}</p>` +
          `<p><a href="${esc(withDev(viewer, `/expedientes/${id}`))}">Volver al expediente</a></p>`),
      );
    }
    return redirect(withDev(viewer, `/facturas/${r.factura.id}`, { ok: "creada" }));
  }

  const rect = /^\/facturas\/([^/]+)\/rectificar$/.exec(path);
  if (rect) {
    const id = rect[1]!;
    const f = ID_RE.test(id) ? runtime.facturas.get(runtime.tenantId, id) : undefined;
    if (!f) return notFound(ctx, viewer, "Esa factura no existe.");
    const r = runtime.rectificarFactura(id, form.motivo ?? "", accountId);
    if (!r.ok) {
      return html(422, page(ctx, viewer, `Factura ${f.codigo}`, documento(ctx, viewer, f, {}, [r.error])));
    }
    return redirect(withDev(viewer, `/facturas/${r.factura.id}`, { ok: "creada" }));
  }

  return notFound(ctx, viewer, "Página no encontrada.");
}

// ─── Vistas ─────────────────────────────────────────────────────────────

const TIPO_LABEL: Readonly<Record<Factura["tipo"], string>> = {
  completa: "Factura",
  simplificada: "Factura simplificada",
  rectificativa: "Factura rectificativa",
};

function fechaEs(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function listado(ctx: MaestrosContext, viewer: Viewer): string {
  const { runtime } = ctx;
  const todas = runtime.facturas.list(runtime.tenantId);
  const cadena = verificarCadena(todas);
  const rectificadas = new Set(todas.filter((f) => f.rectificaA).map((f) => f.rectificaA));
  const emisor = runtime.facturas.getEmisor(runtime.tenantId);
  const aviso = emisor
    ? ""
    : `<p class="err">Antes de facturar, completa los <a href="${esc(withDev(viewer, "/empresa"))}">datos de la empresa</a>.</p>`;
  const integridad = cadena.ok
    ? `<p class="meta" data-cadena="ok">Registro íntegro: ${todas.length} factura(s), ninguna alterada.</p>`
    : `<p class="err" data-cadena="rota">¡Atención! La factura ${esc(cadena.codigo)} no coincide con el registro: alguien la ha modificado fuera de la aplicación.</p>`;
  if (todas.length === 0) {
    return aviso + `<p class="empty" data-facturas-vacio>Todavía no hay facturas. Se expiden desde la ficha de cada expediente.</p>`;
  }
  const rows = [...todas]
    .reverse()
    .map(
      (f) =>
        `<tr data-factura="${esc(f.codigo)}"><td><a href="${esc(withDev(viewer, `/facturas/${f.id}`))}">${esc(f.codigo)}</a></td>` +
        `<td>${esc(fechaEs(f.fechaExpedicion))}</td><td>${esc(TIPO_LABEL[f.tipo])}</td>` +
        `<td>${esc(f.receptor?.nombre ?? runtime.nombreParte(f.parteId))}</td>` +
        `<td>${f.rectificaA ? `Rectifica ${esc(f.rectificaA)}` : rectificadas.has(f.codigo) ? "Rectificada" : ""}</td>` +
        `<td class="num">${esc(formatCentimos(f.total))}</td></tr>`,
    )
    .join("");
  return (
    aviso +
    integridad +
    `<table data-facturas><thead><tr><th>Número</th><th>Fecha</th><th>Tipo</th><th>Cliente</th><th></th><th class="num">Total</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`
  );
}

function documento(
  ctx: MaestrosContext,
  viewer: Viewer,
  f: Factura,
  query: Record<string, string>,
  errors: readonly string[] = [],
): string {
  const { runtime } = ctx;
  const eur = (c: number) => esc(formatCentimos(c));
  const rectificadaPor = runtime.facturas
    .porExpediente(runtime.tenantId, f.expedienteId)
    .find((x) => x.rectificaA === f.codigo);

  const barra =
    `<div class="toolbar no-print">` +
    `<button type="button" data-imprimir>Imprimir o guardar en PDF</button>` +
    `<a href="${esc(withDev(viewer, `/expedientes/${f.expedienteId}`))}">Ver expediente</a>` +
    `<a href="${esc(withDev(viewer, "/facturas"))}">Todas las facturas</a>` +
    `</div>`;

  const estado = rectificadaPor
    ? `<p class="err no-print" data-rectificada>Rectificada por <a href="${esc(withDev(viewer, `/facturas/${rectificadaPor.id}`))}">${esc(rectificadaPor.codigo)}</a>.</p>`
    : "";

  const cabecera =
    `<div class="factura-cab">` +
    `<div><strong>${esc(f.emisor.razonSocial)}</strong><br>NIF ${esc(f.emisor.nif)}<br>${esc(f.emisor.domicilio)}</div>` +
    `<div class="factura-num"><div class="factura-tipo">${esc(TIPO_LABEL[f.tipo])}</div>` +
    `<div>Nº <strong data-codigo>${esc(f.codigo)}</strong></div>` +
    `<div>Fecha: ${esc(fechaEs(f.fechaExpedicion))}</div>` +
    (f.fechaOperacion ? `<div>Fecha de la operación: ${esc(fechaEs(f.fechaOperacion))}</div>` : "") +
    `</div></div>` +
    (f.receptor
      ? `<div class="factura-cliente"><span class="meta">Cliente</span><br><strong>${esc(f.receptor.nombre)}</strong>` +
        (f.receptor.nif ? `<br>NIF ${esc(f.receptor.nif)}` : "") +
        (f.receptor.domicilio ? `<br>${esc(f.receptor.domicilio)}` : "") +
        `</div>`
      : "") +
    (f.rectificaA
      ? `<p data-rectifica>Rectifica la factura <strong>${esc(f.rectificaA)}</strong>. Motivo: ${esc(f.motivo ?? "")}</p>`
      : "");

  const lineas =
    `<table class="factura-lineas"><thead><tr><th>Concepto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">IVA</th><th class="num">Importe</th></tr></thead><tbody>` +
    f.lineas
      .map(
        (l) =>
          `<tr><td>${esc(l.descripcion)}</td><td class="num">${esc(formatCantidad(l.cantidadMilesimas))}</td>` +
          `<td class="num">${eur(l.precioCentimos)}</td><td class="num">${l.ivaPct} %</td>` +
          `<td class="num">${eur(totalesLinea(l).base)}</td></tr>`,
      )
      .join("") +
    `</tbody></table>`;

  const desglose =
    `<table class="factura-totales" data-desglose><tbody>` +
    f.desglose
      .map(
        (d) =>
          `<tr><td>Base imponible al ${d.tipo} %</td><td class="num">${eur(d.base)}</td></tr>` +
          `<tr><td>IVA ${d.tipo} %</td><td class="num">${eur(d.cuota)}</td></tr>`,
      )
      .join("") +
    `<tr class="total"><td>Total</td><td class="num" data-total>${eur(f.total)}</td></tr>` +
    `</tbody></table>`;

  const pie =
    `<p class="meta factura-pie">Huella: <code>${esc(f.huella.slice(0, 16))}…</code></p>`;

  const rectificar =
    f.tipo !== "rectificativa" && !rectificadaPor
      ? `<details class="no-print"><summary>Rectificar esta factura</summary>` +
        errorList(errors) +
        `<form method="post" action="${esc(`/facturas/${f.id}/rectificar`)}" data-rectificar-form>` +
        hiddenIdentity(viewer) +
        `<p class="meta">Se expide una factura rectificativa con los importes en negativo. La original no se borra. Después podrás volver a facturar el expediente.</p>` +
        `<label>Motivo * <input name="motivo" required maxlength="300" placeholder="Error en el precio, devolución…" /></label>` +
        `<button type="submit" class="secondary">Expedir rectificativa</button>` +
        `</form></details>`
      : errorList(errors);

  return (
    okNotice(query.ok === "creada" ? "factura" : query.ok) +
    barra +
    estado +
    `<article class="factura" data-factura-doc="${esc(f.codigo)}">${cabecera}${lineas}${desglose}${pie}</article>` +
    rectificar +
    `<script src="/imprimir.js"></script>`
  );
}

function empresaForm(
  viewer: Viewer,
  values: { razonSocial: string; nif: string; domicilio: string },
  errors: readonly string[] = [],
): string {
  const aviso =
    values.nif && !nifValido(values.nif) && errors.length === 0
      ? `<p class="err">El NIF guardado no es válido.</p>`
      : "";
  return (
    errorList(errors) +
    aviso +
    `<p class="meta">Estos datos aparecen como emisor en cada factura. Las facturas ya expedidas conservan los datos que tenían.</p>` +
    `<form method="post" action="/empresa" data-empresa-form>` +
    hiddenIdentity(viewer) +
    `<label>Razón social o nombre * <input name="razonSocial" required maxlength="200" value="${esc(values.razonSocial)}" /></label>` +
    `<label>NIF / CIF * <input name="nif" required maxlength="20" value="${esc(values.nif)}" /></label>` +
    `<label>Domicilio fiscal * <input name="domicilio" required maxlength="300" value="${esc(values.domicilio)}" /></label>` +
    `<button type="submit">Guardar</button>` +
    `</form>`
  );
}
