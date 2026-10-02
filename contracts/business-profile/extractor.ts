/**
 * BusinessProfileExtractor - Fase 2: Conversión de narrativa libre → BusinessProfile estructurado
 *
 * Principios:
 * - 100% determinista (mismo input = mismo output)
 * - Solo heurísticas (sin IA/LLM)
 * - Auditable y trazo claro
 * - Confidence realista (0.5-0.95, nunca 1.0)
 */

import { createHash } from "crypto";
import type { BusinessProfile, ProcessDecl } from "./types.js";
import type { ArchetypeId } from "../../archetypes/types.js";
import {
  ARCHETYPE_IDS,
  CHANNEL_IDS,
  PAYMENT_MODES,
  CAPACITY_RECURSO_SUBTYPES,
  NATURALEZA_BIENES,
  CAPACITY_MODES,
} from "./types.js";
import type { ProfileField } from "./field.ts";
import {
  EXTRACTOR_KEYWORDS,
  extractKeywords,
  extractNumbers,
  extractUrls,
} from "./extractor-keywords.js";
import { validateCoherence } from "./coherence-validator.js";
import type { CoherenceCheckResult } from "./coherence-validator.js";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface ExtractionInput {
  narrativeDescription: string;
  metadata?: {
    locale?: "es" | "en";
    confidence?: "high" | "medium" | "low";
  };
}

export type FieldExtractionStatus =
  | { status: "confident"; confidence: number; source: string }
  | { status: "inferred"; confidence: number; reasoning: string }
  | { status: "ambiguous"; candidates: Array<{ value: string; confidence: number }> }
  | { status: "unknown" };

export interface ExtractionMetadata {
  timestamp: Date;
  fieldCoverage: Map<string, FieldExtractionStatus>;
  confidence: number; // 0-1, promedio ponderado
  sourceText: string;
  inputHash: string;
}

export interface ExtractionWarning {
  field: string;
  issue: "ambiguous" | "missing" | "inference" | "contradiction";
  message: string;
  severity: "info" | "warning" | "error";
}

export interface ExtractionResult {
  businessProfile: Partial<BusinessProfile>;
  extraction: ExtractionMetadata;
  warnings: ExtractionWarning[];
  coherenceCheck?: CoherenceCheckResult; // Fase 3: Validación de coherencia
}

// ============================================================================
// CLASE PRINCIPAL
// ============================================================================

export class BusinessProfileExtractor {
  private input: ExtractionInput;
  private normalized: string;
  private keywords: Map<string, number>;
  private numbers: number[];
  private urls: string[];
  private fieldCoverage: Map<string, FieldExtractionStatus>;
  private warnings: ExtractionWarning[];
  private confidences: number[];

  constructor(input: ExtractionInput) {
    this.input = input;
    this.normalized = input.narrativeDescription.toLowerCase().trim();
    this.keywords = new Map();
    this.numbers = [];
    this.urls = [];
    this.fieldCoverage = new Map();
    this.warnings = [];
    this.confidences = [];
    this.tokenize();
  }

  private tokenize(): void {
    this.keywords = extractKeywords(this.normalized);
    this.numbers = extractNumbers(this.normalized);
    this.urls = extractUrls(this.normalized);
  }

  /**
   * Ejecuta la extracción completa.
   */
  async extract(): Promise<ExtractionResult> {
    const profileData: Record<string, any> = {
      schemaVersion: "1.2.0",
      identity: {
        companyId: `auto_${this.generateCompanyId()}`,
      },
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "venta", // default, será actualizado
      },
    };

    // Extraer campos
    this.extractProcesses();
    this.extractChannels();
    this.extractExchangeDirection();
    this.extractNaturalezaBienes();
    this.extractPaymentMode();
    this.extractLocation();
    this.extractCapacityMode();
    this.extractResourceSubtypes();
    this.extractCapabilities();
    this.extractOrganization();
    this.extractPortalCliente();

    // Mapear al perfil
    profileData.processes = this.getProfileField("processes");
    profileData.channels = this.getProfileField("channels");
    profileData.paymentMode = this.getProfileField("paymentMode");
    profileData.naturalezaBienes = this.getProfileField("naturalezaBienes");
    profileData.location = this.getProfileField("location");
    profileData.capacityMode = this.getProfileField("capacityMode");
    profileData.resourceSubtypes = this.getProfileField("resourceSubtypes");
    profileData.capabilities = {
      hasPartes: this.getProfileField("hasPartes"),
      hasMovimientos: this.getProfileField("hasMovimientos"),
      hasFormalDocuments: this.getProfileField("hasFormalDocuments"),
      hasFiscalCompliance: this.getProfileField("hasFiscalCompliance"),
      hasCalendar: this.getProfileField("hasCalendar"),
    };
    profileData.organization = this.getProfileField("organization");
    profileData.portalCliente = this.getProfileField("portalCliente");

    // Actualizar archetype dominante
    if (this.fieldCoverage.has("dominantArchetype")) {
      const arch = this.fieldCoverage.get("dominantArchetype");
      if (arch?.status === "confident") {
        profileData.policyMeta.dominantArchetypeId = arch.source as ArchetypeId;
      }
    }

    const profile = profileData as Partial<BusinessProfile>;

    // Calcular confidence promedio
    const avgConfidence =
      this.confidences.length > 0
        ? this.confidences.reduce((a, b) => a + b, 0) / this.confidences.length
        : 0.5;

    // Fase 3: Validar coherencia del perfil
    const coherenceCheck = validateCoherence(profile);

    return {
      businessProfile: profile,
      extraction: {
        timestamp: new Date(),
        fieldCoverage: this.fieldCoverage,
        confidence: Math.round(avgConfidence * 100) / 100,
        sourceText: this.input.narrativeDescription,
        inputHash: this.getExtractionHash(),
      },
      warnings: this.warnings,
      coherenceCheck,
    };
  }

  // ========================================================================
  // MÉTODOS DE EXTRACCIÓN POR CAMPO
  // ========================================================================

  private extractProcesses(): void {
    const processes: ProcessDecl[] = [];

    // Detectar arquetipos
    const archetypeScores: Record<ArchetypeId, number> = {
      venta: 0,
      servicio_proyecto: 0,
      suscripcion: 0,
      uso_temporal: 0,
      intermediacion: 0,
      financiera: 0,
    };

    // Scoring basado en keywords
    if (this.hasKeyword("venta")) {
      archetypeScores.venta += 0.95;
    }
    if (this.hasKeyword("servicio_proyecto")) {
      archetypeScores.servicio_proyecto += 0.95;
    }
    if (this.hasKeyword("suscripcion")) {
      archetypeScores.suscripcion += 0.95;
    }
    if (this.hasKeyword("uso_temporal")) {
      archetypeScores.uso_temporal += 0.85;
    }
    if (this.hasKeyword("intermediacion")) {
      archetypeScores.intermediacion += 0.90;
    }

    // Heurísticas adicionales
    if (this.hasKeyword("propios_por_cantidad")) {
      archetypeScores.venta += 0.30;
    }
    if (this.hasKeyword("cita_individual") || this.hasKeyword("capacidad_temporal")) {
      archetypeScores.uso_temporal += 0.40;
    }

    // Determinar archetype dominante
    let dominantArchetype: ArchetypeId = "venta";
    let maxScore = archetypeScores.venta;

    for (const [archetype, score] of Object.entries(archetypeScores)) {
      if (score > maxScore) {
        maxScore = score;
        dominantArchetype = archetype as ArchetypeId;
      }
    }

    // Crear proceso
    const processId = `process_${dominantArchetype}`;
    processes.push({
      id: processId,
      archetypeId: dominantArchetype,
      label: `Proceso de ${dominantArchetype.replace(/_/g, " ")}`,
      exchangeDirection: this.extractExchangeDirectionForProcess(),
    });

    const confidence = Math.max(...Object.values(archetypeScores)) / 1.0;
    this.fieldCoverage.set("processes", {
      status: "confident",
      confidence: Math.min(confidence, 0.95),
      source: `Detected archetype: ${dominantArchetype}`,
    });
    this.fieldCoverage.set("dominantArchetype", {
      status: "confident",
      confidence: Math.min(confidence, 0.95),
      source: dominantArchetype,
    });
    this.confidences.push(Math.min(confidence, 0.95));
  }

  private extractExchangeDirectionForProcess(): "empresa_vende" | "empresa_compra" {
    if (this.hasKeyword("empresa_compra")) {
      return "empresa_compra";
    }
    // Default: assume vende
    return "empresa_vende";
  }

  private extractChannels(): void {
    const channels: Array<(typeof CHANNEL_IDS)[number]> = [];
    const detected: Record<string, number> = {};

    // Presencial
    if (this.hasKeyword("presencial")) {
      channels.push("presencial");
      detected.presencial = 0.95;
    }

    // Web
    if (this.hasKeyword("web")) {
      channels.push("web");
      detected.web = 0.95;
    }

    // Autoservicio
    if (this.hasKeyword("autoservicio")) {
      channels.push("autoservicio");
      detected.autoservicio = 0.90;
    }

    // Taller
    if (this.hasKeyword("taller")) {
      channels.push("taller");
      detected.taller = 0.90;
    }

    // Heurísticas: si menciona delivery → presencial + web
    if (
      this.normalized.includes("delivery") ||
      this.normalized.includes("domicilio") ||
      this.normalized.includes("envío")
    ) {
      if (!channels.includes("presencial")) {
        channels.push("presencial");
        detected.presencial = 0.75;
      }
      if (!channels.includes("web")) {
        channels.push("web");
        detected.web = 0.75;
      }
    }

    if (channels.length === 0) {
      this.fieldCoverage.set("channels", { status: "unknown" });
      this.warnings.push({
        field: "channels",
        issue: "missing",
        message: "No se detectaron canales de distribución en el texto",
        severity: "warning",
      });
    } else {
      const confidence = Object.values(detected).reduce((a, b) => a + b, 0) / channels.length;
      this.fieldCoverage.set("channels", {
        status: "confident",
        confidence: Math.min(confidence, 0.95),
        source: `Detected: ${channels.join(", ")}`,
      });
      this.confidences.push(Math.min(confidence, 0.95));
    }
  }

  private extractExchangeDirection(): void {
    let direction: "empresa_vende" | "empresa_compra" | null = null;
    let confidence = 0;

    if (this.hasKeyword("empresa_vende")) {
      direction = "empresa_vende";
      confidence = 0.95;
    } else if (this.hasKeyword("empresa_compra")) {
      direction = "empresa_compra";
      confidence = 0.90;
    } else {
      // Heurística: por defecto "vende"
      direction = "empresa_vende";
      confidence = 0.50;
    }

    this.fieldCoverage.set("exchangeDirection", {
      status: "confident",
      confidence,
      source: direction,
    });
    this.confidences.push(confidence);
  }

  private extractNaturalezaBienes(): void {
    const detected: Record<string, number> = {};

    if (this.hasKeyword("propios_por_cantidad")) {
      detected.propios_por_cantidad = 0.95;
    }
    if (this.hasKeyword("propios_unitarios")) {
      detected.propios_unitarios = 0.95;
    }
    if (this.hasKeyword("bienes_del_cliente")) {
      detected.del_cliente = 0.90;
    }

    // Heurísticas
    if (this.normalized.includes("servicio") && Object.keys(detected).length === 0) {
      detected.propios_unitarios = 0.70;
    }
    if (this.normalized.includes("producto") && Object.keys(detected).length === 0) {
      detected.propios_por_cantidad = 0.80;
    }

    if (Object.keys(detected).length === 0) {
      this.fieldCoverage.set("naturalezaBienes", { status: "unknown" });
    } else {
      const naturaleza = Object.keys(detected).filter(
        (k) => k in NATURALEZA_BIENES,
      ) as Array<(typeof NATURALEZA_BIENES)[number]>;
      const confidence = Object.values(detected)[0] || 0.5;
      this.fieldCoverage.set("naturalezaBienes", {
        status: "confident",
        confidence: Math.min(confidence, 0.95),
        source: JSON.stringify(naturaleza),
      });
      this.confidences.push(Math.min(confidence, 0.95));
    }
  }

  private extractPaymentMode(): void {
    const detected: Record<string, number> = {};

    if (this.hasKeyword("inmediato")) {
      detected.inmediato = 0.95;
    }
    if (this.hasKeyword("financiado")) {
      detected.financiado = 0.95;
    }
    if (this.hasKeyword("diferido")) {
      detected.diferido = 0.90;
    }

    // Heurísticas de pago
    if (this.normalized.includes("cash") || this.normalized.includes("efectivo")) {
      detected.inmediato = Math.max(detected.inmediato || 0, 0.80);
    }
    if (this.normalized.includes("tarjeta")) {
      detected.inmediato = Math.max(detected.inmediato || 0, 0.85);
    }
    if (this.normalized.includes("cuota")) {
      detected.financiado = Math.max(detected.financiado || 0, 0.85);
    }

    if (Object.keys(detected).length === 0) {
      this.fieldCoverage.set("paymentMode", { status: "unknown" });
    } else {
      const sortedEntries = Object.entries(detected).sort(([, a], [, b]) => b - a);
      const topEntry = sortedEntries[0];
      if (topEntry) {
        const mode = topEntry[0];
        if (mode in PAYMENT_MODES) {
          const confidence = detected[mode] || 0;
          this.fieldCoverage.set("paymentMode", {
            status: "confident",
            confidence: Math.min(confidence, 0.95),
            source: mode,
          });
          this.confidences.push(Math.min(confidence, 0.95));
        }
      }
    }
  }

  private extractLocation(): void {
    // Detectar si es fijo o virtual
    const hasFixed =
      this.normalized.includes("local") ||
      this.normalized.includes("oficina") ||
      this.normalized.includes("tienda");
    const hasVirtual = this.normalized.includes("online") || this.normalized.includes("web");

    const kind = hasFixed ? "fixed" : hasVirtual ? "virtual" : "unknown";

    // Detectar país
    const countries: Record<string, string> = {
      argentina: "AR",
      españa: "ES",
      chile: "CL",
      méxico: "MX",
      colombia: "CO",
      uruguay: "UY",
      perú: "PE",
      bolivia: "BO",
    };

    let countryCode = "AR"; // Default Argentina
    for (const [country, code] of Object.entries(countries)) {
      if (this.normalized.includes(country)) {
        countryCode = code;
        break;
      }
    }

    if (kind !== "unknown") {
      this.fieldCoverage.set("location", {
        status: "confident",
        confidence: 0.85,
        source: `kind: ${kind}, country: ${countryCode}`,
      });
      this.confidences.push(0.85);
    } else {
      this.fieldCoverage.set("location", { status: "unknown" });
    }
  }

  private extractCapacityMode(): void {
    let mode: (typeof CAPACITY_MODES)[number] | null = null;
    let confidence = 0;

    if (this.hasKeyword("cita_individual")) {
      mode = "cita_individual";
      confidence = 0.95;
    } else if (this.hasKeyword("plazas")) {
      mode = "plazas";
      confidence = 0.90;
    } else if (
      this.normalized.includes("médico") ||
      this.normalized.includes("peluquería") ||
      this.normalized.includes("dentista")
    ) {
      mode = "cita_individual";
      confidence = 0.80;
    } else if (
      this.normalized.includes("restaurante") ||
      this.normalized.includes("cine") ||
      this.normalized.includes("clase")
    ) {
      mode = "plazas";
      confidence = 0.80;
    }

    if (mode) {
      this.fieldCoverage.set("capacityMode", {
        status: "confident",
        confidence: Math.min(confidence, 0.95),
        source: mode,
      });
      this.confidences.push(Math.min(confidence, 0.95));
    } else {
      this.fieldCoverage.set("capacityMode", { status: "unknown" });
    }
  }

  private extractResourceSubtypes(): void {
    const subtypes: Array<(typeof CAPACITY_RECURSO_SUBTYPES)[number]> = [];

    if (this.hasKeyword("capacidad_temporal")) {
      subtypes.push("capacidad_temporal");
    }
    if (this.hasKeyword("retornable")) {
      subtypes.push("retornable");
    }
    if (this.hasKeyword("capital")) {
      subtypes.push("capital");
    }

    // Heurísticas
    if (this.normalized.includes("cita")) {
      subtypes.push("capacidad_temporal");
    }
    if (this.normalized.includes("alquiler") || this.normalized.includes("renta")) {
      subtypes.push("retornable");
    }
    if (this.normalized.includes("máquina") || this.normalized.includes("fábrica")) {
      subtypes.push("capital");
    }

    const unique = [...new Set(subtypes)];
    if (unique.length > 0) {
      this.fieldCoverage.set("resourceSubtypes", {
        status: "confident",
        confidence: 0.80,
        source: unique.join(", "),
      });
      this.confidences.push(0.80);
    }
  }

  private extractCapabilities(): void {
    // hasCalendar
    const hasCalendar =
      this.normalized.includes("cita") ||
      this.normalized.includes("reserva") ||
      this.normalized.includes("agenda");
    this.fieldCoverage.set("hasCalendar", {
      status: "confident",
      confidence: hasCalendar ? 0.85 : 0.60,
      source: hasCalendar ? "Detected calendar keywords" : "No calendar indicators",
    });

    // hasPartes (inventory)
    const hasPartes = this.normalized.includes("producto") || this.normalized.includes("inventario");
    this.fieldCoverage.set("hasPartes", {
      status: "confident",
      confidence: hasPartes ? 0.85 : 0.60,
      source: hasPartes ? "Detected inventory keywords" : "No inventory indicators",
    });

    // hasFormalDocuments
    const hasDocuments =
      this.normalized.includes("factura") ||
      this.normalized.includes("contrato") ||
      this.normalized.includes("comprobante");
    this.fieldCoverage.set("hasFormalDocuments", {
      status: "confident",
      confidence: hasDocuments ? 0.80 : 0.55,
      source: hasDocuments ? "Detected document keywords" : "No document indicators",
    });

    // hasFiscalCompliance
    const hasFiscal =
      this.normalized.includes("impuesto") ||
      this.normalized.includes("fiscal") ||
      this.normalized.includes("iva");
    this.fieldCoverage.set("hasFiscalCompliance", {
      status: "confident",
      confidence: hasFiscal ? 0.80 : 0.50,
      source: hasFiscal ? "Detected fiscal keywords" : "No fiscal indicators",
    });

    // hasMovimientos (financial movements)
    const hasMovimientos =
      this.normalized.includes("pago") ||
      this.normalized.includes("cobro") ||
      this.normalized.includes("gasto");
    this.fieldCoverage.set("hasMovimientos", {
      status: "confident",
      confidence: hasMovimientos ? 0.80 : 0.60,
      source: hasMovimientos ? "Detected payment keywords" : "No payment indicators",
    });
  }

  private extractOrganization(): void {
    let model: string = "small_team";
    let headcount: number | null = null;
    let confidence = 0.65;

    // Detectar tamaño por números
    for (const num of this.numbers) {
      if (num >= 1 && num <= 10) {
        headcount = num;
        model = "small_team";
        confidence = 0.90;
        break;
      }
    }

    // Heurísticas de modelo
    if (this.normalized.includes("solo") || this.normalized.includes("autónomo")) {
      model = "solo_founder";
      confidence = 0.95;
    } else if (
      this.normalized.includes("asociado") ||
      this.normalized.includes("asociación")
    ) {
      model = "associated";
      confidence = 0.90;
    } else if (this.normalized.includes("franquicia")) {
      model = "franchise";
      confidence = 0.95;
    }

    if (headcount || model) {
      this.fieldCoverage.set("organization", {
        status: "confident",
        confidence: Math.min(confidence, 0.95),
        source: `model: ${model}, headcount: ${headcount || "unknown"}`,
      });
      this.confidences.push(Math.min(confidence, 0.95));
    }
  }

  private extractPortalCliente(): void {
    const hasPortal =
      this.normalized.includes("autoservicio") ||
      this.normalized.includes("portal") ||
      this.normalized.includes("plataforma cliente");

    if (hasPortal) {
      this.fieldCoverage.set("portalCliente", {
        status: "confident",
        confidence: 0.85,
        source: "Detected self-service portal keywords",
      });
    } else {
      this.warnings.push({
        field: "portalCliente",
        issue: "ambiguous",
        message: "No se detectó si ofreces portal de autoservicio. Aclarar si los clientes pueden gestionar por sí mismos.",
        severity: "info",
      });
    }
  }

  // ========================================================================
  // UTILIDADES
  // ========================================================================

  private hasKeyword(keyword: string): boolean {
    return (
      this.keywords.has(`${keyword}:exact`) || this.keywords.has(`${keyword}:partial`)
    );
  }

  private getProfileField<T>(fieldName: string): ProfileField<T> {
    const coverage = this.fieldCoverage.get(fieldName);

    if (coverage?.status === "unknown") {
      return { status: "unknown" } as ProfileField<T>;
    }

    if (coverage?.status === "confident") {
      return {
        status: "known",
        value: coverage.source as unknown as T,
        confidence: coverage.confidence,
      } as ProfileField<T>;
    }

    return { status: "unknown" } as ProfileField<T>;
  }

  private generateCompanyId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Genera un hash SHA256 del input para auditoría de determinismo.
   */
  public getExtractionHash(): string {
    return createHash("sha256").update(this.input.narrativeDescription).digest("hex");
  }
}

/**
 * Función wrapper para uso async/await compatible.
 */
export async function extractBusinessProfile(
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const extractor = new BusinessProfileExtractor(input);
  return extractor.extract();
}
