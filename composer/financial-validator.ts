/**
 * Validador de coherencia financiera.
 *
 * Verifica que si se añade secundaria 'financiera', hay al menos una señal
 * válida (aPlazos, aCredito, paymentMode, etc).
 *
 * Resuelve EC3: "Financiera prohibida Y activada" → error claro.
 */

import { isKnown } from "../contracts/business-profile/field.js";
import type { BusinessProfile } from "../contracts/business-profile/types.js";
import type { ComposerSuccess } from "./types.js";

export class FinancialCoherenceError extends Error {
  readonly code = "FINANCIAL_INCOHERENCE" as const;
  readonly details: readonly string[];

  constructor(message: string, details: readonly string[]) {
    super(message);
    this.name = "FinancialCoherenceError";
    this.details = details;
  }
}

/**
 * Validar que si se añadió financiera, hay al menos una señal válida.
 *
 * Señales válidas:
 * - aPlazos=true
 * - aCredito=true o aCredito=cuenta_parte
 * - paymentMode=financiado|diferido
 * - pagosPorHitos (hitos)
 * - Proceso explícito de financiera
 */
export function validateFinancialCoherence(
  result: ComposerSuccess,
  profile: Partial<BusinessProfile>,
): void {
  const hasFinanciera = (result.composition?.secondaries ?? []).some(
    (s) => s.secondaryArchetypeId === "financiera",
  );

  if (!hasFinanciera) {
    // No hay financiera, sin validaciones
    return;
  }

  // ¿Hay al menos una señal válida?
  const signals: { readonly name: string; readonly present: boolean }[] = [];

  // Señal 1: aPlazos=enabled (PlazosDecl con enabled=true)
  const cobros = profile.cobros;
  if (cobros?.aPlazos && isKnown(cobros.aPlazos)) {
    const v = cobros.aPlazos.value;
    const isTruthy = typeof v === "object" && v !== null && (v as any).enabled === true;
    signals.push({ name: "aPlazos=enabled", present: isTruthy });
  }

  // Señal 2: aCredito=true o cuenta_parte
  if (cobros?.aCredito && isKnown(cobros.aCredito)) {
    const v = cobros.aCredito.value;
    const isCuentaParte = typeof v === "object" && v !== null && (v as any).kind === "cuenta_parte";
    signals.push({ name: "aCredito={cuenta_parte}", present: isCuentaParte });
  }

  // Señal 3: paymentMode=financiado|diferido
  if (profile.paymentMode && isKnown(profile.paymentMode)) {
    const pm = profile.paymentMode.value;
    const isValid = pm === "financiado" || pm === "diferido";
    signals.push({ name: "paymentMode={financiado|diferido}", present: isValid });
  }

  // Señal 4: pagosPorHitos
  if (cobros?.pagosPorHitos && isKnown(cobros.pagosPorHitos)) {
    const v = cobros.pagosPorHitos.value;
    const hasHitos = typeof v === "object" && v !== null && "hitos" in v && Array.isArray(v.hitos);
    signals.push({ name: "pagosPorHitos", present: hasHitos });
  }

  // Señal 5: Proceso explícito financiera
  if (profile.processes && isKnown(profile.processes)) {
    const hasFinanceProcess = profile.processes.value.some((p) => p.archetypeId === "financiera");
    signals.push({ name: "Proceso financiera", present: hasFinanceProcess });
  }

  // ¿Hay al menos una señal?
  const hasValidSignal = signals.some((s) => s.present);

  if (!hasValidSignal) {
    const signalsList = signals.map((s) => `  • ${s.name}`).join("\n");
    throw new FinancialCoherenceError(
      "Secundaria 'financiera' fue añadida pero NO hay señal válida de financiamiento",
      [
        "Señales esperadas:",
        signalsList,
        "",
        "Esto indica un bug en las reglas del compositor.",
        "Verifica que se aplicó al menos una de estas reglas:",
        "  • R_APLAZOS_FINANCIERA",
        "  • R_ACREDITO_BOOL_FINANCIERA",
        "  • R_PAYMENT_FINANCIADO",
        "  • R_PROCESS_FINANCIERA",
        "  • R_HITOS (como compromisos pagar)",
      ],
    );
  }
}

/**
 * Validar que no hay conflictos de forbid + add.
 *
 * Por ejemplo:
 * - R_CUENTA_PARTE forbids financiera
 * - Pero R_APLAZOS_FINANCIERA tries to add financiera
 *
 * Con precedencia, R_CUENTA_PARTE gana y forbid se aplica.
 * Esta función verifica que el resultado es coherente.
 */
export function validateNoForbidConflicts(
  result: ComposerSuccess,
  profile: Partial<BusinessProfile>,
): void {
  const hasFinanciera = (result.composition?.secondaries ?? []).some(
    (s) => s.secondaryArchetypeId === "financiera",
  );

  const cobros = profile.cobros;

  // Si aCredito=cuenta_parte, NO debe haber financiera
  if (cobros?.aCredito && isKnown(cobros.aCredito)) {
    const v = cobros.aCredito.value;
    const isCuentaParte = typeof v === "object" && v !== null && v.kind === "cuenta_parte";

    if (isCuentaParte && hasFinanciera) {
      throw new FinancialCoherenceError(
        "Conflicto: aCredito=cuenta_parte forbids financiera, pero financiera fue añadida",
        [
          "R_CUENTA_PARTE debe tener precedencia sobre R_APLAZOS_FINANCIERA, etc.",
          "Verifica que RULE_PRECEDENCE asigna prioridad > 85 a R_CUENTA_PARTE.",
        ],
      );
    }
  }
}

/**
 * Validar coherencia general de financiera.
 * Llamar después de que se aplicaron todas las reglas.
 */
export function validateFinancieraCombined(
  result: ComposerSuccess,
  profile: Partial<BusinessProfile>,
): void {
  // Primero: forbid conflicts
  validateNoForbidConflicts(result, profile);

  // Luego: coherencia de señales
  validateFinancialCoherence(result, profile);
}
