/**
 * Advanced Personalization Engine
 * Personaliza diseño por:
 * - Role (admin/manager → dense; customer → simple)
 * - Preferences (dark/light, accessibility)
 * - Context (mobile/tablet/desktop)
 * - Language (RTL/LTR)
 */

import type { DesignSystem } from "../design/schema.js";

export type UserRole = "admin" | "manager" | "operator" | "customer" | "guest";
export type ColorScheme = "light" | "dark" | "auto";
export type AccessibilityMode = "normal" | "high-contrast" | "dyslexia-friendly" | "motion-reduced";
export type Viewport = "mobile" | "tablet" | "desktop";
export type TextDirection = "ltr" | "rtl";

export interface UserPreferences {
  readonly role: UserRole;
  readonly colorScheme: ColorScheme;
  readonly accessibility: AccessibilityMode;
  readonly textSize: "small" | "normal" | "large" | "extra-large";
  readonly reduceMotion: boolean;
  readonly language?: string;
}

export interface UserContext {
  readonly viewport: Viewport;
  readonly textDirection: TextDirection;
  readonly timezone?: string;
}

export interface PersonalizationConfig {
  readonly user: UserPreferences;
  readonly context: UserContext;
}

export interface PersonalizedDesignSystem extends DesignSystem {
  personalization?: {
    readonly config: PersonalizationConfig;
    readonly appliedTransforms: readonly string[];
  };
}

/** Motor de personalización de diseño */
export function personalizeDesign(
  baseDesignSystem: DesignSystem,
  config: PersonalizationConfig,
): PersonalizedDesignSystem {
  let personalized = JSON.parse(JSON.stringify(baseDesignSystem)) as PersonalizedDesignSystem;
  const transforms: string[] = [];

  // Aplicar transformaciones por rol
  personalized = applyRoleBasedPersonalization(personalized, config.user.role);
  transforms.push(`role:${config.user.role}`);

  // Aplicar transformaciones por esquema de color
  personalized = applyColorSchemePersonalization(personalized, config.user.colorScheme);
  transforms.push(`colorScheme:${config.user.colorScheme}`);

  // Aplicar transformaciones de accesibilidad
  personalized = applyAccessibilityPersonalization(
    personalized,
    config.user.accessibility,
    config.user.textSize,
    config.user.reduceMotion,
  );
  transforms.push(`accessibility:${config.user.accessibility}`);
  transforms.push(`textSize:${config.user.textSize}`);

  // Aplicar transformaciones por viewport
  personalized = applyViewportPersonalization(personalized, config.context.viewport);
  transforms.push(`viewport:${config.context.viewport}`);

  // Aplicar transformaciones por dirección de texto
  personalized = applyTextDirectionPersonalization(personalized, config.context.textDirection);
  transforms.push(`textDirection:${config.context.textDirection}`);

  // @ts-ignore - Acceso a propiedad mutable temporalmente
  personalized.personalization = {
    config,
    appliedTransforms: transforms,
  };

  return personalized;
}

function applyRoleBasedPersonalization(
  ds: PersonalizedDesignSystem,
  role: UserRole,
): PersonalizedDesignSystem {
  const result = JSON.parse(JSON.stringify(ds)) as PersonalizedDesignSystem;

  if (role === "admin" || role === "manager") {
    // Diseño denso, data-forward
    // -15% spacing, -10% typography
    const spacingTokens = Object.entries(result.tokens || {}).filter(
      ([k]) => k.startsWith("spacing.") || k.startsWith("espaciado."),
    );
    for (const [key, value] of spacingTokens) {
      if (typeof value === "string" && value.match(/^(\d+)(px|rem|em)$/)) {
        const match = value.match(/^(\d+)(px|rem|em)$/)!;
        const num = parseInt(match[1], 10);
        const unit = match[2];
        const decreased = Math.max(4, Math.round(num * 0.85));
        result.tokens![key] = `${decreased}${unit}`;
      }
    }
  } else if (role === "customer" || role === "guest") {
    // Diseño simple, minimal
    // +15% spacing, +10% typography
    const spacingTokens = Object.entries(result.tokens || {}).filter(
      ([k]) => k.startsWith("spacing.") || k.startsWith("espaciado."),
    );
    for (const [key, value] of spacingTokens) {
      if (typeof value === "string" && value.match(/^(\d+)(px|rem|em)$/)) {
        const match = value.match(/^(\d+)(px|rem|em)$/)!;
        const num = parseInt(match[1], 10);
        const unit = match[2];
        const increased = Math.round(num * 1.15);
        result.tokens![key] = `${increased}${unit}`;
      }
    }
  }

  return result;
}

function applyColorSchemePersonalization(
  ds: PersonalizedDesignSystem,
  colorScheme: ColorScheme,
): PersonalizedDesignSystem {
  const result = JSON.parse(JSON.stringify(ds)) as PersonalizedDesignSystem;

  if (colorScheme === "dark" || colorScheme === "light") {
    // Invertir colores según esquema
    const colorTokens = Object.entries(result.tokens || {}).filter(
      ([k]) => k.startsWith("color.") || k.startsWith("color_"),
    );

    for (const [key, value] of colorTokens) {
      if (typeof value === "string" && value.startsWith("#")) {
        if (colorScheme === "dark") {
          // Si es light mode, invertir a dark
          result.tokens![key] = invertColor(value);
        }
        // light mode: mantener colores
      }
    }
  }

  return result;
}

function applyAccessibilityPersonalization(
  ds: PersonalizedDesignSystem,
  mode: AccessibilityMode,
  textSize: string,
  reduceMotion: boolean,
): PersonalizedDesignSystem {
  const result = JSON.parse(JSON.stringify(ds)) as PersonalizedDesignSystem;

  // High contrast: aumentar contraste de colores
  if (mode === "high-contrast") {
    const colorTokens = Object.entries(result.tokens || {}).filter(
      ([k]) => k.startsWith("color.") || k.startsWith("color_"),
    );
    for (const [key, value] of colorTokens) {
      if (typeof value === "string" && value.startsWith("#")) {
        result.tokens![key] = increaseContrast(value);
      }
    }
  }

  // Dyslexia friendly: fuente específica, spacing
  if (mode === "dyslexia-friendly") {
    const typographyTokens = Object.entries(result.tokens || {}).filter(
      ([k]) => k.startsWith("typography.") || k.startsWith("tipografia."),
    );
    for (const [key, value] of typographyTokens) {
      if (typeof value === "object" && value !== null && "fontFamily" in value) {
        const typo = value as Record<string, unknown>;
        typo.fontFamily = "OpenDyslexic, sans-serif";
        typo.lineHeight = "1.8";
        typo.letterSpacing = "0.05em";
      }
    }
  }

  // Ajustar tamaño de texto
  const textSizeFactors: Record<string, number> = {
    small: 0.9,
    normal: 1,
    large: 1.15,
    "extra-large": 1.35,
  };

  const factor = textSizeFactors[textSize] || 1;
  if (factor !== 1) {
    const typographyTokens = Object.entries(result.tokens || {}).filter(
      ([k]) => k.startsWith("typography.") || k.startsWith("tipografia."),
    );
    for (const [key, value] of typographyTokens) {
      if (typeof value === "object" && value !== null && "fontSize" in value) {
        const typo = value as Record<string, unknown>;
        if (typeof typo.fontSize === "string" && typo.fontSize.match(/^(\d+)(px|rem)$/)) {
          const match = typo.fontSize.match(/^(\d+)(px|rem)$/)!;
          const num = parseInt(match[1], 10);
          const unit = match[2];
          const adjusted = Math.round(num * factor);
          typo.fontSize = `${adjusted}${unit}`;
        }
      }
    }
  }

  // Reducir motion
  if (reduceMotion) {
    const animationTokens = Object.entries(result.tokens || {}).filter(
      ([k]) => k.startsWith("animation.") || k.startsWith("motion."),
    );
    for (const [key] of animationTokens) {
      if (typeof result.tokens![key] === "object" && result.tokens![key] !== null) {
        const anim = result.tokens![key] as Record<string, unknown>;
        anim.duration = "0ms";
      }
    }
  }

  return result;
}

function applyViewportPersonalization(
  ds: PersonalizedDesignSystem,
  viewport: Viewport,
): PersonalizedDesignSystem {
  const result = JSON.parse(JSON.stringify(ds)) as PersonalizedDesignSystem;

  if (viewport === "mobile") {
    // Reducir spacing, ajustar tipografía para pantalla pequeña
    const spacingTokens = Object.entries(result.tokens || {}).filter(
      ([k]) => k.startsWith("spacing.") || k.startsWith("espaciado."),
    );
    for (const [key, value] of spacingTokens) {
      if (typeof value === "string" && value.match(/^(\d+)(px|rem|em)$/)) {
        const match = value.match(/^(\d+)(px|rem|em)$/)!;
        const num = parseInt(match[1], 10);
        const unit = match[2];
        const mobile = Math.max(4, Math.round(num * 0.75));
        result.tokens![key] = `${mobile}${unit}`;
      }
    }
  } else if (viewport === "tablet") {
    // Balance entre mobile y desktop
    const spacingTokens = Object.entries(result.tokens || {}).filter(
      ([k]) => k.startsWith("spacing.") || k.startsWith("espaciado."),
    );
    for (const [key, value] of spacingTokens) {
      if (typeof value === "string" && value.match(/^(\d+)(px|rem|em)$/)) {
        const match = value.match(/^(\d+)(px|rem|em)$/)!;
        const num = parseInt(match[1], 10);
        const unit = match[2];
        const tablet = Math.round(num * 0.9);
        result.tokens![key] = `${tablet}${unit}`;
      }
    }
  }

  return result;
}

function applyTextDirectionPersonalization(
  ds: PersonalizedDesignSystem,
  direction: TextDirection,
): PersonalizedDesignSystem {
  const result = JSON.parse(JSON.stringify(ds)) as PersonalizedDesignSystem;

  if (direction === "rtl") {
    // Agregar metadata para RTL
    if (!result.metadata) {
      result.metadata = {};
    }
    (result.metadata as Record<string, unknown>).textDirection = "rtl";
    (result.metadata as Record<string, unknown>).layoutDirection = "rtl";
  }

  return result;
}

/** Invertir color hex (para dark mode) */
function invertColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const inverted = [255 - r, 255 - g, 255 - b].map((x) => x.toString(16).padStart(2, "0"));
  return `#${inverted.join("")}`;
}

/** Aumentar contraste de color */
function increaseContrast(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // Aplicar gamma correction para aumentar contraste
  const gamma = 0.4;
  const [rNew, gNew, bNew] = [r, g, b].map((c) =>
    Math.pow(c, gamma) < 0.5 ? 0 : Math.round(Math.pow(c, gamma) * 255),
  );

  return `#${[rNew, gNew, bNew].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Guardar preferencias en localStorage-compatible format */
export function serializePreferences(prefs: UserPreferences): string {
  return JSON.stringify(prefs);
}

/** Cargar preferencias desde localStorage-compatible format */
export function deserializePreferences(serialized: string): UserPreferences {
  return JSON.parse(serialized) as UserPreferences;
}
