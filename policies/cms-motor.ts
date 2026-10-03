/**
 * Motor CMS - Content Management System
 * Gestión de páginas, plantillas, publicación
 */

import { randomUUID } from "crypto";
import type {
  PáginaCMS,
  Plantilla,
  BloqueCMS,
  VorisiónPágina,
  MetadatasSEO,
  EstadoPágina,
  TipoPágina,
} from "../elements/cms.js";

function generarSlug(título: string): string {
  return título
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export class MotorCMS {
  private páginas: Map<string, PáginaCMS> = new Map();
  private versiones: Map<string, VorisiónPágina> = new Map();
  private plantillas: Map<string, Plantilla> = new Map();
  private slugIndex: Map<string, string> = new Map(); // slug -> páginaId

  // ========== PÁGINAS ==========

  crearPágina(
    título: string,
    tipo: TipoPágina,
    contenido: string,
    autorId: string,
    seo?: Partial<MetadatasSEO>
  ): PáginaCMS {
    const id = randomUUID();
    const slug = generarSlug(título);
    const ahora = new Date();

    const metadatasSEO: MetadatasSEO = {
      metaDescripción: seo?.metaDescripción || "",
      palabrasClave: seo?.palabrasClave || [],
      ogTitle: seo?.ogTitle || título,
      ogDescription: seo?.ogDescription,
      ogImage: seo?.ogImage,
      canonicalUrl: seo?.canonicalUrl,
    };

    const página: PáginaCMS = {
      id,
      título,
      slug,
      contenido,
      bloques: [],
      tipo,
      estado: "borrador",
      categorías: [],
      etiquetas: [],
      seo: metadatasSEO,
      autorId,
      vistas: 0,
      fechaCreación: ahora,
      fechaActualización: ahora,
      fechaPublicación: undefined,
      fechaProgramada: undefined,
    };

    this.páginas.set(id, página);
    this.slugIndex.set(slug, id);

    // Crear versión inicial
    this.registrarVersion(id, página.título, contenido, autorId, "Versión inicial");

    return página;
  }

  obtenerPágina(páginaId: string): PáginaCMS | undefined {
    return this.páginas.get(páginaId);
  }

  obtenerPáginasPorSlug(slug: string): PáginaCMS | undefined {
    const páginaId = this.slugIndex.get(slug);
    return páginaId ? this.páginas.get(páginaId) : undefined;
  }

  listarPáginas(filtros?: {
    tipo?: TipoPágina;
    estado?: EstadoPágina;
    categoría?: string;
  }): PáginaCMS[] {
    let páginas = Array.from(this.páginas.values());

    if (filtros) {
      if (filtros.tipo) {
        páginas = páginas.filter((p) => p.tipo === filtros.tipo);
      }
      if (filtros.estado) {
        páginas = páginas.filter((p) => p.estado === filtros.estado);
      }
      if (filtros.categoría) {
        páginas = páginas.filter((p) => p.categorías.includes(filtros.categoría!));
      }
    }

    return páginas;
  }

  actualizarContenido(
    páginaId: string,
    nuevoContenido: string,
    autorId: string,
    cambiosResumen: string
  ): boolean {
    const página = this.páginas.get(páginaId);
    if (!página) return false;

    (página as any).contenido = nuevoContenido;
    (página as any).fechaActualización = new Date();

    // Registrar versión
    this.registrarVersion(páginaId, página.título, nuevoContenido, autorId, cambiosResumen);

    return true;
  }

  publicarPágina(páginaId: string): boolean {
    const página = this.páginas.get(páginaId);
    if (!página) return false;

    (página as any).estado = "publicada";
    (página as any).fechaPublicación = new Date();
    return true;
  }

  programarPublicación(páginaId: string, fechaProgramada: Date): boolean {
    const página = this.páginas.get(páginaId);
    if (!página) return false;

    (página as any).estado = "programada";
    (página as any).fechaProgramada = fechaProgramada;
    return true;
  }

  ejecutarPublicacionesProgramadas(): number {
    let publicadas = 0;
    const ahora = new Date();

    for (const página of this.páginas.values()) {
      if (
        página.estado === "programada" &&
        página.fechaProgramada &&
        página.fechaProgramada <= ahora
      ) {
        (página as any).estado = "publicada";
        (página as any).fechaPublicación = ahora;
        publicadas++;
      }
    }

    return publicadas;
  }

  agregarEtiqueta(páginaId: string, etiqueta: string): boolean {
    const página = this.páginas.get(páginaId);
    if (!página) return false;

    if (!página.etiquetas.includes(etiqueta)) {
      página.etiquetas.push(etiqueta);
    }

    return true;
  }

  agregarCategoría(páginaId: string, categoría: string): boolean {
    const página = this.páginas.get(páginaId);
    if (!página) return false;

    if (!página.categorías.includes(categoría)) {
      página.categorías.push(categoría);
    }

    return true;
  }

  incrementarVistas(páginaId: string): boolean {
    const página = this.páginas.get(páginaId);
    if (!página) return false;

    (página as any).vistas++;
    return true;
  }

  // ========== VERSIONES ==========

  private registrarVersion(
    páginaId: string,
    título: string,
    contenido: string,
    autorId: string,
    cambiosResumen: string
  ): void {
    const página = this.páginas.get(páginaId);
    if (!página) return;

    const versiones = Array.from(this.versiones.values()).filter(
      (v) => v.páginaId === páginaId
    );
    const número = versiones.length + 1;

    const id = randomUUID();
    const versión: VorisiónPágina = {
      id,
      páginaId,
      número,
      título,
      contenido,
      autorId,
      cambiosResumen,
      fechaCreación: new Date(),
    };

    this.versiones.set(id, versión);
  }

  obtenerHistorialPágina(páginaId: string): VorisiónPágina[] {
    return Array.from(this.versiones.values())
      .filter((v) => v.páginaId === páginaId)
      .sort((a, b) => b.número - a.número);
  }

  restaurarVersión(páginaId: string, versionId: string, autorId: string): boolean {
    const página = this.páginas.get(páginaId);
    const versión = this.versiones.get(versionId);

    if (!página || !versión || versión.páginaId !== páginaId) return false;

    (página as any).contenido = versión.contenido;
    (página as any).fechaActualización = new Date();

    // Registrar como nueva versión
    this.registrarVersion(
      páginaId,
      versión.título,
      versión.contenido,
      autorId,
      `Restaurada desde versión ${versión.número}`
    );

    return true;
  }

  // ========== PLANTILLAS ==========

  crearPlantilla(
    nombre: string,
    tipo: TipoPágina,
    contenidoHTML: string,
    bloquesEditables: string[]
  ): Plantilla {
    const id = randomUUID();

    const plantilla: Plantilla = {
      id,
      nombre,
      descripción: "",
      tipo,
      contenidoHTML,
      bloquesEditables,
      fechaCreación: new Date(),
    };

    this.plantillas.set(id, plantilla);
    return plantilla;
  }

  obtenerPlantilla(plantillaId: string): Plantilla | undefined {
    return this.plantillas.get(plantillaId);
  }

  listarPlantillas(tipo?: TipoPágina): Plantilla[] {
    let plantillas = Array.from(this.plantillas.values());
    return tipo
      ? plantillas.filter((p) => p.tipo === tipo)
      : plantillas;
  }

  aplicarPlantilla(páginaId: string, plantillaId: string): boolean {
    const página = this.páginas.get(páginaId);
    const plantilla = this.plantillas.get(plantillaId);

    if (!página || !plantilla) return false;

    (página as any).contenido = plantilla.contenidoHTML;
    (página as any).fechaActualización = new Date();

    return true;
  }

  renderizarPágina(páginaId: string): string | null {
    const página = this.páginas.get(páginaId);
    if (!página) return null;

    // Renderización simple (solo contenido)
    // En producción, se usaría un motor de templates
    return `
      <html>
        <head>
          <title>${página.título}</title>
          <meta name="description" content="${página.seo.metaDescripción}" />
        </head>
        <body>
          <h1>${página.título}</h1>
          <article>${página.contenido}</article>
        </body>
      </html>
    `;
  }

  generarPreview(páginaId: string): string | null {
    return this.renderizarPágina(páginaId);
  }

  exportarComoHTML(páginaId: string): string | null {
    return this.renderizarPágina(páginaId);
  }

  exportarComoMarkdown(páginaId: string): string | null {
    const página = this.páginas.get(páginaId);
    if (!página) return null;

    return `# ${página.título}\n\n${página.contenido}`;
  }

  obtenerPáginasRelacionadas(páginaId: string): PáginaCMS[] {
    const página = this.páginas.get(páginaId);
    if (!página) return [];

    return this.listarPáginas().filter(
      (p) =>
        p.id !== páginaId &&
        (p.etiquetas.some((e) => página.etiquetas.includes(e)) ||
          p.categorías.some((c) => página.categorías.includes(c)))
    );
  }
}
