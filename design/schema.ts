/**
 * Esquema del sistema de diseño (MVP).
 * Toda propuesta LLM se valida contra este esquema cerrado.
 */

import type { PresentationChannel } from "../presentation/types.js";

export type DesignDensity = "compacta" | "normal" | "espaciosa";

export type ListPattern = "tabla" | "tarjetas" | "lista";
export type NavPattern = "lateral" | "superior" | "inferior_movil";
export type FormPattern = "una_columna" | "dos_columnas" | "por_pasos";
export type BoardPattern = "kanban" | "lista_agrupada";

export type TextTone = "formal" | "cercano" | "tecnico";

/** Hex #RRGGBB */
export type HexColor = string;

export interface NeutralColors {
  readonly background: HexColor;
  readonly surface: HexColor;
  readonly text: HexColor;
  readonly muted: HexColor;
  readonly border: HexColor;
}

export interface SemanticColors {
  readonly success: HexColor;
  readonly warning: HexColor;
  readonly danger: HexColor;
}

export interface ColorTokens {
  readonly primary: HexColor;
  readonly secondary: HexColor;
  readonly neutrals: NeutralColors;
  readonly semantic: SemanticColors;
}

export interface TypographyTokens {
  readonly headingFamily: string;
  readonly bodyFamily: string;
  /** Escala ascendente en px (p. ej. 12,14,16,20,24,32). */
  readonly scalePx: readonly number[];
}

export interface SpacingTokens {
  /** Escala de espaciado en px. */
  readonly scalePx: readonly number[];
}

export interface RadiusTokens {
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
}

export interface ShadowTokens {
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
}

export interface DesignTokens {
  readonly colors: ColorTokens;
  readonly typography: TypographyTokens;
  readonly spacing: SpacingTokens;
  readonly radii: RadiusTokens;
  readonly shadows: ShadowTokens;
}

export interface PatternSet {
  readonly listados: ListPattern;
  readonly navegacion: NavPattern;
  readonly formularios: FormPattern;
  readonly tableros: BoardPattern;
}

/**
 * Perfil de uso por rol y canal.
 * Ejemplo: tablet almacén → táctil grande + alto contraste.
 */
export interface UsageProfile {
  readonly id: string;
  readonly roleId: string;
  readonly channel: PresentationChannel;
  /** Objetivo táctil mínimo en px (WCAG/touch). */
  readonly touchTargetMinPx: number;
  readonly highContrast: boolean;
  readonly densityOverride?: DesignDensity;
  readonly label: string;
}

export interface DesignSystem {
  readonly id: string;
  readonly label: string;
  readonly tokens: DesignTokens;
  readonly density: DesignDensity;
  readonly patterns: PatternSet;
  readonly tone: TextTone;
  readonly usageProfiles: readonly UsageProfile[];
}

/** Máximo de colores distintos (primario+secundario+neutros+semánticos). */
export const MAX_DESIGN_COLORS = 12;

/** Contraste mínimo WCAG AA texto normal. */
export const WCAG_AA_CONTRAST = 4.5;

/** Tamaño táctil mínimo en perfiles táctiles. */
export const MIN_TOUCH_TARGET_PX = 44;

/** Intentos de regeneración si el validador rechaza. */
export const MAX_DESIGN_ATTEMPTS = 3;

export const DESIGN_SCHEMA_VERSION = "1.0.0-mvp";
