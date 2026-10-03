/**
 * Sistema de Dark Mode
 * - Detecta preferencia: prefers-color-scheme
 * - Toggle manual con persistencia en localStorage
 * - CSS variables por tema
 * - Transición suave sin flash
 * - Override con data-theme attribute
 */

export type ThemeMode = "light" | "dark" | "auto";

/**
 * Configuración de temas
 */
export interface ThemeColors {
  readonly colorPrimary: string;
  readonly colorSecondary: string;
  readonly colorSurface: string;
  readonly colorBackground: string;
  readonly colorTextPrimary: string;
  readonly colorTextSecondary: string;
  readonly colorBorder: string;
  readonly colorSuccess: string;
  readonly colorWarning: string;
  readonly colorError: string;
  readonly colorInfo: string;
}

export interface ThemeConfig {
  readonly light: ThemeColors;
  readonly dark: ThemeColors;
}

/**
 * Tema por defecto
 */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  light: {
    colorPrimary: "#2563EB",
    colorSecondary: "#7C3AED",
    colorSurface: "#FFFFFF",
    colorBackground: "#F9FAFB",
    colorTextPrimary: "#111827",
    colorTextSecondary: "#6B7280",
    colorBorder: "#E5E7EB",
    colorSuccess: "#10B981",
    colorWarning: "#F59E0B",
    colorError: "#EF4444",
    colorInfo: "#3B82F6",
  },
  dark: {
    colorPrimary: "#3B82F6",
    colorSecondary: "#8B5CF6",
    colorSurface: "#1F2937",
    colorBackground: "#111827",
    colorTextPrimary: "#F9FAFB",
    colorTextSecondary: "#D1D5DB",
    colorBorder: "#374151",
    colorSuccess: "#34D399",
    colorWarning: "#FBBF24",
    colorError: "#F87171",
    colorInfo: "#60A5FA",
  },
};

/**
 * Gestor de Dark Mode
 */
export class ThemeManager {
  private currentTheme: ThemeMode;
  private themeConfig: ThemeConfig;
  private root: any; // Será HTMLElement si en navegador, null en servidor

  constructor(config: ThemeConfig = DEFAULT_THEME_CONFIG) {
    this.themeConfig = config;
    const g = globalThis as any;
    this.root =
      typeof globalThis !== "undefined" &&
      g.document
        ? g.document.documentElement
        : null;
    this.currentTheme = this.detectTheme();
  }

  /**
   * Detecta tema actual
   */
  private detectTheme(): ThemeMode {
    const g = globalThis as any;
    if (typeof globalThis === "undefined" || !g.localStorage) {
      return "auto";
    }

    const saved = g.localStorage.getItem("theme");
    if (saved === "light" || saved === "dark" || saved === "auto") {
      return saved;
    }
    return "auto";
  }

  /**
   * Resuelve tema efectivo (auto → light/dark)
   */
  private resolveEffectiveTheme(theme: ThemeMode): "light" | "dark" {
    if (theme !== "auto") return theme;

    const g = globalThis as any;
    if (typeof globalThis !== "undefined" && g.matchMedia) {
      return g.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light";
  }

  /**
   * Aplica tema actual
   */
  applyTheme(): void {
    if (!this.root) return;

    const effectiveTheme = this.resolveEffectiveTheme(this.currentTheme);
    const colors = this.themeConfig[effectiveTheme];

    // Aplicar data-theme
    this.root.setAttribute("data-theme", effectiveTheme);

    // Aplicar CSS variables
    Object.entries(colors).forEach(([key, value]) => {
      const cssVarName = `--color-${key
        .replace(/([A-Z])/g, "-$1")
        .toLowerCase()
        .replace(/^-/, "")}`;
      if (this.root && this.root.style) {
        this.root.style.setProperty(cssVarName, value);
      }
    });

    // Emitir evento
    const g = globalThis as any;
    if (typeof globalThis !== "undefined" && g.dispatchEvent) {
      g.dispatchEvent(
        new CustomEvent("themechange", {
          detail: { theme: this.currentTheme, effective: effectiveTheme },
        })
      );
    }
  }

  /**
   * Configura tema
   */
  setTheme(theme: ThemeMode): void {
    this.currentTheme = theme;
    const g = globalThis as any;
    if (typeof globalThis !== "undefined" && g.localStorage) {
      g.localStorage.setItem("theme", theme);
    }
    this.applyTheme();
  }

  /**
   * Obtiene tema actual
   */
  getTheme(): ThemeMode {
    return this.currentTheme;
  }

  /**
   * Obtiene tema efectivo
   */
  getEffectiveThemeValue(): "light" | "dark" {
    return this.resolveEffectiveTheme(this.currentTheme);
  }

  /**
   * Toggle entre light/dark (respeta auto si estaba en auto)
   */
  toggleTheme(): void {
    if (this.currentTheme === "auto") {
      const effective = this.resolveEffectiveTheme("auto");
      this.setTheme(effective === "light" ? "dark" : "light");
    } else {
      this.setTheme(this.currentTheme === "light" ? "dark" : "light");
    }
  }

  /**
   * Reset a auto
   */
  resetToAuto(): void {
    this.setTheme("auto");
  }
}

/**
 * Inicializa tema global (call once en app startup)
 */
export function initThemeManager(
  config?: ThemeConfig
): ThemeManager {
  const manager = new ThemeManager(config);
  manager.applyTheme();

  // Escuchar cambios de preferencia del SO
  if (typeof globalThis !== "undefined" && "matchMedia" in globalThis) {
    try {
      (globalThis as any)
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => {
          if (manager.getTheme() === "auto") {
            manager.applyTheme();
          }
        });
    } catch (_) {
      // Ignorar errores en ambientes no-navegador
    }
  }

  return manager;
}

/**
 * Inyecta script de detección de tema (sin flash)
 */
export function injectThemeDetectionScript(): string {
  return `
<script>
  (function() {
    const theme = localStorage.getItem('theme') || 'auto';
    const isDark = theme === 'dark' ||
      (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
</script>
`.trim();
}

/**
 * Genera CSS dark mode (media query)
 */
export function generateDarkModeCss(): string {
  return `
/* Dark Mode CSS */

@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #3B82F6;
    --color-secondary: #8B5CF6;
    --color-surface: #1F2937;
    --color-background: #111827;
    --color-text-primary: #F9FAFB;
    --color-text-secondary: #D1D5DB;
    --color-border: #374151;
    --color-success: #34D399;
    --color-warning: #FBBF24;
    --color-error: #F87171;
    --color-info: #60A5FA;
  }
}

/* Manual override */
[data-theme="dark"] {
  --color-primary: #3B82F6;
  --color-secondary: #8B5CF6;
  --color-surface: #1F2937;
  --color-background: #111827;
  --color-text-primary: #F9FAFB;
  --color-text-secondary: #D1D5DB;
  --color-border: #374151;
  --color-success: #34D399;
  --color-warning: #FBBF24;
  --color-error: #F87171;
  --color-info: #60A5FA;
}

[data-theme="light"] {
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
}

/* Smooth transition on theme change */
body {
  transition: background-color 300ms ease, color 300ms ease;
}

html {
  transition: background-color 300ms ease, color 300ms ease;
}

/* Component-specific dark mode */
@media (prefers-color-scheme: dark) {
  button {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border);
  }

  button:hover {
    background-color: var(--color-border);
  }

  input,
  select,
  textarea {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border);
  }

  .card {
    background-color: var(--color-surface);
    border-color: var(--color-border);
  }

  .alert {
    background-color: var(--color-surface);
    border-color: var(--color-border);
  }

  .table {
    background-color: var(--color-surface);
  }

  .table th {
    background-color: var(--color-border);
  }

  .pagination-btn {
    background-color: var(--color-surface);
    border-color: var(--color-border);
  }
}
`.trim();
}

/**
 * Hook para attach en React/Vue
 */
export function useTheme() {
  const manager = initThemeManager();

  return {
    theme: () => manager.getTheme(),
    effectiveTheme: () => manager.getEffectiveThemeValue(),
    setTheme: (theme: ThemeMode) => manager.setTheme(theme),
    toggleTheme: () => manager.toggleTheme(),
    resetToAuto: () => manager.resetToAuto(),
  };
}
