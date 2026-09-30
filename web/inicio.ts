/**
 * Inicio: el software del negocio de un vistazo. Una tarjeta por parte que
 * el decisor ha puesto en esta app (nada más), con qué hace y un dato vivo.
 *
 *   GET /inicio
 */

import type { IncomingMessage } from "node:http";
import { decidirModulos, type ModuloId } from "../generator/rules/modules.js";
import { formatCentimos } from "../elements/oferta.js";
import { mesMadrid } from "../elements/movimientos.js";
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
import { resumenDinero } from "./dinero.js";

export function isInicioPath(path: string): boolean {
  return path === "/inicio";
}

export async function handleInicio(ctx: MaestrosContext, req: IncomingMessage): Promise<MaestrosResponse> {
  if ((req.method ?? "GET").toUpperCase() !== "GET") return text(405, "Método no permitido");
  const url = new URL(req.url ?? "/", "http://local");
  const who = identifyGet(ctx, req, Object.fromEntries(url.searchParams.entries()));
  if ("response" in who) return who.response;
  return html(200, page(ctx, who.viewer, "", inicioHtml(ctx, who.viewer), "inicio"));
}

interface Tarjeta {
  readonly clave: string;
  readonly titulo: string;
  readonly que: string;
  readonly dato: string;
  readonly href: string;
}

const PANEL_DE: Partial<Record<ModuloId, string>> = {
  agenda: "panel_agenda",
  cuotas: "panel_periodos",
  fianzas: "panel_retencion",
  credito: "panel_credito",
};

const QUE_HACE: Partial<Record<ModuloId, string>> = {
  agenda: "Citas y disponibilidad.",
  cuotas: "Periodos y cuotas de tus suscripciones.",
  fianzas: "Fianzas y dinero retenido.",
  credito: "Ventas a crédito o a plazos.",
};

function inicioHtml(ctx: MaestrosContext, viewer: Viewer): string {
  const { runtime, boot } = ctx;
  const modulos = new Map(decidirModulos(boot.input).map((m) => [m.id, m]));
  const activo = (id: ModuloId) => modulos.get(id)?.activo === true;
  const et = runtime.etiquetas;
  const exps = runtime.expedientesDinero();

  // ── Todos los enlaces únicos
  const enlaces: Array<{ titulo: string; href: string; clave: string }> = [];

  // Procesos dinámicos
  processGroupsForRole(boot.spec, viewer.roleId).forEach((g) => {
    enlaces.push({
      clave: `proceso:${g.lifecycleId}`,
      titulo: et.proceso(g.lifecycleId),
      href: withDev(viewer, "/", { group: g.id }),
    });
  });

  // Paneles opcionales
  for (const [id, kind] of Object.entries(PANEL_DE) as [ModuloId, string][]) {
    if (!activo(id)) continue;
    const view = boot.spec.views.find((v) => v.kind === kind);
    const group = view && boot.spec.processGroups?.find((g) => g.panelIds.includes(view.id) || g.viewIds.includes(view.id));
    if (!view || !group) continue;
    enlaces.push({
      clave: id,
      titulo: modulos.get(id)!.nombre,
      href: withDev(viewer, "/", { group: group.id, view: view.id }),
    });
  }

  // Clientes y catálogo
  enlaces.push({
    clave: "clientes",
    titulo: "Clientes y proveedores",
    href: withDev(viewer, "/partes"),
  });
  enlaces.push({
    clave: "catalogo",
    titulo: "Catálogo",
    href: withDev(viewer, "/ofertas"),
  });

  // Dinero
  enlaces.push({
    clave: "dinero",
    titulo: "Dinero",
    href: withDev(viewer, "/dinero"),
  });

  if (activo("facturas")) {
    enlaces.push({
      clave: "facturas",
      titulo: "Facturas",
      href: withDev(viewer, "/facturas"),
    });
  }

  if (activo("stock")) {
    enlaces.push({
      clave: "stock",
      titulo: "Stock",
      href: withDev(viewer, "/stock"),
    });
  }

  // Menú izquierda
  const menuIzq = enlaces
    .map((e) => `<a class="menu-enlace" href="${esc(e.href)}" data-enlace="${esc(e.clave)}">${esc(e.titulo)}</a>`)
    .join("");

  // Contenido derecha (solo título y botón del primer enlace por defecto)
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
