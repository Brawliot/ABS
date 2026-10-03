/**
 * Token Export System
 * Exporta tokens de diseño a múltiples formatos:
 * - CSS variables
 * - JSON
 * - SCSS
 * - iOS Swift
 * - Android XML
 * - Figma tokens
 */

import type { DesignSystem } from "../design/schema.js";

export type TokenExportFormat = "css" | "json" | "scss" | "swift" | "xml" | "figma";

export interface TokenExportResult {
  readonly format: TokenExportFormat;
  readonly content: string;
  readonly filename: string;
  readonly mimeType: string;
}

/** Exportar tokens en un formato específico */
export function exportTokens(
  designSystem: DesignSystem,
  format: TokenExportFormat,
): TokenExportResult {
  switch (format) {
    case "css":
      return exportToCss(designSystem);
    case "json":
      return exportToJson(designSystem);
    case "scss":
      return exportToScss(designSystem);
    case "swift":
      return exportToSwift(designSystem);
    case "xml":
      return exportToXml(designSystem);
    case "figma":
      return exportToFigmaTokens(designSystem);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

function exportToCss(ds: DesignSystem): TokenExportResult {
  let css = "/* Design System Tokens - CSS Variables */\n\n:root {\n";

  const tokens = ((ds as any).tokens || {});
  for (const [key, value] of Object.entries(tokens)) {
    const cssVar = `--${key.replace(/\./g, "-")}`;
    const cssValue = formatTokenValue(value);
    css += `  ${cssVar}: ${cssValue};\n`;
  }

  css += "}\n\n";

  // Agregar media queries para dark mode
  css += "@media (prefers-color-scheme: dark) {\n  :root {\n";
  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith("color.") || key.startsWith("color_")) {
      const cssVar = `--${key.replace(/\./g, "-")}`;
      const invertedValue = invertTokenColor(value);
      if (invertedValue !== null) {
        css += `    ${cssVar}: ${invertedValue};\n`;
      }
    }
  }
  css += "  }\n}\n";

  return {
    format: "css",
    content: css,
    filename: "design-tokens.css",
    mimeType: "text/css",
  };
}

function exportToJson(ds: DesignSystem): TokenExportResult {
  const tokenObj = {
    version: ds.version || "1.0.0",
    lastModified: new Date().toISOString(),
    tokens: ((ds as any).tokens || {}),
    metadata: {
      description: "Design System Tokens",
      author: ds.id || "design-system",
    },
  };

  return {
    format: "json",
    content: JSON.stringify(tokenObj, null, 2),
    filename: "design-tokens.json",
    mimeType: "application/json",
  };
}

function exportToScss(ds: DesignSystem): TokenExportResult {
  let scss = "// Design System Tokens - SCSS Variables\n\n";

  const tokens = ((ds as any).tokens || {});

  // Colores como map
  scss += "$colors: (\n";
  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith("color.") || key.startsWith("color_")) {
      const scssVar = key.replace(/\./g, "-").replace(/color-/, "");
      scss += `  '${scssVar}': ${formatTokenValueScss(value)},\n`;
    }
  }
  scss += ");\n\n";

  // Spacing como map
  scss += "$spacing: (\n";
  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith("espaciado.") || key.startsWith("spacing.")) {
      const scssVar = key.replace(/\./g, "-").replace(/espaciado-|spacing-/, "");
      scss += `  '${scssVar}': ${formatTokenValueScss(value)},\n`;
    }
  }
  scss += ");\n\n";

  // Typography como map
  scss += "$typography: (\n";
  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith("tipografia.") || key.startsWith("typography.")) {
      const scssVar = key.replace(/\./g, "-").replace(/tipografia-|typography-/, "");
      scss += `  '${scssVar}': ${formatTokenValueScss(value)},\n`;
    }
  }
  scss += ");\n\n";

  // Variables individuales
  scss += "// Individual Variables\n";
  for (const [key, value] of Object.entries(tokens)) {
    const scssVar = `$${key.replace(/\./g, "-")}`;
    scss += `${scssVar}: ${formatTokenValueScss(value)};\n`;
  }

  return {
    format: "scss",
    content: scss,
    filename: "design-tokens.scss",
    mimeType: "text/x-scss",
  };
}

function exportToSwift(ds: DesignSystem): TokenExportResult {
  let swift = "// Design System Tokens - Swift\n\nimport UIKit\n\n";
  swift += "enum DesignTokens {\n";

  // Color enum
  swift += "  enum Color {\n";
  const colorTokens = Object.entries(((ds as any).tokens || {})).filter(
    ([k]) => k.startsWith("color.") || k.startsWith("color_"),
  );

  for (const [key, value] of colorTokens) {
    if (typeof value === "string") {
      const swiftName = key.replace(/color[._]/, "").replace(/\./g, "");
      swift += `    static let ${swiftName} = UIColor(hex: "${value}")\n`;
    }
  }
  swift += "  }\n\n";

  // Spacing enum
  swift += "  enum Spacing {\n";
  const spacingTokens = Object.entries(((ds as any).tokens || {})).filter(
    ([k]) => k.startsWith("espaciado.") || k.startsWith("spacing."),
  );

  for (const [key, value] of spacingTokens) {
    if (typeof value === "string" && value.match(/^(\d+)(px|pt)$/)) {
      const swiftName = key.replace(/espaciado[._]|spacing[._]/, "").replace(/\./g, "");
      const num = parseInt(value, 10);
      swift += `    static let ${swiftName}: CGFloat = ${num}\n`;
    }
  }
  swift += "  }\n\n";

  // Typography enum
  swift += "  enum Typography {\n";
  const typographyTokens = Object.entries(((ds as any).tokens || {})).filter(
    ([k]) => k.startsWith("tipografia.") || k.startsWith("typography."),
  );

  for (const [key] of typographyTokens) {
    const swiftName = key.replace(/tipografia[._]|typography[._]/, "").replace(/\./g, "");
    swift += `    static let ${swiftName} = UIFont(...) // TODO: configure\n`;
  }
  swift += "  }\n";

  swift += "}\n\n";

  swift += `// UIColor extension for hex support
extension UIColor {
  convenience init(hex: String) {
    let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    let scanner = Scanner(string: hex)
    var rgb: UInt64 = 0
    scanner.scanHexInt64(&rgb)

    let r = CGFloat((rgb >> 16) & 0xFF) / 255.0
    let g = CGFloat((rgb >> 8) & 0xFF) / 255.0
    let b = CGFloat(rgb & 0xFF) / 255.0

    self.init(red: r, green: g, blue: b, alpha: 1.0)
  }
}`;

  return {
    format: "swift",
    content: swift,
    filename: "DesignTokens.swift",
    mimeType: "text/x-swift",
  };
}

function exportToXml(ds: DesignSystem): TokenExportResult {
  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += "<!-- Design System Tokens - Android XML -->\n";
  xml += "<resources>\n";

  // Color resources
  const colorTokens = Object.entries(((ds as any).tokens || {})).filter(
    ([k]) => k.startsWith("color.") || k.startsWith("color_"),
  );

  for (const [key, value] of colorTokens) {
    if (typeof value === "string" && value.startsWith("#")) {
      const xmlName = key.replace(/color[._]/, "").replace(/\./g, "_");
      xml += `  <color name="${xmlName}">${value}</color>\n`;
    }
  }

  xml += "\n";

  // Dimension resources
  const spacingTokens = Object.entries(((ds as any).tokens || {})).filter(
    ([k]) => k.startsWith("espaciado.") || k.startsWith("spacing."),
  );

  for (const [key, value] of spacingTokens) {
    if (typeof value === "string") {
      const xmlName = key.replace(/espaciado[._]|spacing[._]/, "").replace(/\./g, "_");
      xml += `  <dimen name="${xmlName}">${value}</dimen>\n`;
    }
  }

  xml += "</resources>\n";

  return {
    format: "xml",
    content: xml,
    filename: "design_tokens.xml",
    mimeType: "application/xml",
  };
}

function exportToFigmaTokens(ds: DesignSystem): TokenExportResult {
  const figmaTokens: Record<string, Record<string, unknown>> = {
    color: {},
    spacing: {},
    typography: {},
    elevation: {},
  };

  const tokens = ((ds as any).tokens || {});

  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith("color.") || key.startsWith("color_")) {
      const name = key.replace(/color[._]/, "").replace(/\./g, "/");
      figmaTokens.color[name] = { value: String(value), type: "color" };
    } else if (key.startsWith("espaciado.") || key.startsWith("spacing.")) {
      const name = key.replace(/espaciado[._]|spacing[._]/, "").replace(/\./g, "/");
      figmaTokens.spacing[name] = { value: String(value), type: "sizing" };
    } else if (key.startsWith("tipografia.") || key.startsWith("typography.")) {
      const name = key.replace(/tipografia[._]|typography[._]/, "").replace(/\./g, "/");
      figmaTokens.typography[name] = { value: value, type: "typography" };
    } else if (key.startsWith("elevation.") || key.startsWith("shadow.")) {
      const name = key.replace(/elevation[._]|shadow[._]/, "").replace(/\./g, "/");
      figmaTokens.elevation[name] = { value: String(value), type: "boxShadow" };
    }
  }

  const figmaFormat = {
    version: "1.0",
    $themes: [],
    $metadata: {
      tokenSetOrder: ["color", "spacing", "typography", "elevation"],
    },
    ...figmaTokens,
  };

  return {
    format: "figma",
    content: JSON.stringify(figmaFormat, null, 2),
    filename: "tokens.json",
    mimeType: "application/json",
  };
}

// Utilidades

function formatTokenValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  } else if (typeof value === "number") {
    return `${value}px`;
  } else if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatTokenValueScss(value: unknown): string {
  if (typeof value === "string") {
    // Si es un hex color, mantenerlo
    if (value.startsWith("#")) return value;
    // Si es un valor con unidad, mantenerlo
    if (value.match(/^\d+(px|rem|em|%)$/)) return value;
    // Si contiene espacios, agregar comillas
    if (value.includes(" ")) return `"${value}"`;
    return value;
  } else if (typeof value === "number") {
    return `${value}px`;
  } else if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function invertTokenColor(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("#")) {
    return null;
  }

  try {
    const r = parseInt(value.slice(1, 3), 16);
    const g = parseInt(value.slice(3, 5), 16);
    const b = parseInt(value.slice(5, 7), 16);

    const inverted = [255 - r, 255 - g, 255 - b]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");

    return `#${inverted}`;
  } catch {
    return null;
  }
}

/** Exportar todos los formatos */
export function exportAllFormats(designSystem: DesignSystem): TokenExportResult[] {
  const formats: TokenExportFormat[] = ["css", "json", "scss", "swift", "xml", "figma"];
  return formats.map((format) => exportTokens(designSystem, format));
}
