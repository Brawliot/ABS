/**
 * Panel Hoy: expedientes que necesitan atención HOY.
 * Contexto: {runtime, boot, viewer, hoy}. Hoy es YYYY-MM-DD en Europe/Madrid.
 */

import type { AppRuntime } from "./runtime.js";
import type { AppBootResult } from "./types.js";
import type { Viewer } from "./maestros.js";
import { esc, fecha } from "./maestros.js";
import { formatCentimos } from "../elements/oferta.js";
import { montar, type SeccionDef } from "../generator/secciones.js";

export interface ContextoHoy {
  readonly runtime: AppRuntime;
  readonly boot: AppBootResult;
  readonly viewer: Viewer;
  readonly hoy: string; // YYYY-MM-DD
}

export function seccionesHoy(ctx: ContextoHoy): readonly SeccionDef<ContextoHoy>[] {
  return [seccionResumen, seccionAgendaHoy, seccionAtascados, seccionPorCobrar, seccionVencen];
}

const seccionResumen: SeccionDef<ContextoHoy> = {
  id: "hoy-resumen",
  titulo: () => "Hoy",
  mostrar: () => true,
  peso: () => 200,
  cubre: ["hoy.resumen"],
  render: (ctx) => {
    const hoy = new Date(ctx.hoy);
    const fechaHoy = hoy.toLocaleDateString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Europe/Madrid",
    });
    return `<h2>${esc(fechaHoy)}</h2>`;
  },
};

const seccionAgendaHoy: SeccionDef<ContextoHoy> = {
  id: "hoy-agenda",
  titulo: () => "Citas de hoy",
  mostrar: (ctx) => {
    const citas = ctx.runtime.expedientesDinero().filter((e) => e.fecha.startsWith(ctx.hoy) && !e.estadoId.startsWith("terminal"));
    return citas.length > 0;
  },
  peso: (ctx) => {
    const citas = ctx.runtime.expedientesDinero().filter((e) => e.fecha.startsWith(ctx.hoy));
    return citas.length > 0 ? 150 : 0;
  },
  cubre: ["hoy.agenda_hoy"],
  render: (ctx) => {
    const citas = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.fecha.startsWith(ctx.hoy) && !e.estadoId.startsWith("terminal"))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    if (citas.length === 0) return `<p class="empty">Sin citas hoy.</p>`;

    const rows = citas
      .map(
        (e) =>
          `<tr><td><a href="/expedientes/${e.id}">${esc(e.label)}</a></td><td>${esc(e.estadoLabel)}</td><td>${esc(e.fecha.slice(11, 16) || "—")}</td></tr>`,
      )
      .join("");
    return `<table><thead><tr><th>Expediente</th><th>Estado</th><th>Hora</th></tr></thead><tbody>${rows}</tbody></table>`;
  },
};

const seccionAtascados: SeccionDef<ContextoHoy> = {
  id: "hoy-atascados",
  titulo: () => "Expedientes atascados",
  mostrar: (ctx) => {
    const hoy = new Date(ctx.hoy);
    const atascados = ctx.runtime
      .expedientesDinero()
      .filter((e) => !e.estadoId.startsWith("terminal") && (hoy.getTime() - new Date(e.fecha).getTime()) / 86400000 >= 3);
    return atascados.length > 0;
  },
  peso: (ctx) => {
    const hoy = new Date(ctx.hoy);
    const atascados = ctx.runtime
      .expedientesDinero()
      .filter((e) => !e.estadoId.startsWith("terminal") && (hoy.getTime() - new Date(e.fecha).getTime()) / 86400000 >= 3);
    return atascados.length > 0 ? 120 : 0;
  },
  cubre: ["hoy.atascados"],
  render: (ctx) => {
    const hoy = new Date(ctx.hoy);
    const atascados = ctx.runtime
      .expedientesDinero()
      .filter((e) => !e.estadoId.startsWith("terminal") && (hoy.getTime() - new Date(e.fecha).getTime()) / 86400000 >= 3)
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    if (atascados.length === 0) return `<p class="empty">Nada atascado.</p>`;

    const rows = atascados
      .map((e) => {
        const dias = Math.floor((hoy.getTime() - new Date(e.fecha).getTime()) / 86400000);
        return `<tr><td><a href="/expedientes/${e.id}">${esc(e.label)}</a></td><td>${esc(e.estadoLabel)}</td><td>${dias} días</td></tr>`;
      })
      .join("");
    return `<table><thead><tr><th>Expediente</th><th>Paso</th><th>Tiempo</th></tr></thead><tbody>${rows}</tbody></table>`;
  },
};

const seccionPorCobrar: SeccionDef<ContextoHoy> = {
  id: "hoy-cobrar",
  titulo: () => "Pendiente de cobro",
  mostrar: (ctx) => {
    const pendientes = ctx.runtime.expedientesDinero().filter((e) => e.situacion === "pendiente");
    return pendientes.length > 0;
  },
  peso: (ctx) => {
    const debe = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.situacion === "pendiente")
      .reduce((s, e) => s + e.totalCentimos, 0);
    return debe > 0 ? 130 : 0;
  },
  cubre: ["hoy.por_cobrar"],
  render: (ctx) => {
    const pendientes = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.situacion === "pendiente")
      .sort((a, b) => b.totalCentimos - a.totalCentimos)
      .slice(0, 10);

    if (pendientes.length === 0) return `<p class="empty">Todo cobrado.</p>`;

    const rows = pendientes
      .map(
        (e) =>
          `<tr><td><a href="/expedientes/${e.id}">${esc(e.label)}</a></td><td class="num">${esc(formatCentimos(e.totalCentimos))}</td></tr>`,
      )
      .join("");
    const total = pendientes.reduce((s, e) => s + e.totalCentimos, 0);
    return (
      `<table><thead><tr><th>Expediente</th><th class="num">Importe</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="total"><strong>Total: ${esc(formatCentimos(total))}</strong></p>`
    );
  },
};

const seccionVencen: SeccionDef<ContextoHoy> = {
  id: "hoy-vencen",
  titulo: () => "Próximas fechas",
  mostrar: (ctx) => {
    const en7 = new Date(ctx.hoy);
    en7.setDate(en7.getDate() + 7);
    const fichasVencidas = ctx.runtime.expedientesDinero().filter((e) => {
      const datos = ctx.runtime.datosDe(e.id);
      if (!datos) return false;
      for (const [k, v] of Object.entries(datos.datos)) {
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const d = new Date(v);
          if (d >= new Date(ctx.hoy) && d <= en7) return true;
        }
      }
      return false;
    });
    return fichasVencidas.length > 0;
  },
  peso: (ctx) => 60,
  cubre: ["hoy.vencen"],
  render: (ctx) => {
    const en7 = new Date(ctx.hoy);
    en7.setDate(en7.getDate() + 7);
    const fichasVencidas = ctx.runtime
      .expedientesDinero()
      .filter((e) => {
        const datos = ctx.runtime.datosDe(e.id);
        if (!datos) return false;
        for (const [k, v] of Object.entries(datos.datos)) {
          if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
            const d = new Date(v);
            if (d >= new Date(ctx.hoy) && d <= en7) return true;
          }
        }
        return false;
      })
      .slice(0, 10);

    if (fichasVencidas.length === 0) return `<p class="empty">Nada vence pronto.</p>`;

    const rows = fichasVencidas
      .map((e) => `<tr><td><a href="/expedientes/${e.id}">${esc(e.label)}</a></td><td>${esc(e.fecha)}</td></tr>`)
      .join("");
    return `<table><thead><tr><th>Expediente</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table>`;
  },
};

export function montarSeccionesHoy(ctx: ContextoHoy) {
  const defs = seccionesHoy(ctx);
  const secciones = montar(defs, ctx);

  if (secciones.length === 0) {
    return {
      secciones: [],
      html: `<p class="empty-day">Nada pendiente hoy. ¡A disfrutar!</p>`,
    };
  }

  const html = secciones
    .map((s) => `<section id="${s.id}" class="seccion"><h2>${s.titulo}</h2>${s.html}</section>`)
    .join("");

  return { secciones, html };
}
