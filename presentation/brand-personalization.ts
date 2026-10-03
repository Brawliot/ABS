/**
 * Sistema de Personalización de Brand (Fase 2, Paso 5)
 * Integración de logo, colores personalizados, micro-brand patterns.
 * Adaptable por industria: premium, technical, approachable.
 */

export type BrandPersonality =
  | "premium"
  | "technical"
  | "approachable"
  | "minimal";

export interface BrandConfig {
  readonly logoUrl?: string;
  readonly logoPlacement: "top-left" | "top-center" | "inline";
  readonly logoWidth: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly personality: BrandPersonality;
  readonly accentPattern?: "corners" | "borders" | "icons" | "none";
  readonly toneVoice: "formal" | "casual" | "playful" | "technical";
}

export interface BrandedDesign {
  readonly html: string;
  readonly css: string;
  readonly logoIntegration: string;
  readonly patternSvg?: string;
}

/**
 * Recomendaciones de brand patterns por personalidad.
 */
const BRAND_PATTERNS: Record<BrandPersonality, string> = {
  premium: `
    <!-- Premium Corner Pattern -->
    <svg class="brand-pattern-premium" viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d="M 0,20 L 20,0 L 0,0 Z" fill="currentColor" opacity="0.1"/>
      <path d="M 100,80 L 80,100 L 100,100 Z" fill="currentColor" opacity="0.1"/>
    </svg>
  `,
  technical: `
    <!-- Technical Grid Pattern -->
    <svg class="brand-pattern-technical" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <pattern id="grid-pattern" x="10" y="10" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.1"/>
        </pattern>
      </defs>
      <rect width="100" height="100" fill="url(#grid-pattern)"/>
    </svg>
  `,
  approachable: `
    <!-- Approachable Rounded Pattern -->
    <svg class="brand-pattern-approachable" viewBox="0 0 100 100" preserveAspectRatio="none">
      <circle cx="20" cy="20" r="8" fill="currentColor" opacity="0.1"/>
      <circle cx="80" cy="80" r="12" fill="currentColor" opacity="0.08"/>
      <circle cx="50" cy="30" r="5" fill="currentColor" opacity="0.06"/>
    </svg>
  `,
  minimal: `
    <!-- Minimal Line Pattern -->
    <svg class="brand-pattern-minimal" viewBox="0 0 100 100" preserveAspectRatio="none">
      <line x1="0" y1="30" x2="100" y2="30" stroke="currentColor" stroke-width="1" opacity="0.1"/>
      <line x1="0" y1="70" x2="100" y2="70" stroke="currentColor" stroke-width="1" opacity="0.1"/>
    </svg>
  `,
};

/**
 * Estilos CSS por personalidad de brand.
 */
const PERSONALITY_CSS: Record<BrandPersonality, string> = {
  premium: `
    /* Premium Style */
    --brand-border-radius: 8px;
    --brand-letter-spacing: 0.05em;
    --brand-font-weight: 600;
    --brand-shadow: 0 8px 24px rgba(0,0,0,0.15);
    --brand-elevation: 8px;

    .brand-premium {
      box-shadow: var(--brand-shadow);
      border-radius: var(--brand-border-radius);
      letter-spacing: var(--brand-letter-spacing);
    }
  `,
  technical: `
    /* Technical Style */
    --brand-border-radius: 2px;
    --brand-letter-spacing: -0.01em;
    --brand-font-weight: 500;
    --brand-font-family: monospace;
    --brand-shadow: 0 2px 4px rgba(0,0,0,0.1);

    .brand-technical {
      font-family: var(--brand-font-family);
      font-weight: var(--brand-font-weight);
      border-radius: var(--brand-border-radius);
      letter-spacing: var(--brand-letter-spacing);
    }
  `,
  approachable: `
    /* Approachable Style */
    --brand-border-radius: 12px;
    --brand-letter-spacing: 0.01em;
    --brand-font-weight: 500;
    --brand-shadow: 0 4px 12px rgba(0,0,0,0.08);

    .brand-approachable {
      border-radius: var(--brand-border-radius);
      letter-spacing: var(--brand-letter-spacing);
      box-shadow: var(--brand-shadow);
    }
  `,
  minimal: `
    /* Minimal Style */
    --brand-border-radius: 0px;
    --brand-letter-spacing: 0em;
    --brand-font-weight: 400;
    --brand-shadow: none;

    .brand-minimal {
      border-radius: var(--brand-border-radius);
      letter-spacing: var(--brand-letter-spacing);
      font-weight: var(--brand-font-weight);
    }
  `,
};

/**
 * Tone voice micro-copy templates.
 */
const TONE_TEMPLATES: Record<
  string,
  Record<string, string>
> = {
  formal: {
    "button.submit": "Enviar",
    "button.cancel": "Cancelar",
    "button.delete": "Eliminar",
    "error.required": "Este campo es obligatorio.",
    "error.invalid": "Valor inválido.",
    "success.save": "Cambios guardados exitosamente.",
  },
  casual: {
    "button.submit": "Listo",
    "button.cancel": "Atrás",
    "button.delete": "Borrar",
    "error.required": "Necesitamos esto.",
    "error.invalid": "Ups, algo no va bien.",
    "success.save": "¡Listo! Guardamos tus cambios.",
  },
  playful: {
    "button.submit": "¡Vamos!",
    "button.cancel": "Mejor no",
    "button.delete": "Bye bye",
    "error.required": "¡Oops! Falta esto.",
    "error.invalid": "Hmm, eso no se ve bien.",
    "success.save": "🎉 ¡Guardado con éxito!",
  },
  technical: {
    "button.submit": "Confirmar",
    "button.cancel": "Abortar",
    "button.delete": "Purgar",
    "error.required": "Campo requerido.",
    "error.invalid": "Validación fallida.",
    "success.save": "Cambios persistidos.",
  },
};

/**
 * Genera header HTML con logo integrado.
 */
function generateLogoHeader(config: BrandConfig): string {
  if (!config.logoUrl) {
    return "";
  }

  const placementClass = `logo-placement-${config.logoPlacement}`;

  return `
<header class="brand-header ${placementClass}">
  <img
    src="${config.logoUrl}"
    alt="Logo"
    class="brand-logo"
    style="width: ${config.logoWidth}; height: auto;"
  />
</header>
`.trim();
}

/**
 * Genera CSS para colores personalizados.
 */
function generateBrandColorCss(config: BrandConfig): string {
  return `
/* Brand Colors */
:root {
  --brand-primary: ${config.primaryColor};
  --brand-secondary: ${config.secondaryColor};
}

.brand-colored {
  color: var(--brand-primary);
}

.brand-colored-bg {
  background-color: var(--brand-primary);
  color: white;
}

.brand-accent {
  color: var(--brand-secondary);
  text-decoration: underline;
  text-decoration-color: var(--brand-secondary);
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}
`;
}

/**
 * Genera patrón SVG según personalidad.
 */
function generateBrandPattern(personality: BrandPersonality): string {
  return BRAND_PATTERNS[personality] || "";
}

/**
 * Genera CSS de acento pattern.
 */
function generatePatternCss(
  personality: BrandPersonality,
  pattern?: string
): string {
  const accentClass =
    pattern === "corners"
      ? "pattern-corners"
      : pattern === "borders"
        ? "pattern-borders"
        : pattern === "icons"
          ? "pattern-icons"
          : "";

  return `
/* Brand Pattern ${personality} */
.brand-pattern-${personality} {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0.05;
  pointer-events: none;
}

.brand-${personality}-accent {
  position: relative;
}

${
  pattern === "corners"
    ? `
.brand-${personality}-accent::before,
.brand-${personality}-accent::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  border: 2px solid var(--brand-primary);
  opacity: 0.1;
}

.brand-${personality}-accent::before {
  top: 0;
  left: 0;
}

.brand-${personality}-accent::after {
  bottom: 0;
  right: 0;
}
`
    : ""
}

${
  pattern === "borders"
    ? `
.brand-${personality}-accent {
  border-top: 3px solid var(--brand-primary);
  border-bottom: 3px solid var(--brand-secondary);
  padding: var(--spacing-l, 16px) 0;
}
`
    : ""
}
`;
}

/**
 * Genera sistema de brand personalizado completo.
 */
export function generateBrandPersonalization(
  config: BrandConfig
): BrandedDesign {
  const logoHeader = generateLogoHeader(config);
  const colorCss = generateBrandColorCss(config);
  const personalityCss = PERSONALITY_CSS[config.personality] || "";
  const patternSvg = generateBrandPattern(config.personality);
  const patternCss = generatePatternCss(
    config.personality,
    config.accentPattern
  );

  const toneTexts = TONE_TEMPLATES[config.toneVoice] || {};

  const html = `
${logoHeader}
<div class="brand-container brand-personality-${config.personality}">
  <!-- Brand content goes here -->
</div>
`.trim();

  const css = `
${colorCss}

${personalityCss}

${patternCss}

/* Header Styles */
.brand-header {
  padding: var(--spacing-l, 16px);
  display: flex;
  align-items: center;
  background-color: var(--color-surface, white);
  border-bottom: 1px solid var(--color-border, #e0e0e0);
}

.logo-placement-top-left {
  justify-content: flex-start;
}

.logo-placement-top-center {
  justify-content: center;
}

.logo-placement-inline {
  justify-content: space-between;
}

.brand-logo {
  max-width: 100%;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
}

/* Brand Container */
.brand-container {
  position: relative;
}
`;

  const logoIntegration = logoHeader;

  return {
    html,
    css,
    logoIntegration,
    patternSvg,
  };
}

/**
 * Obtiene micro-copy texto según tone voice.
 */
export function getBrandCopy(
  toneVoice: string,
  key: string
): string {
  const templates = TONE_TEMPLATES[toneVoice] ?? TONE_TEMPLATES.formal;
  if (!templates) return key;
  return templates[key] || key;
}

/**
 * Aplica branding a HTML existente.
 */
export function applyBrandingToHtml(
  html: string,
  config: BrandConfig
): string {
  const logoHeader = generateLogoHeader(config);
  const brandClass = `brand-personality-${config.personality}`;

  // Inyecta logo al inicio
  let branded = logoHeader + "\n" + html;

  // Agrega clase de personalidad al body/container o crea un div wrapper
  if (branded.includes("<body")) {
    branded = branded.replace(
      /<body[^>]*>/,
      `<body class="${brandClass}">`
    );
  } else {
    // Si no hay body tag, envuelve el contenido en un div con la clase
    branded = `<div class="${brandClass}">\n${branded}\n</div>`;
  }

  return branded;
}

/**
 * Genera colores complementarios de primario.
 */
export function generateComplementaryColors(
  primaryColor: string
): { secondary: string; accent: string } {
  // Conversión simple RGB para complementario (invierte hue en 180 grados)
  // Para production, usar librería de color más robusta
  return {
    secondary: invertColor(primaryColor),
    accent: lightenColor(primaryColor, 20),
  };
}

/**
 * Función auxiliar: invierte color (aproximada).
 */
function invertColor(hex: string): string {
  const color = hex.replace("#", "");
  const rgb = parseInt(color, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;

  const inverted = (255 - r) * 0x10000 + (255 - g) * 0x100 + (255 - b);
  return "#" + inverted.toString(16).padStart(6, "0");
}

/**
 * Función auxiliar: aclara color.
 */
function lightenColor(hex: string, percent: number): string {
  const color = hex.replace("#", "");
  const rgb = parseInt(color, 16);
  let r = (rgb >> 16) & 0xff;
  let g = (rgb >> 8) & 0xff;
  let b = (rgb >> 0) & 0xff;

  r = Math.min(255, r + Math.floor(255 * (percent / 100)));
  g = Math.min(255, g + Math.floor(255 * (percent / 100)));
  b = Math.min(255, b + Math.floor(255 * (percent / 100)));

  return (
    "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)
  );
}
