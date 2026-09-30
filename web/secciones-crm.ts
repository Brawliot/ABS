/**
 * Secciones del CRM: ficha de cliente personalizada por negocio.
 * Contexto: {runtime, boot, parteId, viewer}.
 */

import type { AppRuntime } from "./runtime.js";
import type { AppBootResult } from "./types.js";
import type { Viewer } from "./maestros.js";
import { esc, withDev, fecha } from "./maestros.js";
import { formatCentimos } from "../elements/oferta.js";
import { montar, type SeccionDef } from "../generator/secciones.js";

export interface ContextoCrm {
  readonly runtime: AppRuntime;
  readonly boot: AppBootResult;
  readonly parteId: string;
  readonly viewer: Viewer;
}

export function seccionesCrm(ctx: ContextoCrm): readonly SeccionDef<ContextoCrm>[] {
  return [
    seccionResumen,
    seccionAbiertos,
    seccionSusFichas,
    seccionDeuda,
    seccionCitas,
    seccionHistorial,
  ];
}

const seccionResumen: SeccionDef<ContextoCrm> = {
  id: "crm-resumen",
  titulo: () => "Resumen",
  mostrar: () => true,
  peso: () => 100,
  cubre: ["crm.resumen"],
  render: (ctx) => {
    const parte = ctx.runtime.partes.get(ctx.runtime.tenantId, ctx.parteId);
    if (!parte) {
      return `<p class="err">Parte no encontrada.</p>`;
    }

    const debe = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.direccion === "entra" && e.situacion === "pendiente")
      .reduce((s, e) => s + e.totalCentimos, 0);

    if (!parte.personal) {
      return `<p class="err">Datos personales borrados (RGPD).</p>`;
    }

    return (
      `<dl>` +
      `<dt>Nombre</dt><dd>${esc(parte.personal.displayName)}</dd>` +
      `<dt>Tipo</dt><dd>${esc(parte.subtype ?? "cliente")}</dd>` +
      (parte.personal.taxId ? `<dt>NIF/CIF</dt><dd>${esc(parte.personal.taxId)}</dd>` : "") +
      (parte.personal.phone ? `<dt>Teléfono</dt><dd>${esc(parte.personal.phone)}</dd>` : "") +
      (parte.personal.email ? `<dt>Correo</dt><dd>${esc(parte.personal.email)}</dd>` : "") +
      (parte.personal.address ? `<dt>Dirección</dt><dd>${esc(parte.personal.address)}</dd>` : "") +
      (debe > 0
        ? `<dt>Deuda total</dt><dd class="num"><strong data-te-debe>${esc(formatCentimos(debe))}</strong></dd>`
        : "") +
      `</dl>`
    );
  },
};

const seccionAbiertos: SeccionDef<ContextoCrm> = {
  id: "crm-abiertos",
  titulo: () => "Expedientes abiertos",
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
    return abiertos.length > 0 ? 50 : 0;
  },
  cubre: ["crm.abiertos"],
  render: (ctx) => {
    const exps = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && !e.estadoId.startsWith("terminal"))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    if (exps.length === 0) {
      return `<p class="empty">Sin expedientes abiertos.</p>`;
    }

    const grupos = new Map<string, typeof exps>();
    for (const e of exps) {
      const paso = e.estadoLabel; // Estado del expediente
      const lista = grupos.get(paso) ?? [];
      grupos.set(paso, [...lista, e]);
    }

    const rows = exps
      .map(
        (e) =>
          `<tr><td><a href="${esc(withDev(ctx.viewer, `/expedientes/${e.id}`))}">${esc(e.label)}</a></td>` +
          `<td>${esc(e.estadoLabel)}</td><td>${esc(fecha(e.fecha))}</td></tr>`,
      )
      .join("");
    return `<table data-parte-expedientes><thead><tr><th>Expediente</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table>`;
  },
};

const seccionSusFichas: SeccionDef<ContextoCrm> = {
  id: "crm-sus-fichas",
  titulo: () => "Fichas vinculadas",
  mostrar: (ctx) => {
    const fichas = extraerFichas(ctx);
    return fichas.size > 0;
  },
  peso: (ctx) => {
    const fichas = extraerFichas(ctx);
    return fichas.size > 0 ? 80 : 0;
  },
  cubre: ["crm.sus_fichas"],
  render: (ctx) => {
    const fichas = extraerFichas(ctx);
    if (fichas.size === 0) {
      return `<p class="empty">Sin fichas vinculadas.</p>`;
    }

    const rows = Array.from(fichas.values())
      .map((f) => {
        const campos = Object.entries(f.datos)
          .filter(([k]) => !k.startsWith("ficha_"))
          .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`)
          .join("");
        return (
          `<div class="ficha">` +
          `<h4><a href="${esc(withDev(ctx.viewer, `/expedientes/${f.expedienteId}`))}">${esc(f.label)}</a></h4>` +
          (campos ? `<dl>${campos}</dl>` : "") +
          `</div>`
        );
      })
      .join("");
    return rows;
  },
};

const seccionDeuda: SeccionDef<ContextoCrm> = {
  id: "crm-deuda",
  titulo: () => "Deuda y pagos pendientes",
  mostrar: (ctx) => {
    const debe = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.situacion === "pendiente" && e.direccion === "entra")
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
  cubre: ["crm.deuda"],
  render: (ctx) => {
    const pendientes = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.situacion === "pendiente")
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    if (pendientes.length === 0) {
      return `<p class="empty">Sin deuda.</p>`;
    }

    const total = pendientes.reduce((s, e) => s + e.totalCentimos, 0);
    const rows = pendientes
      .map(
        (e) =>
          `<tr><td><a href="${esc(withDev(ctx.viewer, `/expedientes/${e.id}`))}">${esc(e.label)}</a></td>` +
          `<td>${esc(fecha(e.fecha))}</td><td class="num">${esc(formatCentimos(e.totalCentimos))}</td></tr>`,
      )
      .join("");
    return (
      `<table data-deuda><thead><tr><th>Expediente</th><th>Desde</th><th class="num">Importe</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>` +
      `<p class="total"><strong>Total: ${esc(formatCentimos(total))}</strong></p>`
    );
  },
};

const seccionCitas: SeccionDef<ContextoCrm> = {
  id: "crm-citas",
  titulo: () => "Próximas citas",
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
  cubre: ["crm.citas"],
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
          `<tr><td><a href="${esc(withDev(ctx.viewer, `/expedientes/${e.id}`))}">${esc(e.label)}</a></td>` +
          `<td>${esc(fecha(e.fecha))}</td></tr>`,
      )
      .join("");
    return `<table><thead><tr><th>Expediente</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table>`;
  },
};

const seccionHistorial: SeccionDef<ContextoCrm> = {
  id: "crm-historial",
  titulo: () => "Historial",
  mostrar: (ctx) => {
    const cerrados = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.estadoId.startsWith("terminal"));
    return cerrados.length > 0;
  },
  peso: (ctx) => {
    const debe = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.situacion === "pendiente")
      .length;
    return debe === 0 ? 30 : 10;
  },
  cubre: ["crm.historial"],
  render: (ctx) => {
    const cerrados = ctx.runtime
      .expedientesDinero()
      .filter((e) => e.parteId === ctx.parteId && e.estadoId.startsWith("terminal"))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 10);

    if (cerrados.length === 0) {
      return `<p class="empty">Sin expedientes cerrados.</p>`;
    }

    const rows = cerrados
      .map(
        (e) =>
          `<tr><td><a href="${esc(withDev(ctx.viewer, `/expedientes/${e.id}`))}">${esc(e.label)}</a></td>` +
          `<td>${esc(fecha(e.fecha))}</td><td>${esc(e.estadoLabel)}</td></tr>`,
      )
      .join("");
    return `<table><thead><tr><th>Expediente</th><th>Fecha</th><th>Estado final</th></tr></thead><tbody>${rows}</tbody></table>`;
  },
};

function extraerFichas(
  ctx: ContextoCrm,
): Map<string, { expedienteId: string; label: string; datos: Record<string, unknown> }> {
  const fichas = new Map<string, { expedienteId: string; label: string; datos: Record<string, unknown> }>();
  for (const exp of ctx.runtime.expedientesDinero()) {
    if (exp.parteId !== ctx.parteId) continue;
    const datos = ctx.runtime.datosDe(exp.id)?.datos;
    if (!datos) continue;
    for (const [k, v] of Object.entries(datos)) {
      if (k.startsWith("ficha_") && v) {
        const fichaKey = `${exp.id}:${k}`;
        fichas.set(fichaKey, {
          expedienteId: exp.id,
          label: `${exp.label} - ${k.replace("ficha_", "")}`,
          datos: { ...datos },
        });
      }
    }
  }
  return fichas;
}

export function montarSeccionesCrm(ctx: ContextoCrm) {
  const defs = seccionesCrm(ctx);
  const secciones = montar(defs, ctx);
  return { secciones };
}
