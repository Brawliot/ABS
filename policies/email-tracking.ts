import { randomUUID } from "crypto";
import type {
  EstadísticasCampaña,
  EventoEmail,
  TipoRebote,
} from '../elements/email-marketing.js';

export class MotorTrackingEmail {
  private eventos: EventoEmail[] = [];

  registrarApertura(
    campaña_id: string,
    contacto_id: string,
    pixel: string
  ): EventoEmail {
    const evento: EventoEmail = {
      id: randomUUID(),
      campaña_id,
      contacto_id,
      email: "",
      tipo: "abierto",
      timestamp: new Date(),
      detalles: {
        dispositivo: "web",
      },
    };

    this.eventos.push(evento);
    return evento;
  }

  registrarClick(
    campaña_id: string,
    contacto_id: string,
    url: string,
    dispositivo?: string
  ): EventoEmail {
    const evento: EventoEmail = {
      id: randomUUID(),
      campaña_id,
      contacto_id,
      email: "",
      tipo: "click",
      timestamp: new Date(),
      detalles: {
        url,
        dispositivo: dispositivo || "web",
      },
    };

    this.eventos.push(evento);
    return evento;
  }

  registrarRebote(
    campaña_id: string,
    email: string,
    motivo: TipoRebote
  ): EventoEmail {
    const evento: EventoEmail = {
      id: randomUUID(),
      campaña_id,
      contacto_id: "",
      email,
      tipo: "rebote",
      timestamp: new Date(),
      detalles: {
        dispositivo: motivo,
      },
    };

    this.eventos.push(evento);
    return evento;
  }

  registrarBaja(campaña_id: string, email: string): EventoEmail {
    const evento: EventoEmail = {
      id: randomUUID(),
      campaña_id,
      contacto_id: "",
      email,
      tipo: "baja",
      timestamp: new Date(),
    };

    this.eventos.push(evento);
    return evento;
  }

  registrarEnvío(
    campaña_id: string,
    contacto_id: string,
    email: string
  ): EventoEmail {
    const evento: EventoEmail = {
      id: randomUUID(),
      campaña_id,
      contacto_id,
      email,
      tipo: "enviado",
      timestamp: new Date(),
    };

    this.eventos.push(evento);
    return evento;
  }

  calcularEstadísticas(campaña_id: string): EstadísticasCampaña {
    const eventosCampaña = this.eventos.filter((e) => e.campaña_id === campaña_id);

    const enviados = eventosCampaña.filter((e) => e.tipo === "enviado").length;
    const abiertos = eventosCampaña.filter((e) => e.tipo === "abierto").length;
    const clicks = eventosCampaña.filter((e) => e.tipo === "click").length;
    const rebotes = eventosCampaña.filter((e) => e.tipo === "rebote").length;
    const bajas = eventosCampaña.filter((e) => e.tipo === "baja").length;

    const tasaApertura = enviados > 0 ? (abiertos / enviados) * 100 : 0;
    const tasaClick = enviados > 0 ? (clicks / enviados) * 100 : 0;
    const tasaConversión = abiertos > 0 ? (clicks / abiertos) * 100 : 0;

    return {
      enviados,
      abiertos,
      clicks,
      rebotes,
      bajas,
      tasaApertura,
      tasaClick,
      tasaConversión,
    };
  }

  obtenerEventosCampaña(campaña_id: string): EventoEmail[] {
    return this.eventos.filter((e) => e.campaña_id === campaña_id);
  }

  obtenerEventosContacto(
    campaña_id: string,
    contacto_id: string
  ): EventoEmail[] {
    return this.eventos.filter(
      (e) => e.campaña_id === campaña_id && e.contacto_id === contacto_id
    );
  }
}
