import { randomUUID } from "crypto";
import type {
  Campaña,
  EstadoCampaña,
  PlantillaEmail,
} from '../elements/email-marketing.js';

export interface EnviarCampañaResultado {
  readonly enviados: number;
  readonly errores: Array<{ email: string; motivo: string }>;
}

export class MotorCampañasEmail {
  private plantillas: Map<string, PlantillaEmail> = new Map();
  private campañas: Map<string, Campaña> = new Map();
  private colaEnvío: string[] = [];

  crearPlantilla(
    nombre: string,
    asunto: string,
    contenidoHTML: string,
    variables?: string[]
  ): PlantillaEmail {
    const id = randomUUID();

    const plantilla: PlantillaEmail = {
      id,
      nombre,
      asunto,
      contenidoHTML,
      variables: variables || [],
      createdAt: new Date(),
    };

    this.plantillas.set(id, plantilla);
    return plantilla;
  }

  crearCampaña(
    nombre: string,
    plantillaId: string,
    segmentoId: string,
    fechaEnvío: Date
  ): Campaña {
    const plantilla = this.plantillas.get(plantillaId);
    if (!plantilla) {
      throw new Error(`Plantilla ${plantillaId} no existe`);
    }

    const id = randomUUID();
    const ahora = new Date();

    const campaña: Campaña = {
      id,
      nombre,
      plantillaId,
      segmentoId,
      estado: "borrador",
      fechaEnvío,
      remitente: "noreply@example.com",
      asuntoPersonalizado: false,
      createdAt: ahora,
    };

    this.campañas.set(id, campaña);
    return campaña;
  }

  programarCampaña(campaña: Campaña): void {
    const existente = this.campañas.get(campaña.id);
    if (existente) {
      const actualizada: Campaña = {
        ...existente,
        estado: "programada",
      };
      this.campañas.set(campaña.id, actualizada);
      this.colaEnvío.push(campaña.id);
    }
  }

  async enviarCampaña(campaña: Campaña): Promise<EnviarCampañaResultado> {
    const plantilla = this.plantillas.get(campaña.plantillaId);
    if (!plantilla) {
      throw new Error(`Plantilla ${campaña.plantillaId} no existe`);
    }

    const actualizada: Campaña = {
      ...campaña,
      estado: "enviada",
    };
    this.campañas.set(campaña.id, actualizada);

    return {
      enviados: 1,
      errores: [],
    };
  }

  personalizarPlantilla(
    plantilla: PlantillaEmail,
    datos: Record<string, unknown>
  ): string {
    let contenido = plantilla.contenidoHTML;

    for (const variable of plantilla.variables) {
      const valor = datos[variable];
      const regex = new RegExp(`{{${variable}}}`, "g");
      contenido = contenido.replace(regex, String(valor || ""));
    }

    return contenido;
  }

  cancelarCampaña(campaña: Campaña): void {
    if (campaña.estado === "borrador" || campaña.estado === "programada") {
      const actualizada: Campaña = {
        ...campaña,
        estado: "cancelada",
      };
      this.campañas.set(campaña.id, actualizada);
    }
  }

  obtenerCampaña(id: string): Campaña | undefined {
    return this.campañas.get(id);
  }

  obtenerPlantilla(id: string): PlantillaEmail | undefined {
    return this.plantillas.get(id);
  }

  listarCampañas(): Campaña[] {
    return Array.from(this.campañas.values());
  }

  listarPlantillas(): PlantillaEmail[] {
    return Array.from(this.plantillas.values());
  }

  actualizarEstadoCampaña(id: string, estado: EstadoCampaña): void {
    const campaña = this.campañas.get(id);
    if (campaña) {
      const actualizada: Campaña = {
        ...campaña,
        estado,
      };
      this.campañas.set(id, actualizada);
    }
  }
}
