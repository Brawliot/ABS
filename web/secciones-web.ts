/**
 * Secciones específicas para la landing web.
 * Reutiliza el motor genérico para montar el HTML dinámicamente.
 */

import type { AppBootResult } from "./types.js";
import type { Seccion } from "../generator/secciones.js";
// import type { ContextoSeccion } from "../generator/secciones.js";  // ContextoSeccion no existe
import type { DesignSystem, TextTone, ListPattern } from "../design/schema.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCentimos(centimos: number): string {
  const euros = Math.floor(centimos / 100);
  const cents = centimos % 100;
  return `${euros}${cents > 0 ? "," + cents.toString().padStart(2, "0") : ""}€`;
}

/** Contexto para secciones web: incluye boot + diseño + parámetros. */
export interface ContextoWeb {
  readonly boot: AppBootResult;
  readonly css: string;
  readonly query?: string;
  readonly showSuccess?: boolean;
}

/** PORTADA: siempre presente. Variantes: grande, sobria. */
export const seccionPortada = {
  id: "portada",
  cubre: ["web.presentar"],
  aplica: () => true,
  peso: () => 1000, // Siempre primero
  variantes: ["grande", "sobria"],
  seleccionarVariante: (ctx: ContextoWeb) => {
    const tone = (ctx.boot as any).designSystem?.tone ?? "neutral";
    return tone === "formal" || tone === "tecnico" ? "sobria" : "grande";
  },
  render: (ctx: ContextoWeb, variante: string) => {
    const { boot } = ctx;
    const nombre = esc(boot.brandName);

    if (variante === "grande") {
      return `
<header style="text-align: center; padding: 60px 20px; margin-bottom: 40px;">
  <h1 style="font-size: 3em; margin-bottom: 20px; color: var(--color-primary);">
    ${nombre}
  </h1>
  <p style="font-size: 1.2em; color: #666; margin-bottom: 10px;">
    Te ayudamos con lo que necesites
  </p>
</header>`;
    }

    // sobria
    return `
<header style="text-align: center; padding: 30px 20px; margin-bottom: 30px; border-bottom: 1px solid var(--color-border);">
  <h1 style="font-size: 2em; margin-bottom: 10px; color: var(--color-primary);">
    ${nombre}
  </h1>
</header>`;
  },
};

/** OFERTAS: si hay ciclos de venta. Variantes: tarjetas, tabla, lista. */
export const seccionOferta = {
  id: "oferta",
  cubre: ["web.oferta"],
  aplica: (ctx: any) => {
    const { boot } = ctx;
    return boot.input.lifecycles.some(
      (l: any) => l.archetypeId === "venta",
    );
  },
  peso: (ctx: any) => {
    const { boot } = ctx;
    // Peso mayor si es tienda/comercio
    if (
      boot.input.naturalezaBienes.includes("propios_por_cantidad") ||
      boot.input.naturalezaBienes.includes("propios_unitarios")
    ) {
      return 850;
    }
    return 400;
  },
  variantes: ["tarjetas", "tabla", "lista"],
  seleccionarVariante: (ctx: any) => {
    const pattern = ctx.boot.designSystem.patterns.listados;
    if (pattern === "tabla") return "tabla";
    if (pattern === "lista") return "lista";
    return "tarjetas";
  },
  render: (ctx: any, variante: any) => {
    // Placeholder: sin ofertas reales en los datos de muestra
    if (variante === "tabla") {
      return `
<section style="margin: 40px 0;">
  <h2>Nuestras ofertas</h2>
  <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
    <thead>
      <tr style="border-bottom: 2px solid var(--color-border);">
        <th style="text-align: left; padding: 10px;">Producto</th>
        <th style="text-align: right; padding: 10px;">Precio</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom: 1px solid var(--color-border);">
        <td style="padding: 10px;">Servicio estándar</td>
        <td style="text-align: right; padding: 10px; color: var(--color-primary); font-weight: 600;">Consultar</td>
      </tr>
    </tbody>
  </table>
</section>`;
    }

    if (variante === "lista") {
      return `
<section style="margin: 40px 0;">
  <h2>Nuestras ofertas</h2>
  <ul style="list-style: none; margin-top: 20px;">
    <li style="padding: 15px; border-bottom: 1px solid var(--color-border);">
      <strong>Servicio estándar</strong> — Precio a consultar
    </li>
  </ul>
</section>`;
    }

    // tarjetas (default)
    return `
<section style="margin: 40px 0;">
  <h2>Nuestras ofertas</h2>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px;">
    <div style="border: 1px solid var(--color-border); border-radius: 8px; padding: 20px;">
      <strong style="display: block; font-size: 1.1em; margin-bottom: 10px;">Servicio estándar</strong>
      <p style="color: var(--color-primary); font-weight: 600; font-size: 1.3em;">Consultar</p>
    </div>
  </div>
</section>`;
  },
};

/** COMO_TRABAJAMOS: pasos del proceso principal (3+ pasos). */
export const seccionComoTrabajamos = {
  id: "como_trabajamos",
  cubre: ["web.proceso"],
  aplica: (ctx: any) => {
    const { boot } = ctx;
    const first = boot.input.lifecycles[0];
    return first ? first.lifecycle.states.length >= 3 : false;
  },
  peso: (ctx: any) => {
    const { boot } = ctx;
    // Peso mayor si hay servicio o taller
    const first = boot.input.lifecycles[0];
    if (first?.archetypeId === "servicio_proyecto" || first?.label?.toLowerCase().includes("proyecto")) {
      return 800;
    }
    if (first?.archetypeId === "servicio" || first?.label?.toLowerCase().includes("taller")) {
      return 700;
    }
    return 450;
  },
  variantes: ["pasos_numerados"],
  seleccionarVariante: () => "pasos_numerados",
  render: (ctx: any) => {
    const { boot } = ctx;
    const first = boot.input.lifecycles[0];
    if (!first) return "";

    const estados = first.lifecycle.states.slice(0, 6); // Max 6 pasos en landing
    const html = estados
      .map(
        (estado: any, idx: any) => `
    <div style="display: flex; margin-bottom: 20px;">
      <div style="background: var(--color-primary); color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; margin-right: 15px;">
        ${idx + 1}
      </div>
      <div>
        <strong>${esc(estado.label ?? estado.id)}</strong>
      </div>
    </div>
  `,
      )
      .join("");

    return `
<section style="margin: 40px 0;">
  <h2>Cómo trabajamos</h2>
  <div style="margin-top: 20px;">
    ${html}
  </div>
</section>`;
  },
};

/** HORARIO: si hay sedes o calendario. */
export const seccionHorario= {
  id: "horario",
  cubre: ["web.horario"],
  aplica: (ctx: any) => {
    const { boot } = ctx;
    return (
      boot.input.hasCalendar ||
      boot.input.resourceSubtypes.includes("capacidad_temporal")
    );
  },
  peso: () => 400,
  variantes: ["simple"],
  seleccionarVariante: () => "simple",
  render: (ctx: any) => {
    const { boot } = ctx;
    const first = boot.input.lifecycles[0];
    const horarioText = first?.label ?? "Consúltanos disponibilidad";

    return `
<section style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 40px 0;">
  <h3 style="margin-bottom: 10px;">Horario</h3>
  <p>${esc(horarioText)}</p>
</section>`;
  },
};

/** SOLICITUD: formulario de contacto. Título desde la acción del primer paso. */
export const seccionSolicitud= {
  id: "solicitud",
  cubre: ["web.solicitud"],
  aplica: (ctx: any) => {
    const { boot } = ctx;
    return boot.input.lifecycles.some(
      (l: any) => l.archetypeId === "venta" || l.archetypeId === "servicio",
    );
  },
  peso: (ctx: any) => {
    const { boot } = ctx;
    // Peso mayor si hay citas (calendario)
    if (boot.input.hasCalendar) {
      return 750;
    }
    return 600;
  },
  variantes: ["formulario"],
  seleccionarVariante: () => "formulario",
  render: (ctx: any) => {
    const { boot } = ctx;
    const first = boot.input.lifecycles[0];
    const firstState = first?.lifecycle.states[0];
    const btnText = firstState?.label ?? "Solicitar presupuesto";

    return `
<section style="background: #f9fafb; padding: 30px; border-radius: 8px; margin: 40px 0;">
  <h2>${esc(btnText)}</h2>

  <form method="post" action="/web/solicitud" style="max-width: 500px; margin: 20px 0;">
    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 8px; font-weight: 500;">Tu nombre</label>
      <input type="text" name="nombre" required style="width: 100%; padding: 10px; border: 1px solid var(--color-border); border-radius: 4px; font-family: inherit; font-size: 1em;" />
    </div>

    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 8px; font-weight: 500;">Teléfono o correo</label>
      <input type="text" name="contacto" required style="width: 100%; padding: 10px; border: 1px solid var(--color-border); border-radius: 4px; font-family: inherit; font-size: 1em;" />
    </div>

    <div style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 8px; font-weight: 500;">Cuéntanos qué necesitas</label>
      <textarea name="mensaje" style="width: 100%; padding: 10px; border: 1px solid var(--color-border); border-radius: 4px; font-family: inherit; font-size: 1em; resize: vertical; min-height: 100px;"></textarea>
    </div>

    <input type="hidden" name="trampa" value="" />

    <button type="submit" style="width: 100%; padding: 12px; background: var(--color-primary); color: white; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 1em;">
      ${esc(btnText)}
    </button>
  </form>
</section>`;
  },
};

/** PREGUNTAS: desde plantillas de política (placeholder). */
export const seccionPreguntas= {
  id: "preguntas",
  cubre: ["web.faq"],
  aplica: (ctx: any) => {
    const { boot } = ctx;
    // Aplica si hay documentos formales o compliance
    return boot.input.hasFormalDocuments || boot.input.hasFiscalCompliance;
  },
  peso: () => 300,
  variantes: ["faq"],
  seleccionarVariante: () => "faq",
  render: () => {
    return `
<section style="margin: 40px 0;">
  <h2>Preguntas frecuentes</h2>
  <div style="margin-top: 20px;">
    <details style="margin-bottom: 15px; border: 1px solid var(--color-border); padding: 15px; border-radius: 4px;">
      <summary style="font-weight: 600; cursor: pointer;">¿Cuál es tu política de devoluciones?</summary>
      <p style="margin-top: 10px; color: #666;">Consulta nuestros términos y condiciones.</p>
    </details>
  </div>
</section>`;
  },
};

/** Lista de todas las secciones web disponibles. */
export const SECCIONES_WEB: readonly any[] = [
  seccionPortada,
  seccionOferta,
  seccionComoTrabajamos,
  seccionHorario,
  seccionSolicitud,
  seccionPreguntas,
];
