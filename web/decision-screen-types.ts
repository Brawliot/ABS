/**
 * Tipos para la DECISION SCREEN
 * Flujo: generateUiSpec() → WizardDraft → UserDecisions → applyUserDecisions() → AppBootResult
 */

import type { ModuleSpec } from "../presentation/types.js";
import type { ValidatedUiSpec } from "../presentation/validated.js";
import type { DesignSystem } from "../design/schema.js";
import type { GeneratorInput } from "../generator/types.js";

/**
 * DRAFT: Lo que genera el sistema automáticamente
 * Se muestra en DECISION SCREEN para que usuario apruebe/edite
 */
export interface WizardDraft {
  // Lo que ya existe
  spec: ValidatedUiSpec;
  designSystem: DesignSystem;
  input: GeneratorInput;

  // ANÁLISIS AUTOMÁTICO (para mostrar en DECISION SCREEN)
  modules: {
    detected: ModuleInfo[];        // Lo que el sistema encontró
    recommended: ModuleInfo[];     // Lo que sugiere LLM
    optional: ModuleInfo[];        // Lo que podría agregarse
  };

  // EXPLICACIONES
  explanations: {
    whyThisModules: string;        // Por qué detectó estos módulos
    designRationale: string;       // Por qué este diseño
    risks?: string[];              // Riesgos identificados
    gaps?: GapInfo[];              // Cosas que podrían faltar
  };

  // DESIGN PREVIEW
  design: {
    colors: ColorPalette;
    typography: TypographyPreset;
    theme: "light" | "dark";
  };

  // CONFIGURACIÓN PROPUESTA
  config: {
    language: string;
    timezone: string;
    currency: string;
    region: string;
  };
}

/**
 * DECISIONES DEL USUARIO: Lo que elige/edita en DECISION SCREEN
 */
export interface UserDecisions {
  // MÓDULOS
  modules: {
    approved: string[];            // mod.crm, mod.agenda, etc. (mantener)
    rejected: string[];            // Quitar estos
    added: string[];               // Nuevos módulos a agregar
  };

  // DISEÑO
  design?: {
    colorPreset?: string;          // "elegante", "moderno", "minimalista"
    colors?: Partial<ColorPalette>;
    typography?: TypographyPreset;
    theme?: "light" | "dark";
  };

  // CONFIGURACIÓN
  config?: {
    language?: string;
    timezone?: string;
    currency?: string;
    region?: string;
  };

  // BRANDING
  branding?: {
    brandName?: string;
    logoUrl?: string;
  };
}

/**
 * INFORMACIÓN DE CADA MÓDULO (para mostrar en UI)
 */
export interface ModuleInfo {
  id: string;                      // mod.crm
  labelKey: string;                // module.crm
  name: string;                    // "Gestión de Clientes"
  description: string;             // Explicación en lenguaje natural
  category: "CORE" | "RECOMMENDED" | "OPTIONAL";
  confidence?: number;             // 0.0 - 1.0 (de dónde vino)
  reason?: string;                 // "Detectado por rule.crm"
  importance: "critical" | "high" | "medium" | "low";
  icon?: string;                   // emoji o URL para visualizar
  relatedRoles?: string[];         // Qué roles lo usan
}

/**
 * GAPS DETECTADOS (cosas que falta)
 */
export interface GapInfo {
  id: string;
  issue: string;                   // "Falta expediente médico"
  reason: string;                  // "Clínica sin registros = riesgo legal"
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  impact: "legal" | "functional" | "ux" | "competitive";
  suggestedModule?: string;        // mod.expediente_medico
  blocking?: boolean;              // ¿Impide usar la app?
}

/**
 * DISEÑO: Colores
 */
export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  background: string;
  text: string;
}

/**
 * DISEÑO: Tipografía
 */
export interface TypographyPreset {
  fontFamily: string;              // "Inter", "Poppins", etc.
  fontSize: {
    xs: number;
    sm: number;
    base: number;
    lg: number;
    xl: number;
    "2xl": number;
  };
  fontWeight: {
    light: number;
    regular: number;
    semibold: number;
    bold: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

export type { ModuleSpec };