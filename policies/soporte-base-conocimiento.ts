/**
 * Motor de Base de Conocimiento: FAQs, búsqueda de soluciones por similitud,
 * calificación de utilidad y sugerencias automáticas.
 */

export interface ArticuloConocimiento {
  readonly id: string;
  readonly titulo: string;
  readonly contenido: string;
  readonly categoría: string;
  readonly etiquetas: readonly string[];
  readonly vistas: number;
  readonly utilidad: number; // 0-100
  readonly fechaCreacion: Date;
  readonly fechaActualizacion: Date;
}

export interface SolucionSugerida {
  readonly articuloId: string;
  readonly titulo: string;
  readonly similitud: number; // 0-100
  readonly categoría: string;
}

export class MotorBaseConocimiento {
  private articulos = new Map<string, ArticuloConocimiento>();
  private indiceTexto = new Map<string, Set<string>>();

  crearArticulo(
    titulo: string,
    contenido: string,
    categoría: string,
    etiquetas?: string[]
  ): ArticuloConocimiento {
    const id = `articulo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const ahora = new Date();

    const articulo: ArticuloConocimiento = {
      id,
      titulo,
      contenido,
      categoría,
      etiquetas: etiquetas || [],
      vistas: 0,
      utilidad: 50,
      fechaCreacion: ahora,
      fechaActualizacion: ahora,
    };

    this.articulos.set(id, articulo);
    this.indexarArticulo(id, titulo, contenido);

    return articulo;
  }

  private indexarArticulo(id: string, titulo: string, contenido: string): void {
    const palabras = new Set<string>();
    const texto = `${titulo} ${contenido}`.toLowerCase().split(/\W+/);

    for (const palabra of texto) {
      if (palabra.length > 2) {
        if (!this.indiceTexto.has(palabra)) {
          this.indiceTexto.set(palabra, new Set());
        }
        this.indiceTexto.get(palabra)!.add(id);
      }
    }
  }

  buscarSolución(consulta: string): SolucionSugerida[] {
    const palabrasClave = consulta.toLowerCase().split(/\W+/).filter(p => p.length > 2);
    const resultados = new Map<string, number>();

    for (const palabra of palabrasClave) {
      const articulosConPalabra = this.indiceTexto.get(palabra) || new Set();
      for (const articuloId of articulosConPalabra) {
        resultados.set(articuloId, (resultados.get(articuloId) || 0) + 1);
      }
    }

    const sugerencias: SolucionSugerida[] = [];
    for (const [articuloId, coincidencias] of resultados) {
      const articulo = this.articulos.get(articuloId);
      if (articulo) {
        const similitud = Math.min(100, (coincidencias / palabrasClave.length) * 100);
        if (similitud > 30) {
          sugerencias.push({
            articuloId,
            titulo: articulo.titulo,
            similitud: Math.round(similitud),
            categoría: articulo.categoría,
          });
        }
      }
    }

    // Ordenar por similitud descendente
    return sugerencias.sort((a, b) => b.similitud - a.similitud).slice(0, 5);
  }

  marcarÚtil(articuloId: string, útil: boolean): void {
    const articulo = this.articulos.get(articuloId);
    if (articulo) {
      const cambio = útil ? 2 : -1;
      const nuevaUtilidad = Math.max(0, Math.min(100, articulo.utilidad + cambio));
      this.articulos.set(articuloId, {
        ...articulo,
        utilidad: nuevaUtilidad,
      });
    }
  }

  sugerirSoluciónACliente(articuloId: string, clienteId: string): {
    sugerencia: SolucionSugerida | null;
  } {
    const articulo = this.articulos.get(articuloId);
    if (!articulo) return { sugerencia: null };

    return {
      sugerencia: {
        articuloId,
        titulo: articulo.titulo,
        similitud: 100,
        categoría: articulo.categoría,
      },
    };
  }

  obtenerArticulosMásÚtiles(limite: number = 10): ArticuloConocimiento[] {
    return Array.from(this.articulos.values())
      .sort((a, b) => b.utilidad - a.utilidad)
      .slice(0, limite);
  }

  obtenerArticulosPorCategoría(categoría: string): ArticuloConocimiento[] {
    return Array.from(this.articulos.values())
      .filter(a => a.categoría === categoría)
      .sort((a, b) => b.utilidad - a.utilidad);
  }

  incrementarVistas(articuloId: string): void {
    const articulo = this.articulos.get(articuloId);
    if (articulo) {
      this.articulos.set(articuloId, {
        ...articulo,
        vistas: articulo.vistas + 1,
      });
    }
  }

  obtenerArticulo(articuloId: string): ArticuloConocimiento | undefined {
    return this.articulos.get(articuloId);
  }
}
