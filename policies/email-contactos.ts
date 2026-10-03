import { randomUUID } from "crypto";
import type {
  ContactoEmail,
  EstadoContacto,
  Segmento,
  SegmentoCriterio,
  TipoSegmento,
} from '../elements/email-marketing.js';

export interface ImportarContactosResultado {
  readonly agregados: number;
  readonly duplicados: number;
  readonly inválidos: number;
}

export interface BuscarContactosFiltros {
  readonly email?: string;
  readonly segmento?: string;
  readonly estado?: EstadoContacto;
  readonly últimoAbierto?: { desde: Date; hasta: Date };
}

export class MotorContactosEmail {
  private contactos: Map<string, ContactoEmail> = new Map();
  private segmentos: Map<string, Segmento> = new Map();
  private contactoSegmentos: Map<string, Set<string>> = new Map();

  crearContacto(
    email: string,
    nombre?: string,
    segmentos?: string[]
  ): ContactoEmail {
    const id = randomUUID();
    const ahora = new Date();

    const contacto: ContactoEmail = {
      id,
      email,
      nombre,
      segmentos: segmentos || [],
      estado: "activo",
      fechaSuscripción: ahora,
      metadatos: {},
    };

    this.contactos.set(id, contacto);

    if (segmentos && segmentos.length > 0) {
      this.contactoSegmentos.set(id, new Set(segmentos));
    }

    return contacto;
  }

  importarContactos(
    archivo: Array<{ nombre?: string; email: string }>
  ): ImportarContactosResultado {
    let agregados = 0;
    let duplicados = 0;
    let inválidos = 0;

    for (const fila of archivo) {
      if (!this.esEmailVálido(fila.email)) {
        inválidos++;
        continue;
      }

      const yaExiste = Array.from(this.contactos.values()).some(
        (c) => c.email === fila.email
      );

      if (yaExiste) {
        duplicados++;
        continue;
      }

      this.crearContacto(fila.email, fila.nombre);
      agregados++;
    }

    return { agregados, duplicados, inválidos };
  }

  crearSegmento(
    nombre: string,
    tipo: TipoSegmento,
    criterios?: SegmentoCriterio[]
  ): Segmento {
    const id = randomUUID();

    const segmento: Segmento = {
      id,
      nombre,
      tipo,
      criterios,
      contactosCount: 0,
      createdAt: new Date(),
    };

    this.segmentos.set(id, segmento);
    return segmento;
  }

  obtenerContactosPorSegmento(segmentoId: string): ContactoEmail[] {
    return Array.from(this.contactos.values()).filter((c) =>
      c.segmentos.includes(segmentoId)
    );
  }

  actualizarContactoEstado(
    contactoId: string,
    nuevoEstado: EstadoContacto
  ): void {
    const contacto = this.contactos.get(contactoId);
    if (contacto) {
      const actualizado: ContactoEmail = {
        ...contacto,
        estado: nuevoEstado,
      };
      this.contactos.set(contactoId, actualizado);
    }
  }

  buscarContactos(filtros: BuscarContactosFiltros): ContactoEmail[] {
    let resultados = Array.from(this.contactos.values());

    if (filtros.email) {
      resultados = resultados.filter((c) =>
        c.email.toLowerCase().includes(filtros.email!.toLowerCase())
      );
    }

    if (filtros.segmento) {
      resultados = resultados.filter((c) =>
        c.segmentos.includes(filtros.segmento!)
      );
    }

    if (filtros.estado) {
      resultados = resultados.filter((c) => c.estado === filtros.estado);
    }

    if (filtros.últimoAbierto) {
      resultados = resultados.filter((c) => {
        if (!c.últimoAbierto) return false;
        return (
          c.últimoAbierto >= filtros.últimoAbierto!.desde &&
          c.últimoAbierto <= filtros.últimoAbierto!.hasta
        );
      });
    }

    return resultados;
  }

  obtenerContacto(id: string): ContactoEmail | undefined {
    return this.contactos.get(id);
  }

  listarContactos(): ContactoEmail[] {
    return Array.from(this.contactos.values());
  }

  listarSegmentos(): Segmento[] {
    return Array.from(this.segmentos.values());
  }

  private esEmailVálido(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }
}
