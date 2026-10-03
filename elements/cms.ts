/**
 * Tipos para CMS (Content Management System)
 * Phase 5 Final - MVP Launch
 */

export type TipoPágina = "blog" | "landing" | "documentación" | "producto" | "página_estática";
export type EstadoPágina = "borrador" | "publicada" | "programada" | "archivada";

export interface MetadatasSEO {
  readonly metaDescripción: string;
  readonly palabrasClave: string[];
  readonly ogTitle: string | undefined;
  readonly ogDescription: string | undefined;
  readonly ogImage: string | undefined;
  readonly canonicalUrl: string | undefined;
}

export interface BloqueCMS {
  readonly id: string;
  readonly tipo: "texto" | "imagen" | "video" | "formulario" | "cta" | "tabla";
  readonly contenido: Record<string, unknown>;
  readonly orden: number;
}

export interface PáginaCMS {
  readonly id: string;
  readonly título: string;
  readonly slug: string;
  contenido: string;
  readonly bloques: BloqueCMS[];
  readonly tipo: TipoPágina;
  estado: EstadoPágina;
  readonly categorías: string[];
  readonly etiquetas: string[];
  readonly seo: MetadatasSEO;
  readonly autorId: string;
  vistas: number;
  readonly fechaCreación: Date;
  fechaActualización: Date;
  fechaPublicación: Date | undefined;
  fechaProgramada: Date | undefined;
}

export interface VorisiónPágina {
  readonly id: string;
  readonly páginaId: string;
  readonly número: number;
  readonly título: string;
  readonly contenido: string;
  readonly autorId: string;
  readonly cambiosResumen: string;
  readonly fechaCreación: Date;
}

export interface Plantilla {
  readonly id: string;
  readonly nombre: string;
  readonly descripción: string;
  readonly tipo: TipoPágina;
  readonly contenidoHTML: string;
  readonly bloquesEditables: string[];
  readonly estilosPersonalizados?: Record<string, string>;
  readonly fechaCreación: Date;
}

export interface CTA {
  readonly id: string;
  readonly páginaId: string;
  readonly texto: string;
  readonly url: string;
  readonly tipo: "botón" | "enlace" | "formulario";
  readonly color: string | undefined;
  readonly posición: string;
  clicsRegistrados: number;
  readonly fechaCreación: Date;
}

export interface ComisarioCMS {
  readonly id: string;
  readonly páginaId: string;
  readonly usuarioId: string;
  readonly contenido: string;
  readonly resolución?: string;
  readonly estado: "abierto" | "resuelto" | "cerrado";
  readonly fechaCreación: Date;
  readonly fechaResolución?: Date;
}

export interface ReporteConversionPágina {
  readonly páginaId: string;
  readonly vistas: number;
  readonly clicsEn: Map<string, number>;
  readonly tasaConversión: number;
  readonly visitas: number;
  readonly tasaRebote: number;
  readonly tiempoPromedio: number;
}
