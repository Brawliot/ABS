/**
 * Renderizador HTML5 Profesional
 * Estructura HTML semántica completa con:
 * - Meta tags (viewport, charset, OG, etc.)
 * - Security headers (CSP, X-Frame-Options)
 * - PWA (manifest, icons)
 * - Preload/defer de recursos
 * - ARIA labels automáticos
 * - Skip links de accesibilidad
 */

import type { UiSpec } from "./types.js";
import type { UiDesignBinding } from "./bind-design.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface HtmlPageOptions {
  readonly spec: UiSpec;
  readonly binding?: UiDesignBinding;
  readonly title?: string;
  readonly description?: string;
  readonly ogImage?: string;
  readonly iconUrl?: string;
  readonly manifestUrl?: string;
  readonly themeColor?: string;
  readonly lang?: string;
  readonly canonical?: string;
  readonly indexable?: boolean;
}

/**
 * Genera meta tags de seguridad
 */
function generateSecurityHeaders(): string {
  return `    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'" />
    <meta http-equiv="X-Frame-Options" content="SAMEORIGIN" />
    <meta http-equiv="X-Content-Type-Options" content="nosniff" />
    <meta http-equiv="X-XSS-Protection" content="1; mode=block" />`;
}

/**
 * Genera meta tags de viewport y accesibilidad
 */
function generateViewportMeta(): string {
  return `    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="format-detection" content="telephone=no" />`;
}

/**
 * Genera meta tags de SEO (OpenGraph, Twitter)
 */
function generateSeoMeta(options: {
  readonly title: string;
  readonly description: string;
  readonly ogImage?: string | undefined;
  readonly canonical?: string | undefined;
  readonly indexable?: boolean;
}): string {
  const tags: string[] = [];

  // Meta tags básicos
  tags.push(`    <meta name="description" content="${esc(options.description.slice(0, 160))}" />`);
  tags.push(`    <meta name="theme-color" content="#2563EB" />`);

  // OpenGraph
  tags.push(`    <meta property="og:type" content="website" />`);
  tags.push(`    <meta property="og:title" content="${esc(options.title)}" />`);
  tags.push(`    <meta property="og:description" content="${esc(options.description.slice(0, 160))}" />`);
  if (options.ogImage) {
    tags.push(`    <meta property="og:image" content="${esc(options.ogImage)}" />`);
  }

  // Twitter Card
  tags.push(`    <meta name="twitter:card" content="summary_large_image" />`);
  tags.push(`    <meta name="twitter:title" content="${esc(options.title)}" />`);
  tags.push(`    <meta name="twitter:description" content="${esc(options.description.slice(0, 160))}" />`);

  // Canonical
  if (options.canonical) {
    tags.push(`    <link rel="canonical" href="${esc(options.canonical)}" />`);
  }

  // Robots
  if (options.indexable === false) {
    tags.push(`    <meta name="robots" content="noindex, nofollow" />`);
  } else {
    tags.push(`    <meta name="robots" content="index, follow" />`);
  }

  return tags.join("\n");
}

/**
 * Genera PWA meta tags
 */
function generatePwaMetaTags(options: {
  readonly manifestUrl?: string | undefined;
  readonly iconUrl?: string | undefined;
}): string {
  const tags: string[] = [];

  if (options.manifestUrl) {
    tags.push(`    <link rel="manifest" href="${esc(options.manifestUrl)}" />`);
  }

  // Icons
  if (options.iconUrl) {
    tags.push(`    <link rel="icon" type="image/png" href="${esc(options.iconUrl)}" />`);
    tags.push(`    <link rel="apple-touch-icon" href="${esc(options.iconUrl)}" />`);
  }

  // PWA support
  tags.push(`    <meta name="apple-mobile-web-app-capable" content="yes" />`);
  tags.push(`    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`);
  tags.push(`    <meta name="mobile-web-app-capable" content="yes" />`);

  return tags.join("\n");
}

/**
 * Genera skip links para accesibilidad
 */
function generateSkipLinks(): string {
  return `  <div class="skip-links">
    <a href="#main-content" class="skip-link">Ir al contenido principal</a>
    <a href="#navigation" class="skip-link">Ir a navegación</a>
    <a href="#footer" class="skip-link">Ir al pie de página</a>
  </div>`;
}

/**
 * Renderiza la página HTML5 completa
 */
export function renderFullHtmlPage(options: HtmlPageOptions): string {
  const spec = options.spec;
  const title = options.title || spec.identity.brandName || spec.sourceCaseId;
  const description =
    options.description || "Interfaz profesional generada por ABS";
  const lang = options.lang || "es";
  const themeColor = options.themeColor || "#2563EB";

  const logoHtml = spec.identity.logoUrl
    ? `<img src="${esc(spec.identity.logoUrl)}" alt="Logo de ${esc(title)}" class="header-logo" />`
    : "";

  return `<!DOCTYPE html>
<html lang="${lang}" dir="ltr">
<head>
  ${generateViewportMeta()}
  ${generateSecurityHeaders()}
  <title>${esc(title)} — Sistema de Interfaz ABS</title>
  ${generateSeoMeta({
    title,
    description,
    ogImage: options.ogImage ?? undefined,
    canonical: options.canonical ?? undefined,
    indexable: options.indexable ?? true,
  })}
  ${generatePwaMetaTags({
    manifestUrl: options.manifestUrl ?? undefined,
    iconUrl: options.iconUrl ?? undefined,
  })}
  <meta name="theme-color" content="${esc(themeColor)}" />

  <!-- Preload críticos -->
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" as="style" />
  <link rel="preload" href="/css/critical.css" as="style" />

  <!-- CSS crítico inline -->
  <style>
    :root {
      --color-primary: #2563EB;
      --color-secondary: #7C3AED;
      --color-surface: #FFFFFF;
      --color-background: #F9FAFB;
      --color-text-primary: #111827;
      --color-text-secondary: #6B7280;
      --color-border: #E5E7EB;
      --color-success: #10B981;
      --color-warning: #F59E0B;
      --color-error: #EF4444;
      --color-info: #3B82F6;

      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-m: 12px;
      --spacing-l: 16px;
      --spacing-xl: 24px;
      --spacing-2xl: 32px;

      --typography-base-size: 16px;
      --typography-base-line-height: 1.5;
      --typography-heading-line-height: 1.25;
      --radius-sm: 4px;
      --radius-md: 8px;
      --radius-lg: 12px;

      --elevation-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --elevation-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      --elevation-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

      --animation-fast: 150ms;
      --animation-normal: 300ms;
      --animation-slow: 500ms;
      --easing-in-out: cubic-bezier(0.4, 0, 0.2, 1);
      --easing-ease-in: cubic-bezier(0.4, 0, 1, 1);
      --easing-ease-out: cubic-bezier(0, 0, 0.2, 1);

      --tactil-minimo: 44px;
      --focus-ring: 2px;
      --focus-ring-offset: 2px;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --color-surface: #1F2937;
        --color-background: #111827;
        --color-text-primary: #F9FAFB;
        --color-text-secondary: #D1D5DB;
        --color-border: #374151;
      }
    }

    /* Reset */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif;
      font-size: var(--typography-base-size);
      line-height: var(--typography-base-line-height);
      color: var(--color-text-primary);
      background-color: var(--color-background);
      overflow-x: hidden;
    }

    /* Accesibilidad */
    .skip-links {
      position: absolute;
      top: -40px;
      left: 0;
      background: var(--color-primary);
      color: white;
      padding: var(--spacing-m);
      z-index: 100;
    }

    .skip-link:focus {
      top: 0;
    }

    /* Semantic HTML */
    header {
      background-color: var(--color-primary);
      color: white;
      padding: var(--spacing-l);
      box-shadow: var(--elevation-md);
    }

    header .header-logo {
      height: var(--tactil-minimo);
      width: auto;
      display: block;
    }

    nav {
      display: flex;
      gap: var(--spacing-m);
      flex-wrap: wrap;
    }

    nav a {
      color: white;
      text-decoration: none;
      padding: var(--spacing-m) var(--spacing-l);
      min-height: var(--tactil-minimo);
      display: flex;
      align-items: center;
      border-radius: var(--radius-sm);
      transition: background-color var(--animation-fast) ease;
    }

    nav a:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }

    nav a:focus-visible {
      outline: var(--focus-ring) solid white;
      outline-offset: var(--focus-ring-offset);
    }

    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: var(--spacing-l);
    }

    [role="main"] {
      padding: var(--spacing-l);
    }

    article,
    section {
      margin-bottom: var(--spacing-2xl);
    }

    h1 {
      font-size: 2rem;
      font-weight: 700;
      line-height: var(--typography-heading-line-height);
      margin: var(--spacing-l) 0 var(--spacing-m) 0;
    }

    h2 {
      font-size: 1.5rem;
      font-weight: 600;
      line-height: var(--typography-heading-line-height);
      margin: var(--spacing-m) 0 var(--spacing-m) 0;
    }

    h3 {
      font-size: 1.25rem;
      font-weight: 600;
      line-height: var(--typography-heading-line-height);
      margin: var(--spacing-m) 0 var(--spacing-sm) 0;
    }

    h4,
    h5,
    h6 {
      font-weight: 600;
      line-height: var(--typography-heading-line-height);
      margin: var(--spacing-m) 0 var(--spacing-sm) 0;
    }

    p {
      margin: 0 0 var(--spacing-m) 0;
    }

    a {
      color: var(--color-primary);
      text-decoration: underline;
      transition: opacity var(--animation-fast) ease;
    }

    a:hover {
      opacity: 0.8;
    }

    a:focus-visible {
      outline: var(--focus-ring) solid var(--color-primary);
      outline-offset: var(--focus-ring-offset);
      border-radius: var(--radius-sm);
    }

    button {
      font-family: inherit;
      font-size: inherit;
      cursor: pointer;
    }

    button:focus-visible {
      outline: var(--focus-ring) solid var(--color-primary);
      outline-offset: var(--focus-ring-offset);
    }

    footer {
      background-color: var(--color-text-primary);
      color: var(--color-background);
      padding: var(--spacing-2xl);
      margin-top: var(--spacing-2xl);
      text-align: center;
      font-size: 0.875rem;
    }

    /* Utilidades */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    .container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 var(--spacing-l);
    }

    @media (max-width: 768px) {
      body {
        font-size: 14px;
      }

      h1 {
        font-size: 1.5rem;
      }

      h2 {
        font-size: 1.25rem;
      }

      h3 {
        font-size: 1.125rem;
      }

      main {
        padding: var(--spacing-m);
      }

      header {
        padding: var(--spacing-m);
      }

      footer {
        padding: var(--spacing-l);
      }
    }

    /* Print */
    @media print {
      .no-print {
        display: none !important;
      }

      body {
        background-color: white;
        color: black;
      }

      a {
        text-decoration: none;
      }
    }
  </style>
</head>
<body>
  ${generateSkipLinks()}

  <header role="banner">
    ${logoHtml}
    <div>
      <h1 style="margin: 0; font-size: 1.5rem;">${esc(title)}</h1>
      <p style="margin: 0; opacity: 0.9; font-size: 0.875rem;">${esc(description)}</p>
    </div>
  </header>

  <nav id="navigation" aria-label="Navegación principal" class="no-print">
    <a href="#main-content">Inicio</a>
    <a href="#about">Acerca de</a>
    <a href="#services">Servicios</a>
    <a href="#contact">Contacto</a>
  </nav>

  <main id="main-content" role="main">
    <!-- Contenido insertado aquí -->
  </main>

  <footer id="footer" role="contentinfo">
    <p>&copy; 2026 ABS. Todos los derechos reservados.</p>
    <p>Versión: ${esc(spec.version)} · Generado: ${esc(spec.generatedAt)}</p>
  </footer>

  <!-- Lazy CSS en background -->
  <link rel="stylesheet" media="print" onload="this.media='all'" href="/css/lazy.css" />

  <!-- No-critical scripts con defer -->
  <script defer src="/js/app.js"></script>

  <!-- Theme detection -->
  <script>
    (function() {
      const theme = localStorage.getItem('theme') || 'auto';
      if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    })();
  </script>
</body>
</html>`;
}
