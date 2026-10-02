/**
 * ArchetypeAdvisor - Fase 4: Asesor de Arquetipos
 *
 * Toma un BusinessProfile validado y sugiere qué arquetipo de transacción es el más probable,
 * con confidence scores, reasoning detallado, y detección de ambigüedad.
 *
 * 6 arquetipos soportados:
 * - venta: Transacción de venta (tangible o intangible)
 * - servicio_proyecto: Proyectos con hitos y entregables
 * - suscripcion: Acceso recurrente a servicios/bienes
 * - uso_temporal: Alquiler/uso temporal de recursos
 * - intermediacion: Facilitador entre partes (marketplace, bróker)
 * - financiera: Préstamos, créditos, financiamiento
 *
 * Principios:
 * - Determinista (mismo profile = mismo advice)
 * - Mensajes en español claros
 * - Confidence máximo 0.95 (nunca 1.0)
 * - 20+ señales de recomendación
 * - Detección automática de ambigüedad
 */

import type { BusinessProfile } from "./types.js";
import type { ArchetypeId } from "../../archetypes/types.js";
import { isKnown } from "./field.js";
import type { CoherenceCheckResult } from "./coherence-validator.js";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface SignalMatch {
  /** Identificador de la señal (ej: "paymentMode=subscription") */
  signal: string;
  /** Peso de contribución a la confidence (0-1) */
  weight: number;
  /** Descripción clara de por qué esta señal indica este arquetipo */
  description: string;
}

export interface ArchetypeRecommendation {
  /** Identificador del arquetipo */
  archetype: ArchetypeId;
  /** Confidence: 0-1, nunca 1.0 */
  confidence: number;
  /** Array de razones por las que se recomienda este arquetipo */
  reasoning: string[];
  /** Señales que sustentan la recomendación */
  signals: SignalMatch[];
  /** Alertas si hay inconsistencias */
  warnings?: string[];
}

export interface ArchetypeAdvice {
  /** Arquetipo dominante (confidence >= 0.7) */
  dominant: ArchetypeRecommendation;
  /** Arquetipos secundarios ordenados por confidence */
  secondary: ArchetypeRecommendation[];
  /** Descripción de ambigüedad si la hay, null si es claro */
  ambiguity: string | null;
  /** Preguntas para desambiguar si hay ambigüedad (solo si ambiguity !== null) */
  suggestedQuestions?: string[] | undefined;
}

interface SignalDefinition {
  signal: string;
  weight: number;
  description: string;
  check: (profile: Partial<BusinessProfile>) => boolean;
}

// ============================================================================
// CONSTANTES: DEFINICIONES DE SEÑALES POR ARQUETIPO
// ============================================================================

/**
 * Señales para VENTA
 */
const VENTA_SIGNALS: SignalDefinition[] = [
  {
    signal: "processes_venta_explicit",
    weight: 0.95,
    description: "Procesos con archetypeId='venta' declarados explícitamente",
    check: (p) => {
      if (!p.processes || !isKnown(p.processes)) return false;
      return (p.processes.value ?? []).some((proc) => proc.archetypeId === "venta");
    },
  },
  {
    signal: "exchangeDirection_vende",
    weight: 0.90,
    description: "Dirección de intercambio: empresa vende",
    check: (p) => {
      if (!p.processes || !isKnown(p.processes)) return false;
      return (p.processes.value ?? []).some((proc) => proc.exchangeDirection === "empresa_vende");
    },
  },
  {
    signal: "paymentMode_inmediato",
    weight: 0.75,
    description: "Modo de pago inmediato (transacción única)",
    check: (p) => {
      if (!p.paymentMode || !isKnown(p.paymentMode)) return false;
      return p.paymentMode.value === "inmediato";
    },
  },
  {
    signal: "naturaleza_propios_cantidad",
    weight: 0.85,
    description: "Naturaleza de bienes: propios por cantidad",
    check: (p) => {
      if (!p.naturalezaBienes || !isKnown(p.naturalezaBienes)) return false;
      return (p.naturalezaBienes.value ?? []).includes("propios_por_cantidad");
    },
  },
  {
    signal: "channel_web_autoservicio",
    weight: 0.70,
    description: "Canales: web o autoservicio",
    check: (p) => {
      if (!p.channels || !isKnown(p.channels)) return false;
      return (p.channels.value ?? []).some((ch) =>
        ["web", "autoservicio"].includes(ch)
      );
    },
  },
  {
    signal: "capacity_no_temporal",
    weight: 0.65,
    description: "Capacidad: no temporal",
    check: (p) => {
      if (!p.capacityMode || !isKnown(p.capacityMode)) return true; // Sin límite = venta
      return p.capacityMode.value !== "cita_individual";
    },
  },
  {
    signal: "no_calendar_required",
    weight: 0.60,
    description: "No requiere calendario",
    check: (p) => {
      if (!p.capabilities?.hasCalendar) return false;
      if (!isKnown(p.capabilities.hasCalendar)) return false;
      return p.capabilities.hasCalendar.value === false;
    },
  },
  {
    signal: "resource_no_temporal",
    weight: 0.70,
    description: "Recursos no temporales",
    check: (p) => {
      if (!p.resourceSubtypes || !isKnown(p.resourceSubtypes)) return true; // Sin recursos = venta
      return !(p.resourceSubtypes.value ?? []).includes("capacidad_temporal");
    },
  },
  {
    signal: "channel_presencial",
    weight: 0.50,
    description: "Canal presencial",
    check: (p) => {
      if (!p.channels || !isKnown(p.channels)) return false;
      return (p.channels.value ?? []).includes("presencial");
    },
  },
];

/**
 * Señales para SERVICIO_PROYECTO
 */
const SERVICIO_PROYECTO_SIGNALS: SignalDefinition[] = [
  {
    signal: "processes_servicio_proyecto_explicit",
    weight: 0.95,
    description: "Procesos con archetypeId='servicio_proyecto' declarados",
    check: (p) => {
      if (!p.processes || !isKnown(p.processes)) return false;
      return (p.processes.value ?? []).some((proc) => proc.archetypeId === "servicio_proyecto");
    },
  },
  {
    signal: "cobros_pagosPorHitos",
    weight: 0.90,
    description: "Modelo de cobro: pagos por hitos",
    check: (p) => {
      if (!p.cobros?.pagosPorHitos || !isKnown(p.cobros.pagosPorHitos)) return false;
      return p.cobros.pagosPorHitos.value !== false;
    },
  },
  {
    signal: "paymentMode_diferido",
    weight: 0.85,
    description: "Modo de pago diferido",
    check: (p) => {
      if (!p.paymentMode || !isKnown(p.paymentMode)) return false;
      return ["diferido", "financiado"].includes(p.paymentMode.value);
    },
  },
  {
    signal: "resource_capacidad_temporal",
    weight: 0.80,
    description: "Recursos temporales",
    check: (p) => {
      if (!p.resourceSubtypes || !isKnown(p.resourceSubtypes)) return false;
      return (p.resourceSubtypes.value ?? []).includes("capacidad_temporal");
    },
  },
  {
    signal: "hasCalendar_true",
    weight: 0.75,
    description: "Requiere calendario",
    check: (p) => {
      if (!p.capabilities?.hasCalendar || !isKnown(p.capabilities.hasCalendar)) return false;
      return p.capabilities.hasCalendar.value === true;
    },
  },
  {
    signal: "capacityMode_plazas",
    weight: 0.70,
    description: "Capacidad limitada a plazas",
    check: (p) => {
      if (!p.capacityMode || !isKnown(p.capacityMode)) return false;
      return p.capacityMode.value === "plazas";
    },
  },
  {
    signal: "hasFormalDocuments_true",
    weight: 0.65,
    description: "Requiere documentos formales",
    check: (p) => {
      if (!p.capabilities?.hasFormalDocuments || !isKnown(p.capabilities.hasFormalDocuments)) return false;
      return p.capabilities.hasFormalDocuments.value === true;
    },
  },
  {
    signal: "channel_presencial_backoffice",
    weight: 0.60,
    description: "Canales: presencial y backoffice",
    check: (p) => {
      if (!p.channels || !isKnown(p.channels)) return false;
      return (p.channels.value ?? []).some(
        (ch) => ch === "presencial" || ch === "backoffice"
      );
    },
  },
  {
    signal: "cobros_aPlazos",
    weight: 0.65,
    description: "Modelo de cobro: a plazos",
    check: (p) => {
      if (!p.cobros?.aPlazos || !isKnown(p.cobros.aPlazos)) return false;
      return p.cobros.aPlazos.value !== false;
    },
  },
];

/**
 * Señales para SUSCRIPCION
 */
const SUSCRIPCION_SIGNALS: SignalDefinition[] = [
  {
    signal: "processes_suscripcion_explicit",
    weight: 0.95,
    description: "Procesos con archetypeId='suscripcion'",
    check: (p) => {
      if (!p.processes || !isKnown(p.processes)) return false;
      return (p.processes.value ?? []).some((proc) => proc.archetypeId === "suscripcion");
    },
  },
  {
    signal: "cobros_cuotasRecurrentes",
    weight: 0.90,
    description: "Modelo de cobro: cuotas recurrentes",
    check: (p) => {
      if (!p.cobros?.cuotasRecurrentes || !isKnown(p.cobros.cuotasRecurrentes)) return false;
      return p.cobros.cuotasRecurrentes.value !== false;
    },
  },
  {
    signal: "portalCliente_autoservicio",
    weight: 0.85,
    description: "Portal cliente con autoservicio",
    check: (p) => {
      if (!p.portalCliente || !isKnown(p.portalCliente)) return false;
      return p.portalCliente.value?.autoservicio === true;
    },
  },
  {
    signal: "hasCalendar_true",
    weight: 0.80,
    description: "Requiere calendario",
    check: (p) => {
      if (!p.capabilities?.hasCalendar || !isKnown(p.capabilities.hasCalendar)) return false;
      return p.capabilities.hasCalendar.value === true;
    },
  },
  {
    signal: "resource_capacidad_temporal",
    weight: 0.75,
    description: "Recursos temporales",
    check: (p) => {
      if (!p.resourceSubtypes || !isKnown(p.resourceSubtypes)) return false;
      return (p.resourceSubtypes.value ?? []).includes("capacidad_temporal");
    },
  },
  {
    signal: "channel_web",
    weight: 0.65,
    description: "Canal web",
    check: (p) => {
      if (!p.channels || !isKnown(p.channels)) return false;
      return (p.channels.value ?? []).includes("web");
    },
  },
  {
    signal: "hasMovimientos_true",
    weight: 0.55,
    description: "Requiere movimientos",
    check: (p) => {
      if (!p.capabilities?.hasMovimientos || !isKnown(p.capabilities.hasMovimientos)) return false;
      return p.capabilities.hasMovimientos.value === true;
    },
  },
];

/**
 * Señales para USO_TEMPORAL
 */
const USO_TEMPORAL_SIGNALS: SignalDefinition[] = [
  {
    signal: "processes_uso_temporal_explicit",
    weight: 0.95,
    description: "Procesos con archetypeId='uso_temporal'",
    check: (p) => {
      if (!p.processes || !isKnown(p.processes)) return false;
      return (p.processes.value ?? []).some((proc) => proc.archetypeId === "uso_temporal");
    },
  },
  {
    signal: "resource_retornable",
    weight: 0.90,
    description: "Recursos retornables",
    check: (p) => {
      if (!p.resourceSubtypes || !isKnown(p.resourceSubtypes)) return false;
      return (p.resourceSubtypes.value ?? []).includes("retornable");
    },
  },
  {
    signal: "resource_capacidad_temporal",
    weight: 0.85,
    description: "Recursos temporales",
    check: (p) => {
      if (!p.resourceSubtypes || !isKnown(p.resourceSubtypes)) return false;
      return (p.resourceSubtypes.value ?? []).includes("capacidad_temporal");
    },
  },
  {
    signal: "hasCalendar_true",
    weight: 0.80,
    description: "Requiere calendario",
    check: (p) => {
      if (!p.capabilities?.hasCalendar || !isKnown(p.capabilities.hasCalendar)) return false;
      return p.capabilities.hasCalendar.value === true;
    },
  },
  {
    signal: "cobros_fianzas",
    weight: 0.75,
    description: "Modelo de cobro: fianzas",
    check: (p) => {
      if (!p.cobros?.fianzas || !isKnown(p.cobros.fianzas)) return false;
      return p.cobros.fianzas.value !== false;
    },
  },
  {
    signal: "channel_presencial",
    weight: 0.55,
    description: "Canal presencial",
    check: (p) => {
      if (!p.channels || !isKnown(p.channels)) return false;
      return (p.channels.value ?? []).includes("presencial");
    },
  },
];

/**
 * Señales para INTERMEDIACION
 */
const INTERMEDIACION_SIGNALS: SignalDefinition[] = [
  {
    signal: "processes_intermediacion_explicit",
    weight: 0.95,
    description: "Procesos con archetypeId='intermediacion'",
    check: (p) => {
      if (!p.processes || !isKnown(p.processes)) return false;
      return (p.processes.value ?? []).some((proc) => proc.archetypeId === "intermediacion");
    },
  },
  {
    signal: "hasPartes_true",
    weight: 0.85,
    description: "Requiere partes múltiples",
    check: (p) => {
      if (!p.capabilities?.hasPartes || !isKnown(p.capabilities.hasPartes)) return false;
      return p.capabilities.hasPartes.value === true;
    },
  },
  {
    signal: "channel_web_autoservicio",
    weight: 0.80,
    description: "Canales: web + autoservicio",
    check: (p) => {
      if (!p.channels || !isKnown(p.channels)) return false;
      return (p.channels.value ?? []).some((ch) =>
        ["web", "autoservicio"].includes(ch)
      );
    },
  },
  {
    signal: "portalCliente_autoservicio",
    weight: 0.75,
    description: "Portal cliente autoservicio",
    check: (p) => {
      if (!p.portalCliente || !isKnown(p.portalCliente)) return false;
      return p.portalCliente.value?.autoservicio === true;
    },
  },
  {
    signal: "hasMovimientos_true",
    weight: 0.70,
    description: "Requiere movimientos",
    check: (p) => {
      if (!p.capabilities?.hasMovimientos || !isKnown(p.capabilities.hasMovimientos)) return false;
      return p.capabilities.hasMovimientos.value === true;
    },
  },
  {
    signal: "paymentMode_mixto",
    weight: 0.60,
    description: "Modo de pago mixto",
    check: (p) => {
      if (!p.paymentMode || !isKnown(p.paymentMode)) return false;
      return p.paymentMode.value === "mixto";
    },
  },
  {
    signal: "exchangeDirection_ambas",
    weight: 0.65,
    description: "Dirección: ambas (compra y venta)",
    check: (p) => {
      if (!p.processes || !isKnown(p.processes)) return false;
      const procs = p.processes.value ?? [];
      const hasVenta = procs.some((proc) => proc.exchangeDirection === "empresa_vende");
      const hasCompra = procs.some((proc) => proc.exchangeDirection === "empresa_compra");
      return hasVenta && hasCompra;
    },
  },
];

/**
 * Señales para FINANCIERA
 */
const FINANCIERA_SIGNALS: SignalDefinition[] = [
  {
    signal: "processes_financiera_explicit",
    weight: 0.95,
    description: "Procesos con archetypeId='financiera'",
    check: (p) => {
      if (!p.processes || !isKnown(p.processes)) return false;
      return (p.processes.value ?? []).some((proc) => proc.archetypeId === "financiera");
    },
  },
  {
    signal: "cobros_aCredito",
    weight: 0.90,
    description: "Modelo de cobro: a crédito",
    check: (p) => {
      if (!p.cobros?.aCredito || !isKnown(p.cobros.aCredito)) return false;
      return p.cobros.aCredito.value !== false;
    },
  },
  {
    signal: "cobros_aPlazos",
    weight: 0.85,
    description: "Modelo de cobro: a plazos",
    check: (p) => {
      if (!p.cobros?.aPlazos || !isKnown(p.cobros.aPlazos)) return false;
      return p.cobros.aPlazos.value !== false;
    },
  },
  {
    signal: "paymentMode_financiado",
    weight: 0.85,
    description: "Modo de pago financiado",
    check: (p) => {
      if (!p.paymentMode || !isKnown(p.paymentMode)) return false;
      return p.paymentMode.value === "financiado";
    },
  },
  {
    signal: "hasFormalDocuments_true",
    weight: 0.80,
    description: "Requiere documentos formales",
    check: (p) => {
      if (!p.capabilities?.hasFormalDocuments || !isKnown(p.capabilities.hasFormalDocuments)) return false;
      return p.capabilities.hasFormalDocuments.value === true;
    },
  },
  {
    signal: "cobros_fianzas",
    weight: 0.75,
    description: "Modelo de cobro: fianzas/garantías",
    check: (p) => {
      if (!p.cobros?.fianzas || !isKnown(p.cobros.fianzas)) return false;
      return p.cobros.fianzas.value !== false;
    },
  },
  {
    signal: "hasFiscalCompliance_true",
    weight: 0.70,
    description: "Requiere compliance fiscal",
    check: (p) => {
      if (!p.capabilities?.hasFiscalCompliance || !isKnown(p.capabilities.hasFiscalCompliance)) return false;
      return p.capabilities.hasFiscalCompliance.value === true;
    },
  },
];

// Mapa de arquetipos a sus señales
const SIGNALS_BY_ARCHETYPE: Record<ArchetypeId, SignalDefinition[]> = {
  venta: VENTA_SIGNALS,
  servicio_proyecto: SERVICIO_PROYECTO_SIGNALS,
  suscripcion: SUSCRIPCION_SIGNALS,
  uso_temporal: USO_TEMPORAL_SIGNALS,
  intermediacion: INTERMEDIACION_SIGNALS,
  financiera: FINANCIERA_SIGNALS,
};

// ============================================================================
// CLASE PRINCIPAL: ArchetypeAdvisor
// ============================================================================

export class ArchetypeAdvisor {
  /**
   * Genera una recomendación de arquetipo basada en el BusinessProfile.
   */
  advise(
    profile: Partial<BusinessProfile>,
    coherence?: CoherenceCheckResult
  ): ArchetypeAdvice {
    // Evaluar cada arquetipo
    const scores = new Map<ArchetypeId, ArchetypeRecommendation>();

    const archetypeIds: ArchetypeId[] = [
      "venta",
      "servicio_proyecto",
      "suscripcion",
      "uso_temporal",
      "intermediacion",
      "financiera",
    ];

    for (const archetypeId of archetypeIds) {
      const signals = SIGNALS_BY_ARCHETYPE[archetypeId] ?? [];
      const matches = this.findSignalMatches(profile, signals);
      const confidence = this.scoreMatches(matches);
      const reasoning = matches.map((m) => m.description);

      scores.set(archetypeId, {
        archetype: archetypeId,
        confidence,
        reasoning,
        signals: matches,
        warnings: this.generateWarnings(profile, archetypeId, matches),
      });
    }

    return this.buildAdvice(scores);
  }

  /**
   * Encuentra todas las señales que coinciden en el perfil para un arquetipo.
   */
  private findSignalMatches(
    profile: Partial<BusinessProfile>,
    signals: SignalDefinition[]
  ): SignalMatch[] {
    return signals
      .filter((sig) => sig.check(profile))
      .map((sig) => ({
        signal: sig.signal,
        weight: sig.weight,
        description: sig.description,
      }));
  }

  /**
   * Calcula confidence ponderada de los matches.
   */
  private scoreMatches(matches: SignalMatch[]): number {
    if (matches.length === 0) return 0.1;

    const totalWeight = matches.reduce((sum, m) => sum + m.weight, 0);
    const avgWeight = totalWeight / matches.length;
    const countBonus = Math.min(matches.length - 1, 3) * 0.05;

    return Math.min(0.95, avgWeight * 0.9 + countBonus);
  }

  /**
   * Genera warnings si hay inconsistencias.
   */
  private generateWarnings(
    profile: Partial<BusinessProfile>,
    archetypeId: ArchetypeId,
    matches: SignalMatch[]
  ): string[] {
    const warnings: string[] = [];

    if (matches.length <= 2) {
      warnings.push(
        `Pocos indicadores de '${archetypeId}': solo ${matches.length} señal(es) detectada(s)`
      );
    }

    if (archetypeId === "venta") {
      if (
        profile.cobros?.pagosPorHitos &&
        isKnown(profile.cobros.pagosPorHitos) &&
        profile.cobros.pagosPorHitos.value !== false
      ) {
        warnings.push("Venta pero con pagos por hitos (patrón de proyecto)");
      }
      if (
        profile.capabilities?.hasCalendar &&
        isKnown(profile.capabilities.hasCalendar) &&
        profile.capabilities.hasCalendar.value === true
      ) {
        warnings.push("Venta pero requiere calendario (ambiguo)");
      }
    }

    return warnings;
  }

  /**
   * Construye el objeto ArchetypeAdvice.
   */
  private buildAdvice(
    scores: Map<ArchetypeId, ArchetypeRecommendation>
  ): ArchetypeAdvice {
    const sorted = Array.from(scores.values()).sort(
      (a, b) => b.confidence - a.confidence
    );

    // Siempre hay al menos uno (tenemos 6 arquetipos)
    const dominant = sorted[0]!;
    const secondary = sorted.slice(1);

    const ambiguity = this.detectAmbiguity(sorted);

    const advice: ArchetypeAdvice = {
      dominant,
      secondary,
      ambiguity,
    };

    if (ambiguity && secondary.length > 0) {
      advice.suggestedQuestions = this.suggestClarifyingQuestions(
        dominant,
        secondary[0]!
      );
    }

    return advice;
  }

  /**
   * Detecta si hay ambigüedad entre arquetipos.
   */
  private detectAmbiguity(sorted: ArchetypeRecommendation[]): string | null {
    if (sorted.length < 2) return null;

    const first = sorted[0];
    const second = sorted[1];
    if (!first || !second) return null;

    const confidenceDiff = first.confidence - second.confidence;

    if (confidenceDiff < 0.15) {
      return `Ambiguo entre '${first.archetype}' (${(first.confidence * 100).toFixed(0)}%) y '${second.archetype}' (${(second.confidence * 100).toFixed(0)}%)`;
    }

    return null;
  }

  /**
   * Genera preguntas para desambiguar.
   */
  private suggestClarifyingQuestions(
    dominant: ArchetypeRecommendation,
    secondary: ArchetypeRecommendation
  ): string[] {
    const questions: string[] = [];

    if (
      (dominant.archetype === "venta" &&
        secondary.archetype === "servicio_proyecto") ||
      (dominant.archetype === "servicio_proyecto" &&
        secondary.archetype === "venta")
    ) {
      questions.push(
        "¿Entregas un bien/producto completo, o es un proyecto con fases y hitos?"
      );
      questions.push(
        "¿Es pago único al cierre, o hay pagos intermedios por cada hito?"
      );
      questions.push(
        "¿Necesitas un cronograma detallado, o la entrega es flexible?"
      );
    } else if (
      (dominant.archetype === "suscripcion" &&
        secondary.archetype === "uso_temporal") ||
      (dominant.archetype === "uso_temporal" &&
        secondary.archetype === "suscripcion")
    ) {
      questions.push(
        "¿El cliente accede periódicamente, o alquila un bien físico que devuelve?"
      );
      questions.push(
        "¿Se renueva automáticamente, o es una transacción de alquiler?"
      );
      questions.push(
        "¿Hay bienes que deben retornar, o solo acceso digital?"
      );
    } else if (
      (dominant.archetype === "intermediacion" &&
        secondary.archetype === "venta") ||
      (dominant.archetype === "venta" && secondary.archetype === "intermediacion")
    ) {
      questions.push(
        "¿Eres propietario de lo que vendes, o conectas comprador y vendedor?"
      );
      questions.push("¿Cobras en comisiones sobre transacciones de terceros?");
    } else {
      questions.push(
        `¿Es '${dominant.archetype}' tu modelo de negocio principal?`
      );
      questions.push(
        `¿Qué característica diferencia '${dominant.archetype}' de '${secondary.archetype}'?`
      );
    }

    return questions.slice(0, 3);
  }
}

// ============================================================================
// FUNCIÓN PÚBLICA
// ============================================================================

/**
 * Función de conveniencia para obtener consejo de arquetipo.
 */
export function adviseArchetype(
  profile: Partial<BusinessProfile>,
  coherence?: CoherenceCheckResult
): ArchetypeAdvice {
  const advisor = new ArchetypeAdvisor();
  return advisor.advise(profile, coherence);
}
