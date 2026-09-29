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
  return html(200, page(ctx, who.viewer, ctx.boot.brandName, inicioHtml(ctx, who.viewer)));
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

  // ── Tu negocio: un proceso por tarjeta
  const procesos: Tarjeta[] = processGroupsForRole(boot.spec, viewer.roleId).map((g) => {
    const propios = exps.filter((e) => e.lifecycleId === g.lifecycleId);
    const enCurso = propios.filter((e) => e.situacion === "pendiente").length;
    const presupuestos = propios.filter((e) => e.situacion === "presupuesto").length;
    const slice = boot.input.lifecycles.find((l) => l.id === g.lifecycleId);
    return {
      clave: `proceso:${g.lifecycleId}`,
      titulo: et.proceso(g.lifecycleId),
      que: slice?.exchangeDirection === "empresa_compra" ? "Lo que compras a proveedores." : "Lo que haces para tus clientes.",
      dato: `${enCurso} en curso · ${presupuestos} ${presupuestos === 1 ? "presupuesto" : "presupuestos"}`,
      href: withDev(viewer, "/", { group: g.id }),
    };
  });

  // Paneles decididos (agenda, cuotas…): llevan al proceso que los contiene
  for (const [id, kind] of Object.entries(PANEL_DE) as [ModuloId, string][]) {
    if (!activo(id)) continue;
    const view = boot.spec.views.find((v) => v.kind === kind);
    const group = view && boot.spec.processGroups?.find((g) => g.panelIds.includes(view.id) || g.viewIds.includes(view.id));
    if (!view || !group) continue;
    procesos.push({
      clave: id,
      titulo: modulos.get(id)!.nombre,
      que: QUE_HACE[id] ?? "",
      dato: modulos.get(id)!.motivo,
      href: withDev(viewer, "/", { group: group.id, view: view.id }),
    });
  }

  // ── Clientes y catálogo
  const partes = runtime.partes.list(runtime.tenantId).filter((p) => !p.erasedAt);
  const clientes = partes.filter((p) => p.subtype === "cliente").length;
  const proveedores = partes.filter((p) => p.subtype === "proveedor").length;
  const ofertas = runtime.ofertas.list(runtime.tenantId).filter((o) => o.activa).length;
  const relaciones: Tarjeta[] = [
    {
      clave: "clientes",
      titulo: "Clientes y proveedores",
      que: "Fichas, datos de contacto y lo que te deben.",
      dato: `${clientes} ${clientes === 1 ? "cliente" : "clientes"} · ${proveedores} ${proveedores === 1 ? "proveedor" : "proveedores"}`,
      href: withDev(viewer, "/partes"),
    },
    {
      clave: "catalogo",
      titulo: "Catálogo",
      que: "Productos y servicios con su precio.",
      dato: `${ofertas} ${ofertas === 1 ? "artículo activo" : "artículos activos"}`,
      href: withDev(viewer, "/ofertas"),
    },
  ];

  // ── Dinero
  const r = resumenDinero(exps, mesMadrid(new Date().toISOString()));
  const dinero: Tarjeta[] = [
    {
      clave: "dinero",
      titulo: "Dinero",
      que: "Cobros, pagos y quién te debe.",
      dato: `${formatCentimos(r.porCobrar)} por cobrar · ${formatCentimos(r.cobradoMes)} cobrado este mes`,
      href: withDev(viewer, "/dinero"),
    },
  ];
  if (activo("facturas")) {
    const mes = mesMadrid(new Date().toISOString());
    const n = runtime.facturas.list(runtime.tenantId).filter((f) => f.fechaExpedicion.slice(0, 7) === mes).length;
    dinero.push({
      clave: "facturas",
      titulo: "Facturas",
      que: "Expedir, imprimir y rectificar.",
      dato: `${n} ${n === 1 ? "factura" : "facturas"} este mes`,
      href: withDev(viewer, "/facturas"),
    });
  }
  if (activo("stock")) {
    const { productos } = runtime.stock();
    const alerta = productos.filter((p) => p.estado !== "ok").length;
    dinero.push({
      clave: "stock",
      titulo: "Stock",
      que: "Existencias, reservas y avisos.",
      dato: productos.length === 0 ? "Aún no controlas ningún producto" : `${alerta} ${alerta === 1 ? "producto" : "productos"} bajo mínimo o agotados`,
      href: withDev(viewer, "/stock"),
    });
  }

  const seccion = (titulo: string, ts: readonly Tarjeta[]) =>
    ts.length === 0
      ? ""
      : `<h2>${esc(titulo)}</h2><div class="tarjetas">` +
        ts
          .map(
            (t) =>
              `<a class="tarjeta" href="${esc(t.href)}" data-tarjeta="${esc(t.clave)}">` +
              `<span class="tarjeta-titulo">${esc(t.titulo)}</span>` +
              `<span class="tarjeta-que">${esc(t.que)}</span>` +
              `<span class="tarjeta-dato">${esc(t.dato)}</span></a>`,
          )
          .join("") +
        `</div>`;

  return (
    `<p class="meta">Tu aplicación, con las partes que necesita tu negocio.</p>` +
    seccion("Tu negocio", procesos) +
    seccion("Clientes y catálogo", relaciones) +
    seccion("Dinero", dinero)
  );
}
