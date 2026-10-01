/**
 * Tipos del sistema de comunicación centralizado.
 */

export type Canal = "email" | "sms" | "whatsapp" | "push" | "slack" | "webhook" | "llamada";

export type Destinatario = "cliente" | "empresario" | "ambos";

export interface NotificationRule {
  readonly id: string;
  readonly evento: string;
  readonly canales: readonly Canal[];
  readonly destinatario: Destinatario;
  readonly plantilla: string;
  readonly condicion?: string;
}

export interface NotificacionParaEnviar {
  id: string;
  ruleId: string;
  evento: string;
  canal: Canal;
  destinatario: Destinatario;
  plantilla: string;
  contacto: string;
  datos: Record<string, any>;
  createdAt: string;
}

export interface ResultadoEnvioDatos {
  ok: boolean;
  detalle: string;
  intentos: number;
  proximoIntento?: string;
}
