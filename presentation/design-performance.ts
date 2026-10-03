/**
 * Design Performance Optimizer
 * Optimizaciones:
 * - Critical CSS (inline, <5KB)
 * - Lazy-load non-critical CSS
 * - Font loading strategy
 * - Image optimization
 * - Animation performance
 */

import type { DesignSystem } from "../design/schema.js";

export interface PerformanceOptimization {
  readonly critical: CriticalCssBlock;
  readonly deferred: DeferredCssBlock[];
  readonly fontStrategy: FontLoadingStrategy;
  readonly imageOptimizations: ImageOptimization[];
  readonly animationPerformance: AnimationPerformanceReport;
  readonly metrics: PerformanceMetrics;
}

export interface CriticalCssBlock {
  readonly content: string;
  readonly sizeBytes: number;
  readonly tokens: readonly string[];
}

export interface DeferredCssBlock {
  readonly id: string;
  readonly content: string;
  readonly sizeBytes: number;
  readonly trigger: "idle" | "intersection" | "interaction";
}

export interface FontLoadingStrategy {
  readonly strategy: "swap" | "fallback" | "optional" | "block";
  readonly fonts: readonly {
    readonly family: string;
    readonly weights: readonly string[];
    readonly display: "swap" | "fallback" | "optional" | "block";
    readonly source: string;
  }[];
  readonly fallbackStack: string;
}

export interface ImageOptimization {
  readonly id: string;
  readonly original: string;
  readonly optimized: string;
  readonly format: "webp" | "avif" | "jpeg";
  readonly sizeReduction: number; // percentage
  readonly srcset: string;
}

export interface AnimationPerformanceReport {
  readonly gpuAccelerated: readonly string[];
  readonly notOptimized: readonly {
    readonly property: string;
    readonly reason: string;
    readonly suggestion: string;
  }[];
  readonly estimatedFps: number;
}

export interface PerformanceMetrics {
  readonly criticalCssSize: number;
  readonly totalDeferredSize: number;
  readonly estimatedFcp: number; // First Contentful Paint ms
  readonly estimatedLcp: number; // Largest Contentful Paint ms
  readonly fontLoadTime: number;
}

/** Optimizador de performance de diseño */
export function optimizeDesignPerformance(
  designSystem: DesignSystem,
  baseUrl: string,
): PerformanceOptimization {
  // Generar critical CSS
  const critical = generateCriticalCss(designSystem);

  // Generar CSS deferido
  const deferred = generateDeferredCss(designSystem);

  // Estrategia de fonts
  const fontStrategy = generateFontStrategy(designSystem);

  // Optimizar imágenes
  const imageOptimizations = generateImageOptimizations(baseUrl);

  // Optimizar animaciones
  const animationPerformance = analyzeAnimationPerformance(designSystem);

  // Calcular métricas
  const metrics = calculatePerformanceMetrics(critical, deferred, fontStrategy);

  return {
    critical,
    deferred,
    fontStrategy,
    imageOptimizations,
    animationPerformance,
    metrics,
  };
}

function generateCriticalCss(ds: DesignSystem): CriticalCssBlock {
  const tokens: string[] = [];
  let css = ":root {\n";

  // Critical color tokens
  const criticalColors = [
    "color.primario",
    "color.secundario",
    "color.fondo",
    "color.superficie",
    "color.texto",
  ];

  for (const key of criticalColors) {
    const value = (((ds as any).tokens || {}))[key];
    if (value) {
      const cssVar = `--${key.replace(/\./g, "-")}`;
      css += `  ${cssVar}: ${String(value)};\n`;
      tokens.push(key);
    }
  }

  // Critical spacing
  const criticalSpacing = [
    "espaciado.xs",
    "espaciado.s",
    "espaciado.m",
    "espaciado.l",
  ];

  for (const key of criticalSpacing) {
    const value = (((ds as any).tokens || {}))[key];
    if (value) {
      const cssVar = `--${key.replace(/\./g, "-")}`;
      css += `  ${cssVar}: ${String(value)};\n`;
      tokens.push(key);
    }
  }

  // Critical typography
  const typographyBase = (((ds as any).tokens || {}))["tipografia.base"];
  if (typographyBase) {
    css += `  --font-size-base: ${String((typographyBase as Record<string, unknown>).fontSize || "16px")};\n`;
    css += `  --line-height-base: ${String((typographyBase as Record<string, unknown>).lineHeight || "1.5")};\n`;
    tokens.push("tipografia.base");
  }

  css += "}";

  const sizeBytes = Buffer.byteLength(css, "utf8");

  return {
    content: css,
    sizeBytes,
    tokens,
  };
}

function generateDeferredCss(ds: DesignSystem): DeferredCssBlock[] {
  const blocks: DeferredCssBlock[] = [];

  // Deferred: componentes estados (hover, active, disabled)
  let componentCss = "/* Component states */\n";
  componentCss += "button:hover { opacity: 0.8; }\n";
  componentCss += "button:active { transform: scale(0.98); }\n";
  componentCss += "button:disabled { opacity: 0.5; pointer-events: none; }\n";

  blocks.push({
    id: "component-states",
    content: componentCss,
    sizeBytes: Buffer.byteLength(componentCss, "utf8"),
    trigger: "interaction",
  });

  // Deferred: animaciones complejas
  let animationCss = `@media (prefers-reduced-motion: no-preference) {
  @keyframes slideIn {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }
  .slide-in { animation: slideIn 0.3s ease-out; }
}`;

  blocks.push({
    id: "animations",
    content: animationCss,
    sizeBytes: Buffer.byteLength(animationCss, "utf8"),
    trigger: "idle",
  });

  // Deferred: layouts avanzados
  let layoutCss = "@media (min-width: 768px) {\n";
  layoutCss += "  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }\n";
  layoutCss += "}\n";

  blocks.push({
    id: "layout-responsive",
    content: layoutCss,
    sizeBytes: Buffer.byteLength(layoutCss, "utf8"),
    trigger: "intersection",
  });

  return blocks;
}

function generateFontStrategy(ds: DesignSystem): FontLoadingStrategy {
  return {
    strategy: "swap",
    fonts: [
      {
        family: "Inter",
        weights: ["400", "500", "600", "700"],
        display: "swap",
        source: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
      {
        family: "JetBrains Mono",
        weights: ["400", "600"],
        display: "swap",
        source:
          "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap",
      },
    ],
    fallbackStack: "system-ui, -apple-system, sans-serif",
  };
}

function generateImageOptimizations(baseUrl: string): ImageOptimization[] {
  return [
    {
      id: "logo-primary",
      original: `${baseUrl}/assets/logo.png`,
      optimized: `${baseUrl}/assets/logo.avif`,
      format: "avif",
      sizeReduction: 65,
      srcset: `${baseUrl}/assets/logo-128w.avif 128w, ${baseUrl}/assets/logo-256w.avif 256w, ${baseUrl}/assets/logo-512w.avif 512w`,
    },
    {
      id: "hero-image",
      original: `${baseUrl}/assets/hero.jpg`,
      optimized: `${baseUrl}/assets/hero.webp`,
      format: "webp",
      sizeReduction: 35,
      srcset: `${baseUrl}/assets/hero-480w.webp 480w, ${baseUrl}/assets/hero-800w.webp 800w, ${baseUrl}/assets/hero-1200w.webp 1200w`,
    },
  ];
}

function analyzeAnimationPerformance(ds: DesignSystem): AnimationPerformanceReport {
  const gpuAccelerated: string[] = [];
  const notOptimized: {
    readonly property: string;
    readonly reason: string;
    readonly suggestion: string;
  }[] = [];

  // Analizar animaciones
  const animationTokens = Object.entries(((ds as any).tokens || {})).filter(
    ([k]) => k.startsWith("animation.") || k.startsWith("motion."),
  );

  for (const [key, value] of animationTokens) {
    if (typeof value === "object" && value !== null) {
      const anim = value as Record<string, unknown>;
      const property = String(anim.property || "");

      // GPU-accelerated properties: transform, opacity
      if (
        property === "transform" ||
        property === "opacity" ||
        property === "translate" ||
        property === "rotate"
      ) {
        gpuAccelerated.push(`${key} (${property})`);
      } else if (
        property === "width" ||
        property === "height" ||
        property === "left" ||
        property === "top"
      ) {
        notOptimized.push({
          property: `${key} (${property})`,
          reason: `Animating ${property} causes layout recalculations`,
          suggestion: `Use transform: scale() or translate() instead`,
        });
      }
    }
  }

  const estimatedFps =
    gpuAccelerated.length >= notOptimized.length ? 60 : Math.max(30, 60 - notOptimized.length * 5);

  return {
    gpuAccelerated,
    notOptimized,
    estimatedFps,
  };
}

function calculatePerformanceMetrics(
  critical: CriticalCssBlock,
  deferred: DeferredCssBlock[],
  fontStrategy: FontLoadingStrategy,
): PerformanceMetrics {
  const criticalSize = critical.sizeBytes;
  const deferredSize = deferred.reduce((sum, b) => sum + b.sizeBytes, 0);

  // Estimaciones (valores típicos para web moderno)
  const fontLoadTime = fontStrategy.strategy === "swap" ? 100 : 250; // ms
  const estimatedFcp = 1200 + fontLoadTime; // First Contentful Paint
  const estimatedLcp = 2500 + fontLoadTime; // Largest Contentful Paint

  return {
    criticalCssSize: criticalSize,
    totalDeferredSize: deferredSize,
    estimatedFcp,
    estimatedLcp,
    fontLoadTime,
  };
}

/** Generar reporte de performance */
export function generatePerformanceReport(opt: PerformanceOptimization): string {
  let report = "# Design Performance Optimization Report\n\n";

  report += "## Critical CSS\n";
  report += `- Size: ${(opt.metrics.criticalCssSize / 1024).toFixed(2)} KB\n`;
  report += `- Tokens: ${opt.critical.tokens.length}\n`;
  report += `- Status: ${opt.metrics.criticalCssSize < 5120 ? "✅ PASS" : "⚠️ EXCEED (>5KB)"}\n\n`;

  report += "## Deferred CSS\n";
  report += `- Total Size: ${(opt.metrics.totalDeferredSize / 1024).toFixed(2)} KB\n`;
  report += `- Blocks: ${opt.deferred.length}\n`;
  for (const block of opt.deferred) {
    report += `  - ${block.id}: ${block.sizeBytes} bytes (trigger: ${block.trigger})\n`;
  }
  report += "\n";

  report += "## Font Loading Strategy\n";
  report += `- Strategy: ${opt.fontStrategy.strategy}\n`;
  report += `- Load Time: ${opt.metrics.fontLoadTime}ms\n`;
  report += `- Fonts: ${opt.fontStrategy.fonts.length}\n\n`;

  report += "## Animation Performance\n";
  report += `- GPU Accelerated: ${opt.animationPerformance.gpuAccelerated.length}\n`;
  report += `- Not Optimized: ${opt.animationPerformance.notOptimized.length}\n`;
  report += `- Estimated FPS: ${opt.animationPerformance.estimatedFps}\n\n`;

  report += "## Core Web Vitals Estimates\n";
  report += `- FCP: ${opt.metrics.estimatedFcp}ms\n`;
  report += `- LCP: ${opt.metrics.estimatedLcp}ms\n`;

  return report;
}
