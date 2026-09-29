/**
 * Validador determinista del sistema de diseño (antes de guardar).
 */

import { contrastRatio, parseHex } from "./contrast.js";
import {
  MAX_DESIGN_COLORS,
  MIN_TOUCH_TARGET_PX,
  WCAG_AA_CONTRAST,
  type DesignSystem,
  type HexColor,
} from "./schema.js";

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

const MOBILE_CHANNELS = new Set(["autoservicio"]);

function collectColors(system: DesignSystem): HexColor[] {
  const c = system.tokens.colors;
  return [
    c.primary,
    c.secondary,
    c.neutrals.background,
    c.neutrals.surface,
    c.neutrals.text,
    c.neutrals.muted,
    c.neutrals.border,
    c.semantic.success,
    c.semantic.warning,
    c.semantic.danger,
  ];
}

function assertHex(hex: string, path: string, issues: ValidationIssue[]): void {
  try {
    parseHex(hex);
  } catch {
    issues.push({
      code: "invalid_hex",
      message: `${path}: color hex inválido (${hex})`,
    });
  }
}

function isCoherentScale(scale: readonly number[]): boolean {
  if (scale.length < 3) return false;
  for (let i = 1; i < scale.length; i++) {
    const prev = scale[i - 1]!;
    const cur = scale[i]!;
    if (!(cur > prev)) return false;
    // Cada paso al menos +10% o +2px
    if (cur < prev * 1.1 && cur < prev + 2) return false;
  }
  return true;
}

function isTactileProfile(p: DesignSystem["usageProfiles"][number]): boolean {
  return (
    p.highContrast ||
    p.channel === "taller" ||
    p.channel === "presencial" ||
    /tablet|almacen|táctil|tactil|touch/i.test(p.label + p.id)
  );
}

/**
 * Valida un DesignSystem. Puro y determinista.
 */
export function validateDesignSystem(system: DesignSystem): ValidationResult {
  const issues: ValidationIssue[] = [];

  const colors = collectColors(system);
  for (const [i, hex] of colors.entries()) {
    assertHex(hex, `colors[${i}]`, issues);
  }
  if (colors.length > MAX_DESIGN_COLORS) {
    issues.push({
      code: "too_many_colors",
      message: `Más de ${MAX_DESIGN_COLORS} colores (${colors.length})`,
    });
  }

  // Contraste texto sobre fondo y superficie
  if (issues.every((x) => x.code !== "invalid_hex")) {
    const text = system.tokens.colors.neutrals.text;
    const bg = system.tokens.colors.neutrals.background;
    const surface = system.tokens.colors.neutrals.surface;
    const rBg = contrastRatio(text, bg);
    const rSurf = contrastRatio(text, surface);
    if (rBg < WCAG_AA_CONTRAST) {
      issues.push({
        code: "contrast_aa",
        message: `Contraste texto/fondo ${rBg.toFixed(2)} < ${WCAG_AA_CONTRAST} (WCAG AA)`,
      });
    }
    if (rSurf < WCAG_AA_CONTRAST) {
      issues.push({
        code: "contrast_aa",
        message: `Contraste texto/superficie ${rSurf.toFixed(2)} < ${WCAG_AA_CONTRAST} (WCAG AA)`,
      });
    }
  }

  if (!isCoherentScale(system.tokens.typography.scalePx)) {
    issues.push({
      code: "typography_scale",
      message: "Escala tipográfica incoherente (debe ser estrictamente creciente)",
    });
  }
  if (!isCoherentScale(system.tokens.spacing.scalePx)) {
    issues.push({
      code: "spacing_scale",
      message: "Escala de espaciado incoherente",
    });
  }

  // Patrones vs canal en perfiles
  for (const profile of system.usageProfiles) {
    if (
      MOBILE_CHANNELS.has(profile.channel) &&
      system.patterns.navegacion === "lateral"
    ) {
      // Perfil móvil no puede depender de nav lateral del sistema
      issues.push({
        code: "nav_channel",
        message: `Navegación lateral incompatible con canal móvil (${profile.channel} / ${profile.id})`,
      });
    }
    if (isTactileProfile(profile)) {
      if (profile.touchTargetMinPx < MIN_TOUCH_TARGET_PX) {
        issues.push({
          code: "touch_target",
          message: `Perfil táctil ${profile.id}: touchTargetMinPx ${profile.touchTargetMinPx} < ${MIN_TOUCH_TARGET_PX}`,
        });
      }
    }
  }

  // Si el sistema declara nav lateral, no debe usarse como default en móvil-only systems
  const onlyMobile =
    system.usageProfiles.length > 0 &&
    system.usageProfiles.every((p) => MOBILE_CHANNELS.has(p.channel));
  if (onlyMobile && system.patterns.navegacion === "lateral") {
    issues.push({
      code: "nav_channel",
      message: "Sistema solo-móvil no puede usar navegación lateral",
    });
  }

  if (!system.tokens.typography.headingFamily.trim()) {
    issues.push({
      code: "typography_family",
      message: "Falta familia tipográfica de títulos",
    });
  }
  if (!system.tokens.typography.bodyFamily.trim()) {
    issues.push({
      code: "typography_family",
      message: "Falta familia tipográfica de cuerpo",
    });
  }

  return { ok: issues.length === 0, issues };
}
