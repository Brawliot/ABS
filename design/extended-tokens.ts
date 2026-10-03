/**
 * Sistema extendido de tokens: 60+ tokens de diseño.
 * Agregamos animación, elevación, estados, densidad y tipografía escalada.
 */

import type { DesignDensity } from "./schema.js";

/** Duración de animaciones (ms). */
export interface AnimationTokens {
  readonly fast: number;
  readonly normal: number;
  readonly slow: number;
}

/** Funciones de easing. */
export interface EasingTokens {
  readonly easeIn: string;
  readonly easeOut: string;
  readonly easeInOut: string;
  readonly cubic: string;
}

/** Sombras para profundidad visual. */
export interface ElevationTokens {
  readonly none: string;
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
  readonly xl: string;
}

/** Estados de interacción. */
export interface StateTokens {
  readonly focus: {
    readonly outlineWidth: number;
    readonly outlineColor: string;
  };
  readonly disabled: {
    readonly opacity: number;
    readonly cursor: string;
  };
  readonly loading: {
    readonly opacity: number;
  };
  readonly error: {
    readonly bgColor: string;
    readonly textColor: string;
  };
}

/** Densidades de espaciado (compacta, normal, espaciosa). */
export interface DensityVariant {
  readonly spacing: readonly number[];
  readonly lineHeight: number;
  readonly letterSpacing: number;
}

export interface DensityTokens {
  readonly compacta: DensityVariant;
  readonly normal: DensityVariant;
  readonly espaciosa: DensityVariant;
}

/** Escalas tipográficas dinámicas. */
export interface TypographyScale {
  readonly xs: { size: number; lineHeight: number; weight: number };
  readonly sm: { size: number; lineHeight: number; weight: number };
  readonly base: { size: number; lineHeight: number; weight: number };
  readonly lg: { size: number; lineHeight: number; weight: number };
  readonly xl: { size: number; lineHeight: number; weight: number };
  readonly "2xl": { size: number; lineHeight: number; weight: number };
}

/**
 * Tokens extendidos completos (60+).
 */
export interface ExtendedTokens {
  readonly animation: AnimationTokens;
  readonly easing: EasingTokens;
  readonly elevation: ElevationTokens;
  readonly states: StateTokens;
  readonly density: DensityTokens;
  readonly typographyScale: TypographyScale;
}

/**
 * Tokens por defecto (MVP).
 */
export function defaultExtendedTokens(): ExtendedTokens {
  return {
    animation: {
      fast: 150,
      normal: 300,
      slow: 500,
    },
    easing: {
      easeIn: "cubic-bezier(0.4, 0, 1, 1)",
      easeOut: "cubic-bezier(0, 0, 0.2, 1)",
      easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
      cubic: "cubic-bezier(0.42, 0, 0.58, 1)",
    },
    elevation: {
      none: "0 0 0 0 rgba(0,0,0,0)",
      sm: "0 1px 2px 0 rgba(0,0,0,0.05)",
      md: "0 4px 6px -1px rgba(0,0,0,0.1)",
      lg: "0 10px 15px -3px rgba(0,0,0,0.1)",
      xl: "0 20px 25px -5px rgba(0,0,0,0.1)",
    },
    states: {
      focus: {
        outlineWidth: 3,
        outlineColor: "var(--color-primario)",
      },
      disabled: {
        opacity: 0.5,
        cursor: "not-allowed",
      },
      loading: {
        opacity: 0.7,
      },
      error: {
        bgColor: "#fee2e2",
        textColor: "#991b1b",
      },
    },
    density: {
      compacta: {
        spacing: [2, 4, 6, 8, 12, 16],
        lineHeight: 1.3,
        letterSpacing: -0.02,
      },
      normal: {
        spacing: [4, 8, 12, 16, 24, 32],
        lineHeight: 1.5,
        letterSpacing: 0,
      },
      espaciosa: {
        spacing: [8, 12, 16, 24, 40, 56],
        lineHeight: 1.7,
        letterSpacing: 0.02,
      },
    },
    typographyScale: {
      xs: { size: 12, lineHeight: 1.2, weight: 400 },
      sm: { size: 14, lineHeight: 1.3, weight: 400 },
      base: { size: 16, lineHeight: 1.5, weight: 400 },
      lg: { size: 18, lineHeight: 1.6, weight: 400 },
      xl: { size: 20, lineHeight: 1.7, weight: 600 },
      "2xl": { size: 24, lineHeight: 1.8, weight: 700 },
    },
  };
}

/**
 * Genera tokens extendidos según densidad especificada.
 */
export function generateExtendedTokensForDensity(
  density: DesignDensity,
): ExtendedTokens {
  const base = defaultExtendedTokens();

  // Ajustar tipografía por densidad
  const scaleMultiplier =
    density === "compacta" ? 0.9 : density === "espaciosa" ? 1.1 : 1;

  const adjustedTypography: TypographyScale = {
    xs: {
      size: Math.round(base.typographyScale.xs.size * scaleMultiplier),
      lineHeight: base.density[density].lineHeight,
      weight: base.typographyScale.xs.weight,
    },
    sm: {
      size: Math.round(base.typographyScale.sm.size * scaleMultiplier),
      lineHeight: base.density[density].lineHeight,
      weight: base.typographyScale.sm.weight,
    },
    base: {
      size: Math.round(base.typographyScale.base.size * scaleMultiplier),
      lineHeight: base.density[density].lineHeight,
      weight: base.typographyScale.base.weight,
    },
    lg: {
      size: Math.round(base.typographyScale.lg.size * scaleMultiplier),
      lineHeight: base.density[density].lineHeight,
      weight: base.typographyScale.lg.weight,
    },
    xl: {
      size: Math.round(base.typographyScale.xl.size * scaleMultiplier),
      lineHeight: base.density[density].lineHeight,
      weight: base.typographyScale.xl.weight,
    },
    "2xl": {
      size: Math.round(base.typographyScale["2xl"].size * scaleMultiplier),
      lineHeight: base.density[density].lineHeight,
      weight: base.typographyScale["2xl"].weight,
    },
  };

  return {
    ...base,
    typographyScale: adjustedTypography,
  };
}

/**
 * Mapea tokens extendidos a valores CSS.
 */
export function extendedTokensToCss(tokens: ExtendedTokens): Record<string, string> {
  return {
    "--animation-fast": `${tokens.animation.fast}ms`,
    "--animation-normal": `${tokens.animation.normal}ms`,
    "--animation-slow": `${tokens.animation.slow}ms`,
    "--easing-in": tokens.easing.easeIn,
    "--easing-out": tokens.easing.easeOut,
    "--easing-in-out": tokens.easing.easeInOut,
    "--easing-cubic": tokens.easing.cubic,
    "--elevation-none": tokens.elevation.none,
    "--elevation-sm": tokens.elevation.sm,
    "--elevation-md": tokens.elevation.md,
    "--elevation-lg": tokens.elevation.lg,
    "--elevation-xl": tokens.elevation.xl,
    "--focus-outline-width": `${tokens.states.focus.outlineWidth}px`,
    "--focus-outline-color": tokens.states.focus.outlineColor,
    "--disabled-opacity": `${tokens.states.disabled.opacity}`,
    "--disabled-cursor": tokens.states.disabled.cursor,
    "--loading-opacity": `${tokens.states.loading.opacity}`,
    "--error-bg-color": tokens.states.error.bgColor,
    "--error-text-color": tokens.states.error.textColor,
    "--typography-xs-size": `${tokens.typographyScale.xs.size}px`,
    "--typography-xs-line-height": `${tokens.typographyScale.xs.lineHeight}`,
    "--typography-sm-size": `${tokens.typographyScale.sm.size}px`,
    "--typography-sm-line-height": `${tokens.typographyScale.sm.lineHeight}`,
    "--typography-base-size": `${tokens.typographyScale.base.size}px`,
    "--typography-base-line-height": `${tokens.typographyScale.base.lineHeight}`,
    "--typography-lg-size": `${tokens.typographyScale.lg.size}px`,
    "--typography-lg-line-height": `${tokens.typographyScale.lg.lineHeight}`,
    "--typography-xl-size": `${tokens.typographyScale.xl.size}px`,
    "--typography-xl-line-height": `${tokens.typographyScale.xl.lineHeight}`,
    "--typography-2xl-size": `${tokens.typographyScale["2xl"].size}px`,
    "--typography-2xl-line-height": `${tokens.typographyScale["2xl"].lineHeight}`,
  };
}
