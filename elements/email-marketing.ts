export type EstadoCampaña = "borrador" | "programada" | "enviada" | "completada" | "cancelada";
export type TipoSegmento = "clientes" | "leads" | "inactivos" | "vip" | "custom";
export type EstadoContacto = "activo" | "inactivo" | "bloqueado";
export type TipoEvento = "enviado" | "abierto" | "click" | "rebote" | "baja";
export type TipoRebote = "soft" | "hard";

export interface ContactoEmail {
  readonly id: string;
  readonly email: string;
  readonly nombre?: string | undefined;
  readonly empresa?: string | undefined;
  readonly segmentos: string[];
  readonly estado: EstadoContacto;
  readonly fechaSuscripción: Date;
  readonly últimoAbierto?: Date | undefined;
  readonly últimoClick?: Date | undefined;
  readonly metadatos?: Record<string, unknown> | undefined;
}

export interface SegmentoCriterio {
  readonly campo: string;
  readonly operador: "=" | ">" | "<" | "contains" | "in";
  readonly valor: unknown;
}

export interface Segmento {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoSegmento;
  readonly criterios?: SegmentoCriterio[] | undefined;
  readonly contactosCount: number;
  readonly createdAt: Date;
}

export interface PlantillaEmail {
  readonly id: string;
  readonly nombre: string;
  readonly asunto: string;
  readonly contenidoHTML: string;
  readonly contenidoTexto?: string | undefined;
  readonly variables: string[];
  readonly createdAt: Date;
}

export interface EstadísticasCampaña {
  readonly enviados: number;
  readonly abiertos: number;
  readonly clicks: number;
  readonly rebotes: number;
  readonly bajas: number;
  readonly tasaApertura: number;
  readonly tasaClick: number;
  readonly tasaConversión?: number;
}

export interface Campaña {
  readonly id: string;
  readonly nombre: string;
  readonly descripción?: string;
  readonly plantillaId: string;
  readonly segmentoId: string;
  readonly estado: EstadoCampaña;
  readonly fechaEnvío: Date;
  readonly remitente: string;
  readonly asuntoPersonalizado: boolean;
  readonly estadísticas?: EstadísticasCampaña;
  readonly createdAt: Date;
}

export interface DetallesEvento {
  readonly url?: string;
  readonly dispositivo?: string;
  readonly navegador?: string;
}

export interface EventoEmail {
  readonly id: string;
  readonly campaña_id: string;
  readonly contacto_id: string;
  readonly email: string;
  readonly tipo: TipoEvento;
  readonly timestamp: Date;
  readonly detalles?: DetallesEvento;
}
