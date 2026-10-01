/**
 * Secciones del CRM: ficha de cliente personalizada por negocio.
 * Contexto: {runtime, boot, parteId, viewer}.
 */

import type { AppRuntime } from "./runtime.js";
import type { AppBootResult } from "./types.js";
import type { Viewer } from "./maestros.js";
import { esc, withDev, fecha, hiddenIdentity } from "./maestros.js";
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
    seccionContactos,
    seccionTareas,
    seccionNotas,
    seccionAuditoria,
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

const seccionContactos: SeccionDef<ContextoCrm> = {
  id: "crm-contactos",
  titulo: () => "Contactos",
  mostrar: () => true,
  peso: () => 55,
  cubre: ["crm.contactos"],
  render: (ctx) => {
    const contactos = ctx.runtime.contactosDelCliente(ctx.parteId);
    const listaContactos = contactos.length === 0
      ? `<p class="empty">Sin contactos registrados.</p>`
      : contactos
          .map(
            (c) =>
              `<div class="contacto" data-principal="${c.esPrincipal}">` +
              `<strong>${esc(c.nombre)}</strong>` +
              (c.esPrincipal ? ` <span class="badge-principal">[Principal]</span>` : "") +
              (c.cargo ? `<div class="cargo">${esc(c.cargo)}</div>` : "") +
              (c.telefono ? `<div class="dato"><strong>Tel:</strong> ${esc(c.telefono)}</div>` : "") +
              (c.email ? `<div class="dato"><strong>Email:</strong> ${esc(c.email)}</div>` : "") +
              `</div>`,
          )
          .join("");

    const formContacto = `
      <form method="post" action="/clientes/${esc(ctx.parteId)}/contactos" data-contacto-form style="margin-top: 16px;">
      ${hiddenIdentity(ctx.viewer)}
      <label>Nombre * <input name="nombre" required maxlength="200" placeholder="Nombre completo" /></label>
      <label>Cargo <input name="cargo" maxlength="100" placeholder="Director, técnico..." /></label>
      <label>Teléfono <input name="telefono" type="tel" placeholder="+34..." /></label>
      <label>Email <input name="email" type="email" /></label>
      <label><input type="checkbox" name="esPrincipal" value="1" /> Establecer como contacto principal</label>
      <button type="submit">Añadir contacto</button>
      </form>
    `;

    return listaContactos + formContacto;
  },
};

const seccionTareas: SeccionDef<ContextoCrm> = {
  id: "crm-tareas",
  titulo: () => "Tareas",
  mostrar: () => true,
  peso: () => 50,
  cubre: ["crm.tareas"],
  render: (ctx) => {
    const tareas = ctx.runtime.tareasDelCliente(ctx.parteId, "todas");
    const pendientes = tareas.filter((t) => t.estado === "pendiente");

    const hoy = new Date().toISOString().slice(0, 10);
    const clasificarFecha = (fecha?: string) => {
      if (!fecha) return "sin-fecha";
      if (fecha < hoy) return "vencida";
      const diff = Math.ceil((new Date(fecha).getTime() - new Date(hoy).getTime()) / 86400000);
      if (diff === 0) return "hoy";
      if (diff <= 7) return "semana";
      return "futuro";
    };

    const colores: Record<string, string> = {
      vencida: "color:red",
      hoy: "color:orange",
      semana: "color:#666",
      futuro: "color:#999",
    };

    const listaTareas = tareas.length === 0
      ? `<p class="empty">Sin tareas registradas.</p>`
      : tareas
          .map(
            (t) => {
              const cat = clasificarFecha(t.fechaVencimiento);
              const estilo = colores[cat] ?? "";
              return (
                `<div class="tarea" data-estado="${t.estado}" style="${estilo}">` +
                `<input type="checkbox" ${t.estado === "completada" ? "checked" : ""} />` +
                `<span class="tarea-texto">${esc(t.texto)}</span>` +
                (t.fechaVencimiento ? `<span class="tarea-fecha">${esc(t.fechaVencimiento)}</span>` : "") +
                `<span class="tarea-prioridad badge-${t.prioridad}">${t.prioridad}</span>` +
                `</div>`
              );
            },
          )
          .join("");

    const formTarea = `
      <form method="post" action="/clientes/${esc(ctx.parteId)}/tareas" data-tarea-form style="margin-top: 16px;">
      ${hiddenIdentity(ctx.viewer)}
      <label>Nueva tarea * <input name="texto" required maxlength="500" placeholder="Descripción..." /></label>
      <label>Vencimiento <input name="fechaVencimiento" type="date" /></label>
      <label>Prioridad
        <select name="prioridad">
          <option value="media">Media</option>
          <option value="baja">Baja</option>
          <option value="alta">Alta</option>
        </select>
      </label>
      <button type="submit">Crear tarea</button>
      </form>
    `;

    return `<div>${listaTareas}</div>` + formTarea;
  },
};

const seccionNotas: SeccionDef<ContextoCrm> = {
  id: "crm-notas",
  titulo: () => "Notas",
  mostrar: () => true,
  peso: () => 60,
  cubre: ["crm.notas"],
  render: (ctx) => {
    const notas = ctx.runtime.notasDelCliente(ctx.parteId);
    const listaNotas = notas.length === 0
      ? `<p class="empty">Sin notas registradas.</p>`
      : notas
          .map(
            (n) =>
              `<div class="nota" data-tipo="${n.esInterna ? "interna" : "publica"}">` +
              `<div class="nota-encabezado"><strong>${esc(n.autor)}</strong> ${esc(fecha(n.fecha))}` +
              (n.esInterna ? ` <span class="badge-interna">[Interna]</span>` : "") +
              `</div>` +
              `<div class="nota-texto">${esc(n.texto).replace(/\n/g, "<br>")}</div>` +
              `</div>`,
          )
          .join("");

    const formNota = `
      <form method="post" action="/clientes/${esc(ctx.parteId)}/notas" data-nota-form style="margin-top: 16px;">
      ${hiddenIdentity(ctx.viewer)}
      <label>Añadir nota <textarea name="texto" required maxlength="5000" placeholder="Escribe la nota..." style="min-height:80px;"></textarea></label>
      <label><input type="checkbox" name="esInterna" value="1" /> Solo para el equipo (no visible para el cliente)</label>
      <button type="submit">Guardar nota</button>
      </form>
    `;

    return listaNotas + formNota;
  },
};

const seccionAuditoria: SeccionDef<ContextoCrm> = {
  id: "crm-auditoria",
  titulo: () => "Historial de cambios",
  mostrar: () => true,
  peso: () => 35,
  cubre: ["crm.auditoria"],
  render: (ctx) => {
    const cambios = ctx.runtime.auditoriaDe(ctx.parteId);
    if (cambios.length === 0) {
      return `<p class="empty">Sin cambios registrados.</p>`;
    }

    const rows = cambios
      .map(
        (c) =>
          `<tr><td>${esc(c.campo)}</td>` +
          `<td>${c.valorAnterior ? esc(c.valorAnterior) : "—"}</td>` +
          `<td>${c.valorNuevo ? esc(c.valorNuevo) : "—"}</td>` +
          `<td>${esc(c.autor)}</td>` +
          `<td>${esc(fecha(c.fecha))}</td></tr>`,
      )
      .join("");
    return `<table><thead><tr><th>Campo</th><th>Anterior</th><th>Nuevo</th><th>Autor</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table>`;
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
