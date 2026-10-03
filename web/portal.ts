/**
 * Portal del cliente: acceso por token. Solo ve y hace lo suyo.
 * Rutas: /portal/<token>, /portal/<token>/expediente/<id>, /portal/<token>/factura/<id>
 */

import type { IncomingMessage } from "node:http";
import { SqlitePortalAccess } from "../adapters/sqlite-portal-access.js";
import type { AppRuntime } from "./runtime.js";
import type { AppBootResult } from "./types.js";
import { esc, fecha } from "./maestros.js";
import { formatCentimos } from "../elements/oferta.js";
import { executeUiAction } from "./action-handler.js";
import { renderSecciones } from "../generator/secciones.js";
import { montarSeccionesPortal } from "./secciones-portal.js";
import { calcularTotales } from "../elements/transaccion.js";

export interface PortalContext {
  readonly runtime: AppRuntime;
  readonly boot: AppBootResult;
}

export interface PortalResponse {
  readonly status: number;
  readonly body: string;
  readonly contentType: string;
  readonly headers?: Record<string, string>;
}

const portalAccess = new Map<string, SqlitePortalAccess>();

function getPortalAccess(dbPath: string): SqlitePortalAccess {
  if (!portalAccess.has(dbPath)) {
    portalAccess.set(dbPath, new SqlitePortalAccess(dbPath));
  }
  return portalAccess.get(dbPath)!;
}

export function isPortalPath(path: string): boolean {
  return path === "/portal" || path.startsWith("/portal/");
}

export async function handlePortal(
  ctx: PortalContext,
  req: IncomingMessage,
  readForm: () => Promise<Record<string, string>>,
): Promise<PortalResponse> {
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.pathname;
  const method = (req.method ?? "GET").toUpperCase();

  const tokenMatch = path.match(/^\/portal\/([a-zA-Z0-9_-]+)(\/.*)?$/);
  if (!tokenMatch) return notFound();

  const token = tokenMatch[1]!;
  const access = getPortalAccess(ctx.runtime.dbPath);
  const resuelto = access.resolver(token);

  if (!resuelto) return notFound();

  const { parteId, tenant } = resuelto;
  if (tenant !== ctx.runtime.tenantId) return notFound();

  const resto = tokenMatch[2] ?? "";

  if (method === "GET") {
    if (resto === "" || resto === "/") {
      return portalIndex(ctx, parteId, token);
    }

    const expedienteMatch = resto.match(/^\/expediente\/([a-zA-Z0-9_-]+)$/);
    if (expedienteMatch) {
      return portalExpediente(ctx, parteId, expedienteMatch[1]!, token);
    }

    const facturaMatch = resto.match(/^\/factura\/([a-zA-Z0-9_-]+)$/);
    if (facturaMatch) {
      return portalFactura(ctx, parteId, facturaMatch[1]!, token);
    }

    return notFound();
  }

  if (method === "POST") {
    const form = await readForm();
    const accionMatch = resto.match(/^\/expediente\/([a-zA-Z0-9_-]+)\/accion$/);
    if (!accionMatch) return notFound();

    const subjectId = accionMatch[1]!;
    return portalAccion(ctx, parteId, subjectId, form);
  }

  return notFound();
}

function portalIndex(ctx: PortalContext, parteId: string, token: string): PortalResponse {
  const ctxPortal = { runtime: ctx.runtime, boot: ctx.boot, parteId };
  const { secciones } = montarSeccionesPortal(ctxPortal);
  const contenido = renderSecciones(secciones);

  return html(
    200,
    page(
      ctx,
      parteId,
      "Mi cuenta",
      `<p class="meta">Token de acceso seguro. <a href="javascript:void(0)" onclick="if(confirm('¿Cerrar sesión?'))window.close()">Cerrar</a></p>` +
        contenido,
    ),
  );
}

function portalExpediente(ctx: PortalContext, parteId: string, expedienteId: string, token: string): PortalResponse {
  const exp = ctx.runtime.expedientesDinero().find((e) => e.id === expedienteId);

  if (!exp || exp.parteId !== parteId) return notFound();

  const datos = ctx.runtime.datosDe(expedienteId);
  if (!datos) return notFound();

  const lineas = datos.datos.lineas
    .map((l) => `<tr><td>${esc(l.descripcion)}</td><td class="num">${(l.cantidadMilesimas / 1000).toFixed(2)}</td><td class="num">${esc(formatCentimos(l.precioCentimos))}</td></tr>`)
    .join("");

  const totales = calcularTotales(datos.datos.lineas);
  const contenido =
    `<h2>${esc(exp.label)}</h2>` +
    `<p><strong>Estado:</strong> ${esc(exp.estadoLabel)}</p>` +
    `<p><strong>Fecha:</strong> ${esc(fecha(exp.fecha))}</p>` +
    `<table><thead><tr><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio</th></tr></thead><tbody>${lineas}</tbody></table>` +
    `<p class="total"><strong>Total:</strong> ${esc(formatCentimos(totales.total))}</p>` +
    `<div class="acciones" data-expediente="${esc(expedienteId)}">` +
    `<!-- Acciones disponibles se renderizan acá -->` +
    `</div>` +
    `<p><a href="./">← Volver</a></p>`;

  return html(200, page(ctx, parteId, exp.label, contenido));
}

function portalFactura(ctx: PortalContext, parteId: string, facturaId: string, token: string): PortalResponse {
  // Obtener facturas de los expedientes del cliente
  const facturas = [];
  for (const exp of ctx.runtime.expedientesDinero()) {
    if (exp.parteId !== parteId) continue;
    facturas.push(...ctx.runtime.facturas.porExpediente(ctx.runtime.tenantId, exp.id));
  }
  const factura = facturas.find((f: any) => f.id === facturaId);

  if (!factura) return notFound();

  const contenido =
    `<h2>${esc(factura.codigo)}</h2>` +
    `<p><strong>Fecha:</strong> ${esc(fecha(factura.fechaExpedicion))}</p>` +
    `<p><strong>Total:</strong> ${esc(formatCentimos(Math.round(factura.total * 100)))}</p>` +
    `<p><a href="./">← Volver</a></p>`;

  return html(200, page(ctx, parteId, "Factura", contenido));
}

async function portalAccion(
  ctx: PortalContext,
  parteId: string,
  subjectId: string,
  form: Record<string, string>,
): Promise<PortalResponse> {
  const exp = ctx.runtime.expedientesDinero().find((e) => e.id === subjectId);
  if (!exp || exp.parteId !== parteId) return notFound();

  const actionId = form.actionId;
  if (!actionId) return notFound();

  const result = await executeUiAction(ctx.runtime, {
    actionId,
    subjectId,
    clientRequestId: form.clientRequestId ?? "",
    roleId: "cliente",
    parteId,
    channel: "autoservicio",
    kind: "boton",
  });

  const statusClass = result.ok ? "ok" : "err";
  const titulo = result.ok ? "Cambio guardado" : "No se pudo completar";
  const msg = result.flash.text || (result.ok ? "¡Listo! Tu cambio se registró." : "La acción no pudo completarse.");

  return html(
    result.ok ? 200 : 400,
    page(
      ctx,
      parteId,
      titulo,
      `<p class="${statusClass}">${esc(msg)}</p>` +
        `<p><a href="./expediente/${subjectId}">← Volver al expediente</a></p>`,
    ),
  );
}

function page(ctx: PortalContext, parteId: string, titulo: string, contenido: string): string {
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(titulo)}</title>` +
    `<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f5f5f5}.num{text-align:right}a{color:#0066cc}.btn{display:inline-block;padding:8px 16px;background:#0066cc;color:white;text-decoration:none;border-radius:4px}.err{color:red}.ok{color:green}.meta{color:#666;font-size:.9em}.total{font-weight:bold;margin-top:12px}</style>` +
    `</head><body><header><h1>${esc(ctx.boot.brandName)}</h1></header><main>${contenido}</main></body></html>`
  );
}

function html(status: number, body: string): PortalResponse {
  return {
    status,
    body,
    contentType: "text/html; charset=utf-8",
    headers: {
      "Referrer-Policy": "no-referrer",
    },
  };
}

function notFound(): PortalResponse {
  return html(
    404,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>No encontrado</title></head><body><p>Este enlace no existe o ha caducado.</p></body></html>`,
  );
}
