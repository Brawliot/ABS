/**
 * Constraint-Based Design System Solver
 * Validación y corrección automática de especificaciones de diseño
 * contra restricciones empresariales predefinidas.
 */

import type { DesignSystem } from "../design/schema.js";

/** Definición de un constraint sobre tokens de diseño */
export interface DesignConstraint {
  readonly category: "spacing" | "typography" | "color" | "elevation" | "border-radius";
  readonly rule: string;
  readonly allowedValues?: readonly (string | number)[];
  readonly range?: { readonly min: number; readonly max: number };
  readonly pattern?: RegExp;
}

/** Report de validación de constraints */
export interface ConstraintValidationReport {
  readonly valid: boolean;
  readonly violations: readonly ConstraintViolation[];
  readonly corrections: readonly Correction[];
  readonly summary: string;
}

export interface ConstraintViolation {
  readonly tokenKey: string;
  readonly constraint: string;
  readonly actual: string | number;
  readonly expected: string;
  readonly severity: "warning" | "error";
}

export interface Correction {
  readonly tokenKey: string;
  readonly original: string | number;
  readonly corrected: string | number;
  readonly reason: string;
}

/** Conjunto predefinido de constraints empresariales */
export const ENTERPRISE_CONSTRAINTS: readonly DesignConstraint[] = [
  // Spacing: múltiplos de 4px
  {
    category: "spacing",
    rule: "spacing_multiple_of_4px",
    pattern: /^\d+(px|rem|em)$/,
  },
  // Typography: ratios musicales (1.125, 1.25, 1.5)
  {
    category: "typography",
    rule: "typography_musical_ratios",
    allowedValues: [1.125, 1.25, 1.5],
  },
  // Colors: paleta definida
  {
    category: "color",
    rule: "color_from_palette",
  },
  // Elevation: sombras predefinidas
  {
    category: "elevation",
    rule: "elevation_predefined",
    allowedValues: ["sm", "md", "lg", "xl"],
  },
  // Border radius: valores permitidos
  {
    category: "border-radius",
    rule: "border_radius_standard",
    allowedValues: [0, 4, 8, 12, 16],
  },
];

/** Validador de constraints de diseño */
export function validateDesignConstraints(
  designSystem: DesignSystem,
): ConstraintValidationReport {
  const violations: ConstraintViolation[] = [];
  const corrections: Correction[] = [];

  // Validar spacing tokens
  const spacingTokens = Object.entries(designSystem.tokens || {}).filter(
    ([k]) => k.startsWith("spacing.") || k.startsWith("espaciado."),
  );

  for (const [key, value] of spacingTokens) {
    if (typeof value === "string" && value.match(/^\d+px$/)) {
      const px = parseInt(value, 10);
      if (px % 4 !== 0) {
        violations.push({
          tokenKey: key,
          constraint: "spacing_multiple_of_4px",
          actual: value,
          expected: `Múltiplo de 4px (más cercano: ${Math.round(px / 4) * 4}px)`,
          severity: "error",
        });
        corrections.push({
          tokenKey: key,
          original: value,
          corrected: `${Math.round(px / 4) * 4}px`,
          reason: "Espaciado debe ser múltiplo de 4px para ritmo visual consistente",
        });
      }
    }
  }

  // Validar typography ratios
  const typographyTokens = Object.entries(designSystem.tokens || {}).filter(
    ([k]) => k.startsWith("typography.") || k.startsWith("tipografia."),
  );

  const musicalRatios = [1.125, 1.25, 1.5];
  for (const [key, value] of typographyTokens) {
    if (typeof value === "object" && value !== null && "scaleRatio" in value) {
      const ratio = (value as Record<string, number>).scaleRatio;
      if (!musicalRatios.includes(ratio)) {
      // @ts-ignore
        violations.push({
          tokenKey: key,
          constraint: "typography_musical_ratios",
          actual: ratio,
          expected: `Uno de: ${musicalRatios.join(", ")}`,
          severity: "warning",
        });
        const closest = musicalRatios.reduce((a, b) =>
          Math.abs(b - ratio) < Math.abs(a - ratio) ? b : a,
        );
        corrections.push({
          tokenKey: key,
          original: ratio,
          corrected: closest,
          reason: `Ratio musical más cercano para armonía tipográfica`,
        });
      }
    }
  }

  // Validar colores contra paleta
  const colorTokens = Object.entries(designSystem.tokens || {}).filter(
    ([k]) => k.startsWith("color.") || k.startsWith("color_"),
  );

  // @ts-ignore
  const palette = designSystem.palette || {};
  for (const [key, value] of colorTokens) {
    if (typeof value === "string" && value.startsWith("#")) {
      const isInPalette = Object.values(palette).some((c: unknown) => c === value);
      if (!isInPalette && value !== "#ffffff" && value !== "#000000") {
        violations.push({
          tokenKey: key,
          constraint: "color_from_palette",
          actual: value,
          expected: `Color debe pertenecer a paleta definida`,
          severity: "warning",
        });
      }
    }
  }

  // Validar elevation
  const elevationTokens = Object.entries(designSystem.tokens || {}).filter(
    ([k]) => k.startsWith("elevation.") || k.startsWith("shadow."),
  );

  const validElevations = ["sm", "md", "lg", "xl"];
  for (const [key, value] of elevationTokens) {
    if (typeof value === "string") {
      if (!validElevations.some((e) => value.includes(e))) {
        violations.push({
          tokenKey: key,
          constraint: "elevation_predefined",
          actual: value,
          expected: `Uno de: ${validElevations.join(", ")}`,
          severity: "warning",
        });
      }
    }
  }

  // Validar border-radius
  const radiusTokens = Object.entries(designSystem.tokens || {}).filter(
    ([k]) => k.startsWith("radius.") || k.startsWith("border-radius."),
  );

  const validRadii = [0, 4, 8, 12, 16];
  for (const [key, value] of radiusTokens) {
    if (typeof value === "string" && value.match(/^\d+px$/)) {
      const px = parseInt(value, 10);
      if (!validRadii.includes(px)) {
        violations.push({
          tokenKey: key,
          constraint: "border_radius_standard",
          actual: value,
          expected: `Uno de: ${validRadii.map((r) => `${r}px`).join(", ")}`,
          severity: "warning",
        });
        const closest = validRadii.reduce((a, b) =>
          Math.abs(b - px) < Math.abs(a - px) ? b : a,
        );
        corrections.push({
          tokenKey: key,
          original: value,
          corrected: `${closest}px`,
          reason: `Border radius debe ser valor estándar`,
        });
      }
    }
  }

  const valid = violations.filter((v) => v.severity === "error").length === 0;
  const summary =
    violations.length === 0
      ? "✅ Todas las restricciones de diseño cumplidas"
      : `⚠️ ${violations.length} violaciones encontradas, ${corrections.length} correcciones disponibles`;

  return {
    valid,
    violations,
    corrections,
    summary,
  };
}

/** Aplicar correcciones automáticas a una especificación de diseño */
export function applyCorrectionsToCorrectedSpec(
  designSystem: DesignSystem,
  corrections: readonly Correction[],
): DesignSystem {
  const corrected = JSON.parse(JSON.stringify(designSystem)) as DesignSystem;

  for (const correction of corrections) {
    const parts = correction.tokenKey.split(".");
    let current = corrected.tokens || {};

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = correction.corrected;
  }

  return corrected;
}

/** Resolver constraint-violations iterativamente */
export function resolveConstraintViolations(
  designSystem: DesignSystem,
): {
  readonly corrected: DesignSystem;
  readonly report: ConstraintValidationReport;
} {
  let current = designSystem;
  let maxIterations = 3;

  while (maxIterations > 0) {
    const report = validateDesignConstraints(current);

    if (report.valid && report.violations.length === 0) {
      return { corrected: current, report };
    }

    if (report.corrections.length === 0) {
      return { corrected: current, report };
    }

    current = applyCorrectionsToCorrectedSpec(current, report.corrections);
    maxIterations--;
  }

  const finalReport = validateDesignConstraints(current);
  return { corrected: current, report: finalReport };
}

/** Generar reporte detallado de cambios */
export function generateConstraintReport(
  original: DesignSystem,
  corrected: DesignSystem,
): string {
  const report = validateDesignConstraints(original);

  let output = "# Reporte de Validación de Constraints de Diseño\n\n";
  output += `## Resumen\n${report.summary}\n\n`;

  if (report.violations.length > 0) {
    output += "## Violaciones Encontradas\n";
    output += report.violations
      .map(
        (v) =>
          `- **${v.tokenKey}**: ${v.constraint}\n` +
          `  - Actual: \`${v.actual}\`\n` +
          `  - Esperado: ${v.expected}\n` +
          `  - Severidad: ${v.severity}\n`,
      )
      .join("\n");
    output += "\n";
  }

  if (report.corrections.length > 0) {
    output += "## Correcciones Aplicadas\n";
    output += report.corrections
      .map(
        (c) =>
          `- **${c.tokenKey}**\n` +
          `  - Original: \`${c.original}\`\n` +
          `  - Corregido: \`${c.corrected}\`\n` +
          `  - Razón: ${c.reason}\n`,
      )
      .join("\n");
  }

  return output;
}
