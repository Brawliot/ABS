/**
 * Motor de Layouts Adaptativos (Fase 2, Paso 5)
 * Analiza contenido real y elige el layout más apropiado.
 * Soporta responsive design: xs, sm, md, lg, xl breakpoints.
 */

export type LayoutType =
  | "single-column"
  | "two-column"
  | "three-column"
  | "masonry"
  | "data-grid";

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";
export type DensityLevel = "compacta" | "normal" | "espaciosa";

export interface ContentAnalysis {
  readonly fieldCount: number;
  readonly itemCount: number;
  readonly hasNavigation: boolean;
  readonly hasSidebar: boolean;
  readonly isDataHeavy: boolean;
  readonly preferredDensity: DensityLevel;
}

export interface LayoutSpec {
  readonly type: LayoutType;
  readonly breakpoint: Breakpoint;
  readonly columns: number;
  readonly gapSize: string;
  readonly paddingSize: string;
  readonly maxWidth: string;
  readonly containerClass: string;
}

export interface ResponsiveLayout {
  readonly xs: LayoutSpec;
  readonly sm: LayoutSpec;
  readonly md: LayoutSpec;
  readonly lg: LayoutSpec;
  readonly xl: LayoutSpec;
  readonly cssGrid: string;
}

const BREAKPOINT_PIXELS: Record<Breakpoint, number> = {
  xs: 320,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

interface SpacingMap {
  readonly xs: string;
  readonly s: string;
  readonly m: string;
  readonly l: string;
  readonly xl: string;
}

const SPACING_SCALE: Record<DensityLevel, SpacingMap> = {
  compacta: {
    xs: "4px",
    s: "8px",
    m: "12px",
    l: "16px",
    xl: "24px",
  },
  normal: {
    xs: "8px",
    s: "12px",
    m: "16px",
    l: "24px",
    xl: "32px",
  },
  espaciosa: {
    xs: "12px",
    s: "16px",
    m: "24px",
    l: "32px",
    xl: "48px",
  },
};

/**
 * Analiza el contenido real para determinar el layout óptimo.
 */
export function analyzeContent(
  fieldCount: number,
  itemCount: number,
  options?: {
    hasNavigation?: boolean;
    hasSidebar?: boolean;
    isDataHeavy?: boolean;
  }
): ContentAnalysis {
  const hasNav = options?.hasNavigation ?? false;
  const hasSide = options?.hasSidebar ?? false;
  const isDataHvy = options?.isDataHeavy ?? itemCount > 50;

  let density: DensityLevel = "normal";
  if (itemCount > 100) density = "compacta";
  if (itemCount < 10 && fieldCount < 5) density = "espaciosa";

  return {
    fieldCount,
    itemCount,
    hasNavigation: hasNav,
    hasSidebar: hasSide,
    isDataHeavy: isDataHvy,
    preferredDensity: density,
  };
}

/**
 * Elige el tipo de layout basado en análisis de contenido.
 */
function chooseLayoutType(analysis: ContentAnalysis): LayoutType {
  // Si hay muchos datos, usa data-grid
  if (analysis.isDataHeavy && analysis.itemCount > 50) {
    return "data-grid";
  }

  // Si hay navegación principal + sidebar, usa three-column
  if (analysis.hasNavigation && analysis.hasSidebar) {
    return "three-column";
  }

  // Si hay navegación O sidebar, usa two-column
  if (analysis.hasNavigation || analysis.hasSidebar) {
    return "two-column";
  }

  // Si hay múltiples items pero no es data-heavy, usa masonry
  if (analysis.itemCount > 15) {
    return "masonry";
  }

  // Default: single-column
  return "single-column";
}

/**
 * Genera especificación de layout para un breakpoint específico.
 */
function generateLayoutForBreakpoint(
  layoutType: LayoutType,
  breakpoint: Breakpoint,
  density: DensityLevel
): LayoutSpec {
  const spacing = SPACING_SCALE[density];

  switch (layoutType) {
    case "single-column":
      return {
        type: "single-column",
        breakpoint,
        columns: 1,
        gapSize: spacing.l,
        paddingSize: breakpoint === "xs" ? spacing.m : spacing.l,
        maxWidth: breakpoint === "lg" || breakpoint === "xl" ? "800px" : "",
        containerClass: "layout-single-column",
      };

    case "two-column":
      if (breakpoint === "xs" || breakpoint === "sm") {
        // Stack en mobile
        return {
          type: "two-column",
          breakpoint,
          columns: 1,
          gapSize: spacing.m,
          paddingSize: spacing.m,
          maxWidth: "",
          containerClass: "layout-two-column-stacked",
        };
      }
      return {
        type: "two-column",
        breakpoint,
        columns: 2,
        gapSize: spacing.l,
        paddingSize: spacing.l,
        maxWidth: "1200px",
        containerClass: "layout-two-column",
      };

    case "three-column":
      if (breakpoint === "xs" || breakpoint === "sm") {
        return {
          type: "three-column",
          breakpoint,
          columns: 1,
          gapSize: spacing.m,
          paddingSize: spacing.m,
          maxWidth: "",
          containerClass: "layout-three-column-stacked",
        };
      }
      if (breakpoint === "md") {
        return {
          type: "three-column",
          breakpoint,
          columns: 2,
          gapSize: spacing.m,
          paddingSize: spacing.m,
          maxWidth: "",
          containerClass: "layout-three-column-two-col",
        };
      }
      return {
        type: "three-column",
        breakpoint,
        columns: 3,
        gapSize: spacing.l,
        paddingSize: spacing.l,
        maxWidth: "1400px",
        containerClass: "layout-three-column",
      };

    case "masonry":
      if (breakpoint === "xs") {
        return {
          type: "masonry",
          breakpoint,
          columns: 1,
          gapSize: spacing.m,
          paddingSize: spacing.m,
          maxWidth: "",
          containerClass: "layout-masonry-1col",
        };
      }
      if (breakpoint === "sm" || breakpoint === "md") {
        return {
          type: "masonry",
          breakpoint,
          columns: 2,
          gapSize: spacing.m,
          paddingSize: spacing.m,
          maxWidth: "",
          containerClass: "layout-masonry-2col",
        };
      }
      return {
        type: "masonry",
        breakpoint,
        columns: 3,
        gapSize: spacing.l,
        paddingSize: spacing.l,
        maxWidth: "1400px",
        containerClass: "layout-masonry-3col",
      };

    case "data-grid":
      // Data-grid siempre adapta columnas
      if (breakpoint === "xs" || breakpoint === "sm") {
        return {
          type: "data-grid",
          breakpoint,
          columns: 1,
          gapSize: spacing.s,
          paddingSize: spacing.s,
          maxWidth: "",
          containerClass: "layout-data-grid-mobile",
        };
      }
      return {
        type: "data-grid",
        breakpoint,
        columns: 4,
        gapSize: spacing.m,
        paddingSize: spacing.m,
        maxWidth: "100%",
        containerClass: "layout-data-grid",
      };
  }
}

/**
 * Ajusta tipografía según densidad.
 */
function adjustTypographyForDensity(
  density: DensityLevel
): { fontSize: string; lineHeight: string; letterSpacing: string } {
  switch (density) {
    case "compacta":
      return {
        fontSize: "14px",
        lineHeight: "1.4",
        letterSpacing: "-0.01em",
      };
    case "espaciosa":
      return {
        fontSize: "16px",
        lineHeight: "1.8",
        letterSpacing: "0.01em",
      };
    default:
      return {
        fontSize: "15px",
        lineHeight: "1.6",
        letterSpacing: "0em",
      };
  }
}

/**
 * Genera layout responsive completo.
 */
export function generateAdaptiveLayout(
  fieldCount: number,
  itemCount: number,
  options?: {
    hasNavigation?: boolean;
    hasSidebar?: boolean;
    isDataHeavy?: boolean;
  }
): ResponsiveLayout {
  const analysis = analyzeContent(fieldCount, itemCount, options);
  const layoutType = chooseLayoutType(analysis);
  const density = analysis.preferredDensity;
  const typography = adjustTypographyForDensity(density);

  const layouts: Record<Breakpoint, LayoutSpec> = {
    xs: generateLayoutForBreakpoint(layoutType, "xs", density),
    sm: generateLayoutForBreakpoint(layoutType, "sm", density),
    md: generateLayoutForBreakpoint(layoutType, "md", density),
    lg: generateLayoutForBreakpoint(layoutType, "lg", density),
    xl: generateLayoutForBreakpoint(layoutType, "xl", density),
  };

  const cssGrid = generateResponsiveCss(layouts, typography);

  return {
    xs: layouts.xs,
    sm: layouts.sm,
    md: layouts.md,
    lg: layouts.lg,
    xl: layouts.xl,
    cssGrid,
  };
}

/**
 * Genera CSS media queries y grid definitions.
 */
function generateResponsiveCss(
  layouts: Record<Breakpoint, LayoutSpec>,
  typography: { fontSize: string; lineHeight: string; letterSpacing: string }
): string {
  const breakpoints = Object.entries(BREAKPOINT_PIXELS);

  const mediaQueries = breakpoints
    .map(([bp, px]) => {
      const layout = layouts[bp as Breakpoint];
      const minWidth = px === 320 ? "0" : `${px}px`;
      const mediaQuery =
        bp === "xs" ? `@media (max-width: 639px)` : `@media (min-width: ${minWidth})`;

      if (layout.columns === 1) {
        return `
${mediaQuery} {
  .${layout.containerClass} {
    display: flex;
    flex-direction: column;
    gap: ${layout.gapSize};
    padding: ${layout.paddingSize};
    ${layout.maxWidth ? `max-width: ${layout.maxWidth};` : ""}
    margin: 0 auto;
    font-size: ${typography.fontSize};
    line-height: ${typography.lineHeight};
    letter-spacing: ${typography.letterSpacing};
  }
}`;
      }

      return `
${mediaQuery} {
  .${layout.containerClass} {
    display: grid;
    grid-template-columns: repeat(${layout.columns}, 1fr);
    gap: ${layout.gapSize};
    padding: ${layout.paddingSize};
    ${layout.maxWidth ? `max-width: ${layout.maxWidth};` : ""}
    margin: 0 auto;
    font-size: ${typography.fontSize};
    line-height: ${typography.lineHeight};
    letter-spacing: ${typography.letterSpacing};
  }
}`;
    })
    .join("\n");

  return mediaQueries;
}

/**
 * Genera HTML wrapper con responsive attributes.
 */
export function wrapInResponsiveLayout(
  content: string,
  analysis: ContentAnalysis
): string {
  const layoutType = chooseLayoutType(analysis);
  const containerClass = `layout-container layout-type-${layoutType}`;

  return `<div class="${containerClass}" data-layout="${layoutType}" data-density="${analysis.preferredDensity}">
${content}
</div>`;
}
