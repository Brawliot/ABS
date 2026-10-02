/**
 * Tipos para Lead Management (Captura, Nurturing, Scoring)
 * Phase 5 Final - MVP Launch
 */

// Tipos para Formularios
export type EstadoFormulario = "borrador" | "publicado" | "pausado" | "archivado";

export interface Campo {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: "texto" | "email" | "teléfono" | "select" | "checkbox" | "textarea";
  readonly requerido: boolean;
  readonly placeholder?: string;
  readonly opciones?: string[];
}

export interface Formulario {
  readonly id: string;
  readonly nombre: string;
  readonly descripción: string;
  readonly campos: Campo[];
  readonly estado: EstadoFormulario;
  readonly ctaTexto: string;
  readonly ctaColor: string;
  readonly fechaCreación: Date;
  readonly fechaActualización: Date;
  readonly webhookUrl?: string;
}

export interface EnvíoFormulario {
  readonly id: string;
  readonly formularioId: string;
  readonly datos: Record<string, string>;
  readonly fechaEnvío: Date;
  readonly ipOrigen: string;
  readonly userAgent: string;
}

// Tipos para Leads
export type EstadoLead = "nuevo" | "contactado" | "prospecto" | "cliente" | "perdido";

export interface Lead {
  readonly id: string;
  readonly email: string;
  readonly nombre: string;
  readonly empresa: string | undefined;
  readonly teléfono: string | undefined;
  estado: EstadoLead;
  puntuación: number;
  temperatura: "fría" | "tibia" | "caliente";
  readonly fechaCaptura: Date;
  fechaÚltimoContacto: Date | undefined;
  readonly fuente: string; // "formulario", "importación", "manual"
  readonly etiquetas: string[];
  notas: string | undefined;
}

// Tipos para Email Nurturing
export type TipoSecuencia = "bienvenida" | "educación" | "descuento" | "reenganche";

export interface Email {
  readonly id: string;
  readonly asunto: string;
  readonly cuerpo: string;
  readonly variables: string[];
}

export interface MailingSecuencia {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoSecuencia;
  readonly descripción: string;
  readonly emails: Email[];
  readonly intervalosDías: number[]; // Días entre cada email
  readonly activa: boolean;
}

export interface AsignacionSecuencia {
  readonly id: string;
  readonly leadId: string;
  readonly secuenciaId: string;
  readonly fechaInicio: Date;
  readonly fechaFin?: Date;
  readonly emailActualIndex: number;
  readonly completada: boolean;
}

export interface RegistroNurturing {
  readonly id: string;
  readonly leadId: string;
  readonly asignacionId: string;
  readonly emailId: string;
  readonly tipo: "enviado" | "abierto" | "click" | "rebote";
  readonly fechaRegistro: Date;
  readonly metadatos?: Record<string, unknown>;
}

// Tipos para Scoring
export interface ReglaScoring {
  readonly id: string;
  readonly nombre: string;
  readonly evento: "email_abierto" | "email_click" | "página_visitada" | "formulario_enviado" | "demo_solicitada";
  readonly puntos: number;
}

export interface EventoLead {
  readonly id: string;
  readonly leadId: string;
  readonly tipo: "email_abierto" | "email_click" | "página_visitada" | "formulario_enviado" | "demo_solicitada";
  readonly puntos: number;
  readonly fecha: Date;
  readonly metadatos?: Record<string, unknown>;
}

export interface PrediccionConversión {
  readonly leadId: string;
  readonly probabilidad: number; // 0-100
  readonly factores: string[];
  readonly fechaCálculo: Date;
}
