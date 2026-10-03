/**
 * Motor de Tipografía Avanzada (Fase 2, Paso 5)
 * Sistema de pairing automático de fuentes.
 * Scales dinámicas: 1.125, 1.25, 1.5 (ratios musicales).
 * Densidad-aware: ajusta line-height, letter-spacing, weight.
 */

export type FontCategory = "serif" | "sans" | "mono";
export type Industry =
  | "gastronomia"
  | "saas"
  | "fintech"
  | "retail"
  | "healthcare"
  | "education"
  | "general";
export type DensityLevel = "compacta" | "normal" | "espaciosa";

export interface FontPair {
  readonly heading: string;
  readonly body: string;
  readonly rationale: string;
}

export interface TypographyScale {
  readonly xs: number;
  readonly sm: number;
  readonly base: number;
  readonly md: number;
  readonly lg: number;
  readonly xl: number;
  readonly xxl: number;
}

export interface TypographyMetrics {
  readonly fontSize: string;
  readonly lineHeight: string;
  readonly letterSpacing: string;
  readonly fontWeight: string;
  readonly fontStyle: string;
}

export interface TypographySystem {
  readonly fontPair: FontPair;
  readonly scale: TypographyScale;
  readonly metrics: {
    readonly heading: TypographyMetrics;
    readonly body: TypographyMetrics;
    readonly caption: TypographyMetrics;
  };
  readonly cssVariables: string;
}

// Recomendaciones de pairing por industria
const INDUSTRY_PAIRINGS: Record<Industry, FontPair[]> = {
  gastronomia: [
    {
      heading: "Playfair Display",
      body: "Lato",
      rationale:
        "Elegancia gastronomica con calidez modern. Display serif + sans warm.",
    },
    {
      heading: "Georgia",
      body: "Segoe UI",
      rationale: "Clásico acogedor. Serif tradicional + sans system.",
    },
    {
      heading: "Abril Fatface",
      body: "Open Sans",
      rationale: "Playful premium. Display bold + sans legible.",
    },
  ],
  saas: [
    {
      heading: "Inter",
      body: "Inter",
      rationale: "Minimalista total. Sans geometric neutral.",
    },
    {
      heading: "SF Pro Display",
      body: "SF Pro Text",
      rationale: "Apple-inspired. Sans system moderno.",
    },
    {
      heading: "IBM Plex Sans",
      body: "IBM Plex Sans",
      rationale: "Technical professional. Sans geometric accessible.",
    },
  ],
  fintech: [
    {
      heading: "IBM Plex Mono",
      body: "IBM Plex Sans",
      rationale: "Technical authority. Mono + sans precision.",
    },
    {
      heading: "JetBrains Mono",
      body: "Roboto",
      rationale: "Developer-friendly. Mono + sans clarity.",
    },
    {
      heading: "Courier Prime",
      body: "Source Sans Pro",
      rationale: "Secure feeling. Mono + sans accessible.",
    },
  ],
  retail: [
    {
      heading: "Montserrat",
      body: "Open Sans",
      rationale: "Bold friendly. Sans modern + sans accessible.",
    },
    {
      heading: "Bebas Neue",
      body: "Lato",
      rationale: "Impact casual. Display + sans warm.",
    },
    {
      heading: "Poppins",
      body: "Poppins",
      rationale: "Contemporary playful. Sans geometric complete.",
    },
  ],
  healthcare: [
    {
      heading: "Nunito",
      body: "Nunito",
      rationale: "Medical neutral. Sans geometric friendly.",
    },
    {
      heading: "Roboto",
      body: "Roboto",
      rationale: "Professional clear. Sans geometric accessible.",
    },
    {
      heading: "Source Sans Pro",
      body: "Source Sans Pro",
      rationale: "Accessible medical. Sans open-source trust.",
    },
  ],
  education: [
    {
      heading: "Merriweather",
      body: "Merriweather",
      rationale: "Scholarly traditional. Serif readable academic.",
    },
    {
      heading: "Playfair Display",
      body: "Source Sans Pro",
      rationale: "Academic prestige. Serif + sans accessible.",
    },
    {
      heading: "PT Serif",
      body: "PT Sans",
      rationale: "Russian geometric. Serif + sans system.",
    },
  ],
  general: [
    {
      heading: "Segoe UI",
      body: "Segoe UI",
      rationale: "System default. Sans geometric universal.",
    },
    {
      heading: "Helvetica Neue",
      body: "Helvetica Neue",
      rationale: "Swiss modernism. Sans neutral timeless.",
    },
    {
      heading: "Calibre",
      body: "Calibre",
      rationale: "Web native. Sans geometric modern.",
    },
  ],
};

// Scales musicales
const SCALE_RATIOS: Record<string, number> = {
  "1.125": 1.125, // Minor second
  "1.25": 1.25, // Major third
  "1.5": 1.5, // Perfect fifth
};

/**
 * Calcula escala de tipografía basada en ratio.
 */
function calculateScale(baseSize: number, ratio: number): TypographyScale {
  return {
    xs: Math.round(baseSize / (ratio * 2)),
    sm: Math.round(baseSize / ratio),
    base: baseSize,
    md: Math.round(baseSize * ratio),
    lg: Math.round(baseSize * ratio * ratio),
    xl: Math.round(baseSize * ratio * ratio * ratio),
    xxl: Math.round(baseSize * ratio * ratio * ratio * ratio),
  };
}

/**
 * Elige pairing de fuentes basado en industria.
 */
export function chooseFontPair(industry: Industry): FontPair {
  const pairings = INDUSTRY_PAIRINGS[industry] || INDUSTRY_PAIRINGS.general;
  return pairings[Math.floor(Math.random() * pairings.length)]!;
}

/**
 * Ajusta métricas de tipografía según densidad.
 */
function getMetricsForDensity(density: DensityLevel): {
  heading: TypographyMetrics;
  body: TypographyMetrics;
  caption: TypographyMetrics;
} {
  switch (density) {
    case "compacta":
      return {
        heading: {
          fontSize: "var(--typography-heading-size)",
          lineHeight: "1.2",
          letterSpacing: "-0.02em",
          fontWeight: "700",
          fontStyle: "normal",
        },
        body: {
          fontSize: "var(--typography-body-size)",
          lineHeight: "1.4",
          letterSpacing: "-0.01em",
          fontWeight: "400",
          fontStyle: "normal",
        },
        caption: {
          fontSize: "var(--typography-caption-size)",
          lineHeight: "1.3",
          letterSpacing: "0em",
          fontWeight: "400",
          fontStyle: "normal",
        },
      };
    case "espaciosa":
      return {
        heading: {
          fontSize: "var(--typography-heading-size)",
          lineHeight: "1.4",
          letterSpacing: "0em",
          fontWeight: "600",
          fontStyle: "normal",
        },
        body: {
          fontSize: "var(--typography-body-size)",
          lineHeight: "1.8",
          letterSpacing: "0.01em",
          fontWeight: "400",
          fontStyle: "normal",
        },
        caption: {
          fontSize: "var(--typography-caption-size)",
          lineHeight: "1.6",
          letterSpacing: "0.02em",
          fontWeight: "400",
          fontStyle: "normal",
        },
      };
    default: // normal
      return {
        heading: {
          fontSize: "var(--typography-heading-size)",
          lineHeight: "1.3",
          letterSpacing: "-0.01em",
          fontWeight: "700",
          fontStyle: "normal",
        },
        body: {
          fontSize: "var(--typography-body-size)",
          lineHeight: "1.6",
          letterSpacing: "0em",
          fontWeight: "400",
          fontStyle: "normal",
        },
        caption: {
          fontSize: "var(--typography-caption-size)",
          lineHeight: "1.5",
          letterSpacing: "0.01em",
          fontWeight: "400",
          fontStyle: "normal",
        },
      };
  }
}

/**
 * Genera sistema de tipografía completo.
 */
export function generateTypographySystem(options: {
  industry: Industry;
  density: DensityLevel;
  scaleRatio?: number;
  baseSize?: number;
}): TypographySystem {
  const fontPair = chooseFontPair(options.industry);
  const ratio = options.scaleRatio || 1.25;
  const baseSize = options.baseSize || 16;
  const scale = calculateScale(baseSize, ratio);
  const metrics = getMetricsForDensity(options.density);

  const cssVariables = `
:root {
  /* Font families */
  --typography-heading-family: "${fontPair.heading}", serif;
  --typography-body-family: "${fontPair.body}", sans-serif;

  /* Scale sizes */
  --typography-xs-size: ${scale.xs}px;
  --typography-sm-size: ${scale.sm}px;
  --typography-base-size: ${scale.base}px;
  --typography-md-size: ${scale.md}px;
  --typography-lg-size: ${scale.lg}px;
  --typography-xl-size: ${scale.xl}px;
  --typography-xxl-size: ${scale.xxl}px;

  /* Default sizes */
  --typography-heading-size: ${scale.lg}px;
  --typography-body-size: ${scale.base}px;
  --typography-caption-size: ${scale.sm}px;

  /* Line heights */
  --typography-heading-line-height: ${metrics.heading.lineHeight};
  --typography-body-line-height: ${metrics.body.lineHeight};

  /* Letter spacing */
  --typography-heading-letter-spacing: ${metrics.heading.letterSpacing};
  --typography-body-letter-spacing: ${metrics.body.letterSpacing};
}

/* Typography classes */
.typography-heading {
  font-family: var(--typography-heading-family);
  font-size: var(--typography-heading-size);
  line-height: var(--typography-heading-line-height);
  letter-spacing: var(--typography-heading-letter-spacing);
  font-weight: ${metrics.heading.fontWeight};
}

.typography-body {
  font-family: var(--typography-body-family);
  font-size: var(--typography-body-size);
  line-height: var(--typography-body-line-height);
  letter-spacing: var(--typography-body-letter-spacing);
  font-weight: ${metrics.body.fontWeight};
}

.typography-caption {
  font-family: var(--typography-body-family);
  font-size: var(--typography-caption-size);
  line-height: 1.5;
  letter-spacing: var(--typography-body-letter-spacing);
  font-weight: 400;
}

/* Scale utilities */
.text-xs { font-size: var(--typography-xs-size); }
.text-sm { font-size: var(--typography-sm-size); }
.text-base { font-size: var(--typography-base-size); }
.text-md { font-size: var(--typography-md-size); }
.text-lg { font-size: var(--typography-lg-size); }
.text-xl { font-size: var(--typography-xl-size); }
.text-xxl { font-size: var(--typography-xxl-size); }
`;

  return {
    fontPair,
    scale,
    metrics,
    cssVariables,
  };
}

/**
 * Genera recomendación de escala basada en disponibilidad de contenido.
 */
export function recommendScaleRatio(
  contentDensity: "sparse" | "normal" | "dense"
): number {
  switch (contentDensity) {
    case "sparse":
      return 1.5; // Perfect fifth - más dramático
    case "dense":
      return 1.125; // Minor second - más sutil
    default:
      return 1.25; // Major third - balanced
  }
}

/**
 * Aplica tipografía al elemento HTML.
 */
export function applyTypographyClass(
  element: string,
  type: "heading" | "body" | "caption"
): string {
  return element.replace(/class="([^"]*)"/g, (match, classes) => {
    return `class="${classes} typography-${type}"`;
  });
}
