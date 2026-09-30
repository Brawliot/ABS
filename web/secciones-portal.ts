/**
 * Secciones del portal: vista del cliente sobre SUS expedientes y facturas.
 * Contexto: {runtime, boot, parteId}. Todo filtrado por ese parteId.
 */

import type { AppRuntime } from "./runtime.js";
import type { AppBootResult } from "./types.js";
import { esc, fecha } from "./maestros.js";
import { formatCentimos } from "../elements/oferta.js";
import { montar, type SeccionDef } from "../generator/secciones.js";
import type { ChecklistEntry } from "../generator/checklist.js";

export interface ContextoPortal {
  readonly runtime: AppRuntime;
  readonly boot: AppBootResult;
  readonly parteId: string;
}

export function seccionesPortal(ctx: ContextoPortal): readonly SeccionDef<ContextoPortal>[] {
  return [seccionLoMio, seccionSusFichas, seccionCitas, seccionPagos, seccionFacturas, seccionHistorial];
}

const seccionLoMio: SeccionDef<ContextoPortal> = {
  id: "portal-lo-mio",
  titulo: () => "Mis expedientes",
  mostrar: (ctx) => {
    const abiertos = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && !e.estadoId.startsWith("terminal"));
    return abiertos.length > 0;
  },
  peso: (ctx) => {
    const abiertos = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && !e.estadoId.startsWith("terminal"));
    return abiertos.length > 0 ? 100 : 0;
  },
  cubre: ["modulo.portal", "portal.lo_mio"],
  render: (ctx) => {
    const exps = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && !e.estadoId.startsWith("terminal"))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    if (exps.length === 0) {
      return `<p class="empty">Sin expedientes en trámite.</p>`;
    }

    const rows = exps
      .map(
        (e) =>
          `<tr><td><a href="./expediente/${e.id}">${esc(e.label)}</a></td>` +
          `<td>${esc(e.estadoLabel)}</td><td>${esc(fecha(e.fecha))}</td></tr>`,
      )
      .join("");
    return `<table><thead><tr><th>Expediente</th><th>Estado</th><th>Desde</th></tr></thead><tbody>${rows}</tbody></table>`;
  },
};

const seccionSusFichas: SeccionDef<ContextoPortal> = {
  id: "portal-fichas",
  titulo: () => "Mis datos",
  mostrar: (ctx) => {
    const fichas = extraerFichas(ctx);
    return fichas.size > 0;
  },
  peso: (ctx) => {
    const fichas = extraerFichas(ctx);
    return fichas.size > 0 ? 80 : 0;
  },
  cubre: ["modulo.portal", "portal.sus_fichas"],
  render: (ctx) => {
    const fichas = extraerFichas(ctx);
    if (fichas.size === 0) {
      return `<p class="empty">Sin datos vinculados.</p>`;
    }

    const rows = Array.from(fichas.values())
      .map((f) => {
        const campos = Object.entries(f.datos)
          .filter(([k]) => !k.startsWith("ficha_") && !k.startsWith("parte_") && k !== "vinculadoA")
          .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`)
          .join("");
        return `<div class="ficha"><h4>${esc(f.label)}</h4>${campos ? `<dl>${campos}</dl>` : ""}</div>`;
      })
      .join("");
    return rows;
  },
};

const seccionCitas: SeccionDef<ContextoPortal> = {
  id: "portal-citas",
  titulo: () => "Mis citas",
  mostrar: (ctx) => {
    const citas = ctx.runtime
      .expedientesDinero()
      .filter(
        (e) =>
          e.parteId === ctx.parteId &&
          !e.estadoId.startsWith("terminal") &&
          e.fecha > new Date().toISOString(),
      );
    return citas.length > 0;
  },
  peso: (ctx) => {
    const citas = ctx.runtime
      .expedientesDinero()
      .filter(
        (e) =>
          e.parteId === ctx.parteId &&
          !e.estadoId.startsWith("terminal") &&
          e.fecha > new Date().toISOString(),
      );
    return citas.length > 0 ? 70 : 0;
  },
  cubre: ["modulo.portal", "portal.citas"],
  render: (ctx) => {
    const citas = ctx.runtime
      .expedientesDinero()
      .filter(
        (e) =>
          e.parteId === ctx.parteId &&
          !e.estadoId.startsWith("terminal") &&
          e.fecha > new Date().toISOString(),
      )
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    if (citas.length === 0) {
      return `<p class="empty">Sin citas próximas.</p>`;
    }

    const rows = citas
      .map(
        (e) =>
          `<tr><td><a href="./expediente/${e.id}">${esc(e.label)}</a></td>` +
          `<td>${esc(fecha(e.fecha))}</td></tr>`,
      )
      .join("");
    return `<table><thead><tr><th>Expediente</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table>`;
  },
};

const seccionPagos: SeccionDef<ContextoPortal> = {
  id: "portal-pagos",
  titulo: () => "Pagos",
  mostrar: (ctx) => {
    const debe = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.situacion === "pendiente")
      .length > 0;
    return debe;
  },
  peso: (ctx) => {
    const debe = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.situacion === "pendiente")
      .reduce((s, e) => s + e.totalCentimos, 0);
    return debe > 0 ? 90 : 20;
  },
  cubre: ["modulo.portal", "portal.pagos"],
  render: (ctx) => {
    const pendientes = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.situacion === "pendiente")
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    if (pendientes.length === 0) {
      return `<p class="ok">Todo pagado. ¡Gracias!</p>`;
    }

    const total = pendientes.reduce((s, e) => s + e.totalCentimos, 0);
    const rows = pendientes
      .map(
        (e) =>
          `<tr><td><a href="./expediente/${e.id}">${esc(e.label)}</a></td>` +
          `<td>${esc(fecha(e.fecha))}</td><td class="num">${esc(formatCentimos(e.totalCentimos))}</td></tr>`,
      )
      .join("");
    return (
      `<table><thead><tr><th>Expediente</th><th>Desde</th><th class="num">Importe</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>` +
      `<p class="total"><strong>Total pendiente: ${esc(formatCentimos(total))}</strong></p>`
    );
  },
};

const seccionFacturas: SeccionDef<ContextoPortal> = {
  id: "portal-facturas",
  titulo: () => "Facturas",
  mostrar: (ctx) => {
    const facturas = extraerFacturas(ctx);
    return facturas.length > 0;
  },
  peso: (ctx) => {
    const facturas = extraerFacturas(ctx);
    return facturas.length > 0 ? 60 : 0;
  },
  cubre: ["modulo.portal", "portal.facturas"],
  render: (ctx) => {
    const facturas = extraerFacturas(ctx);

    if (facturas.length === 0) {
      return `<p class="empty">Sin facturas.</p>`;
    }

    const rows = facturas
      .map(
        (f: any) =>
          `<tr><td><a href="./factura/${f.id}">${esc(f.codigo)}</a></td>` +
          `<td>${esc(fecha(f.fechaExpedicion))}</td><td class="num">${esc(formatCentimos(Math.round(f.total * 100)))}</td></tr>`,
      )
      .join("");
    return `<table><thead><tr><th>Factura</th><th>Fecha</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table>`;
  },
};

const seccionHistorial: SeccionDef<ContextoPortal> = {
  id: "portal-historial",
  titulo: () => "Completados",
  mostrar: (ctx) => {
    const cerrados = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.estadoId.startsWith("terminal"));
    return cerrados.length > 0;
  },
  peso: (ctx) => {
    const debe = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.situacion === "pendiente").length;
    return debe === 0 ? 30 : 10;
  },
  cubre: ["modulo.portal", "portal.historial"],
  render: (ctx) => {
    const cerrados = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.estadoId.startsWith("terminal"))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 10);

    if (cerrados.length === 0) {
      return `<p class="empty">Sin expedientes completados.</p>`;
    }

    const rows = cerrados
      .map(
        (e) =>
          `<tr><td><a href="./expediente/${e.id}">${esc(e.label)}</a></td>` +
          `<td>${esc(fecha(e.fecha))}</td></tr>`,
      )
      .join("");
    return `<table><thead><tr><th>Expediente</th><th>Completado</th></tr></thead><tbody>${rows}</tbody></table>`;
  },
};

function extraerFichas(
  ctx: ContextoPortal,
): Map<string, { label: string; datos: Record<string, unknown> }> {
  const fichas = new Map<string, { label: string; datos: Record<string, unknown> }>();
  for (const exp of ctx.runtime.expedientesDinero()) {
    if (exp.parteId !== ctx.parteId) continue;
    const datos = ctx.runtime.datosDe(exp.id)?.datos;
    if (!datos) continue;
    for (const [k, v] of Object.entries(datos)) {
      if (k.startsWith("ficha_") && v) {
        const fichaKey = `${exp.id}:${k}`;
        fichas.set(fichaKey, {
          label: `${exp.label} - ${k.replace("ficha_", "")}`,
          datos: { ...datos },
        });
      }
    }
  }
  return fichas;
}

function extraerFacturas(ctx: ContextoPortal): any[] {
  const facturas = [];
  for (const exp of ctx.runtime.expedientesDinero()) {
    if (exp.parteId !== ctx.parteId) continue;
    const porExp = ctx.runtime.facturas.porExpediente(ctx.runtime.tenantId, exp.id);
    facturas.push(...porExp);
  }
  return facturas;
}

export function montarSeccionesPortal(ctx: ContextoPortal) {
  const defs = seccionesPortal(ctx);
  const secciones = montar(defs, ctx);
  const checklistEntries: ChecklistEntry[] = [
    {
      generador: "portal",
      cubiertos: secciones.flatMap((s) => s.cubre) as any[],
    },
  ];
  return { secciones, checklistEntries };
}
