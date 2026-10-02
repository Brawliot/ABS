/**
 * Normalización determinista de campos problemáticos del BusinessProfile.
 *
 * Fase 1 Compositor: cobros=null, aPlazos=unknown, aCredito=unknown
 * no deben causar comportamiento silencioso o no determinista.
 *
 * Normalización = llenar gaps con reglas explícitas e infererencias auditables.
 */

import { isKnown, unknownField, known } from "../contracts/business-profile/field.js";
import type { BusinessProfile, CobrosModel } from "../contracts/business-profile/types.js";
import type { ProfileField } from "../contracts/business-profile/field.js";

export interface NormalizationTrace {
  readonly field: string;
  readonly source: "present" | "normalized_from_paymentMode" | "normalized_from_processes" | "normalized_default";
  readonly confidence: number;
  readonly reason: string;
}

/**
 * Normalizar cobros: si es null o unknown, inferir de paymentMode/procesos.
 *
 * Reglas:
 * - Si cobros.aPlazos ya es known → dejar como está
 * - Si paymentMode="financiado" → normalizar aPlazos=true
 * - Si paymentMode="diferido" → normalizar aPlazos=true
 * - Si procesos contienen financiera → aPlazos=unknown (no asumir)
 * - Si procesos contienen venta → aPlazos=false (inmediato por defecto)
 * - Si procesos contienen servicio → aPlazos=unknown (depende de capacityMode)
 * - Default fallback: aPlazos=unknown (sin asumir)
 */
export function normalizeAPlazos(
  profile: Partial<BusinessProfile>,
): { field: ProfileField<false | { readonly enabled: true; readonly viaFinanciera?: boolean }>;
  trace: NormalizationTrace } {
  const cobros = profile.cobros;
  const aPlazos = cobros?.aPlazos;

  // Si ya es known, retornar sin cambios
  if (aPlazos && isKnown(aPlazos)) {
    return {
      field: aPlazos,
      trace: {
        field: "cobros.aPlazos",
        source: "present",
        confidence: 1.0,
        reason: "aPlazos ya era known en profile",
      },
    };
  }

  // Inferir de paymentMode
  const paymentMode = profile.paymentMode;
  if (paymentMode && isKnown(paymentMode)) {
    if (paymentMode.value === "financiado" || paymentMode.value === "diferido") {
      return {
        field: known({ enabled: true }),
        trace: {
          field: "cobros.aPlazos",
          source: "normalized_from_paymentMode",
          confidence: 0.85,
          reason: `paymentMode='${paymentMode.value}' → aPlazos=true`,
        },
      };
    }
  }

  // Inferir de procesos
  const processes = profile.processes;
  if (processes && isKnown(processes)) {
    const archetypeIds = processes.value.map((p) => p.archetypeId);

    // Si hay proceso financiera, no asumir aPlazos
    if (archetypeIds.includes("financiera")) {
      return {
        field: unknownField(),
        trace: {
          field: "cobros.aPlazos",
          source: "normalized_default",
          confidence: 0.5,
          reason: "Procesos contienen 'financiera' → no asumir aPlazos",
        },
      };
    }

    // Si hay venta, asumir inmediato (no plazos)
    if (archetypeIds.includes("venta") && !archetypeIds.includes("servicio_proyecto")) {
      return {
        field: known(false),
        trace: {
          field: "cobros.aPlazos",
          source: "normalized_from_processes",
          confidence: 0.70,
          reason: "Procesos contienen 'venta' → aPlazos=false (inmediato)",
        },
      };
    }

    // Si hay servicio, dejar unknown (depende de capacityMode)
    if (archetypeIds.includes("servicio_proyecto")) {
      return {
        field: unknownField(),
        trace: {
          field: "cobros.aPlazos",
          source: "normalized_default",
          confidence: 0.5,
          reason: "Procesos contienen 'servicio' → aPlazos depende de capacityMode",
        },
      };
    }
  }

  // Default fallback: dejar unknown (sin asumir)
  return {
    field: unknownField(),
    trace: {
      field: "cobros.aPlazos",
      source: "normalized_default",
      confidence: 0.5,
      reason: "Sin evidencia clara; dejar unknown (sin asumir)",
    },
  };
}

/**
 * Normalizar aCredito: si es unknown, inferir de paymentMode/procesos.
 *
 * Reglas:
 * - Si aCredito ya es known → dejar como está
 * - Si paymentMode="credit" → normalizar aCredito=true
 * - Si procesos contienen financiera → aCredito=unknown (no asumir)
 * - Default fallback: aCredito=unknown (sin asumir)
 */
export function normalizeACredito(
  profile: Partial<BusinessProfile>,
): { field: ProfileField<false | { readonly kind: "cuenta_parte"; readonly limitePorDefectoEur?: number; readonly bloqueoImpagoDias?: number }>;
  trace: NormalizationTrace } {
  const cobros = profile.cobros;
  const aCredito = cobros?.aCredito;

  // Si ya es known, retornar sin cambios
  if (aCredito && isKnown(aCredito)) {
    return {
      field: aCredito,
      trace: {
        field: "cobros.aCredito",
        source: "present",
        confidence: 1.0,
        reason: "aCredito ya era known en profile",
      },
    };
  }

  // No hay much evidencia para aCredito, así que dejar unknown
  const processes = profile.processes;
  if (processes && isKnown(processes)) {
    const archetypeIds = processes.value.map((p) => p.archetypeId);
    if (archetypeIds.includes("financiera")) {
      return {
        field: unknownField(),
        trace: {
          field: "cobros.aCredito",
          source: "normalized_default",
          confidence: 0.5,
          reason: "Procesos contienen 'financiera' → no asumir aCredito",
        },
      };
    }
  }

  // Default fallback: dejar unknown
  return {
    field: unknownField(),
    trace: {
      field: "cobros.aCredito",
      source: "normalized_default",
      confidence: 0.5,
      reason: "Sin evidencia clara; dejar unknown (sin asumir)",
    },
  };
}

/**
 * Normalizar cobros: si es null/undefined, crear objeto con campos unknown.
 * Esto resuelve EC1 (cobros=null no dispara preguntas).
 */
export function normalizeCobrosModel(profile: Partial<BusinessProfile>): {
  cobros: CobrosModel;
  traces: readonly NormalizationTrace[];
} {
  if (profile.cobros) {
    // Ya existe, retornar como está
    return {
      cobros: profile.cobros,
      traces: [],
    };
  }

  // cobros=null → crear modelo normalizado
  const aPlazosNorm = normalizeAPlazos(profile);
  const aCreditoNorm = normalizeACredito(profile);

  const cobros: CobrosModel = {
    aPlazos: aPlazosNorm.field,
    aCredito: aCreditoNorm.field,
    fianzas: unknownField(),
    cuotasRecurrentes: unknownField(),
    pagosPorHitos: unknownField(),
  };

  return {
    cobros,
    traces: [aPlazosNorm.trace, aCreditoNorm.trace],
  };
}

/**
 * Normalizar BusinessProfile completo.
 * Retorna profile con cobros normalizado (nunca null).
 */
export function normalizeBusinessProfile(
  profile: Partial<BusinessProfile>,
): {
  normalized: Partial<BusinessProfile>;
  traces: readonly NormalizationTrace[];
} {
  const { cobros, traces } = normalizeCobrosModel(profile);

  return {
    normalized: {
      ...profile,
      cobros,
    },
    traces,
  };
}

/**
 * Auditoría: describir qué normalización se aplicó.
 * Útil para logs y debugging.
 */
export function describeNormalization(traces: readonly NormalizationTrace[]): string {
  if (traces.length === 0) {
    return "Sin normalización (profile ya estaba completo)";
  }

  const lines = traces.map(
    (t) => `  • ${t.field} (${t.source}, conf=${t.confidence.toFixed(2)}): ${t.reason}`,
  );
  return `Normalización aplicada:\n${lines.join("\n")}`;
}
