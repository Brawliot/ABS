/**
 * Tokens temáticos para light/dark mode.
 * Define paletas completas por tema y resuelve tokens dinámicamente.
 */

import type { ColorTokens, DesignTokens } from "./schema.js";

export type ThemeVariant = "light" | "dark";

/**
 * Paleta temática completa (light + dark).
 */
export interface ThemedColorTokens {
  readonly light: ColorTokens;
  readonly dark: ColorTokens;
}

/**
 * Especificación temática del sistema de diseño.
 */
export interface ThemeSpec {
  readonly id: string;
  readonly defaultTheme: ThemeVariant;
  readonly colors: ThemedColorTokens;
}

/**
 * Genera paletas light/dark para un sistema de diseño.
 */
export function generateThemedColors(
  baseColors: ColorTokens,
  theme: "neutral" | "warm" | "cool" | "vibrant",
  suggestDarkModeDefault: boolean = false,
): ThemedColorTokens {
  // Función auxiliar: invertir luminosidad
  const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1]!, 16),
          parseInt(result[2]!, 16),
          parseInt(result[3]!, 16),
        ]
      : [0, 0, 0];
  };

  const rgbToHex = (r: number, g: number, b: number): string => {
    return (
      "#" +
      [r, g, b]
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("")
    );
  };

  const lighten = (hex: string, factor: number): string => {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(
      Math.min(255, Math.round(r + (255 - r) * factor)),
      Math.min(255, Math.round(g + (255 - g) * factor)),
      Math.min(255, Math.round(b + (255 - b) * factor)),
    );
  };

  const darken = (hex: string, factor: number): string => {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(
      Math.round(r * (1 - factor)),
      Math.round(g * (1 - factor)),
      Math.round(b * (1 - factor)),
    );
  };

  // Paleta light estándar
  const lightColors: ColorTokens = {
    primary: baseColors.primary,
    secondary: baseColors.secondary,
    neutrals: {
      background: theme === "warm" ? "#FDF8F3" : "#F8F9FA",
      surface: "#FFFFFF",
      text: theme === "warm" ? "#2C1810" : "#0F172A",
      muted: theme === "warm" ? "#8B7355" : "#64748B",
      border: theme === "warm" ? "#E8DDD0" : "#E2E8F0",
    },
    semantic: baseColors.semantic,
  };

  // Paleta dark: invertir los neutrales
  const darkColors: ColorTokens = {
    primary: lighten(baseColors.primary, 0.15),
    secondary: lighten(baseColors.secondary, 0.1),
    neutrals: {
      background: theme === "warm" ? "#1A1410" : "#0F172A",
      surface: theme === "warm" ? "#2D241C" : "#1E293B",
      text: theme === "warm" ? "#F5EFE7" : "#F1F5F9",
      muted: theme === "warm" ? "#A09080" : "#94A3B8",
      border: theme === "warm" ? "#3D342C" : "#334155",
    },
    semantic: {
      success: lighten(baseColors.semantic.success, 0.2),
      warning: lighten(baseColors.semantic.warning, 0.2),
      danger: lighten(baseColors.semantic.danger, 0.2),
    },
  };

  return {
    light: lightColors,
    dark: darkColors,
  };
}

/**
 * Resuelve los tokens de diseño para un tema específico.
 */
export function resolveTokensForTheme(
  designTokens: DesignTokens,
  themedColors: ThemedColorTokens,
  theme: ThemeVariant,
): DesignTokens {
  return {
    ...designTokens,
    colors: themedColors[theme],
  };
}

/**
 * Genera CSS variables para un tema.
 */
export function themeTokensToCssVariables(
  colors: ColorTokens,
  prefix: string = "--",
): Record<string, string> {
  return {
    [`${prefix}color-primary`]: colors.primary,
    [`${prefix}color-secondary`]: colors.secondary,
    [`${prefix}color-bg`]: colors.neutrals.background,
    [`${prefix}color-surface`]: colors.neutrals.surface,
    [`${prefix}color-text`]: colors.neutrals.text,
    [`${prefix}color-muted`]: colors.neutrals.muted,
    [`${prefix}color-border`]: colors.neutrals.border,
    [`${prefix}color-success`]: colors.semantic.success,
    [`${prefix}color-warning`]: colors.semantic.warning,
    [`${prefix}color-danger`]: colors.semantic.danger,
  };
}

/**
 * Genera tema completo con light y dark.
 */
export function generateCompleteTheme(
  id: string,
  baseColors: ColorTokens,
  colorTheme: "warm" | "cool" | "neutral" | "vibrant",
  suggestDarkModeDefault: boolean,
): ThemeSpec {
  const themedColors = generateThemedColors(baseColors, colorTheme, suggestDarkModeDefault);

  return {
    id,
    defaultTheme: suggestDarkModeDefault ? "dark" : "light",
    colors: themedColors,
  };
}

/**
 * Genera CSS para aplicar un tema (light + dark mode).
 */
export function generateThemeCss(theme: ThemeSpec): string {
  const lightVars = themeTokensToCssVariables(theme.colors.light);
  const darkVars = themeTokensToCssVariables(theme.colors.dark);

  let css = ":root {\n";
  for (const [key, value] of Object.entries(lightVars)) {
    css += `  ${key}: ${value};\n`;
  }
  css += "}\n\n";

  css += "@media (prefers-color-scheme: dark) {\n";
  css += "  :root {\n";
  for (const [key, value] of Object.entries(darkVars)) {
    css += `    ${key}: ${value};\n`;
  }
  css += "  }\n";
  css += "}\n\n";

  css += "[data-theme=\"light\"] {\n";
  for (const [key, value] of Object.entries(lightVars)) {
    css += `  ${key}: ${value};\n`;
  }
  css += "}\n\n";

  css += "[data-theme=\"dark\"] {\n";
  for (const [key, value] of Object.entries(darkVars)) {
    css += `  ${key}: ${value};\n`;
  }
  css += "}\n";

  return css;
}
