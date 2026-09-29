/**
 * Dinero: cobrado / pagado del mes, pendiente de cobro / pago, deuda por
 * cliente y movimientos. Todo se deriva de los eventos (sin estado propio).
 *
 *   GET /dinero?mes=AAAA-MM
 */

import type { IncomingMessage } from "node:http";
import { formatCentimos } from "../elements/oferta.js";
import { mesMadrid, type Movimiento } from "../elements/movimientos.js";
import {
  esc,
  fecha,
  html,
  identifyGet,
  page,
  text,
  withDev,
  type MaestrosContext,
  type MaestrosResponse,
  type Viewer,
} from "./maestros.js";
import type { ExpedienteDinero } from "./runtime.js";

export interface DeudaParte {
  readonly parteId: string;
  readonly pendienteCentimos: number;
  readonly expedientes: number;
}

export interface ResumenDinero {
  readonly mes: string;
  readonly cobradoMes: number;
  readonly pagadoMes: number;
  readonly porCobrar: number;
  readonly porPagar: number;
  /** Presupuestos de venta aún no aceptados (no es deuda). */
  readonly enPresupuesto: number;
  readonly deudaPorCliente: readonly DeudaParte[];
  readonly deudaConProveedores: readonly DeudaParte[];
  readonly movimientosMes: readonly Movimiento[];
  readonly pendientes: readonly ExpedienteDinero[];
}

function agrupar(expedientes: readonly ExpedienteDinero[]): DeudaParte[] {
  const m = new Map<string, { pendienteCentimos: number; expedientes: number }>();
  for (const e of expedientes) {
    const prev = m.get(e.parteId) ?? { pendienteCentimos: 0, expedientes: 0 };
    m.set(e.parteId, {
      pendienteCentimos: prev.pendienteCentimos + e.totalCentimos,
      expedientes: prev.expedientes + 1,
    });
  }
  return [...m.entries()]
    .map(([parteId, v]) => ({ parteId, ...v }))
    .sort((a, b) => b.pendienteCentimos - a.pendienteCentimos || a.parteId.localeCompare(b.parteId));
}

/** Cálculo puro del resumen para un mes (AAAA-MM, hora de Madrid). */
export function resumenDinero(
  expedientes: readonly ExpedienteDinero[],
  mes: string,
): ResumenDinero {
  const movimientos = expedientes.flatMap((e) => e.movimientos);
  const movimientosMes = movimientos
    .filter((m) => mesMadrid(m.at) === mes)
    .sort((a, b) => b.at.localeCompare(a.at));
  const sum = (xs: readonly { importeCentimos: number }[]) =>
    xs.reduce((s, x) => s + x.importeCentimos, 0);
  const pendientesCobro = expedientes.filter((e) => e.direccion === "entra" && e.situacion === "pendiente");
  const pendientesPago = expedientes.filter((e) => e.direccion === "sale" && e.situacion === "pendiente");
  return {
    mes,
    cobradoMes: sum(movimientosMes.filter((m) => m.direccion === "entra")),
    pagadoMes: sum(movimientosMes.filter((m) => m.direccion === "sale")),
    porCobrar: pendientesCobro.reduce((s, e) => s + e.totalCentimos, 0),
    porPagar: pendientesPago.reduce((s, e) => s + e.totalCentimos, 0),
    enPresupuesto: expedientes
      .filter((e) => e.direccion === "entra" && e.situacion === "presupuesto")
      .reduce((s, e) => s + e.totalCentimos, 0),
    deudaPorCliente: agrupar(pendientesCobro),
    deudaConProveedores: agrupar(pendientesPago),
    movimientosMes,
    pendientes: [...pendientesCobro, ...pendientesPago].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id),
    ),
  };
}

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function mesVecino(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  return `${MESES[m - 1]} de ${y}`;
}

export function isDineroPath(path: string): boolean {
  return path === "/dinero";
}

export async function handleDinero(
  ctx: MaestrosContext,
  req: IncomingMessage,
): Promise<MaestrosResponse> {
  if ((req.method ?? "GET").toUpperCase() !== "GET") {
    return text(405, "Método no permitido");
  }
  const url = new URL(req.url ?? "/", "http://local");
  const query = Object.fromEntries(url.searchParams.entries());
  const who = identifyGet(ctx, req, query);
  if ("response" in who) return who.response;
  const mes = query.mes && MES_RE.test(query.mes) ? query.mes : mesMadrid(new Date().toISOString());
  const expedientes = ctx.runtime.expedientesDinero();
  const r = resumenDinero(expedientes, mes);
  return html(200, page(ctx, who.viewer, "Dinero", dineroHtml(ctx, who.viewer, r, expedientes)));
}

function dineroHtml(
  ctx: MaestrosContext,
  viewer: Viewer,
  r: ResumenDinero,
  expedientes: readonly ExpedienteDinero[],
): string {
  const { runtime } = ctx;
  const byId = new Map(expedientes.map((e) => [e.id, e]));
  const eur = (c: number) => esc(formatCentimos(c));
  const cliente = (parteId: string) =>
    `<a href="${esc(withDev(viewer, `/partes/${parteId}`))}">${esc(runtime.nombreParte(parteId))}</a>`;
  const expLink = (id: string) =>
    `<a href="${esc(withDev(viewer, `/expedientes/${id}`))}">${esc(byId.get(id)?.label ?? id)}</a>`;
  const hayCompras = expedientes.some((e) => e.direccion === "sale");

  const nav =
    `<p class="toolbar" data-mes="${esc(r.mes)}">` +
    `<a href="${esc(withDev(viewer, "/dinero", { mes: mesVecino(r.mes, -1) }))}">← ${esc(nombreMes(mesVecino(r.mes, -1)))}</a>` +
    `<strong>${esc(nombreMes(r.mes))}</strong>` +
    `<a href="${esc(withDev(viewer, "/dinero", { mes: mesVecino(r.mes, 1) }))}">${esc(nombreMes(mesVecino(r.mes, 1)))} →</a>` +
    `</p>`;

  const tile = (label: string, value: number, key: string, hint: string) =>
    `<div class="tile" data-kpi="${key}"><span class="tile-label">${esc(label)}</span>` +
    `<span class="tile-value">${eur(value)}</span><span class="tile-hint">${esc(hint)}</span></div>`;
  const tiles =
    `<div class="tiles">` +
    tile("Cobrado este mes", r.cobradoMes, "cobrado", "ventas liquidadas en el mes") +
    tile("Por cobrar", r.porCobrar, "por-cobrar", "aceptado y aún sin cobrar") +
    (hayCompras ? tile("Pagado este mes", r.pagadoMes, "pagado", "compras liquidadas en el mes") : "") +
    (hayCompras ? tile("Por pagar", r.porPagar, "por-pagar", "compras aceptadas sin pagar") : "") +
    tile("En presupuesto", r.enPresupuesto, "presupuesto", "propuestas aún no aceptadas") +
    `</div>`;

  const deudaTabla = (titulo: string, rows: readonly { parteId: string; pendienteCentimos: number; expedientes: number }[], key: string, vacio: string) =>
    `<h2>${esc(titulo)}</h2>` +
    (rows.length === 0
      ? `<p class="empty" data-${key}-vacio>${esc(vacio)}</p>`
      : `<table data-${key}><thead><tr><th>Quién</th><th class="num">Expedientes</th><th class="num">Importe</th></tr></thead><tbody>` +
        rows
          .map((d) => `<tr><td>${cliente(d.parteId)}</td><td class="num">${d.expedientes}</td><td class="num">${eur(d.pendienteCentimos)}</td></tr>`)
          .join("") +
        `</tbody></table>`);

  const pendientes =
    `<h2>Pendientes</h2>` +
    (r.pendientes.length === 0
      ? `<p class="empty">No hay nada pendiente de cobro ni de pago.</p>`
      : `<table data-pendientes><thead><tr><th>Expediente</th><th>Quién</th><th>Fecha</th><th>Estado</th><th>Tipo</th><th class="num">Importe</th></tr></thead><tbody>` +
        r.pendientes
          .map(
            (e) =>
              `<tr><td>${expLink(e.id)}</td><td>${cliente(e.parteId)}</td><td>${esc(e.fecha)}</td>` +
              `<td>${esc(e.estadoLabel)}</td><td>${e.direccion === "entra" ? "Cobro" : "Pago"}</td>` +
              `<td class="num">${eur(e.totalCentimos)}</td></tr>`,
          )
          .join("") +
        `</tbody></table>`);

  const movimientos =
    `<h2>Movimientos de ${esc(nombreMes(r.mes))}</h2>` +
    (r.movimientosMes.length === 0
      ? `<p class="empty" data-movimientos-vacio>Sin cobros ni pagos este mes.</p>`
      : `<table data-movimientos><thead><tr><th>Fecha</th><th>Expediente</th><th>Quién</th><th>Tipo</th><th class="num">Importe</th></tr></thead><tbody>` +
        r.movimientosMes
          .map(
            (m) =>
              `<tr data-movimiento="${m.direccion}"><td>${esc(fecha(m.at))}</td><td>${expLink(m.expedienteId)}</td>` +
              `<td>${cliente(m.parteId)}</td><td>${m.direccion === "entra" ? "Cobro" : "Pago"}</td>` +
              `<td class="num">${m.direccion === "sale" ? "−" : ""}${eur(m.importeCentimos)}</td></tr>`,
          )
          .join("") +
        `</tbody></table>`);

  const nota =
    `<p class="meta">Un expediente cuenta como cobrado (o pagado) cuando da el paso que liquida el pago; ` +
    `en procesos sin paso de pago, cuando se cierra con éxito. Importes con IVA.</p>`;

  return (
    nav +
    tiles +
    deudaTabla("Te deben", r.deudaPorCliente, "deuda-clientes", "Nadie te debe nada ahora mismo.") +
    (hayCompras ? deudaTabla("Debes a proveedores", r.deudaConProveedores, "deuda-proveedores", "No debes nada a proveedores.") : "") +
    pendientes +
    movimientos +
    nota
  );
}
