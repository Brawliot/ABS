/**
 * Accessibility Auditor & Remediation Engine
 * Auditorías automáticas WCAG AAA:
 * - Color contrast (7:1)
 * - Color-blind simulation
 * - Focus indicators
 * - Touch targets
 * - Text scaling
 * - Motion sensitivity
 */

import type { DesignSystem } from "../design/schema.js";

export type ColorBlindnessType = "deuteranopia" | "protanopia" | "tritanopia";

export interface AccessibilityViolation {
  readonly id: string;
  readonly criterion: string;
  readonly level: "A" | "AA" | "AAA";
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly element: string;
  readonly issue: string;
  readonly remediation: string;
}

export interface AccessibilityAuditReport {
  readonly compliant: boolean;
  readonly wcagLevel: "A" | "AA" | "AAA" | "none";
  readonly violations: readonly AccessibilityViolation[];
  readonly remediations: readonly AccessibilityRemediation[];
  readonly summary: string;
  readonly score: number; // 0-100
}

export interface AccessibilityRemediation {
  readonly violationId: string;
  readonly steps: readonly string[];
  readonly priority: "P1" | "P2" | "P3";
  readonly estimatedEffort: "low" | "medium" | "high";
}

/** Auditor de accesibilidad */
export function auditAccessibility(designSystem: DesignSystem): AccessibilityAuditReport {
  const violations: AccessibilityViolation[] = [];

  // Auditar contraste de colores
  auditColorContrast(designSystem, violations);

  // Auditar para daltónico
  auditColorBlindness(designSystem, violations);

  // Auditar indicadores de focus
  auditFocusIndicators(designSystem, violations);

  // Auditar touch targets
  auditTouchTargets(designSystem, violations);

  // Auditar text scaling
  auditTextScaling(designSystem, violations);

  // Auditar motion sensitivity
  auditMotionSensitivity(designSystem, violations);

  // Generar remediaciones
  const remediations = generateRemediations(violations);

  // Calcular score
  const score = calculateAccessibilityScore(violations);

  // Determinar nivel WCAG
  const wcagLevel = determineWcagLevel(violations);

  const summary = generateAccessibilitySummary(violations, wcagLevel);

  return {
    compliant: violations.filter((v) => v.severity === "critical").length === 0,
    wcagLevel,
    violations,
    remediations,
    summary,
    score,
  };
}

function auditColorContrast(ds: DesignSystem, violations: AccessibilityViolation[]) {
  const colorTokens = Object.entries((ds as unknown as Record<string, unknown>).tokens || {}).filter(
    ([k]) => k.startsWith("color.") || k.startsWith("color_"),
  );

  for (const [key, value] of colorTokens) {
    if (typeof value === "string" && value.startsWith("#")) {
  // @ts-ignore
      // Verificar contraste contra fondo
      const bgColor = ((ds as unknown as Record<string, unknown>).tokens || {})["color.fondo"] || "#ffffff";
      if (typeof bgColor === "string") {
        const contrast = calculateColorContrast(value, bgColor);

        if (contrast < 7) {
          violations.push({
            id: `contrast-${key}`,
            criterion: "1.4.3 Contrast (Minimum)",
            level: "AAA",
            severity: contrast < 4.5 ? "critical" : "high",
            element: key,
            issue: `Color contrast ratio is ${contrast.toFixed(2)}:1, needs 7:1 for AAA`,
            remediation: `Adjust color or background to achieve 7:1 contrast ratio`,
          });
        }
      }
    }
  }
}

function auditColorBlindness(ds: DesignSystem, violations: AccessibilityViolation[]) {
  const tokens = (ds as unknown as Record<string, unknown>).tokens || {};
  const colorTokens = Object.entries(tokens).filter(
    ([k]) => k.startsWith("color.") || k.startsWith("color_"),
  );

  const types: ColorBlindnessType[] = ["deuteranopia", "protanopia", "tritanopia"];

  for (const [key, value] of colorTokens) {
    if (typeof value === "string" && value.startsWith("#")) {
      for (const type of types) {
  // @ts-ignore
        const simulated = simulateColorBlindness(value, type);
        const bgColor = tokens["color.fondo"] || "#ffffff";
        if (typeof bgColor === "string") {
          const contrast = calculateColorContrast(simulated, bgColor);
          if (contrast < 4.5) {
            violations.push({
              id: `colorblind-${key}-${type}`,
              criterion: "1.4.3 Use of Color",
              level: "A",
              severity: "high",
              element: `${key} (${type})`,
              issue: `Color not distinguishable for ${type}: contrast ${contrast.toFixed(2)}:1`,
              remediation: `Use pattern or text in addition to color to convey meaning`,
            });
          }
        }
      }
    }
  }
}

function auditFocusIndicators(ds: DesignSystem, violations: AccessibilityViolation[]) {
  const focusToken = (((ds as any).tokens || {}))["focus.indicator"] ||
    (((ds as any).tokens || {}))["state.focus"] || { width: "1px", color: "#000" };

  if (typeof focusToken === "object" && focusToken !== null) {
    const width = focusToken.width || "1px";
    const color = focusToken.color || "#000";

    if (typeof width === "string" && parseInt(width, 10) < 3) {
      violations.push({
        id: "focus-indicator-width",
        criterion: "2.4.7 Focus Visible",
        level: "AA",
        severity: "medium",
        element: "Focus indicator",
        issue: `Focus indicator width is ${width}, needs minimum 3px`,
        remediation: `Increase focus indicator width to at least 3px`,
      });
      // @ts-ignore
    }

    if (typeof color === "string") {
      const bgColor = (((ds as any).tokens || {}))["color.fondo"] || "#ffffff";
      if (typeof bgColor === "string") {
        const contrast = calculateColorContrast(color, bgColor);
        if (contrast < 3) {
          violations.push({
            id: "focus-indicator-contrast",
            criterion: "2.4.7 Focus Visible",
            level: "AAA",
            severity: "high",
            element: "Focus indicator",
            issue: `Focus indicator contrast is ${contrast.toFixed(2)}:1, needs 3:1 minimum`,
            remediation: `Adjust focus indicator color for better visibility`,
          });
        }
      }
    }
  } else {
    violations.push({
      id: "focus-indicator-missing",
      criterion: "2.4.7 Focus Visible",
      level: "AA",
      severity: "critical",
      element: "Focus indicator",
      issue: `No focus indicator defined in design system`,
      remediation: `Add a visible focus indicator token (3px minimum, 3:1 contrast)`,
    });
  }
}

function auditTouchTargets(ds: DesignSystem, violations: AccessibilityViolation[]) {
  const touchToken =
    (((ds as any).tokens || {}))["tactil.minimo"] ||
    (((ds as any).tokens || {}))["touch.target"] ||
    "44px";

  if (typeof touchToken === "string" && touchToken.match(/^(\d+)px$/)) {
    const px = parseInt(touchToken, 10);
    if (px < 44) {
      violations.push({
        id: "touch-target-size",
        criterion: "2.5.5 Target Size",
        level: "AAA",
        severity: "high",
        element: "Touch target",
        issue: `Touch target size is ${px}px, needs minimum 44px`,
        remediation: `Increase minimum touch target size to 44x44px`,
      });
    }
  }
}

function auditTextScaling(ds: DesignSystem, violations: AccessibilityViolation[]) {
  // Verificar que tipografía no se corte al 200%
  const typographyTokens = Object.entries(((ds as any).tokens || {})).filter(
    ([k]) => k.startsWith("typography.") || k.startsWith("tipografia."),
  );

  for (const [key, value] of typographyTokens) {
    if (typeof value === "object" && value !== null) {
      const typo = value as Record<string, unknown>;
      const lineHeight = parseFloat((typo.lineHeight as string) || "1.5");

      if (lineHeight < 1.5) {
        violations.push({
          id: `text-scaling-${key}`,
          criterion: "1.4.12 Text Spacing",
          level: "AAA",
          severity: "medium",
          element: key,
          issue: `Line height is ${lineHeight}, needs minimum 1.5 for text scaling tolerance`,
          remediation: `Increase line height to 1.5 or higher`,
        });
      }
    }
  }
}

function auditMotionSensitivity(ds: DesignSystem, violations: AccessibilityViolation[]) {
  const animationTokens = Object.entries(((ds as any).tokens || {})).filter(
    ([k]) => k.startsWith("animation.") || k.startsWith("motion."),
  );

  for (const [key, value] of animationTokens) {
    if (typeof value === "object" && value !== null) {
      const anim = value as Record<string, unknown>;
      const duration = parseFloat((anim.duration as string) || "300ms");

      if (duration > 1000) {
        violations.push({
          id: `motion-${key}`,
          criterion: "2.3.3 Animation from Interactions",
          level: "AAA",
          severity: "medium",
          element: key,
          issue: `Animation duration is ${duration}ms, may cause issues for motion-sensitive users`,
          remediation: `Reduce animation duration to 300-500ms or provide prefers-reduced-motion support`,
        });
      }
    }
  }
}

/** Calcular contraste WCAG */
function calculateColorContrast(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return 0;

  const lum1 = calculateLuminance(rgb1);
  const lum2 = calculateLuminance(rgb2);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function calculateLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Simular daltonismo */
function simulateColorBlindness(hex: string, type: ColorBlindnessType): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  let simulated = rgb;

  switch (type) {
    case "deuteranopia": // Verde-rojo deficiency
      simulated = {
        r: Math.round(rgb.r * 0.625 + rgb.g * 0.375),
        g: Math.round(rgb.r * 0.7 + rgb.g * 0.3),
        b: rgb.b,
      };
      break;
    case "protanopia": // Rojo deficiency
      simulated = {
        r: Math.round(rgb.r * 0.567 + rgb.g * 0.433),
        g: Math.round(rgb.r * 0.558 + rgb.g * 0.442),
        b: Math.round(rgb.b * 0.242 + rgb.g * 0.758),
      };
      break;
    case "tritanopia": // Azul deficiency
      simulated = {
        r: Math.round(rgb.r * 0.95 + rgb.b * 0.05),
        g: Math.round(rgb.g * 0.433 + rgb.b * 0.567),
        b: Math.round(rgb.g * 0.475 + rgb.b * 0.525),
      };
      break;
  }

  return `#${[simulated.r, simulated.g, simulated.b]
    .map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function generateRemediations(violations: AccessibilityViolation[]): AccessibilityRemediation[] {
  const remediations: AccessibilityRemediation[] = [];

  for (const violation of violations) {
    let priority: "P1" | "P2" | "P3" = "P3";
    let effort: "low" | "medium" | "high" = "low";

    if (violation.severity === "critical") {
      priority = "P1";
      effort = "high";
    } else if (violation.severity === "high") {
      priority = "P2";
      effort = "medium";
    }

    remediations.push({
      violationId: violation.id,
      steps: [violation.remediation],
      priority,
      estimatedEffort: effort,
    });
  }

  return remediations;
}

function calculateAccessibilityScore(violations: AccessibilityViolation[]): number {
  let score = 100;

  for (const violation of violations) {
    const penalty = violation.severity === "critical" ? 20 : violation.severity === "high" ? 10 : 5;
    score -= penalty;
  }

  return Math.max(0, score);
}

function determineWcagLevel(violations: AccessibilityViolation[]): "A" | "AA" | "AAA" | "none" {
  if (violations.length === 0) return "AAA";

  const hasAaa = violations.some((v) => v.level === "AAA");
  const hasAa = violations.some((v) => v.level === "AA");
  const hasA = violations.some((v) => v.level === "A");

  if (hasAaa) return "AA";
  if (hasAa) return "A";
  if (hasA) return "none";

  return "AAA";
}

function generateAccessibilitySummary(
  violations: AccessibilityViolation[],
  wcagLevel: string,
): string {
  const critical = violations.filter((v) => v.severity === "critical");
  const high = violations.filter((v) => v.severity === "high");

  return (
    `WCAG Level: ${wcagLevel}\n` +
    `Critical Issues: ${critical.length}\n` +
    `High Priority: ${high.length}\n` +
    `Total Violations: ${violations.length}`
  );
}
