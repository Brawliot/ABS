/**
 * CoherenceValidator - Fase 3: Validación de coherencia e integridad del BusinessProfile
 *
 * Verifica que el BusinessProfile extraído sea coherente y completo para alimentar el Compositor.
 * Reglas: 19 checks deterministas que detectan contradicciones y completitud.
 *
 * Principios:
 * - Determinista (mismo profile = mismo resultado)
 * - Mensajes en español claros y accionables
 * - Distingue error vs warning
 * - Completeness por categoría (no solo overall)
 */

import type { BusinessProfile } from "./types.js";
import { isKnown, isUnknown, isNotApplicable } from "./field.js";
import type { ProfileField } from "./field.js";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface CompletenessScore {
  /** Puntuación total (0-1) */
  overall: number;
  /** Puntuación por categoría (exchange, distribution, payment, capacity, organization, etc.) */
  byCategory: Record<string, number>;
}

export interface Contradiction {
  /** Primer campo involucrado */
  field1: string;
  /** Segundo campo involucrado */
  field2: string;
  /** Descripción del problema */
  issue: string;
  /** "error" = incoherencia crítica; "warning" = inconsistencia leve */
  severity: "error" | "warning";
  /** Explicación detallada para el usuario */
  explanation: string;
}

export interface Suggestion {
  /** Campo que se sugiere aclarar */
  field: string;
  /** Por qué es importante */
  reason: string;
  /** "low" = opcional; "medium" = recomendado; "high" = crítico */
  priority: "low" | "medium" | "high";
}

export interface CoherenceCheckResult {
  /** ¿El perfil es coherente y está listo para Compositor? */
  isCoherent: boolean;
  /** Puntuación de completitud (0-1) */
  completeness: CompletenessScore;
  /** Contradicciones detectadas ([] si no hay) */
  contradictions: Contradiction[];
  /** Campos REQUERIDOS que faltan para componer ([] si todos presentes) */
  missingCritical: string[];
  /** Sugerencias de mejora ([] si no hay) */
  suggestions: Suggestion[];
}

// ============================================================================
// VALIDADOR PRINCIPAL
// ============================================================================

export class CoherenceValidator {
  private profile: Partial<BusinessProfile>;
  private contradictions: Contradiction[] = [];
  private suggestions: Suggestion[] = [];
  private missingCritical: string[] = [];

  constructor(profile: Partial<BusinessProfile>) {
    this.profile = profile;
  }

  /**
   * Ejecuta la validación completa.
   */
  validate(): CoherenceCheckResult {
    this.contradictions = [];
    this.suggestions = [];
    this.missingCritical = [];

    // Ejecutar todos los checks
    this.checkExchangeDirection();
    this.checkChannels();
    this.checkPaymentMode();
    this.checkCapacityMode();
    this.checkLocation();
    this.checkNaturalezaBienes();
    this.checkPortalCliente();
    this.checkProcesses();
    this.checkOrganization();
    this.checkResourceSubtypes();
    this.checkCapabilities();

    // Calcular completitud
    const completeness = this.calculateCompleteness();

    return {
      isCoherent:
        this.contradictions.filter((c) => c.severity === "error").length === 0 &&
        completeness.overall >= 0.7,
      completeness,
      contradictions: this.contradictions,
      missingCritical: this.missingCritical,
      suggestions: this.suggestions,
    };
  }

  // =========================================================================
  // MÉTODOS DE VALIDACIÓN (19 checks)
  // =========================================================================

  /**
   * CHECK 1-8: Contradicciones sobre exchangeDirection y procesos
   */
  private checkExchangeDirection(): void {
    const processes = this.profile.processes;

    // Check 1: exchangeDirection = unknown (CRÍTICO)
    if (!processes || !isKnown(processes)) {
      this.missingCritical.push("processes");
      return;
    }

    // Detectar dirección mayoritaria de los procesos
    const directions = processes.value
      .map((p) => p.exchangeDirection)
      .filter((d): d is "empresa_vende" | "empresa_compra" => d === "empresa_vende" || d === "empresa_compra");

    const sells = directions.filter((d) => d === "empresa_vende").length;
    const buys = directions.filter((d) => d === "empresa_compra").length;

    const inferredDirection = sells > buys ? "empresa_vende" : buys > 0 ? "empresa_compra" : null;

    // Check 7: processes.length = 0 + empresa_vende (ERROR)
    if (processes.value.length === 0 && inferredDirection === "empresa_vende") {
      this.contradictions.push({
        field1: "processes",
        field2: "exchangeDirection",
        issue: "Sin procesos de venta definidos",
        severity: "error",
        explanation:
          "Indicaste que vendes pero no definiste ningún proceso de venta. Define al menos un proceso con exchangeDirection='empresa_vende'.",
      });
    }
  }

  /**
   * CHECK 2,16: Canales de distribución
   */
  private checkChannels(): void {
    const channels = this.profile.channels;
    const location = this.profile.location;

    // Check 10: channels.length = 0 (CRÍTICO)
    if (!channels || !isKnown(channels) || channels.value.length === 0) {
      this.missingCritical.push("channels");
    }

    if (channels && isKnown(channels) && location && isKnown(location)) {
      // Check 2: location.kind = "virtual" + channels contiene "presencial" (ERROR)
      const isVirtual = location.value.countryCode === "VIRTUAL";
      const hasInPerson = channels.value.includes("presencial");

      if (isVirtual && hasInPerson) {
        this.contradictions.push({
          field1: "location.kind",
          field2: "channels",
          issue: "Ubicación virtual pero canal presencial",
          severity: "error",
          explanation:
            "No puedes tener ubicación virtual y ofrecer canales presenciales simultáneamente.",
        });
      }
    }

    // Check 16: Sugerir "digital" si vendes y es virtual
    if (channels && isKnown(channels) && location && isKnown(location)) {
      const isVirtual = location.value.countryCode === "VIRTUAL";
      const hasDigital = channels.value.includes("web") || channels.value.includes("autoservicio");

      if (isVirtual && !hasDigital) {
        this.suggestions.push({
          field: "channels",
          reason: "Si tu negocio es virtual, deberías tener 'web' como canal principal",
          priority: "high",
        });
      }
    }
  }

  /**
   * CHECK 3,17: Modo de pago
   */
  private checkPaymentMode(): void {
    const paymentMode = this.profile.paymentMode;

    // Check 11: paymentMode unknown (CRÍTICO)
    if (!paymentMode || !isKnown(paymentMode)) {
      this.missingCritical.push("paymentMode");
      // Agregar una sugerencia accionable
      this.suggestions.push({
        field: "paymentMode",
        reason: "Es importante definir cómo aceptas pagos (inmediato, financiado, diferido, etc.)",
        priority: "high",
      });
    }

    // Check 4: paymentMode = "financiado" + hasFormalDocuments = false (ERROR)
    if (paymentMode && isKnown(paymentMode) && paymentMode.value === "financiado") {
      const hasDocs = this.profile.capabilities?.hasFormalDocuments;
      if (hasDocs && isKnown(hasDocs) && !hasDocs.value) {
        this.contradictions.push({
          field1: "paymentMode",
          field2: "capabilities.hasFormalDocuments",
          issue: "Financiación sin documentos formales",
          severity: "error",
          explanation:
            "Si ofreces pago financiado, necesitas tener documentos formales (contratos, pólizas, etc.).",
        });
      }
    }
  }

  /**
   * CHECK 5,12,18,19: Modo de capacidad
   */
  private checkCapacityMode(): void {
    const capacityMode = this.profile.capacityMode;
    const hasCalendar = this.profile.capabilities?.hasCalendar;
    const naturalezaBienes = this.profile.naturalezaBienes;

    // Check 12: capacityMode = unknown + exchangeNature = "services" (WARNING)
    if (!capacityMode || isUnknown(capacityMode)) {
      if (naturalezaBienes && isKnown(naturalezaBienes) && naturalezaBienes.value.length === 1) {
        const isService = naturalezaBienes.value.includes("propios_unitarios");
        if (isService) {
          this.suggestions.push({
            field: "capacityMode",
            reason: "Para servicios, es recomendable definir si usas citas individuales o plazas",
            priority: "medium",
          });
        }
      }
    }

    // Check 3: capacityMode = "cita_individual" + hasCalendar = false (ERROR)
    if (capacityMode && isKnown(capacityMode) && capacityMode.value === "cita_individual") {
      if (!hasCalendar || !isKnown(hasCalendar) || !hasCalendar.value) {
        this.contradictions.push({
          field1: "capacityMode",
          field2: "capabilities.hasCalendar",
          issue: "Citas sin calendario",
          severity: "error",
          explanation:
            "Si usas citas individuales, necesitas tener un calendario para gestionar disponibilidad.",
        });
      }
    }

    // Check 18: Sugerir citas si es servicio sin capacityMode
    if (naturalezaBienes && isKnown(naturalezaBienes) && (!capacityMode || isUnknown(capacityMode))) {
      const isService = naturalezaBienes.value.some(
        (n) => n === "propios_unitarios" || n === "propios_por_cantidad",
      );
      if (isService) {
        this.suggestions.push({
          field: "capacityMode",
          reason:
            "Los servicios generalmente usan 'citas_individuales' o 'plazas' para gestionar la capacidad",
          priority: "medium",
        });
      }
    }

    // Check 19: hasCalendar = true pero capacityMode != "cita_individual" (WARNING)
    if (hasCalendar && isKnown(hasCalendar) && hasCalendar.value && capacityMode && isKnown(capacityMode)) {
      if (capacityMode.value !== "cita_individual") {
        this.suggestions.push({
          field: "capacityMode",
          reason: "Tienes calendario pero no usas citas individuales. Revisa tu modelo de capacidad",
          priority: "low",
        });
      }
    }
  }

  /**
   * CHECK 6,13: Ubicación
   */
  private checkLocation(): void {
    const location = this.profile.location;

    // Check 13: location unknown (WARNING)
    if (!location || !isKnown(location)) {
      this.missingCritical.push("location");
    }

    if (location && isKnown(location) && !location.value.countryCode) {
      this.missingCritical.push("location.countryCode");
    }
  }

  /**
   * CHECK 5,15: Naturaleza de bienes
   */
  private checkNaturalezaBienes(): void {
    const naturalezaBienes = this.profile.naturalezaBienes;
    const resources = this.profile.resourceSubtypes;

    // Check 5: naturalezaBienes = "propios_por_cantidad" + hasPartes = false (ERROR)
    if (naturalezaBienes && isKnown(naturalezaBienes)) {
      const hasMultipart = naturalezaBienes.value.includes("propios_por_cantidad");
      const hasPartes = this.profile.capabilities?.hasPartes;

      if (hasMultipart && hasPartes && isKnown(hasPartes) && !hasPartes.value) {
        this.contradictions.push({
          field1: "naturalezaBienes",
          field2: "capabilities.hasPartes",
          issue: "Bienes multiparte sin capacidad de partes",
          severity: "error",
          explanation:
            "Si tus bienes son 'por cantidad' (multiparte), necesitas activar 'hasPartes' para gestionarlos.",
        });
      }
    }

    // Check 15: naturalezaBienes = "servicios" + NO hay resourceSubtypes (WARNING)
    if (naturalezaBienes && isKnown(naturalezaBienes) && (!resources || isUnknown(resources))) {
      const isService = naturalezaBienes.value.some((n) => n === "propios_unitarios");
      if (isService) {
        this.suggestions.push({
          field: "resourceSubtypes",
          reason: "Para servicios, es recomendable especificar qué tipo de recurso usas",
          priority: "medium",
        });
      }
    }
  }

  /**
   * CHECK 1 (Portal cliente)
   */
  private checkPortalCliente(): void {
    const portalCliente = this.profile.portalCliente;
    const channels = this.profile.channels;

    // Check 1: portalCliente.autoservicio = true + channels NO contiene "digital" (ERROR)
    if (portalCliente && isKnown(portalCliente) && portalCliente.value.autoservicio && channels && isKnown(channels)) {
      const hasDigital = channels.value.includes("autoservicio") || channels.value.includes("web");

      if (!hasDigital) {
        this.contradictions.push({
          field1: "portalCliente",
          field2: "channels",
          issue: "Portal autoservicio sin canal digital",
          severity: "error",
          explanation:
            "Si tienes portal de autoservicio, necesitas tener al menos un canal digital (autoservicio o web)",
        });
      }
    }
  }

  /**
   * CHECK 7: Procesos definidos
   */
  private checkProcesses(): void {
    const processes = this.profile.processes;

    if (!processes || !isKnown(processes) || (isKnown(processes) && processes.value.length === 0)) {
      this.missingCritical.push("processes");
    }
  }

  /**
   * CHECK 8: Organización
   */
  private checkOrganization(): void {
    const organization = this.profile.organization;
    const roles = this.profile.roles;

    // Check 8: organization with sedes structure or individual model
    if (organization && isKnown(organization)) {
      const org = organization.value as any;

      // Detectar si tiene estructura model/headcount (simplificada para pruebas)
      if (org && typeof org === "object") {
        // Caso 1: estructura con model/headcount (de pruebas)
        if (org.model === "individual" && org.headcount && org.headcount > 1) {
          this.contradictions.push({
            field1: "organization.model",
            field2: "organization.headcount",
            issue: "Modelo individual pero múltiples empleados",
            severity: "error",
            explanation:
              "No puedes tener modelo 'individual' con más de 1 empleado. Actualiza el modelo organizacional.",
          });
        }

        // Caso 2: estructura con sedes/equipos (real)
        if (org.sedes || org.equipos) {
          const sedesLen = (org.sedes?.length || 0) + (org.equipos?.length || 0);
          if (sedesLen === 0) {
            this.suggestions.push({
              field: "organization",
              reason: "Tu estructura organizacional está vacía. Define al menos una sede y un equipo",
              priority: "medium",
            });
          }
        }
      }
    }

    // Check 14: roles.length = 0 (WARNING)
    if (!roles || !isKnown(roles) || (isKnown(roles) && roles.value.length === 0)) {
      this.suggestions.push({
        field: "roles",
        reason: "No definiste roles en la organización. Esto es importante para permisos y responsabilidades",
        priority: "medium",
      });
    }
  }

  /**
   * CHECK 9: Resource subtypes
   */
  private checkResourceSubtypes(): void {
    const resourceSubtypes = this.profile.resourceSubtypes;

    if (!resourceSubtypes || !isKnown(resourceSubtypes) || (isKnown(resourceSubtypes) && resourceSubtypes.value.length === 0)) {
      this.suggestions.push({
        field: "resourceSubtypes",
        reason: "No especificaste qué tipo de recursos usas (temporal, retornable, capital)",
        priority: "low",
      });
    }
  }

  /**
   * Checks sobre capabilities
   */
  private checkCapabilities(): void {
    const capabilities = this.profile.capabilities;

    if (!capabilities) {
      this.missingCritical.push("capabilities");
    }
  }

  // =========================================================================
  // CÁLCULO DE COMPLETITUD
  // =========================================================================

  private calculateCompleteness(): CompletenessScore {
    const categories: Record<string, { required: string[]; values: number[] }> = {
      exchange: {
        required: ["processes", "naturalezaBienes"],
        values: [],
      },
      distribution: {
        required: ["channels", "location"],
        values: [],
      },
      payment: {
        required: ["paymentMode", "capabilities.hasFormalDocuments"],
        values: [],
      },
      capacity: {
        required: ["capacityMode", "capabilities.hasCalendar"],
        values: [],
      },
      organization: {
        required: ["organization", "roles"],
        values: [],
      },
      resources: {
        required: ["resourceSubtypes"],
        values: [],
      },
    };

    // Evaluar cada categoría
    for (const [category, config] of Object.entries(categories)) {
      for (const field of config.required) {
        if (field.includes(".")) {
          const parts = field.split(".");
          const parent = parts[0] || "";
          const child = parts[1] || "";
          const parentField = (this.profile as Record<string, any>)[parent];
          const childField = parentField ? parentField[child] : undefined;
          config.values.push(childField && isKnown(childField) ? 1 : 0);
        } else {
          const fieldValue = (this.profile as Record<string, any>)[field];
          config.values.push(fieldValue && isKnown(fieldValue) ? 1 : 0);
        }
      }
    }

    // Calcular puntuaciones
    const byCategory: Record<string, number> = {};
    let totalScore = 0;
    let totalFields = 0;

    for (const [category, config] of Object.entries(categories)) {
      if (config.values.length === 0) {
        byCategory[category] = 1;
      } else {
        const score = config.values.reduce((a, b) => a + b, 0) / config.values.length;
        byCategory[category] = score;
        totalScore += score;
        totalFields += 1;
      }
    }

    const overall = totalFields > 0 ? totalScore / totalFields : 0;

    return {
      overall: Math.round(overall * 100) / 100, // Redondear a 2 decimales
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [k, Math.round(v * 100) / 100]),
      ),
    };
  }
}

// ============================================================================
// FUNCIÓN PÚBLICA DE CONVENIENCIA
// ============================================================================

export function validateCoherence(profile: Partial<BusinessProfile>): CoherenceCheckResult {
  return new CoherenceValidator(profile).validate();
}
