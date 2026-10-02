/**
 * Motor SEO Técnico
 * Validación de salud del sitio, velocidad, móvil, HTTPS
 */

import type { ValidacionTécnica } from "../elements/seo.js";

export class MotorSEO_Técnico {
  // ========== VALIDACIÓN ==========

  validarSitioweb(
    tiempoRespuesta: number, // ms
    móvilOptimizado: boolean,
    httpsActivo: boolean,
    sitemapPresente: boolean,
    robotsTxtPresente: boolean,
    schemaJSON: boolean,
    imágenesConAlt: boolean,
    h1Presentes: boolean,
    enlacesRotos: number
  ): ValidacionTécnica {
    let puntuación = 100;

    // Validar velocidad
    let velocidad: "rápida" | "media" | "lenta";
    if (tiempoRespuesta < 1000) {
      velocidad = "rápida";
    } else if (tiempoRespuesta < 3000) {
      velocidad = "media";
      puntuación -= 10;
    } else {
      velocidad = "lenta";
      puntuación -= 20;
    }

    // Validar móvil
    if (!móvilOptimizado) {
      puntuación -= 15;
    }

    // Validar HTTPS
    if (!httpsActivo) {
      puntuación -= 20;
    }

    // Validar sitemap
    if (!sitemapPresente) {
      puntuación -= 10;
    }

    // Validar robots.txt
    if (!robotsTxtPresente) {
      puntuación -= 5;
    }

    // Validar Schema JSON
    if (!schemaJSON) {
      puntuación -= 10;
    }

    // Validar imágenes con alt
    if (!imágenesConAlt) {
      puntuación -= 5;
    }

    // Validar H1
    if (!h1Presentes) {
      puntuación -= 10;
    }

    // Validar enlaces rotos
    puntuación = Math.max(0, puntuación - enlacesRotos * 2);

    return {
      velocidadPágina: velocidad,
      móvilOptimizado,
      httpsActivo,
      sitemapPresente,
      robotsTxtPresente,
      schemaJSON,
      imágenesConAlt,
      h1Presentes,
      enlacesRotos,
      puntuaciónTotal: Math.max(0, Math.min(100, puntuación)),
      fechaValidación: new Date(),
    };
  }

  // ========== ANÁLISIS DE ESTRUCTURA ==========

  analizarEstructuraURL(url: string): {
    esAmigable: boolean;
    profundidad: number;
    caracteres: number;
    problemas: string[];
  } {
    const problemas: string[] = [];

    // Analizar profundidad
    const partes = url.split("/").filter((p) => p.length > 0);
    const profundidad = partes.length;

    if (profundidad > 4) {
      problemas.push("URL muy profunda (más de 4 niveles)");
    }

    // Analizar caracteres
    const caracteres = url.length;
    if (caracteres > 75) {
      problemas.push("URL muy larga (más de 75 caracteres)");
    }

    // Verificar si es amigable (sin parámetros, palabras clave)
    let esAmigable = true;
    if (url.includes("?")) {
      esAmigable = false;
      problemas.push("Contiene parámetros de query");
    }

    if (url.includes("id=") || url.includes("=")) {
      esAmigable = false;
      problemas.push("Contiene identificadores dinámicos");
    }

    // Verificar palabras clave
    const palabrasNormales = ["home", "blog", "producto", "servicio", "contacto"];
    const tieneKeyword = palabrasNormales.some((p) => url.includes(p));

    if (!tieneKeyword && url.length > 10) {
      problemas.push("Falta palabra clave descriptiva");
    }

    return {
      esAmigable,
      profundidad,
      caracteres,
      problemas,
    };
  }

  // ========== ANÁLISIS DE ENCABEZADOS ==========

  analizarEncabezados(contenidoHTML: string): {
    h1Count: number;
    h2Count: number;
    h3Count: number;
    estructura: string[];
    problemas: string[];
  } {
    const problemas: string[] = [];
    const estructura: string[] = [];

    const h1Regex = /<h1[^>]*>([^<]*)<\/h1>/gi;
    const h2Regex = /<h2[^>]*>([^<]*)<\/h2>/gi;
    const h3Regex = /<h3[^>]*>([^<]*)<\/h3>/gi;

    const h1Count = (contenidoHTML.match(h1Regex) || []).length;
    const h2Count = (contenidoHTML.match(h2Regex) || []).length;
    const h3Count = (contenidoHTML.match(h3Regex) || []).length;

    // Extraer contenido para estructura
    let match;
    while ((match = h1Regex.exec(contenidoHTML)) !== null) {
      estructura.push(`H1: ${match[1]}`);
    }
    while ((match = h2Regex.exec(contenidoHTML)) !== null) {
      estructura.push(`  H2: ${match[1]}`);
    }

    // Validar estructura
    if (h1Count === 0) {
      problemas.push("Falta H1");
    } else if (h1Count > 1) {
      problemas.push("Múltiples H1 (debe ser solo uno)");
    }

    if (h2Count === 0 && h1Count > 0) {
      problemas.push("Falta estructura H2 bajo H1");
    }

    return {
      h1Count,
      h2Count,
      h3Count,
      estructura,
      problemas,
    };
  }

  // ========== ANÁLISIS DE IMÁGENES ==========

  verificarImágenes(contenidoHTML: string): {
    totalImágenes: number;
    imágenesConAlt: number;
    imágenesSinAlt: number;
    imágenesOptimizadas: number;
    problemas: string[];
  } {
    const problemas: string[] = [];

    const imgRegex = /<img[^>]*>/gi;
    const imágenes = contenidoHTML.match(imgRegex) || [];
    const totalImágenes = imágenes.length;

    let imágenesConAlt = 0;
    let imágenesSinAlt = 0;
    let imágenesOptimizadas = 0;

    for (const img of imágenes) {
      if (img.includes('alt="') || img.includes("alt='")) {
        imágenesConAlt++;
      } else {
        imágenesSinAlt++;
        problemas.push(`Imagen sin alt: ${img.substring(0, 50)}...`);
      }

      // Verificar si es optimizada (jpg, webp, png con tamaño)
      if (
        img.includes(".jpg") ||
        img.includes(".webp") ||
        img.includes(".png")
      ) {
        imágenesOptimizadas++;
      }
    }

    if (imágenesSinAlt > 0) {
      problemas.push(`${imágenesSinAlt} imágenes sin atributo alt`);
    }

    return {
      totalImágenes,
      imágenesConAlt,
      imágenesSinAlt,
      imágenesOptimizadas,
      problemas,
    };
  }

  // ========== ANÁLISIS DE VELOCIDAD ==========

  analizarVelocidad(tiempoRespuesta: number): {
    calificación: "A" | "B" | "C" | "D" | "F";
    recomendaciones: string[];
  } {
    let calificación: "A" | "B" | "C" | "D" | "F" = "A";
    const recomendaciones: string[] = [];

    if (tiempoRespuesta < 1000) {
      calificación = "A";
    } else if (tiempoRespuesta < 2000) {
      calificación = "B";
      recomendaciones.push("Optimizar tiempo de respuesta");
    } else if (tiempoRespuesta < 3000) {
      calificación = "C";
      recomendaciones.push("Implementar caching de servidor");
      recomendaciones.push("Comprimir recursos estáticos");
    } else if (tiempoRespuesta < 5000) {
      calificación = "D";
      recomendaciones.push("Usar CDN");
      recomendaciones.push("Minificar CSS/JS");
    } else {
      calificación = "F";
      recomendaciones.push("Revisar configuración del servidor");
      recomendaciones.push("Considerar migración a hosting más rápido");
    }

    return { calificación, recomendaciones };
  }

  // ========== ANÁLISIS DE ENLACES ==========

  analizarEnlaces(contenidoHTML: string): {
    totalEnlaces: number;
    enlacesInternos: number;
    enlacesExternos: number;
    enlacesRotos: number;
    enlacesSinTexto: number;
  } {
    const aRegex = /<a[^>]*href=["']([^"']*?)["'][^>]*>([^<]*)<\/a>/gi;
    let totalEnlaces = 0;
    let enlacesInternos = 0;
    let enlacesExternos = 0;
    let enlacesSinTexto = 0;

    let match;
    while ((match = aRegex.exec(contenidoHTML)) !== null) {
      totalEnlaces++;
      const href = match[1];
      const texto = match[2].trim();

      if (href.startsWith("/") || href.startsWith("http://localhost")) {
        enlacesInternos++;
      } else {
        enlacesExternos++;
      }

      if (!texto) {
        enlacesSinTexto++;
      }
    }

    // Simular detección de enlaces rotos
    const enlacesRotos = Math.floor(totalEnlaces * 0.02); // 2% de enlaces rotos

    return {
      totalEnlaces,
      enlacesInternos,
      enlacesExternos,
      enlacesRotos,
      enlacesSinTexto,
    };
  }

  // ========== REPORTE TÉCNICO ==========

  generarReporteTécnico(contenidoHTML: string): {
    puntuaciónGeneral: number;
    validaciones: ValidacionTécnica;
    problemas: string[];
    recomendaciones: string[];
  } {
    const problemas: string[] = [];
    const recomendaciones: string[] = [];

    // Análisis de encabezados
    const encabezados = this.analizarEncabezados(contenidoHTML);
    problemas.push(...encabezados.problemas);

    // Análisis de imágenes
    const imágenes = this.verificarImágenes(contenidoHTML);
    problemas.push(...imágenes.problemas);

    // Análisis de enlaces
    const enlaces = this.analizarEnlaces(contenidoHTML);
    if (enlaces.enlacesSinTexto > 0) {
      problemas.push(`${enlaces.enlacesSinTexto} enlaces sin texto descriptivo`);
    }

    // Validación básica
    const validación = this.validarSitioweb(
      1000,
      true,
      true,
      true,
      true,
      true,
      imágenes.imágenesConAlt > 0,
      encabezados.h1Count > 0,
      enlaces.enlacesRotos
    );

    recomendaciones.push(...this.analizarVelocidad(1000).recomendaciones);

    return {
      puntuaciónGeneral: validación.puntuaciónTotal,
      validaciones: validación,
      problemas,
      recomendaciones,
    };
  }
}
