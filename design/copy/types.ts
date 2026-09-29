/**
 * Redactor de interfaz — plantillas de texto (propuesta única; fill en runtime).
 */

import type { TextTone } from "../schema.js";

export type CopyKind =
  | "label"
  | "button"
  | "confirmation"
  | "empty"
  | "help"
  | "error";

/** Longitud máxima por tipo (caracteres, plantilla sin expandir). */
export const COPY_MAX_LENGTH: Readonly<Record<CopyKind, number>> = {
  label: 48,
  button: 56,
  confirmation: 180,
  empty: 220,
  help: 260,
  error: 360,
};

export interface CopyTemplate {
  readonly id: string;
  readonly kind: CopyKind;
  /** Clave estable (p. ej. action.recibir.button). */
  readonly key: string;
  /** Plantilla con {{variables}}. */
  readonly template: string;
  /** Variables que deben rellenarse; en errores = hechos de la traza. */
  readonly requiredVariables: readonly string[];
  readonly locale: string;
}

/**
 * Vocabulario de negocio (capa superpuesta): sustituye jerga técnica.
 * Ej.: "evidencia de entrega" → "albarán".
 */
export type BusinessVocabulary = Readonly<Record<string, string>>;

export interface InterfaceCopyPack {
  readonly version: string;
  readonly contentHash: string;
  readonly sourceUiSpecHash: string;
  readonly locale: string;
  readonly tone: TextTone;
  readonly templates: readonly CopyTemplate[];
  readonly vocabulary: BusinessVocabulary;
  readonly proposedAt: string;
}

export class CopyValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[],
  ) {
    super(message);
    this.name = "CopyValidationError";
  }
}

export class CopyFillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopyFillError";
  }
}
