import { randomUUID } from "crypto";

export interface Comentario {
  readonly id: string;
  readonly documento_id: string;
  readonly línea: number;
  readonly texto: string;
  readonly autor_id: string;
  readonly fecha_creación: Date;
  readonly resuelta: boolean;
  readonly respuestas?: Comentario[];
}

export interface ResultadoBúsqueda {
  readonly documento_id: string;
  readonly coincidencias: string[];
  readonly líneas_coincidencia: number[];
}

export class MotorBúsquedaDocumentos {
  private documentosTexto: Map<string, string> = new Map();
  private comentarios: Map<string, Comentario[]> = new Map();
  private documentosRecientes: Map<string, Date> = new Map();

  registrarDocumento(documento_id: string, contenido: string): void {
    this.documentosTexto.set(documento_id, contenido);
    this.documentosRecientes.set(documento_id, new Date());
  }

  buscarFullText(
    término: string,
    tipos?: string[],
    usuario_id?: string
  ): ResultadoBúsqueda[] {
    const resultados: ResultadoBúsqueda[] = [];
    const término_lower = término.toLowerCase();

    for (const [docId, contenido] of this.documentosTexto) {
      const líneas = contenido.split("\n");
      const coincidencias: string[] = [];
      const líneas_coincidencia: number[] = [];

      líneas.forEach((línea, idx) => {
        if (línea.toLowerCase().includes(término_lower)) {
          coincidencias.push(línea);
          líneas_coincidencia.push(idx + 1);
        }
      });

      if (coincidencias.length > 0) {
        resultados.push({
          documento_id: docId,
          coincidencias,
          líneas_coincidencia,
        });
      }
    }

    return resultados;
  }

  agregarComentario(
    documento_id: string,
    línea: number,
    texto: string,
    autor_id: string
  ): Comentario {
    const comentario: Comentario = {
      id: randomUUID(),
      documento_id,
      línea,
      texto,
      autor_id,
      fecha_creación: new Date(),
      resuelta: false,
    };

    const comentariosDoc = this.comentarios.get(documento_id) ?? [];
    comentariosDoc.push(comentario);
    this.comentarios.set(documento_id, comentariosDoc);

    return comentario;
  }

  agregarRespuestaComentario(
    documento_id: string,
    comentario_padre_id: string,
    texto: string,
    autor_id: string
  ): Comentario {
    const comentarios = this.comentarios.get(documento_id) ?? [];
    const padre = comentarios.find((c) => c.id === comentario_padre_id);

    if (!padre) {
      throw new Error("Comentario padre no encontrado");
    }

    const respuesta: Comentario = {
      id: randomUUID(),
      documento_id,
      línea: padre.línea,
      texto,
      autor_id,
      fecha_creación: new Date(),
      resuelta: false,
    };

    // Agregar respuesta al padre
    const respuestas = padre.respuestas ?? [];
    respuestas.push(respuesta);

    // Actualizar padre (clonar y actualizar)
    const padreActualizado: Comentario = {
      ...padre,
      respuestas,
    };

    const índice = comentarios.findIndex((c) => c.id === comentario_padre_id);
    comentarios[índice] = padreActualizado;
    this.comentarios.set(documento_id, comentarios);

    return respuesta;
  }

  obtenerComentarios(documento_id: string): Comentario[] {
    return this.comentarios.get(documento_id) ?? [];
  }

  resolverComentario(comentario_id: string, documento_id: string): void {
    const comentarios = this.comentarios.get(documento_id) ?? [];
    const índice = comentarios.findIndex((c) => c.id === comentario_id);

    if (índice !== -1) {
      const comentario = comentarios[índice];
      comentarios[índice] = {
        id: comentario.id,
        documento_id: comentario.documento_id,
        línea: comentario.línea,
        texto: comentario.texto,
        autor_id: comentario.autor_id,
        fecha_creación: comentario.fecha_creación,
        resuelta: true,
        respuestas: comentario.respuestas,
      };
      this.comentarios.set(documento_id, comentarios);
    }
  }

  obtenerComentariosNoResueltos(documento_id: string): Comentario[] {
    const comentarios = this.comentarios.get(documento_id) ?? [];
    return comentarios.filter((c) => !c.resuelta);
  }

  obtenerDocumentosRecientes(usuario_id: string, días: number = 30): {
    documento_id: string;
    última_actualización: Date;
  }[] {
    const hace_días = new Date(Date.now() - días * 24 * 3600000);

    const recientes = Array.from(this.documentosRecientes.entries())
      .filter(([_, fecha]) => fecha >= hace_días)
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(([docId, fecha]) => ({
        documento_id: docId,
        última_actualización: fecha,
      }));

    return recientes;
  }

  actualizar_última_acceso(documento_id: string): void {
    this.documentosRecientes.set(documento_id, new Date());
  }

  obtenerEstadísticasComentarios(documento_id: string): {
    total: number;
    resueltos: number;
    pendientes: number;
    con_respuestas: number;
  } {
    const comentarios = this.comentarios.get(documento_id) ?? [];

    const total = comentarios.length;
    const resueltos = comentarios.filter((c) => c.resuelta).length;
    const pendientes = total - resueltos;
    const con_respuestas = comentarios.filter((c) => c.respuestas && c.respuestas.length > 0).length;

    return {
      total,
      resueltos,
      pendientes,
      con_respuestas,
    };
  }
}
