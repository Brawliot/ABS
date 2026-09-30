/**
 * Expedientes con datos (transacción viva): alta, ficha y edición.
 *
 *   GET  /expedientes/nuevo?proceso=<lifecycleId>   formulario de alta
 *   POST /expedientes                               alta (evento `alta`)
 *   GET  /expedientes/:id                           ficha: datos, líneas, totales, historial
 *   GET  /expedientes/:id/editar                    formulario de edición
 *   POST /expedientes/:id                           guardar cambios (evento `datos`)
 *
 * El estado sigue avanzando solo por POST /action (Intérprete → Juez).
 * Solo roles internos.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { DomainEvent, TransaccionDatos } from "../core/events.js";
import {
  IVA_TIPOS,
  formatCentimos,
  parseImporteCentimos,
  type OfertaRecord,
} from "../elements/oferta.js";
import { PARTE_SUBTYPE_LABELS } from "../elements/parte.js";
import { crearEtiquetador } from "../presentation/etiquetas.js";
import type { CampoProceso } from "./runtime.js";
import {
  calcularTotales,
  formatCantidad,
  parseCantidadMilesimas,
  type EntradaTransaccion,
  type LineaEntrada,
} from "../elements/transaccion.js";
import {
  errorList,
  esc,
  fecha,
  hiddenIdentity,
  html,
  identifyGet,
  identifyPost,
  moduloEnApp,
  notFound,
  okNotice,
  page,
  redirect,
  rememberRequest,
  seenRequest,
  text,
  withDev,
  type MaestrosContext,
  type MaestrosResponse,
  type Viewer,
} from "./maestros.js";

const ID_RE = /^[A-Za-z0-9._-]{1,120}$/;
const FILAS_EXTRA = 3;
const FILAS_NUEVO = 5;
const MAX_FILAS = 50;

export function isExpedientesPath(path: string): boolean {
  return path === "/expedientes" || path.startsWith("/expedientes/");
}

export async function handleExpedientes(
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
    return routePost(ctx, who.viewer, who.accountId, path, form);
  }
  return text(405, "Método no permitido");
}

// ─── GET ────────────────────────────────────────────────────────────────

function routeGet(
  ctx: MaestrosContext,
  viewer: Viewer,
  path: string,
  query: Record<string, string>,
): MaestrosResponse {
  const { runtime } = ctx;

  if (path === "/expedientes/nuevo") {
    const slice = runtime.boot.input.lifecycles.find((l) => l.id === query.proceso);
    if (!slice) return notFound(ctx, viewer, "Ese proceso no existe.");
    return html(
      200,
      page(
        ctx,
        viewer,
        `Nuevo: ${procesoLabel(ctx, slice.id)}`,
        expedienteForm(ctx, viewer, slice.id, "/expedientes", {
          proceso: slice.id,
          fecha: new Date().toISOString().slice(0, 10),
        }, FILAS_NUEVO),
      ),
    );
  }

  const editar = /^\/expedientes\/([^/]+)\/editar$/.exec(path);
  if (editar) {
    const id = editar[1]!;
    const tx = ID_RE.test(id) ? runtime.datosDe(id) : undefined;
    if (!tx) return notFound(ctx, viewer, "Ese expediente no existe.");
    if (!runtime.puedeEditarDatos(id)) {
      return html(
        409,
        page(ctx, viewer, subjectLabel(ctx, id), noEditable(viewer, id)),
      );
    }
    const values = valuesFromDatos(tx.datos);
    return html(
      200,
      page(
        ctx,
        viewer,
        `Editar ${subjectLabel(ctx, id)}`,
        expedienteForm(ctx, viewer, tx.lifecycleId, `/expedientes/${id}`, values, tx.datos.lineas.length + FILAS_EXTRA, tx.datos),
      ),
    );
  }

  const ficha = /^\/expedientes\/([^/]+)$/.exec(path);
  if (ficha) {
    const id = ficha[1]!;
    const tx = ID_RE.test(id) ? runtime.datosDe(id) : undefined;
    if (!tx) return notFound(ctx, viewer, "Ese expediente no existe.");
    return html(
      200,
      page(ctx, viewer, subjectLabel(ctx, id), okNotice(query.ok) + fichaHtml(ctx, viewer, id)),
    );
  }

  return notFound(ctx, viewer, "Página no encontrada.");
}

// ─── POST ───────────────────────────────────────────────────────────────

function routePost(
  ctx: MaestrosContext,
  viewer: Viewer,
  accountId: string,
  path: string,
  form: Record<string, string>,
): MaestrosResponse {
  const { runtime } = ctx;

  if (path === "/expedientes") {
    const slice = runtime.boot.input.lifecycles.find((l) => l.id === form.proceso);
    if (!slice) return notFound(ctx, viewer, "Ese proceso no existe.");
    const title = `Nuevo: ${procesoLabel(ctx, slice.id)}`;
    if (form.accion === "mas") {
      return html(200, page(ctx, viewer, title, expedienteForm(ctx, viewer, slice.id, "/expedientes", form, filas(form) + FILAS_EXTRA)));
    }
    const previous = seenRequest(runtime, form.clientRequestId);
    if (previous) return redirect(withDev(viewer, `/expedientes/${previous}`));

    const parsed = parseExpedienteForm(form, slice.id, runtime.camposDeProceso(slice.id));
    const result = parsed.ok
      ? runtime.crearTransaccion(parsed.value, accountId)
      : parsed;
    if (!result.ok) {
      return html(
        422,
        page(ctx, viewer, title, expedienteForm(ctx, viewer, slice.id, "/expedientes", form, filas(form), undefined, result.errors)),
      );
    }
    rememberRequest(runtime, form.clientRequestId, result.id);
    return redirect(withDev(viewer, `/expedientes/${result.id}`, { ok: "creada" }));
  }

  const m = /^\/expedientes\/([^/]+)$/.exec(path);
  if (m) {
    const id = m[1]!;
    const tx = ID_RE.test(id) ? runtime.datosDe(id) : undefined;
    if (!tx) return notFound(ctx, viewer, "Ese expediente no existe.");
    const title = `Editar ${subjectLabel(ctx, id)}`;
    if (!runtime.puedeEditarDatos(id)) {
      return html(409, page(ctx, viewer, subjectLabel(ctx, id), noEditable(viewer, id)));
    }
    if (form.accion === "mas") {
      return html(200, page(ctx, viewer, title, expedienteForm(ctx, viewer, tx.lifecycleId, `/expedientes/${id}`, form, filas(form) + FILAS_EXTRA, tx.datos)));
    }
    const parsed = parseExpedienteForm(form, tx.lifecycleId, runtime.camposDeProceso(tx.lifecycleId));
    const result = parsed.ok
      ? runtime.editarTransaccion(id, parsed.value, accountId)
      : parsed;
    if (!result.ok) {
      return html(
        422,
        page(ctx, viewer, title, expedienteForm(ctx, viewer, tx.lifecycleId, `/expedientes/${id}`, form, filas(form), tx.datos, result.errors)),
      );
    }
    return redirect(withDev(viewer, `/expedientes/${id}`, { ok: "guardada" }));
  }

  return notFound(ctx, viewer, "Página no encontrada.");
}

// ─── Formulario ─────────────────────────────────────────────────────────

function filas(form: Record<string, string>): number {
  const n = Number(form.numLineas);
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_FILAS) : FILAS_NUEVO;
}

/**
 * Formulario → entrada del runtime. Una fila sin oferta ni descripción se
 * ignora; la cantidad vacía vale 1.
 */
export function parseExpedienteForm(
  form: Record<string, string>,
  lifecycleId: string,
  camposProceso: readonly CampoProceso[] = [],
): { ok: true; value: EntradaTransaccion } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const lineas: LineaEntrada[] = [];
  for (let i = 0; i < filas(form); i++) {
    const ofertaId = (form[`l${i}_oferta`] ?? "").trim();
    const descripcion = (form[`l${i}_desc`] ?? "").trim();
    if (!ofertaId && !descripcion) continue;
    const n = lineas.length + 1;
    const cantRaw = (form[`l${i}_cant`] ?? "").trim() || "1";
    const cantidad = parseCantidadMilesimas(cantRaw);
    if (cantidad === null) {
      errors.push(`Línea ${n}: la cantidad no es válida (ejemplo: 1 o 2,5).`);
      continue;
    }
    const precioRaw = (form[`l${i}_precio`] ?? "").trim();
    const precio = precioRaw === "" ? undefined : parseImporteCentimos(precioRaw);
    if (precio === null) {
      errors.push(`Línea ${n}: el precio no es válido (ejemplo: 12,50).`);
      continue;
    }
    const iva = Number(form[`l${i}_iva`] ?? "21");
    lineas.push({
      ...(ofertaId ? { ofertaId } : {}),
      ...(descripcion ? { descripcion } : {}),
      cantidadMilesimas: cantidad,
      ...(precio !== undefined ? { precioCentimos: precio } : {}),
      ...(!ofertaId ? { ivaPct: iva } : {}),
    });
  }
  const campos: Record<string, number | boolean | string> = {};
  for (const c of camposProceso) {
    const raw = (form[`campo_${c.campo}`] ?? "").trim();
    if (c.tipo === "si_no") {
      campos[c.campo] = raw === "1";
    } else if (c.tipo === "numero") {
      if (raw === "") continue;
      if (!/^\d+([.,]\d+)?$/.test(raw)) {
        errors.push(`«${humanizarCampo(c.campo)}» no es un número válido.`);
        continue;
      }
      campos[c.campo] = Number(raw.replace(",", "."));
    } else if (raw !== "") {
      campos[c.campo] = raw;
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const vinculadoA = (form.vinculadoA ?? "").trim();
  return {
    ok: true,
    value: {
      lifecycleId,
      parteId: (form.clienteId ?? "").trim(),
      fecha: (form.fecha ?? "").trim(),
      referencia: form.referencia ?? "",
      notas: form.notas ?? "",
      lineas,
      ...(Object.keys(campos).length > 0 ? { campos } : {}),
      ...(vinculadoA ? { vinculadoA } : {}),
    },
  };
}

/** Nombre legible de un dato adicional sin vocabulario (mensajes del formulario). */
function humanizarCampo(campo: string): string {
  return crearEtiquetador({ lifecycles: [] }).campo(campo);
}

function valuesFromDatos(d: TransaccionDatos): Record<string, string> {
  const out: Record<string, string> = {
    clienteId: d.parteId,
    fecha: d.fecha,
    referencia: d.referencia ?? "",
    notas: d.notas ?? "",
    ...(d.vinculadoA ? { vinculadoA: d.vinculadoA } : {}),
  };
  for (const [k, v] of Object.entries(d.campos ?? {})) {
    out[`campo_${k}`] = typeof v === "boolean" ? (v ? "1" : "") : String(v).replace(".", ",");
  }
  d.lineas.forEach((l, i) => {
    out[`l${i}_oferta`] = l.ofertaId ?? "";
    out[`l${i}_desc`] = l.descripcion;
    out[`l${i}_cant`] = formatCantidad(l.cantidadMilesimas);
    out[`l${i}_precio`] = formatCentimos(l.precioCentimos).replace(" €", "");
    out[`l${i}_iva`] = String(l.ivaPct);
  });
  return out;
}

function expedienteForm(
  ctx: MaestrosContext,
  viewer: Viewer,
  lifecycleId: string,
  action: string,
  values: Record<string, string | undefined>,
  numFilas: number,
  previos?: TransaccionDatos,
  errors: readonly string[] = [],
): string {
  const { runtime } = ctx;
  const tenant = runtime.tenantId;
  const v = (k: string) => esc(values[k] ?? "");
  const n = Math.min(Math.max(numFilas, 1), MAX_FILAS);

  const partes = runtime.partes
    .list(tenant)
    .filter((p) => !p.erasedAt && p.personal)
    .sort((a, b) => a.personal!.displayName.localeCompare(b.personal!.displayName, "es"));
  const parteOpts =
    `<option value="">— Elige —</option>` +
    partes
      .map(
        (p) =>
          `<option value="${esc(p.parteId)}"${values.clienteId === p.parteId ? " selected" : ""}>` +
          `${esc(p.personal!.displayName)}${p.subtype ? ` (${esc(PARTE_SUBTYPE_LABELS[p.subtype])})` : ""}</option>`,
      )
      .join("");

  // Ofertas activas + las que ya están en el expediente aunque se desactivaran
  const usadas = new Set((previos?.lineas ?? []).map((l) => l.ofertaId).filter(Boolean));
  const ofertas = runtime.ofertas
    .list(tenant)
    .filter((o) => o.activa || usadas.has(o.ofertaId));
  const ofertaOpts = (selected: string | undefined) =>
    `<option value="">— Línea libre —</option>` +
    ofertas
      .map(
        (o: OfertaRecord) =>
          `<option value="${esc(o.ofertaId)}"${selected === o.ofertaId ? " selected" : ""}>` +
          `${esc(o.nombre)} — ${esc(formatCentimos(o.precioCentimos))} + ${o.ivaPct} %</option>`,
      )
      .join("");
  const ivaOpts = (selected: string | undefined) =>
    IVA_TIPOS.map(
      (i) => `<option value="${i}"${(selected ?? "21") === String(i) ? " selected" : ""}>${i} %</option>`,
    ).join("");

  const rows = Array.from({ length: n }, (_, i) => {
    const k = (f: string) => `l${i}_${f}`;
    return (
      `<tr data-linea="${i}">` +
      `<td><select name="${k("oferta")}" aria-label="Producto o servicio, línea ${i + 1}">${ofertaOpts(values[k("oferta")])}</select></td>` +
      `<td><input name="${k("desc")}" maxlength="200" aria-label="Descripción, línea ${i + 1}" placeholder="(la del catálogo)" value="${v(k("desc"))}" /></td>` +
      `<td><input name="${k("cant")}" inputmode="decimal" aria-label="Cantidad, línea ${i + 1}" placeholder="1" value="${v(k("cant"))}" /></td>` +
      `<td><input name="${k("precio")}" inputmode="decimal" aria-label="Precio sin IVA, línea ${i + 1}" placeholder="(del catálogo)" value="${v(k("precio"))}" /></td>` +
      `<td><select name="${k("iva")}" aria-label="IVA, línea ${i + 1}">${ivaOpts(values[k("iva")])}</select></td>` +
      `</tr>`
    );
  }).join("");

  const sinPartes =
    partes.length === 0
      ? `<p class="err">No hay clientes ni proveedores. <a href="${esc(withDev(viewer, "/partes/nueva"))}">Da de alta el primero</a>.</p>`
      : "";
  const sinOfertas =
    ofertas.length === 0
      ? `<p class="meta">El catálogo está vacío: puedes usar líneas libres o <a href="${esc(withDev(viewer, "/ofertas/nueva"))}">añadir productos</a>.</p>`
      : "";

  return (
    errorList(errors) +
    sinPartes +
    `<form method="post" action="${esc(action)}" class="wide" data-expediente-form>` +
    hiddenIdentity(viewer) +
    `<input type="hidden" name="clientRequestId" value="${esc(values.clientRequestId ?? randomUUID())}" />` +
    `<input type="hidden" name="numLineas" value="${n}" />` +
    (values.proceso ? `<input type="hidden" name="proceso" value="${v("proceso")}" />` : "") +
    `<div class="grid2">` +
    `<label>Cliente / proveedor * <select name="clienteId" required>${parteOpts}</select></label>` +
    `<label>Fecha * <input name="fecha" type="date" required value="${v("fecha")}" /></label>` +
    `<label>Referencia <input name="referencia" maxlength="100" placeholder="matrícula, mesa, nº de obra…" value="${v("referencia")}" /></label>` +
    `</div>` +
    `<h2>Líneas</h2>` +
    sinOfertas +
    `<p class="meta">Elige un producto del catálogo (precio e IVA se copian) o escribe una línea libre. Las filas vacías se ignoran.</p>` +
    `<div class="scroll"><table class="lineas"><thead><tr><th>Producto / servicio</th><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio sin IVA (€)</th><th>IVA</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>` +
    (n < MAX_FILAS
      ? `<button type="submit" name="accion" value="mas" class="secondary" formnovalidate>+ Más líneas</button>`
      : "") +
    camposHtml(ctx, lifecycleId, values) +
    fichasHtml(ctx, lifecycleId, values) +
    principalHtml(ctx, lifecycleId, values) +
    `<label>Notas <textarea name="notas" rows="3" maxlength="2000">${v("notas")}</textarea></label>` +
    `<button type="submit" name="accion" value="guardar">Guardar</button>` +
    `</form>`
  );
}

// ─── Ficha ──────────────────────────────────────────────────────────────

function fichaHtml(ctx: MaestrosContext, viewer: Viewer, id: string): string {
  const { runtime } = ctx;
  const tx = runtime.datosDe(id)!;
  const estado = runtime.estadoDe(id);
  const totales = calcularTotales(tx.datos.lineas);
  const d = tx.datos;
  const cliente = runtime.nombreParte(d.parteId);

  const acciones =
    `<p class="toolbar">` +
    (runtime.puedeEditarDatos(id)
      ? `<a class="btn" href="${esc(withDev(viewer, `/expedientes/${id}/editar`))}" data-editar-expediente>Editar datos</a> `
      : "") +
    `<a href="${esc(tableroHref(ctx, viewer, tx.lifecycleId, estado?.id))}" data-ir-tablero>Ir al tablero para avanzar su estado →</a>` +
    `</p>`;

  const cabecera =
    `<dl class="ficha" data-expediente="${esc(id)}">` +
    `<dt>Estado</dt><dd><strong data-estado="${esc(estado?.id ?? "")}">${esc(estado?.label ?? "—")}</strong></dd>` +
    `<dt>Proceso</dt><dd>${esc(procesoLabel(ctx, tx.lifecycleId))}</dd>` +
    `<dt>Cliente / proveedor</dt><dd><a href="${esc(withDev(viewer, `/partes/${d.parteId}`))}" data-cliente>${esc(cliente)}</a></dd>` +
    `<dt>Fecha</dt><dd>${esc(d.fecha)}</dd>` +
    (d.referencia ? `<dt>Referencia</dt><dd>${esc(d.referencia)}</dd>` : "") +
    (d.notas ? `<dt>Notas</dt><dd class="notas">${esc(d.notas)}</dd>` : "") +
    Object.entries(d.campos ?? {})
      .map(([k, val]) => {
        if (k.startsWith("ficha_")) {
          const fichaId = k.slice(6);
          const fichaVal = String(val);
          const ficha = runtime.fichas.get(runtime.tenantId, fichaId, fichaVal);
          if (ficha) {
            return `<dt>${esc(runtime.etiquetas.campo(k))}</dt><dd data-ficha="${esc(k)}"><a href="${esc(withDev(viewer, `/fichas/${fichaId}/${fichaVal}`))}">${esc(String(ficha.valores.nombre || ficha.id))}</a></dd>`;
          }
        }
        return `<dt>${esc(runtime.etiquetas.campo(k))}</dt><dd data-campo="${esc(k)}">${esc(typeof val === "boolean" ? (val ? "Sí" : "No") : String(val).replace(".", ","))}</dd>`;
      })
      .join("") +
    (d.vinculadoA
      ? `<dt>Expediente principal</dt><dd><a href="${esc(withDev(viewer, `/expedientes/${d.vinculadoA}`))}" data-principal>${esc(subjectLabel(ctx, d.vinculadoA))}</a></dd>`
      : "") +
    (runtime.vinculadosA(id).length > 0
      ? `<dt>Vinculados</dt><dd data-vinculados>${runtime
          .vinculadosA(id)
          .map((s) => `<a href="${esc(withDev(viewer, `/expedientes/${s.id}`))}">${esc(s.label)}</a> (${esc(runtime.estadoDe(s.id)?.label ?? "")})`)
          .join(", ")}</dd>`
      : "") +
    `</dl>`;

  const lineas =
    `<h2>Líneas</h2><div class="scroll"><table data-lineas><thead><tr><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">IVA</th><th class="num">Base</th><th class="num">Total</th></tr></thead><tbody>` +
    d.lineas
      .map((l, i) => {
        const t = totales.lineas[i]!;
        return (
          `<tr><td>${esc(l.descripcion)}${l.ofertaId ? "" : ' <span class="meta">(libre)</span>'}</td>` +
          `<td class="num">${esc(formatCantidad(l.cantidadMilesimas))}</td>` +
          `<td class="num">${esc(formatCentimos(l.precioCentimos))}</td>` +
          `<td class="num">${l.ivaPct} %</td>` +
          `<td class="num">${esc(formatCentimos(t.base))}</td>` +
          `<td class="num">${esc(formatCentimos(t.total))}</td></tr>`
        );
      })
      .join("") +
    `</tbody><tfoot>` +
    `<tr><td colspan="5">Base imponible</td><td class="num">${esc(formatCentimos(totales.base))}</td></tr>` +
    Object.entries(totales.ivaPorTipo)
      .filter(([, cuota]) => cuota !== 0)
      .map(([tipo, cuota]) => `<tr><td colspan="5">IVA ${esc(tipo)} %</td><td class="num">${esc(formatCentimos(cuota))}</td></tr>`)
      .join("") +
    `<tr class="total"><td colspan="5">Total</td><td class="num" data-total>${esc(formatCentimos(totales.total))}</td></tr>` +
    `</tfoot></table></div>`;

  return (
    acciones +
    cabecera +
    dineroHtml(ctx, id) +
    (moduloEnApp(ctx, "stock") ? stockAviso(ctx, viewer, id) : "") +
    (moduloEnApp(ctx, "facturas") ? facturaHtml(ctx, viewer, id) : "") +
    lineas +
    historialHtml(ctx, id)
  );
}

/** Aviso (no bloquea) si faltan existencias para servir el expediente. */
function stockAviso(ctx: MaestrosContext, viewer: Viewer, id: string): string {
  const faltas = ctx.runtime.faltasStock(id);
  if (faltas.length === 0) return "";
  const items = faltas
    .map((f) => {
      const o = ctx.runtime.ofertas.get(ctx.runtime.tenantId, f.ofertaId);
      const u = o?.unidad ?? "ud";
      return (
        `<li><a href="${esc(withDev(viewer, `/stock/${f.ofertaId}`))}">${esc(o?.nombre ?? "Producto")}</a>: ` +
        `hacen falta ${esc(formatCantidad(f.necesita))} ${esc(u)} y hay ${esc(formatCantidad(Math.max(0, f.disponible)))} disponibles</li>`
      );
    })
    .join("");
  return `<div class="dinero err" role="status" data-falta-stock><strong>Falta stock</strong><ul>${items}</ul></div>`;
}

/** Factura del expediente: la vigente, el botón para expedirla o por qué no se puede. */
function facturaHtml(ctx: MaestrosContext, viewer: Viewer, id: string): string {
  const f = ctx.runtime.facturacionDe(id);
  const link = (fac: { id: string; codigo: string }) =>
    `<a href="${esc(withDev(viewer, `/facturas/${fac.id}`))}">${esc(fac.codigo)}</a>`;
  const anteriores = f.historial.filter((x) => x.id !== f.vigente?.id);
  const historia =
    anteriores.length > 0
      ? `<br><span class="meta">Anteriores: ${anteriores.map(link).join(", ")}</span>`
      : "";
  if (f.vigente) {
    return `<p class="dinero" data-factura-vigente>Factura ${link(f.vigente)} · ${esc(formatCentimos(f.vigente.total))}${historia}</p>`;
  }
  if (!f.puede) {
    return `<p class="dinero" data-factura-no>${esc(f.motivo)}${historia}</p>`;
  }
  return (
    `<form method="post" action="${esc(`/expedientes/${id}/factura`)}" class="dinero" data-expedir-factura>` +
    hiddenIdentity(viewer) +
    `<span>${f.tipo === "completa" ? "Se expedirá una factura completa." : "Se expedirá una factura simplificada (el cliente no tiene NIF y dirección)."}</span> ` +
    `<button type="submit">Expedir factura</button>${historia}</form>`
  );
}

/** Situación económica del expediente: presupuesto, pendiente o liquidado. */
function dineroHtml(ctx: MaestrosContext, id: string): string {
  const e = ctx.runtime.expedientesDinero().find((x) => x.id === id);
  if (!e) return "";
  const cobro = e.direccion === "entra";
  const total = esc(formatCentimos(e.totalCentimos));
  let texto: string;
  switch (e.situacion) {
    case "presupuesto":
      texto = `Presupuesto de ${total}: aún no se ${cobro ? "debe" : "ha comprometido"} nada.`;
      break;
    case "pendiente":
      texto = `<strong>Pendiente de ${cobro ? "cobro" : "pago"}: ${total}</strong>`;
      break;
    case "liquidado":
      texto = e.movimientos
        .map((m) => `${cobro ? "Cobrado" : "Pagado"} ${esc(formatCentimos(m.importeCentimos))} el ${esc(fecha(m.at))}`)
        .join(" · ") || `${cobro ? "Cobrado" : "Pagado"}: ${total}`;
      break;
    default:
      texto = "Anulado: no hay importe que cobrar ni pagar.";
  }
  return `<p class="dinero" data-situacion="${e.situacion}" data-direccion="${e.direccion}">${texto}</p>`;
}

function historialHtml(ctx: MaestrosContext, id: string): string {
  const events = ctx.runtime.store.getBySubject(id) as readonly DomainEvent[];
  const items = [...events]
    .reverse()
    .map((e) => `<tr><td>${esc(fecha(e.occurredAt))}</td><td>${esc(actorLabel(e.actorId))}</td><td>${esc(describeEvent(ctx, e))}</td></tr>`)
    .join("");
  return (
    `<h2>Historial</h2><table data-historial><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th></tr></thead>` +
    `<tbody>${items}</tbody></table>`
  );
}

const CAMPO_LABELS: Readonly<Record<string, string>> = {
  parteId: "cliente",
  fecha: "fecha",
  referencia: "referencia",
  notas: "notas",
  lineas: "líneas",
};

function describeEvent(ctx: MaestrosContext, e: DomainEvent): string {
  switch (e.kind) {
    case "alta":
      return "Creado";
    case "datos":
      return `Datos cambiados: ${Object.keys(e.cambios).map((k) => CAMPO_LABELS[k] ?? k).join(", ")}`;
    case "transicion":
      return `Paso a «${stateLabel(ctx, e.subjectId, e.toStateId)}»`;
    case "excepcion":
    case "vencimiento":
      return `Terminado en «${stateLabel(ctx, e.subjectId, e.toStateId)}»`;
    case "modificacion":
      return `Nota: ${e.freeText}`;
    default:
      return "";
  }
}

function stateLabel(ctx: MaestrosContext, subjectId: string, stateId: string): string {
  return ctx.runtime.etiquetas.estado(ctx.runtime.lifecycleForSubject(subjectId)?.id, stateId);
}

function actorLabel(actorId: string): string {
  if (actorId === "sistema-demo") return "Sistema (demo)";
  if (actorId.startsWith("dev:")) return `${actorId.slice(4)} (desarrollo)`;
  return actorId;
}

// ─── Utilidades ─────────────────────────────────────────────────────────

function noEditable(viewer: Viewer, id: string): string {
  return (
    `<p class="err">Este expediente ya no está en su estado inicial: sus datos no se pueden cambiar.</p>` +
    `<p><a href="${esc(withDev(viewer, `/expedientes/${id}`))}">Volver a la ficha</a></p>`
  );
}

function procesoLabel(ctx: MaestrosContext, lifecycleId: string): string {
  const slice = ctx.runtime.boot.input.lifecycles.find((l) => l.id === lifecycleId);
  return slice ? ctx.runtime.etiquetas.proceso(slice.id) : lifecycleId;
}

function subjectLabel(ctx: MaestrosContext, id: string): string {
  return ctx.runtime.subjects.find((s) => s.id === id)?.label ?? id;
}

function tableroHref(
  ctx: MaestrosContext,
  viewer: Viewer,
  lifecycleId: string,
  stateId: string | undefined,
): string {
  const group = ctx.runtime.boot.spec.processGroups?.find((g) => g.lifecycleId === lifecycleId);
  const view = group?.viewIds.find((vid) =>
    ctx.runtime.boot.spec.views.some((v) => v.id === vid && v.stateId === stateId),
  );
  return withDev(viewer, "/", {
    ...(group ? { group: group.id } : {}),
    ...(view ? { view } : {}),
  });
}

/** «Datos adicionales» que piden las reglas del proceso. */
function camposHtml(
  ctx: MaestrosContext,
  lifecycleId: string,
  values: Record<string, string | undefined>,
): string {
  const campos = ctx.runtime.camposDeProceso(lifecycleId);
  if (campos.length === 0) return "";
  const inputs = campos
    .map((c) => {
      const name = `campo_${c.campo}`;
      const label = esc(ctx.runtime.etiquetas.campo(c.campo));
      if (c.tipo === "si_no") {
        return `<label><span><input type="checkbox" name="${esc(name)}" value="1"${values[name] === "1" ? " checked" : ""} /> ${label}</span></label>`;
      }
      return `<label>${label} <input name="${esc(name)}" ${c.tipo === "numero" ? 'inputmode="decimal" placeholder="0"' : ""} value="${esc(values[name] ?? "")}" /></label>`;
    })
    .join("");
  return `<fieldset class="grid2" data-campos><legend>Datos adicionales</legend>${inputs}</fieldset>`;
}

/** Fichas generadas del negocio que aplican a este proceso. */
function fichasHtml(
  ctx: MaestrosContext,
  lifecycleId: string,
  values: Record<string, string | undefined>,
): string {
  const { runtime, boot } = ctx;
  const tenant = runtime.tenantId;
  const fichas = (boot.input.fichas as Array<{ id: string; nombre: string; enProcesos?: readonly string[] }> | undefined) ?? [];

  // Buscar proceso para sus palabras
  const slice = boot.input.lifecycles.find((l) => l.id === lifecycleId);
  if (!slice) return "";
  const procesos = new Set((slice.nombre || "").toLowerCase().split(/\s+/));

  // Fichas que aplican a este proceso
  const aplicables = fichas.filter((f) => {
    if (!f.enProcesos || f.enProcesos.length === 0) return false;
    return (f.enProcesos as readonly string[]).some((p) => procesos.has(p.toLowerCase()));
  });

  if (aplicables.length === 0) return "";

  const selects = aplicables
    .map((f) => {
      const fieldName = `ficha_${f.id}`;
      const instancias = runtime.fichas.listar(tenant, f.id);
      const opts =
        `<option value="">— ${esc(f.nombre)} (sin elegir) —</option>` +
        instancias
          .map((inst) => {
            const label = inst.valores.nombre || inst.valores.descripcion || inst.id;
            return `<option value="${esc(inst.id)}"${values[fieldName] === inst.id ? " selected" : ""}>${esc(String(label))}</option>`;
          })
          .join("");
      return `<label>${esc(f.nombre)} <select name="${esc(fieldName)}" data-ficha="${esc(f.id)}">${opts}</select></label>`;
    })
    .join("");

  return `<fieldset class="grid2" data-fichas><legend>Elementos vinculados</legend>${selects}</fieldset>`;
}

/** Proceso secundario: a qué expediente principal pertenece. */
function principalHtml(
  ctx: MaestrosContext,
  lifecycleId: string,
  values: Record<string, string | undefined>,
): string {
  const { runtime } = ctx;
  if (!runtime.esSecundario(lifecycleId)) return "";
  const actual = values.vinculadoA;
  const opciones = runtime.principalesAbiertos().filter((s) => s.id !== actual);
  const actualSub = actual ? runtime.subjects.find((s) => s.id === actual) : undefined;
  const opts =
    `<option value="">— Ninguno —</option>` +
    (actualSub ? `<option value="${esc(actualSub.id)}" selected>${esc(actualSub.label)}</option>` : "") +
    opciones.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("");
  return (
    `<label>Expediente principal <select name="vinculadoA" data-vinculado>${opts}</select></label>` +
    `<p class="meta">El expediente principal no podrá avanzar hasta que este se complete.</p>`
  );
}
