/**
 * Motor SEO para CMS
 * Optimización de contenido, metadatos, validación
 */

import type { PáginaCMS } from "../elements/cms.js";

export interface ResultadoValidacionSEO {
  readonly puntuación: number; // 0-100
  readonly problemas: string[];
  readonly advertencias: string[];
  readonly sugerencias: string[];
}

export class MotorSEO_CMS {
  // ========== META DESCRIPTION ==========

  generarMetaDescripción(contenido: string, máximo: number = 160): string {
    // Tomar primeras palabras del contenido
    const palabras = contenido.split(/\s+/).slice(0, 30).join(" ");
    const desc = palabras.substring(0, máximo);

    return desc + (desc.length === máximo ? "..." : "");
  }

  // ========== PALABRAS CLAVE ==========

  extraerPalabrasClave(contenido: string, máximas: number = 10): string[] {
    const palabras = contenido
      .toLowerCase()
      .replace(/[^a-záéíóúñ0-9\s]/g, "")
      .split(/\s+/)
      .filter((p) => p.length > 3);

    const frecuencia = new Map<string, number>();
    for (const palabra of palabras) {
      frecuencia.set(palabra, (frecuencia.get(palabra) || 0) + 1);
    }

    return Array.from(frecuencia.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, máximas)
      .map(([palabra]) => palabra);
  }

  // ========== VALIDACIÓN ==========

  validarSEO(página: PáginaCMS): ResultadoValidacionSEO {
    const problemas: string[] = [];
    const advertencias: string[] = [];
    const sugerencias: string[] = [];
    let puntuación = 100;

    // Validar título
    if (!página.título || página.título.length === 0) {
      problemas.push("Falta título de página");
      puntuación -= 20;
    } else if (página.título.length < 30) {
      advertencias.push("Título muy corto (menor a 30 caracteres)");
      puntuación -= 5;
    } else if (página.título.length > 60) {
      advertencias.push("Título muy largo (mayor a 60 caracteres)");
      puntuación -= 5;
    }

    // Validar meta description
    if (!página.seo.metaDescripción || página.seo.metaDescripción.length === 0) {
      problemas.push("Falta meta description");
      puntuación -= 15;
    } else if (página.seo.metaDescripción.length < 120) {
      advertencias.push("Meta description muy corta");
      puntuación -= 5;
    } else if (página.seo.metaDescripción.length > 160) {
      advertencias.push("Meta description muy larga");
      puntuación -= 5;
    }

    // Validar palabras clave
    if (!página.seo.palabrasClave || página.seo.palabrasClave.length === 0) {
      advertencias.push("No hay palabras clave definidas");
      puntuación -= 10;
    }

    // Validar contenido
    if (!página.contenido || página.contenido.length < 300) {
      advertencias.push("Contenido muy corto (menor a 300 caracteres)");
      puntuación -= 15;
    }

    // Validar imágenes con alt text (simulado)
    if (!página.contenido.includes("alt=")) {
      sugerencias.push("Agregar atributos alt a imágenes");
      puntuación -= 5;
    }

    // Validar encabezados (H1-H6)
    if (!página.contenido.includes("<h1>")) {
      problemas.push("Falta encabezado H1");
      puntuación -= 10;
    }

    // Validar links internos
    const linksInternos = (página.contenido.match(/href="\//g) || []).length;
    if (linksInternos === 0) {
      sugerencias.push("Agregar links internos");
      puntuación -= 5;
    }

    // Validar slug
    if (!página.slug || página.slug.length === 0) {
      problemas.push("URL amigable no definida");
      puntuación -= 10;
    }

    puntuación = Math.max(0, Math.min(100, puntuación));

    return {
      puntuación,
      problemas,
      advertencias,
      sugerencias,
    };
  }

  // ========== SITEMAP ==========

  generarSitemap(páginas: PáginaCMS[]): string {
    const urls = páginas
      .filter((p) => p.estado === "publicada")
      .map((p) => {
        return `  <url>
    <loc>https://example.com/${p.slug}</loc>
    <lastmod>${p.fechaActualización.toISOString().split("T")[0]}</lastmod>
    <priority>1.0</priority>
  </url>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  }

  // ========== ROBOTS.TXT ==========

  generarRobotstxt(dominios: { permitir: string[]; bloquear: string[] }): string {
    let robots = "User-agent: *\n";

    for (const permitir of dominios.permitir) {
      robots += `Allow: ${permitir}\n`;
    }

    for (const bloquear of dominios.bloquear) {
      robots += `Disallow: ${bloquear}\n`;
    }

    robots += "\nSitemap: https://example.com/sitemap.xml\n";

    return robots;
  }

  // ========== SCHEMA.JSON ==========

  generarSchemaJSON(página: PáginaCMS): Record<string, unknown> {
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: página.título,
      description: página.seo.metaDescripción,
      datePublished: página.fechaPublicación || página.fechaCreación,
      dateModified: página.fechaActualización,
      keywords: página.seo.palabrasClave,
      author: {
        "@type": "Person",
        name: página.autorId,
      },
      articleBody: página.contenido.replace(/<[^>]*>/g, ""),
    };
  }

  // ========== ANÁLISIS DE CONTENIDO ==========

  analizarLegibilidad(contenido: string): {
    nivelLectura: string;
    palabrasPorOración: number;
    palabrasÚnicas: number;
    largoPromedioPalabra: number;
  } {
    const texto = contenido.replace(/<[^>]*>/g, "");
    const palabras = texto.split(/\s+/).filter((p) => p.length > 0);
    const oraciones = texto.split(/[.!?]+/).filter((o) => o.trim().length > 0);

    const palabrasÚnicas = new Set(palabras.map((p) => p.toLowerCase())).size;
    const largoPromedioPalabra =
      palabras.reduce((sum, p) => sum + p.length, 0) / palabras.length;
    const palabrasPorOración = palabras.length / (oraciones.length || 1);

    let nivelLectura = "Avanzado";
    if (palabrasPorOración < 15 && largoPromedioPalabra < 5) {
      nivelLectura = "Fácil";
    } else if (palabrasPorOración < 20 && largoPromedioPalabra < 6) {
      nivelLectura = "Intermedio";
    }

    return {
      nivelLectura,
      palabrasPorOración: Math.round(palabrasPorOración),
      palabrasÚnicas,
      largoPromedioPalabra: Math.round(largoPromedioPalabra * 10) / 10,
    };
  }

  // ========== RECOMENDACIONES ==========

  obtenerRecomendacionesSEO(página: PáginaCMS): string[] {
    const recomendaciones: string[] = [];

    const validación = this.validarSEO(página);

    if (validación.puntuación < 50) {
      recomendaciones.push("Puntuación SEO baja - requiere mejoras significativas");
    }

    recomendaciones.push(...validación.problemas);
    recomendaciones.push(...validación.sugerencias);

    // Análisis adicional
    const legibilidad = this.analizarLegibilidad(página.contenido);
    if (legibilidad.nivelLectura === "Avanzado") {
      recomendaciones.push("Simplificar lenguaje para mejor legibilidad");
    }

    return recomendaciones;
  }
}
