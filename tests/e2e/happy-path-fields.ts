/**
 * Datos de prueba para camino feliz E2E.
 * NO van en enrichFormForTransition (producción rechaza si faltan).
 */

import type { CompiledRuleSet } from "../../policies/types.js";
import type { Transition } from "../../core/lifecycle.js";

/**
 * Valores que satisfacen las reglas de la transición (camino feliz).
 * Más permisivos que "ausente" — solo para tests/UI demo.
 * Importante: no inventar deudas (importe bajo) ni el campo sintético `_fact`.
 */
export function happyPathFieldsForTransition(
  ruleSet: CompiledRuleSet,
  transition: Transition,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of ruleSet.rules) {
    if (!("transitionId" in rule) || rule.transitionId !== transition.id) {
      continue;
    }
    if (rule.kind === "legal_deadline") {
      const past = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      out[rule.anchorField] = past;
    }
    if (rule.kind === "condition") {
      const pred = rule.predicate;
      if (!pred || typeof pred.field !== "string") continue;
      if (pred.field === "_fact") continue; // hecho vía FactBag, no campo de formulario
      if (pred.op === "present") {
        if (pred.field === "dias_impago") out[pred.field] = "0";
        else if (pred.field === "recibos_pendientes") out[pred.field] = "0";
        else if (pred.field === "importe") out[pred.field] = "0";
        else out[pred.field] = "1";
      } else if (
        rule.isRestriction &&
        pred.op !== "absent" &&
        typeof pred.value === "number"
      ) {
        if (pred.op === "lte" || pred.op === "lt") {
          out[pred.field] = String(Number(pred.value) + 1);
        } else if (pred.op === "gte" || pred.op === "gt") {
          out[pred.field] = "0";
        } else {
          out[pred.field] = "0";
        }
      } else if (
        !rule.isRestriction &&
        pred.op === "eq" &&
        pred.value === true &&
        /^hito_.*cobrado$/.test(pred.field)
      ) {
        out[pred.field] = "true";
      }
    }
    if (
      rule.kind === "evidence_requirement" &&
      rule.when &&
      typeof rule.when.field === "string" &&
      rule.when.field === "importe"
    ) {
      // Por debajo del umbral de aprobación; 0 no genera deuda ni exige rol
      if (out.importe === undefined) out.importe = "0";
    }
  }
  return out;
}
