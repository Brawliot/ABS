/**
 * Layer 4: Inteligencia de diseño basada en contexto empresarial.
 * Analiza perfil comercial + entrada del generador → decisiones de diseño.
 * Determinista y tipificado. Extensible para integración LLM posterior.
 */

import type { IdentitySpec } from "../presentation/types.js";
import type { DesignDensity, TextTone } from "./schema.js";

export interface BusinessProfile {
  readonly companyId: string;
  readonly businessDescription: string;
  readonly segment?: string;
  readonly differentiation?: string;
  readonly targetAudience?: string;
}

export interface GeneratorInput {
  readonly identity: IdentitySpec;
  readonly channels?: readonly string[];
}

export interface PersonalityType {
  readonly id: "premium" | "technical" | "approachable" | "minimalist" | "energetic";
  readonly confidence: number; // 0..1
}

export interface DesignDirection {
  readonly typographyProfile: "serif" | "sans-serif" | "monospace" | "display";
  readonly colorPsychology: readonly string[];
  readonly density: DesignDensity;
  readonly tone: TextTone;
}

export interface DesignVariant {
  readonly id: "A" | "B" | "C";
  readonly label: string;
  readonly description: string;
  readonly personality: PersonalityType;
  readonly direction: DesignDirection;
}

export interface DesignIntelligenceResult {
  readonly businessSegment: string;
  readonly detectedIndustry: string;
  readonly primaryPersonality: PersonalityType;
  readonly variants: readonly [DesignVariant, DesignVariant, DesignVariant];
  readonly colorTheme: "warm" | "cool" | "neutral" | "vibrant";
  readonly suggestedDarkModeDefault: boolean;
  readonly accessibility: {
    readonly minContrastRatio: number;
    readonly touchTargetMinPx: number;
  };
}

/**
 * Detecta industria real por análisis de palabras clave + contexto.
 */
function detectIndustry(description: string): {
  industry: string;
  confidence: number;
  keywords: readonly string[];
} {
  const t = description
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  const patterns = {
    ferrreteria: {
      keywords: ["ferreter", "bricolaj", "herramient", "torniller", "obra", "material"],
      industry: "ferreteria",
    },
    clinica: {
      keywords: ["clinic", "salud", "medic", "dental", "estetic", "farmacia", "hospital"],
      industry: "clinica",
    },
    moda: {
      keywords: ["ropa", "moda", "streetwear", "juvenil", "boutique", "fashion", "prenda"],
      industry: "moda",
    },
    gastronomia: {
      keywords: ["restaurant", "pizzeria", "cafe", "comida", "chef", "gastronomia", "cocina"],
      industry: "gastronomia",
    },
    saas: {
      keywords: ["software", "app", "plataforma", "digital", "saas", "herramienta"],
      industry: "saas",
    },
    fintech: {
      keywords: ["banco", "fintech", "credito", "inversion", "pago", "wallet", "financier"],
      industry: "fintech",
    },
    ecommerce: {
      keywords: ["tienda", "ecommerce", "venta", "compra", "pedido", "envio"],
      industry: "ecommerce",
    },
    logistica: {
      keywords: ["logistica", "almacen", "distribucion", "transporte", "envio"],
      industry: "logistica",
    },
  };

  let bestMatch = { industry: "general", matches: 0, keywords: [] as string[] };

  for (const [_key, pattern] of Object.entries(patterns)) {
    const matches = pattern.keywords.filter((kw) => t.includes(kw)).length;
    if (matches > bestMatch.matches) {
      bestMatch = {
        industry: pattern.industry,
        matches,
        keywords: pattern.keywords,
      };
    }
  }

  const confidence =
    bestMatch.matches > 0
      ? Math.min(1, bestMatch.matches / 3)
      : 0;

  return {
    industry: bestMatch.industry,
    confidence,
    keywords: bestMatch.keywords,
  };
}

/**
 * Determina el tipo de personalidad de diseño.
 */
function inferPersonality(
  industry: string,
  confidence: number,
): PersonalityType {
  const personalities: Record<string, PersonalityType> = {
    clinica: { id: "premium", confidence: 0.9 },
    fintech: { id: "technical", confidence: 0.85 },
    moda: { id: "energetic", confidence: 0.9 },
    gastronomia: { id: "approachable", confidence: 0.8 },
    saas: { id: "minimalist", confidence: 0.75 },
    ferrreteria: { id: "technical", confidence: 0.7 },
    ecommerce: { id: "approachable", confidence: 0.75 },
    logistica: { id: "technical", confidence: 0.8 },
    general: { id: "minimalist", confidence: 0.5 },
  };

  return personalities[industry] ?? { id: "minimalist", confidence: 0.5 };
}

/**
 * Define la dirección de diseño para cada industria.
 */
function designDirectionByIndustry(
  industry: string,
): DesignDirection {
  const directions: Record<string, DesignDirection> = {
    clinica: {
      typographyProfile: "serif",
      colorPsychology: ["trust", "serenity", "safety"],
      density: "espaciosa",
      tone: "formal",
    },
    fintech: {
      typographyProfile: "sans-serif",
      colorPsychology: ["trust", "security", "professionalism"],
      density: "compacta",
      tone: "tecnico",
    },
    moda: {
      typographyProfile: "display",
      colorPsychology: ["energy", "creativity", "expression"],
      density: "normal",
      tone: "cercano",
    },
    gastronomia: {
      typographyProfile: "serif",
      colorPsychology: ["warmth", "appetite", "emotion"],
      density: "normal",
      tone: "cercano",
    },
    saas: {
      typographyProfile: "sans-serif",
      colorPsychology: ["clarity", "efficiency", "innovation"],
      density: "compacta",
      tone: "tecnico",
    },
    ferrreteria: {
      typographyProfile: "sans-serif",
      colorPsychology: ["robustness", "practicality", "durability"],
      density: "compacta",
      tone: "tecnico",
    },
    ecommerce: {
      typographyProfile: "sans-serif",
      colorPsychology: ["accessibility", "trust", "conversion"],
      density: "normal",
      tone: "cercano",
    },
    logistica: {
      typographyProfile: "monospace",
      colorPsychology: ["clarity", "efficiency", "systematics"],
      density: "compacta",
      tone: "tecnico",
    },
    general: {
      typographyProfile: "sans-serif",
      colorPsychology: ["clarity", "professionalism"],
      density: "normal",
      tone: "formal",
    },
  };

  return (
    directions[industry] ?? {
      typographyProfile: "sans-serif",
      colorPsychology: ["clarity"],
      density: "normal",
      tone: "formal",
    }
  );
}

/**
 * Genera 3 variantes de diseño automáticamente.
 * A: Premium, B: Data-forward, C: Balanced
 */
function generateVariants(
  industry: string,
  personality: PersonalityType,
): readonly [DesignVariant, DesignVariant, DesignVariant] {
  const baseDirection = designDirectionByIndustry(industry);

  const variantA: DesignVariant = {
    id: "A",
    label: "Premium",
    description: "Diseño exclusivo, generoso en espacios, tipografía serif",
    personality: { id: "premium", confidence: 0.95 },
    direction: {
      ...baseDirection,
      typographyProfile: "serif",
      density: "espaciosa",
    },
  };

  const variantB: DesignVariant = {
    id: "B",
    label: "Técnico",
    description: "Datos prioritarios, compacto, monospace/sans-serif",
    personality: { id: "technical", confidence: 0.9 },
    direction: {
      ...baseDirection,
      typographyProfile: baseDirection.typographyProfile === "serif" ? "sans-serif" : "monospace",
      density: "compacta",
    },
  };

  const variantC: DesignVariant = {
    id: "C",
    label: "Equilibrado",
    description: "Balance entre accesibilidad y modernidad",
    personality: { id: "approachable", confidence: 0.85 },
    direction: {
      ...baseDirection,
      density: "normal",
    },
  };

  return [variantA, variantB, variantC];
}

/**
 * Determina el tema de color basado en psicología de color.
 */
function inferColorTheme(
  industry: string,
  colorPsychology: readonly string[],
): "warm" | "cool" | "neutral" | "vibrant" {
  const theme: Record<string, "warm" | "cool" | "neutral" | "vibrant"> = {
    clinica: "cool",
    fintech: "cool",
    moda: "vibrant",
    gastronomia: "warm",
    saas: "neutral",
    ferrreteria: "warm",
    ecommerce: "vibrant",
    logistica: "neutral",
    general: "neutral",
  };

  return theme[industry] ?? "neutral";
}

/**
 * Analiza contexto empresarial y genera decisiones de diseño inteligentes.
 */
export function analyzeBusinessContextForDesign(
  businessProfile: BusinessProfile,
  _generatorInput?: GeneratorInput,
): DesignIntelligenceResult {
  const { industry, confidence: industryConfidence, keywords } =
    detectIndustry(businessProfile.businessDescription);

  const personality = inferPersonality(industry, industryConfidence);
  const variants = generateVariants(industry, personality);
  const baseDirection = designDirectionByIndustry(industry);
  const colorTheme = inferColorTheme(industry, baseDirection.colorPsychology);

  // Accesibilidad por industria
  const accessibilityLevels: Record<string, { minContrastRatio: number; touchTargetMinPx: number }> =
    {
      clinica: { minContrastRatio: 7, touchTargetMinPx: 48 }, // AAA + medical
      fintech: { minContrastRatio: 7, touchTargetMinPx: 48 }, // AAA + security
      moda: { minContrastRatio: 4.5, touchTargetMinPx: 44 }, // AA + mobile
      gastronomia: { minContrastRatio: 4.5, touchTargetMinPx: 44 }, // AA + visual
      saas: { minContrastRatio: 7, touchTargetMinPx: 48 }, // AAA + productivity
      ferrreteria: { minContrastRatio: 7, touchTargetMinPx: 56 }, // AAA + workshop
      ecommerce: { minContrastRatio: 4.5, touchTargetMinPx: 44 }, // AA + conversion
      logistica: { minContrastRatio: 7, touchTargetMinPx: 56 }, // AAA + warehouse
      general: { minContrastRatio: 4.5, touchTargetMinPx: 44 }, // AA default
    };

  const accessibility =
    accessibilityLevels[industry] ?? {
      minContrastRatio: 4.5,
      touchTargetMinPx: 44,
    };

  // Dark mode es default para industrias técnicas
  const suggestedDarkModeDefault =
    ["fintech", "saas", "logistica"].includes(industry);

  return {
    businessSegment: businessProfile.segment ?? industry,
    detectedIndustry: industry,
    primaryPersonality: personality,
    variants,
    colorTheme,
    suggestedDarkModeDefault,
    accessibility,
  };
}
