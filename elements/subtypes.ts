/**
 * Subtipos cerrados de los 10 elementos.
 * Añadir un valor exige versión mayor de la gramática.
 */

export const ParteSubtypes = [
  "cliente",
  "proveedor",
  "tercero_intermediado",
  "garante",
] as const;
export type ParteSubtype = (typeof ParteSubtypes)[number];

export const ActorSubtypes = ["humano", "sistema", "agente_ia"] as const;
export type ActorSubtype = (typeof ActorSubtypes)[number];

export const OfertaSubtypes = [
  "bien",
  "trabajo",
  "acceso",
  "uso",
  "dinero_cobertura",
] as const;
export type OfertaSubtype = (typeof OfertaSubtypes)[number];

export const RecursoSubtypes = [
  "consumible",
  "capacidad_temporal",
  "retornable",
  "capital",
] as const;
export type RecursoSubtype = (typeof RecursoSubtypes)[number];

export const CompromisoSubtypes = [
  "entregar",
  "pagar",
  "devolver",
  "mantener",
] as const;
export type CompromisoSubtype = (typeof CompromisoSubtypes)[number];

export const MovimientoSubtypes = [
  "cargo",
  "liquidacion",
  "reembolso",
  "retencion",
  "reparto",
] as const;
export type MovimientoSubtype = (typeof MovimientoSubtypes)[number];

export const EvidenciaSubtypes = [
  "aceptacion",
  "confirmacion_sistema",
  "constancia_fisica",
] as const;
export type EvidenciaSubtype = (typeof EvidenciaSubtypes)[number];

export const TransaccionSubtypes = [
  "venta",
  "servicio_proyecto",
  "suscripcion",
  "uso_temporal",
  "intermediacion",
  "financiera",
] as const;
export type TransaccionSubtype = (typeof TransaccionSubtypes)[number];

/** El elemento Estado reutiliza los tipos de estado de la gramática. */
export const EstadoSubtypes = [
  "inicial",
  "intermedio",
  "en_espera",
  "terminal_exito",
  "terminal_excepcion",
] as const;
export type EstadoSubtype = (typeof EstadoSubtypes)[number];

/** El elemento Evento reutiliza los tipos de evento de la gramática. */
export const EventoSubtypes = [
  "transicion",
  "excepcion",
  "modificacion",
  "vencimiento",
] as const;
export type EventoSubtype = (typeof EventoSubtypes)[number];

export type AnyElementSubtype =
  | ParteSubtype
  | ActorSubtype
  | OfertaSubtype
  | RecursoSubtype
  | CompromisoSubtype
  | MovimientoSubtype
  | EvidenciaSubtype
  | TransaccionSubtype
  | EstadoSubtype
  | EventoSubtype;
