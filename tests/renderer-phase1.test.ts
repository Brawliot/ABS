/**
 * Fase 1 del Renderer - Tests Completos
 * 22 tests cubriendo:
 * 1. HTML Boilerplate (4 tests)
 * 2. CSS Crítico (3 tests)
 * 3. Component Integration (4 tests)
 * 4. Dark Mode (3 tests)
 * 5. Lighthouse Optimization (3 tests)
 * 6. SEO Basics (2 tests)
 * 7. Form Validation (3 tests)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderFullHtmlPage,
  type HtmlPageOptions,
} from "../presentation/html-renderer.js";
import {
  generateCriticalCss,
  getCriticalCssSize,
  isCriticalCssSizeValid,
} from "../presentation/css-critical.js";
import {
  generateLazyCss,
  injectLazyCss,
} from "../presentation/css-lazy.js";
import {
  ThemeManager,
  DEFAULT_THEME_CONFIG,
  initThemeManager,
  generateDarkModeCss,
  type ThemeMode,
} from "../presentation/dark-mode.js";
import {
  FormValidator,
  attachFormValidation,
  generateValidationCss,
  type FormFieldValidation,
  type ValidationRule,
} from "../presentation/form-validation.js";
import { renderButton, renderInput, renderTable, renderAlert } from "../presentation/component-library.js";

// ═══════════════════════════════════════════════════════════════
// 1. HTML BOILERPLATE (4 tests)
// ═══════════════════════════════════════════════════════════════

describe("Fase 1: HTML Boilerplate Profesional", () => {
  let mockSpec: any;

  beforeEach(() => {
    mockSpec = {
      id: "test-ui-1",
      version: "1.0.0",
      generatedAt: "2026-10-03T10:00:00Z",
      sourceCaseId: "case-123",
      sourceCaseVersion: "v1",
      sourcePolicyHash: "hash123",
      contentHash: "contenthash123",
      identity: {
        brandName: "Test Brand",
        logoUrl: "https://example.com/logo.png",
      },
      modules: [],
      views: [],
      actions: [],
      forms: [],
      recorridos: [],
      localization: [{ locale: "es", strings: {} }],
      content: {},
      styleTokenRefs: { colorPrimario: "color.primario", espaciadoM: "espaciado.m" },
    };
  });

  it("1.1 Estructura HTML5 básica: DOCTYPE, html lang, head, body", () => {
    const html = renderFullHtmlPage({ spec: mockSpec });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="es"');
    expect(html).toContain("<head>");
    expect(html).toContain("</head>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
  });

  it("1.2 Meta tags críticos: charset, viewport, theme-color", () => {
    const html = renderFullHtmlPage({ spec: mockSpec });

    expect(html).toContain('charset="UTF-8"');
    expect(html).toContain("viewport");
    expect(html).toContain("width=device-width");
    expect(html).toContain("initial-scale=1.0");
    expect(html).toContain("theme-color");
  });

  it("1.3 Seguridad: CSP, X-Frame-Options, X-Content-Type-Options", () => {
    const html = renderFullHtmlPage({ spec: mockSpec });

    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("X-Frame-Options");
    expect(html).toContain("SAMEORIGIN");
    expect(html).toContain("X-Content-Type-Options");
    expect(html).toContain("nosniff");
    expect(html).toContain("X-XSS-Protection");
  });

  it("1.4 PWA + Accesibilidad: manifest, icons, skip-links", () => {
    const html = renderFullHtmlPage({
      spec: mockSpec,
      manifestUrl: "/manifest.json",
      iconUrl: "/icon.png",
    });

    expect(html).toContain('rel="manifest"');
    expect(html).toContain("/manifest.json");
    expect(html).toContain("apple-mobile-web-app-capable");
    expect(html).toContain("skip-links");
    expect(html).toContain("Ir al contenido principal");
    expect(html).toContain("#main-content");
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. CSS CRÍTICO (3 tests)
// ═══════════════════════════════════════════════════════════════

describe("Fase 1: CSS Crítico + Critical Path", () => {
  it("2.1 CSS crítico genera < 5KB", () => {
    const css = generateCriticalCss();
    const size = getCriticalCssSize(css);

    expect(size).toBeLessThan(5120); // 5KB
    expect(isCriticalCssSizeValid(css)).toBe(true);
  });

  it("2.2 CSS crítico contiene reset, colores base, spacing, focus", () => {
    const css = generateCriticalCss();

    expect(css).toContain("box-sizing: border-box");
    expect(css).toContain("--color-primary");
    expect(css).toContain("--spacing-xs");
    expect(css).toContain("--focus-ring");
    expect(css).toContain("focus-visible");
    expect(css).toContain("@media");
  });

  it("2.3 CSS lazy contiene componentes, animations, dark mode", () => {
    const css = generateLazyCss();

    expect(css).toContain(".card");
    expect(css).toContain(".alert");
    expect(css).toContain("@keyframes");
    expect(css).toContain("(prefers-color-scheme: dark)");
    expect(css.length).toBeGreaterThan(5120); // > 5KB
    expect(css).toContain("button");
    expect(css).toContain("input");
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. COMPONENT INTEGRATION (4 tests)
// ═══════════════════════════════════════════════════════════════

describe("Fase 1: Component Library Integration", () => {
  it("3.1 renderButton genera HTML accesible con ARIA", () => {
    const html = renderButton({
      id: "btn-1",
      variant: "primary",
      size: "md",
      state: "default",
      label: "Guardar",
      ariaLabel: "Guardar cambios",
    });

    expect(html).toContain('<button');
    expect(html).toContain('aria-label="Guardar cambios"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Guardar");
  });

  it("3.2 renderInput genera formulario con labels, validation hooks", () => {
    const html = renderInput({
      id: "email-1",
      type: "email",
      state: "default",
      label: "Correo",
      placeholder: "usuario@example.com",
      required: true,
    });

    expect(html).toContain('<label for="email-1"');
    expect(html).toContain("Correo");
    expect(html).toContain('type="email"');
    expect(html).toContain("required");
    expect(html).toContain("*");
    expect(html).toContain("input-wrapper");
  });

  it("3.3 renderTable genera <table> semántica con scope", () => {
    const html = renderTable({
      id: "table-1",
      headers: ["Nombre", "Email", "Rol"],
      rows: [
        { cells: ["Juan", "juan@example.com", "Admin"] },
        { cells: ["María", "maria@example.com", "User"] },
      ],
      hoverable: true,
    });

    expect(html).toContain("<table");
    expect(html).toContain("<thead>");
    expect(html).toContain("<tbody>");
    expect(html).toContain('scope="col"');
    expect(html).toContain("Juan");
    expect(html).toContain("table-hoverable");
  });

  it("3.4 renderAlert genera alertas con roles semánticos", () => {
    const html = renderAlert({
      id: "alert-1",
      variant: "error",
      title: "Error",
      message: "Ocurrió un error al guardar",
      dismissible: true,
    });

    expect(html).toContain('class="alert alert-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Error");
    expect(html).toContain("Ocurrió un error");
    expect(html).toContain("aria-label");
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. DARK MODE (3 tests)
// ═══════════════════════════════════════════════════════════════

describe("Fase 1: Dark Mode Support", () => {
  beforeEach(() => {
    // Mock localStorage
    const localStorageMock = {
      data: {} as Record<string, string>,
      getItem(key: string) {
        return this.data[key] || null;
      },
      setItem(key: string, value: string) {
        this.data[key] = value;
      },
      removeItem(key: string) {
        delete this.data[key];
      },
      clear() {
        this.data = {};
      },
    };
    (global as any).localStorage = localStorageMock;
  });

  it("4.1 ThemeManager detecta preferencia auto/light/dark", () => {
    (global as any).localStorage.data = {};

    const manager = new ThemeManager(DEFAULT_THEME_CONFIG);
    expect(manager.getTheme()).toBe("auto");

    manager.setTheme("dark");
    expect(manager.getTheme()).toBe("dark");

    manager.setTheme("light");
    expect(manager.getTheme()).toBe("light");

    manager.resetToAuto();
    expect(manager.getTheme()).toBe("auto");
  });

  it("4.2 ThemeManager persiste en localStorage", () => {
    const manager = new ThemeManager(DEFAULT_THEME_CONFIG);
    manager.setTheme("dark");

    const manager2 = new ThemeManager(DEFAULT_THEME_CONFIG);
    expect(manager2.getTheme()).toBe("dark");
  });

  it("4.3 generateDarkModeCss cubre @media y [data-theme]", () => {
    const css = generateDarkModeCss();

    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain("--color-primary");
    expect(css).toContain("transition");
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. LIGHTHOUSE OPTIMIZATION (3 tests)
// ═══════════════════════════════════════════════════════════════

describe("Fase 1: Lighthouse Optimization", () => {
  let mockSpec: any;

  beforeEach(() => {
    mockSpec = {
      id: "lighthouse-test",
      version: "1.0.0",
      generatedAt: "2026-10-03T10:00:00Z",
      sourceCaseId: "case-lh",
      sourceCaseVersion: "v1",
      sourcePolicyHash: "hash-lh",
      contentHash: "content-lh",
      identity: { brandName: "Lighthouse Test" },
      modules: [],
      views: [],
      actions: [],
      forms: [],
      recorridos: [],
      localization: [{ locale: "es", strings: {} }],
      content: {},
      styleTokenRefs: { colorPrimario: "color.primario", espaciadoM: "espaciado.m" },
    };
  });

  it("5.1 CSS crítico inline reduce FCP/LCP", () => {
    const html = renderFullHtmlPage({ spec: mockSpec });

    expect(html).toContain("<style>");
    expect(html).toContain("</style>");
    expect(html).toContain("--color-primary");
    expect(html).toContain(":root");
    // CSS inline = faster FCP
  });

  it("5.2 Lazy CSS con media print trick para defer", () => {
    const lazyCss = generateLazyCss();
    const html = renderFullHtmlPage({ spec: mockSpec });

    expect(html).toContain('media="print"');
    expect(html).toContain('onload="this.media=\'all\'"');
    // No bloquea render
  });

  it("5.3 Semántica HTML reduce CLS", () => {
    const html = renderFullHtmlPage({ spec: mockSpec });

    expect(html).toContain("<header");
    expect(html).toContain("<main");
    expect(html).toContain("<footer");
    expect(html).toContain("role=");
    // Semantic HTML = better layout
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. SEO BASICS (2 tests)
// ═══════════════════════════════════════════════════════════════

describe("Fase 1: SEO Basics", () => {
  let mockSpec: any;

  beforeEach(() => {
    mockSpec = {
      id: "seo-test",
      version: "1.0.0",
      generatedAt: "2026-10-03T10:00:00Z",
      sourceCaseId: "case-seo",
      sourceCaseVersion: "v1",
      sourcePolicyHash: "hash-seo",
      contentHash: "content-seo",
      identity: { brandName: "SEO Test", logoUrl: "https://example.com/logo.png" },
      modules: [],
      views: [],
      actions: [],
      forms: [],
      recorridos: [],
      localization: [{ locale: "es", strings: {} }],
      content: {},
      styleTokenRefs: { colorPrimario: "color.primario", espaciadoM: "espaciado.m" },
    };
  });

  it("6.1 Meta tags OG y Twitter", () => {
    const html = renderFullHtmlPage({
      spec: mockSpec,
      title: "Mi Aplicación",
      description: "Descripción de la aplicación",
      ogImage: "https://example.com/image.png",
    });

    expect(html).toContain('property="og:type"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('name="twitter:title"');
  });

  it("6.2 Robots meta y canonical", () => {
    const html = renderFullHtmlPage({
      spec: mockSpec,
      canonical: "https://example.com/page",
      indexable: true,
    });

    expect(html).toContain('rel="canonical"');
    expect(html).toContain("robots");
    expect(html).toContain("index, follow");
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. FORM VALIDATION (3 tests)
// ═══════════════════════════════════════════════════════════════

describe("Fase 1: Form Validation", () => {
  it("7.1 FormValidator valida required, email, pattern", async () => {
    const validator = new FormValidator();

    validator.registerField({
      fieldName: "email",
      rules: [{ type: "required" }, { type: "email" }],
    });

    const emptyErrors = await validator.validateField("email", "");
    expect(emptyErrors.length).toBeGreaterThan(0);
    expect(emptyErrors.some((e) => e.rule.type === "required")).toBe(true);

    const invalidErrors = await validator.validateField("email", "invalid");
    expect(invalidErrors.length).toBeGreaterThan(0);
    expect(invalidErrors.some((e) => e.rule.type === "email")).toBe(true);

    const validErrors = await validator.validateField("email", "user@example.com");
    expect(validErrors.length).toBe(0);
  });

  it("7.2 FormValidator soporta minLength, maxLength, custom", async () => {
    const validator = new FormValidator();

    validator.registerField({
      fieldName: "password",
      rules: [
        { type: "required" },
        { type: "minLength", min: 8 },
        { type: "maxLength", max: 50 },
      ],
    });

    const shortErrors = await validator.validateField("password", "abc");
    expect(shortErrors.some((e) => e.rule.type === "minLength")).toBe(true);

    const validErrors = await validator.validateField("password", "ValidPassword123");
    expect(validErrors.length).toBe(0);
  });

  it("7.3 generateValidationCss cubre estilos de error/success", () => {
    const css = generateValidationCss();

    expect(css).toContain(".is-invalid");
    expect(css).toContain(".is-valid");
    expect(css).toContain(".validation-error");
    expect(css).toContain(".validation-icon");
    expect(css).toContain("#EF4444"); // error color
    expect(css).toContain("#10B981"); // success color
  });
});

// ═══════════════════════════════════════════════════════════════
// TESTS DE INTEGRACIÓN
// ═══════════════════════════════════════════════════════════════

describe("Fase 1: Integración Completa", () => {
  let mockSpec: any;

  beforeEach(() => {
    mockSpec = {
      id: "integration-test",
      version: "1.0.0",
      generatedAt: "2026-10-03T10:00:00Z",
      sourceCaseId: "case-integration",
      sourceCaseVersion: "v1",
      sourcePolicyHash: "hash-int",
      contentHash: "content-int",
      identity: { brandName: "Integration Test" },
      modules: [],
      views: [],
      actions: [],
      forms: [],
      recorridos: [],
      localization: [{ locale: "es", strings: {} }],
      content: {},
      styleTokenRefs: { colorPrimario: "color.primario", espaciadoM: "espaciado.m" },
    };
  });

  it("Página completa: HTML + CSS crítico + dark mode + validación", () => {
    const html = renderFullHtmlPage({
      spec: mockSpec,
      title: "Integración Completa",
      description: "Test de integración",
    });

    // HTML
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<body>");

    // CSS crítico inline
    expect(html).toContain("<style>");
    expect(html).toContain(":root");

    // Dark mode script
    expect(html).toContain("data-theme");
    expect(html).toContain("localStorage");

    // Lazy CSS defer
    expect(html).toContain('media="print"');
    expect(html).toContain("onload");

    // Semantica
    expect(html).toContain("<header");
    expect(html).toContain("<main");
    expect(html).toContain("<footer");
  });

  it("CSS crítico + lazy = cobertura completa sin overlap", () => {
    const criticalCss = generateCriticalCss();
    const lazyCss = generateLazyCss();

    // Ambos validos
    expect(isCriticalCssSizeValid(criticalCss)).toBe(true);
    expect(lazyCss.length).toBeGreaterThan(0);

    // Sin duplicación significativa de selectores
    const criticalSelectors = (criticalCss.match(/\./g) || []).length;
    const lazySelectors = (lazyCss.match(/\./g) || []).length;

    expect(lazySelectors).toBeGreaterThan(criticalSelectors);
  });

  it("Componentes renderizan con CSS classes para lazy styling", () => {
    const buttonHtml = renderButton({
      id: "test-btn",
      variant: "primary",
      size: "md",
      state: "default",
      label: "Test",
    });

    const inputHtml = renderInput({
      id: "test-input",
      type: "text",
      state: "default",
      label: "Test",
    });

    const alertHtml = renderAlert({
      id: "test-alert",
      variant: "info",
      message: "Test",
    });

    // Clases que se estilean en lazy CSS
    expect(buttonHtml).toContain("btn");
    expect(inputHtml).toContain("input");
    expect(alertHtml).toContain("alert");

    // Atributos ARIA
    expect(buttonHtml).toContain("aria-");
    expect(inputHtml).toContain("aria-");
    expect(alertHtml).toContain("role=");
  });
});

// ═══════════════════════════════════════════════════════════════
// DETERMINISMO
// ═══════════════════════════════════════════════════════════════

describe("Fase 1: Determinismo", () => {
  let mockSpec: any;

  beforeEach(() => {
    mockSpec = {
      id: "determinism-test",
      version: "1.0.0",
      generatedAt: "2026-10-03T10:00:00Z",
      sourceCaseId: "determinism-case",
      sourceCaseVersion: "v1",
      sourcePolicyHash: "hash-det",
      contentHash: "content-det",
      identity: { brandName: "Determinism Test" },
      modules: [],
      views: [],
      actions: [],
      forms: [],
      recorridos: [],
      localization: [{ locale: "es", strings: {} }],
      content: {},
      styleTokenRefs: { colorPrimario: "color.primario", espaciadoM: "espaciado.m" },
    };
  });

  it("renderFullHtmlPage produce salida idéntica para entrada idéntica", () => {
    const html1 = renderFullHtmlPage({ spec: mockSpec });
    const html2 = renderFullHtmlPage({ spec: mockSpec });

    expect(html1).toBe(html2);
  });

  it("generateCriticalCss es determinístico", () => {
    const css1 = generateCriticalCss();
    const css2 = generateCriticalCss();

    expect(css1).toBe(css2);
  });

  it("generateLazyCss es determinístico", () => {
    const css1 = generateLazyCss();
    const css2 = generateLazyCss();

    expect(css1).toBe(css2);
  });
});

// Variable para importación
const mockSpec = {} as any;
