/**
 * CSS Crítico (< 5KB)
 * Estilos inline para FCP/LCP rápido
 * - Reset y normalización
 * - Colores primarios
 * - Spacing base
 * - Tipografía base
 * - Focus indicators
 * - Media queries viewport
 */

export interface CriticalCssOptions {
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
  readonly backgroundColor?: string;
  readonly surfaceColor?: string;
  readonly textColor?: string;
  readonly borderColor?: string;
}

/**
 * Genera CSS crítico mínimo (< 5KB)
 */
export function generateCriticalCss(
  options: CriticalCssOptions = {}
): string {
  const primaryColor = options.primaryColor || "#2563EB";
  const backgroundColor = options.backgroundColor || "#F9FAFB";
  const surfaceColor = options.surfaceColor || "#FFFFFF";
  const textColor = options.textColor || "#111827";
  const borderColor = options.borderColor || "#E5E7EB";

  return `
/* CSS CRÍTICO - <5KB inline */

:root {
  --color-primary: ${primaryColor};
  --color-surface: ${surfaceColor};
  --color-bg: ${backgroundColor};
  --color-text: ${textColor};
  --color-border: ${borderColor};
  --spacing-xs: 4px;
  --spacing-s: 8px;
  --spacing-m: 12px;
  --spacing-l: 16px;
  --focus-ring: 2px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-surface: #1F2937;
    --color-bg: #111827;
    --color-text: #F9FAFB;
    --color-border: #374151;
  }
}

*,*::before,*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
}

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--color-text);
  background-color: var(--color-bg);
}

h1,h2,h3,h4,h5,h6 {
  margin: 1em 0 0.5em 0;
  font-weight: 600;
}

h1 { font-size: 2rem; }
h2 { font-size: 1.5rem; }
h3 { font-size: 1.25rem; }

p { margin: 0 0 1em 0; }

a {
  color: var(--color-primary);
  text-decoration: underline;
}

a:focus-visible {
  outline: var(--focus-ring) solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 2px;
}

button {
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
}

button:focus-visible {
  outline: var(--focus-ring) solid var(--color-primary);
  outline-offset: 2px;
}

header {
  background: var(--color-primary);
  color: #fff;
  padding: var(--spacing-l);
}

main {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--spacing-l);
}

footer {
  background: var(--color-text);
  color: var(--color-bg);
  padding: var(--spacing-l);
  margin-top: var(--spacing-l);
  text-align: center;
}

/* Accesibilidad */
.skip-links {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--color-primary);
  color: #fff;
  padding: var(--spacing-m);
  z-index: 100;
}

.skip-links a:focus-visible {
  top: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
}

/* Mobile */
@media (max-width: 768px) {
  body { font-size: 14px; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.25rem; }
  h3 { font-size: 1.125rem; }
  main { padding: var(--spacing-m); }
}
`.trim();
}

/**
 * Calcula tamaño de CSS crítico
 */
export function getCriticalCssSize(css: string): number {
  return new Blob([css], { type: "text/css" }).size;
}

/**
 * Verifica si CSS crítico es válido (< 5KB)
 */
export function isCriticalCssSizeValid(css: string): boolean {
  return getCriticalCssSize(css) < 5120; // 5KB
}

/**
 * Genera HTML con CSS crítico inline
 */
export function inlineCriticalCss(
  htmlContent: string,
  css: string
): string {
  if (!isCriticalCssSizeValid(css)) {
    console.warn(
      `CSS crítico excede 5KB: ${getCriticalCssSize(css)} bytes. ` +
        "Considera mover estilos a CSS lazy."
    );
  }

  const styleTag = `<style>${css}</style>`;
  return htmlContent.replace("</head>", `${styleTag}</head>`);
}
