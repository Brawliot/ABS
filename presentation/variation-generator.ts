/**
 * Design Variation Generator
 * Genera 3 variantes automáticas (Conservative, Optimal, Compact)
 * para A/B testing y adaptación a industrias/personalidades.
 */

import type { DesignSystem } from "../design/schema.js";

export type VariantKind = "conservative" | "optimal" | "compact";

export interface DesignVariation {
  readonly id: string;
  readonly kind: VariantKind;
  readonly designSystem: DesignSystem;
  readonly metadata: VariationMetadata;
}

export interface VariationMetadata {
  readonly createdAt: string;
  readonly version: string;
  readonly baseDesignSystemId: string;
  readonly author: string;
  readonly industry?: string;
  readonly personality?: string;
  readonly description: string;
  readonly modifications: readonly {
    readonly tokenKey: string;
    readonly factor: number;
    readonly reason: string;
  }[];
}

/**
 * Genera 3 variantes automáticas de un design system
 * - Conservative: +20% spacing, tipografía más grande
 * - Optimal: balanceado y recomendado
 * - Compact: -20% spacing, tipografía más densa
 */
export function generateDesignVariations(
  baseDesignSystem: DesignSystem,
  metadata: {
    readonly author: string;
    readonly industry?: string;
    readonly personality?: string;
  },
): readonly DesignVariation[] {
  const timestamp = new Date().toISOString();
  const baseId = baseDesignSystem.id || "base-design-system";

  return [
    generateConservativeVariant(baseDesignSystem, baseId, timestamp, metadata),
    generateOptimalVariant(baseDesignSystem, baseId, timestamp, metadata),
    generateCompactVariant(baseDesignSystem, baseId, timestamp, metadata),
  ];
}

function generateConservativeVariant(
  base: DesignSystem,
  baseId: string,
  timestamp: string,
  metadata: { readonly author: string; readonly industry?: string; readonly personality?: string },
): DesignVariation {
  const modifications: {
    readonly tokenKey: string;
    readonly factor: number;
    readonly reason: string;
  }[] = [];

  const cloned = JSON.parse(JSON.stringify(base)) as DesignSystem;
  cloned.id = `${baseId}-conservative-${timestamp.slice(0, 10)}`;

  // Aumentar spacing en +20%
  const spacingTokens = Object.entries(cloned.tokens || {}).filter(
    ([k]) => k.startsWith("spacing.") || k.startsWith("espaciado."),
  );

  for (const [key, value] of spacingTokens) {
    if (typeof value === "string" && value.match(/^(\d+)(px|rem|em)$/)) {
      const match = value.match(/^(\d+)(px|rem|em)$/)!;
      const num = parseInt(match[1], 10);
      const unit = match[2];
      const increased = Math.round(num * 1.2);
      cloned.tokens![key] = `${increased}${unit}`;
      modifications.push({
        tokenKey: key,
        factor: 1.2,
        reason: "Increased spacing for better visual hierarchy",
      });
    }
  }

  // Aumentar tamaños de tipografía en +15%
  const typographyTokens = Object.entries(cloned.tokens || {}).filter(
    ([k]) => k.startsWith("typography.") || k.startsWith("tipografia."),
  );

  for (const [key, value] of typographyTokens) {
    if (typeof value === "object" && value !== null && "fontSize" in value) {
      const typo = value as Record<string, unknown>;
      if (typeof typo.fontSize === "string" && typo.fontSize.match(/^(\d+)(px|rem)$/)) {
        const match = typo.fontSize.match(/^(\d+)(px|rem)$/)!;
        const num = parseInt(match[1], 10);
        const unit = match[2];
        const increased = Math.round(num * 1.15);
        typo.fontSize = `${increased}${unit}`;
        modifications.push({
          tokenKey: `${key}.fontSize`,
          factor: 1.15,
          reason: "Larger typography for better readability",
        });
      }
    }
  }

  return {
    id: cloned.id,
    kind: "conservative",
    designSystem: cloned,
    metadata: {
      createdAt: timestamp,
      version: base.version || "1.0.0",
      baseDesignSystemId: baseId,
      author: metadata.author,
      industry: metadata.industry,
      personality: metadata.personality,
      description:
        "Conservative variant: +20% spacing, +15% typography for accessibility and clarity",
      modifications,
    },
  };
}

function generateOptimalVariant(
  base: DesignSystem,
  baseId: string,
  timestamp: string,
  metadata: { readonly author: string; readonly industry?: string; readonly personality?: string },
): DesignVariation {
  const modifications: {
    readonly tokenKey: string;
    readonly factor: number;
    readonly reason: string;
  }[] = [];

  const cloned = JSON.parse(JSON.stringify(base)) as DesignSystem;
  cloned.id = `${baseId}-optimal-${timestamp.slice(0, 10)}`;

  // El optimal es el diseño base, con algunos ajustes menores
  // +5% a spacing general para balance
  const spacingTokens = Object.entries(cloned.tokens || {}).filter(
    ([k]) => k.startsWith("spacing.") || k.startsWith("espaciado."),
  );

  for (const [key, value] of spacingTokens) {
    if (
      typeof value === "string" &&
      value.match(/^(\d+)(px|rem|em)$/) &&
      (key.includes("m") || key.includes("l"))
    ) {
      const match = value.match(/^(\d+)(px|rem|em)$/)!;
      const num = parseInt(match[1], 10);
      const unit = match[2];
      const adjusted = Math.round(num * 1.05);
      cloned.tokens![key] = `${adjusted}${unit}`;
      modifications.push({
        tokenKey: key,
        factor: 1.05,
        reason: "Slight spacing adjustment for optimal balance",
      });
    }
  }

  return {
    id: cloned.id,
    kind: "optimal",
    designSystem: cloned,
    metadata: {
      createdAt: timestamp,
      version: base.version || "1.0.0",
      baseDesignSystemId: baseId,
      author: metadata.author,
      industry: metadata.industry,
      personality: metadata.personality,
      description:
        "Optimal variant (recommended): balanced spacing and typography for most use cases",
      modifications,
    },
  };
}

function generateCompactVariant(
  base: DesignSystem,
  baseId: string,
  timestamp: string,
  metadata: { readonly author: string; readonly industry?: string; readonly personality?: string },
): DesignVariation {
  const modifications: {
    readonly tokenKey: string;
    readonly factor: number;
    readonly reason: string;
  }[] = [];

  const cloned = JSON.parse(JSON.stringify(base)) as DesignSystem;
  cloned.id = `${baseId}-compact-${timestamp.slice(0, 10)}`;

  // Reducir spacing en -20%
  const spacingTokens = Object.entries(cloned.tokens || {}).filter(
    ([k]) => k.startsWith("spacing.") || k.startsWith("espaciado."),
  );

  for (const [key, value] of spacingTokens) {
    if (typeof value === "string" && value.match(/^(\d+)(px|rem|em)$/)) {
      const match = value.match(/^(\d+)(px|rem|em)$/)!;
      const num = parseInt(match[1], 10);
      const unit = match[2];
      const decreased = Math.max(4, Math.round(num * 0.8));
      cloned.tokens![key] = `${decreased}${unit}`;
      modifications.push({
        tokenKey: key,
        factor: 0.8,
        reason: "Reduced spacing for dense information layouts",
      });
    }
  }

  // Reducir tamaños de tipografía en -10%
  const typographyTokens = Object.entries(cloned.tokens || {}).filter(
    ([k]) => k.startsWith("typography.") || k.startsWith("tipografia."),
  );

  for (const [key, value] of typographyTokens) {
    if (typeof value === "object" && value !== null && "fontSize" in value) {
      const typo = value as Record<string, unknown>;
      if (typeof typo.fontSize === "string" && typo.fontSize.match(/^(\d+)(px|rem)$/)) {
        const match = typo.fontSize.match(/^(\d+)(px|rem)$/)!;
        const num = parseInt(match[1], 10);
        const unit = match[2];
        const decreased = Math.max(12, Math.round(num * 0.9));
        typo.fontSize = `${decreased}${unit}`;
        modifications.push({
          tokenKey: `${key}.fontSize`,
          factor: 0.9,
          reason: "Smaller typography for information-dense interfaces",
        });
      }
    }
  }

  return {
    id: cloned.id,
    kind: "compact",
    designSystem: cloned,
    metadata: {
      createdAt: timestamp,
      version: base.version || "1.0.0",
      baseDesignSystemId: baseId,
      author: metadata.author,
      industry: metadata.industry,
      personality: metadata.personality,
      description:
        "Compact variant: -20% spacing, -10% typography for data-dense dashboards",
      modifications,
    },
  };
}

/** Renderizar comparativa A/B entre variantes */
export function generateVariationComparison(
  variations: readonly DesignVariation[],
): string {
  let output = "# Design Variations A/B Comparison\n\n";

  for (const variant of variations) {
    output += `## ${variant.kind.charAt(0).toUpperCase() + variant.kind.slice(1)} Variant\n`;
    output += `- **ID**: ${variant.id}\n`;
    output += `- **Description**: ${variant.metadata.description}\n`;
    output += `- **Created**: ${variant.metadata.createdAt}\n`;
    output += `- **Industry**: ${variant.metadata.industry || "General"}\n`;
    output += `- **Modifications**: ${variant.metadata.modifications.length}\n`;
    output += "\n";
  }

  return output;
}

/** Seleccionar la variante óptima basado en criterios */
export function selectOptimalVariant(
  variations: readonly DesignVariation[],
  criteria: {
    readonly prioritizeAccessibility?: boolean;
    readonly prioritizeCompactness?: boolean;
    readonly industry?: string;
  },
): DesignVariation | undefined {
  if (criteria.prioritizeAccessibility) {
    return variations.find((v) => v.kind === "conservative");
  }

  if (criteria.prioritizeCompactness) {
    return variations.find((v) => v.kind === "compact");
  }

  // Default: optimal
  return variations.find((v) => v.kind === "optimal");
}
