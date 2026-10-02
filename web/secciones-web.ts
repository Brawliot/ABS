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
    const tagline = "Soluciones ágiles, resultados confiables";

    if (variante === "grande") {
      return `
<header style="text-align: center;">
  <div class="container">
    <h1>${nombre}</h1>
    <p>${tagline}</p>
  </div>
</header>`;
    }

    // sobria
    return `
<header>
  <div class="container">
    <h1>${nombre}</h1>
  </div>
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
<section class="container">
  <h2>Nuestras ofertas</h2>
  <div style="overflow-x: auto; margin-top: 30px;">
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f9fafb; border-bottom: 2px solid var(--color-border);">
          <th style="text-align: left; padding: 15px; font-weight: 600;">Producto</th>
          <th style="text-align: right; padding: 15px; font-weight: 600;">Precio</th>
          <th style="text-align: center; padding: 15px; font-weight: 600;">Acción</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid var(--color-border); transition: background 0.2s;">
          <td style="padding: 15px;">Servicio estándar</td>
          <td style="text-align: right; padding: 15px; color: var(--color-primary); font-weight: 700; font-size: 1.1em;">Consultar</td>
          <td style="text-align: center; padding: 15px;"><a href="#solicitud" class="cta-button" style="padding: 8px 16px; font-size: 0.9em;">Solicitar</a></td>
        </tr>
      </tbody>
    </table>
  </div>
</section>`;
    }

    if (variante === "lista") {
      return `
<section class="container">
  <h2>Nuestras ofertas</h2>
  <div style="margin-top: 30px;">
    <div style="padding: 20px; border: 1px solid var(--color-border); border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: 700; font-size: 1.1em; margin-bottom: 5px;">Servicio estándar</div>
        <div style="color: var(--color-light); font-size: 0.95em;">Solución completa para tu negocio</div>
      </div>
      <div style="text-align: right;">
        <div style="color: var(--color-primary); font-weight: 700; font-size: 1.3em;">Consultar</div>
        <a href="#solicitud" class="cta-button" style="display: inline-block; padding: 8px 16px; margin-top: 8px; font-size: 0.9em;">Solicitar</a>
      </div>
    </div>
  </div>
</section>`;
    }

    // tarjetas (default)
    return `
<section class="container">
  <h2>Nuestras ofertas</h2>
  <div class="offers">
    <div class="offer-card">
      <div class="offer-title">Servicio estándar</div>
      <div class="offer-price">Consultar</div>
      <p class="offer-desc">Solución completa diseñada para tu negocio</p>
      <a href="#solicitud" class="cta-button">Solicitar información</a>
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
    <div class="step">
      <div class="step-number">${idx + 1}</div>
      <div class="step-content">
        <h3>${esc(estado.label ?? estado.id)}</h3>
      </div>
    </div>
  `,
      )
      .join("");

    return `
<section class="container">
  <h2>Cómo trabajamos</h2>
  <div class="steps-container">
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
<section class="container">
  <div class="info-section">
    <h3 style="margin-top: 0;">📅 Horario y disponibilidad</h3>
    <p>${esc(horarioText)}</p>
    <p style="color: var(--color-light); font-size: 0.95em; margin-top: 10px;">Contáctanos para conocer nuestros horarios específicos y disponibilidad.</p>
  </div>
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
<section class="container">
  <div style="text-align: center; margin-bottom: 40px;">
    <h2 id="solicitud">${esc(btnText)}</h2>
    <p style="color: var(--color-light); font-size: 1.05em;">Completa el formulario y nos pondremos en contacto contigo pronto</p>
  </div>

  <div class="form-container">
    <form method="post" action="/web/solicitud">
      <div class="form-group">
        <label for="nombre">Tu nombre</label>
        <input type="text" id="nombre" name="nombre" required placeholder="Juan García" />
      </div>

      <div class="form-group">
        <label for="contacto">Teléfono o correo</label>
        <input type="text" id="contacto" name="contacto" required placeholder="+34 612 345 678 o tu@email.com" />
      </div>

      <div class="form-group">
        <label for="mensaje">Cuéntanos qué necesitas</label>
        <textarea id="mensaje" name="mensaje" placeholder="Describe brevemente tu necesidad..."></textarea>
      </div>

      <input type="hidden" name="trampa" value="" />

      <button type="submit">${esc(btnText)}</button>
    </form>
  </div>
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
<section class="container">
  <h2>Preguntas frecuentes</h2>
  <div style="max-width: 700px; margin: 30px auto;">
    <details>
      <summary>✓ ¿Cuál es tu política de devoluciones?</summary>
      <p>Oferecemos garantía de satisfacción. Consulta nuestros términos y condiciones para más detalles sobre plazos y condiciones específicas.</p>
    </details>

    <details>
      <summary>✓ ¿Cuáles son tus plazos de entrega?</summary>
      <p>Los plazos dependen del tipo de servicio. Te proporcionaremos un estimado personalizado tras revisar tu solicitud.</p>
    </details>

    <details>
      <summary>✓ ¿Ofrecen soporte después de la venta?</summary>
      <p>Sí, contamos con equipo de soporte disponible para resolver tus consultas e inquietudes.</p>
    </details>

    <details>
      <summary>✓ ¿Cómo puedo contactar para más información?</summary>
      <p>Puedes usar el formulario de solicitud anterior, enviarnos un email, o llamar directamente a nuestro equipo.</p>
    </details>
  </div>
</section>`;
  },
};

/** CARACTERÍSTICAS: atributos principales del negocio. */
export const seccionCaracteristicas = {
  id: "caracteristicas",
  cubre: ["web.caracteristicas"],
  aplica: (ctx: any) => {
    const { boot } = ctx;
    // Siempre mostrar para dar contexto visual
    return true;
  },
  peso: (ctx: any) => {
    const { boot } = ctx;
    // Mostrar más prominentemente en servicios
    if (boot.input.lifecycles.some((l: any) =>
      l.archetypeId === "servicio" || l.archetypeId === "servicio_proyecto"
    )) {
      return 500;
    }
    return 200;
  },
  variantes: ["destacadas"],
  seleccionarVariante: () => "destacadas",
  render: (ctx: any) => {
    const { boot } = ctx;
    const características = [
      { titulo: "Rápido", descripcion: "Procesos ágiles y eficientes", icono: "⚡" },
      { titulo: "Confiable", descripcion: "Soluciones probadas y seguras", icono: "✓" },
      { titulo: "Accesible", descripcion: "Atención personalizada siempre", icono: "👥" },
      { titulo: "Transparente", descripcion: "Sin costos ocultos ni sorpresas", icono: "💡" },
    ];

    const html = características
      .map(
        (car: any) => `
      <div class="feature-card">
        <div class="feature-icon">${car.icono}</div>
        <h3>${esc(car.titulo)}</h3>
        <p>${esc(car.descripcion)}</p>
      </div>
    `,
      )
      .join("");

    return `
<section class="container">
  <div class="features-grid">
    ${html}
  </div>
</section>`;
  },
};

/** Lista de todas las secciones web disponibles. */
export const SECCIONES_WEB: readonly any[] = [
  seccionPortada,
  seccionCaracteristicas,
  seccionOferta,
  seccionComoTrabajamos,
  seccionHorario,
  seccionSolicitud,
  seccionPreguntas,
];
