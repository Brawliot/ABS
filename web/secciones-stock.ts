/**
 * Secciones de Stock: integración en CRM y Hoy.
 * Muestra productos, movimientos y alertas según el negocio.
 */

import type { AppRuntime } from "./runtime.js";
import type { AppBootResult } from "./types.js";
import type { Viewer } from "./maestros.js";
import { esc, withDev, fecha } from "./maestros.js";
import { formatCantidad } from "../elements/transaccion.js";
import { montar, type SeccionDef } from "../generator/secciones.js";

export interface ContextoStock {
  readonly runtime: AppRuntime;
  readonly boot: AppBootResult;
  readonly parteId?: string;
  readonly viewer: Viewer;
}

export function seccionesStock(ctx: ContextoStock): readonly SeccionDef<ContextoStock>[] {
  return [seccionProductosStock, seccionMovimientosStock, seccionAlertasStock];
}

const seccionProductosStock: SeccionDef<ContextoStock> = {
  id: "stock-productos",
  titulo: () => "Productos en Stock",
  mostrar: (ctx) => {
    const controlados = ctx.runtime.obtenerProductosControlados();
    return controlados.size > 0;
  },
  peso: (ctx) => {
    const controlados = ctx.runtime.obtenerProductosControlados();
    return controlados.size > 0 ? 100 : 0;
  },
  cubre: ["stock.productos"],
  render: (ctx) => {
    const controlados = ctx.runtime.obtenerProductosControlados();
    if (controlados.size === 0) {
      return `<p class="empty">Sin productos con control de stock.</p>`;
    }

    const resumen = ctx.runtime.resumenStock();
    const rows = Array.from(controlados.entries())
      .map(([productoId, config]) => {
        const prod = ctx.runtime.ofertas.get(ctx.runtime.tenantId, productoId);
        if (!prod) return "";
        const info = resumen.get(productoId);
        const stock = info?.disponible ?? 0;
        const estado = stock < config.minimo ? "bajo" : stock <= 0 ? "agotado" : "ok";
        const estadoClass = estado === "ok" ? "" : ` class="${estado}"`;

        return (
          `<tr><td><a href="${esc(withDev(ctx.viewer, `/stock/${productoId}`))}">${esc(prod.nombre)}</a></td>` +
          `<td class="num">${formatCantidad(stock)}</td>` +
          `<td class="num">${formatCantidad(config.minimo)}</td>` +
          `<td class="num">${prod.precioCentimos}</td>` +
          `<td${estadoClass}>${estado === "ok" ? "Bien" : estado === "bajo" ? "Bajo mínimo" : "Agotado"}</td></tr>`
        );
      })
      .filter((r) => r !== "")
      .join("");

    return (
      `<table data-stock-productos><thead><tr><th>Producto</th><th>Stock actual</th><th>Mínimo</th><th>Precio</th><th>Estado</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>` +
      `<p><a href="${esc(withDev(ctx.viewer, "/stock"))}">Ir a gestión completa</a></p>`
    );
  },
};

const seccionMovimientosStock: SeccionDef<ContextoStock> = {
  id: "stock-movimientos",
  titulo: () => "Últimos movimientos",
  mostrar: (ctx) => {
    const movs = ctx.runtime.movimientosStockRecientes(10);
    return movs.length > 0;
  },
  peso: (ctx) => {
    const movs = ctx.runtime.movimientosStockRecientes(10);
    return movs.length > 0 ? 60 : 0;
  },
  cubre: ["stock.movimientos"],
  render: (ctx) => {
    const movs = ctx.runtime.movimientosStockRecientes(10);
    if (movs.length === 0) {
      return `<p class="empty">Sin movimientos recientes.</p>`;
    }

    const rows = movs
      .map((m) => {
        const prod = ctx.runtime.ofertas.get(ctx.runtime.tenantId, m.ofertaId);
        const tipo = m.origen === "ajuste" ? "Ajuste" : "Reserva";
        const signo = m.delta > 0 ? "+" : "";
        return (
          `<tr><td>${esc(fecha(m.at))}</td><td>${esc(tipo)}</td>` +
          `<td><a href="${esc(withDev(ctx.viewer, `/stock/${m.ofertaId}`))}">${esc(prod?.nombre ?? m.ofertaId)}</a></td>` +
          `<td class="num">${signo}${formatCantidad(m.delta)}</td><td>${esc(m.motivo ?? "")}</td></tr>`
        );
      })
      .join("");

    return (
      `<table data-stock-movimientos><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cantidad</th><th>Motivo</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>`
    );
  },
};

const seccionAlertasStock: SeccionDef<ContextoStock> = {
  id: "stock-alertas",
  titulo: () => "Alertas de stock",
  mostrar: (ctx) => {
    const controlados = ctx.runtime.obtenerProductosControlados();
    if (controlados.size === 0) return false;
    const resumen = ctx.runtime.resumenStock();
    return Array.from(controlados.entries()).some(([id, cfg]) => {
      const info = resumen.get(id);
      return !info || info.disponible < cfg.minimo;
    });
  },
  peso: (ctx) => {
    const controlados = ctx.runtime.obtenerProductosControlados();
    if (controlados.size === 0) return 0;
    const resumen = ctx.runtime.resumenStock();
    const bajo = Array.from(controlados.entries()).filter(([id, cfg]) => {
      const info = resumen.get(id);
      return !info || info.disponible < cfg.minimo;
    }).length;
    return bajo > 0 ? 90 : 0;
  },
  cubre: ["stock.alertas"],
  render: (ctx) => {
    const controlados = ctx.runtime.obtenerProductosControlados();
    const resumen = ctx.runtime.resumenStock();
    const alertas = Array.from(controlados.entries())
      .filter(([id, cfg]) => {
        const info = resumen.get(id);
        return !info || info.disponible < cfg.minimo;
      })
      .map(([id, cfg]) => {
        const prod = ctx.runtime.ofertas.get(ctx.runtime.tenantId, id);
        const info = resumen.get(id);
        const stock = info?.disponible ?? 0;
        const falta = cfg.minimo - stock;
        return (
          `<div class="alerta-stock"><strong>${esc(prod?.nombre ?? id)}</strong>: ` +
          `Stock ${formatCantidad(stock)} (faltan ${formatCantidad(falta)} para mínimo ${formatCantidad(cfg.minimo)}). ` +
          `<a href="${esc(withDev(ctx.viewer, `/stock/${id}`))}">[Ajustar]</a></div>`
        );
      });

    if (alertas.length === 0) {
      return `<p class="empty">Sin alertas de stock.</p>`;
    }

    return alertas.join("");
  },
};
