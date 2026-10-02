/**
 * DSL Extendido para Reglas (Fase 2 Compositor)
 * Soporta: AND, OR, NOT, CONFIDENCE_MIN, FIELD_EQUALS
 * Evaluación pura y determinista.
 */

import type { BusinessProfile } from "../contracts/business-profile/types.js";
import { isKnown, isUnknown } from "../contracts/business-profile/field.js";

/**
 * Contexto de evaluación: perfil de negocio con metadatos.
 */
export interface ComposerContext {
  readonly profile: BusinessProfile;
  readonly metadata?: {
    readonly evaluatedAt?: Date;
    readonly [key: string]: any;
  };
}

/**
 * Condición evaluable: AND, OR, NOT, comparaciones.
 */
export interface RuleCondition {
  readonly type: "AND" | "OR" | "NOT" | "CONFIDENCE_MIN" | "FIELD_EQUALS";
  readonly operands?: readonly RuleCondition[];
  readonly field?: string;
  readonly value?: any;
  readonly minConfidence?: number; // 0-1
}

/**
 * Constructor fluido para condiciones.
 */
export class RuleBuilder {
  static AND(...conditions: RuleCondition[]): RuleCondition {
    if (conditions.length === 0) {
      throw new Error("AND requiere al menos una condición");
    }
    return { type: "AND", operands: conditions };
  }

  static OR(...conditions: RuleCondition[]): RuleCondition {
    if (conditions.length === 0) {
      throw new Error("OR requiere al menos una condición");
    }
    return { type: "OR", operands: conditions };
  }

  static NOT(condition: RuleCondition): RuleCondition {
    return { type: "NOT", operands: [condition] };
  }

  static confidenceMin(field: string, minConfidence: number): RuleCondition {
    if (minConfidence < 0 || minConfidence > 1) {
      throw new Error(`minConfidence debe estar entre 0 y 1, recibido: ${minConfidence}`);
    }
    return { type: "CONFIDENCE_MIN", field, minConfidence };
  }

  static fieldEquals(field: string, value: any): RuleCondition {
    return { type: "FIELD_EQUALS", field, value };
  }

  static fieldKnown(field: string): RuleCondition {
    return { type: "FIELD_EQUALS", field, value: "__KNOWN__" };
  }

  static fieldUnknown(field: string): RuleCondition {
    return { type: "FIELD_EQUALS", field, value: "__UNKNOWN__" };
  }
}

/**
 * Extrae el valor de un campo del perfil usando path notation.
 * Ej: "cobros.aPlazos" → profile.cobros?.aPlazos
 */
function getFieldValueRecursive(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Obtiene confidence de un campo (defecto 0.5).
 */
function getFieldConfidence(field: any): number {
  if (!field || typeof field !== "object") return 0.5;
  if ("confidence" in field) return field.confidence;
  if ("status" in field) {
    if (field.status === "known") return 0.9;
    if (field.status === "unknown") return 0.1;
    if (field.status === "not_applicable") return 0.7;
  }
  return 0.5;
}

/**
 * Evalúa una condición contra un contexto.
 * Retorna boolean determinista.
 */
export function evaluateCondition(
  condition: RuleCondition,
  context: ComposerContext,
): boolean {
  switch (condition.type) {
    case "AND": {
      if (!condition.operands || condition.operands.length === 0) return false;
      return condition.operands.every((op) => {
        if (!op) return false;
        return evaluateCondition(op, context);
      });
    }

    case "OR": {
      if (!condition.operands || condition.operands.length === 0) return false;
      return condition.operands.some((op) => {
        if (!op) return false;
        return evaluateCondition(op, context);
      });
    }

    case "NOT": {
      if (!condition.operands || condition.operands.length === 0) return false;
      const first = condition.operands[0];
      if (!first) return false;
      return !evaluateCondition(first, context);
    }

    case "CONFIDENCE_MIN": {
      if (!condition.field) return false;
      const field = getFieldValueRecursive(context.profile, condition.field);
      const confidence = getFieldConfidence(field);
      return confidence >= (condition.minConfidence || 0.5);
    }

    case "FIELD_EQUALS": {
      if (!condition.field) return false;
      const field = getFieldValueRecursive(context.profile, condition.field);

      // Manejo especial de valores mágicos
      if (condition.value === "__KNOWN__") {
        return isKnown(field);
      }
      if (condition.value === "__UNKNOWN__") {
        return isUnknown(field);
      }

      // Comparación normal
      if (field === null || field === undefined) {
        return condition.value === null || condition.value === undefined;
      }

      // Si es un Field con value, comparar value
      if (typeof field === "object" && "value" in field) {
        return field.value === condition.value;
      }

      return field === condition.value;
    }

    default: {
      const _exhaustive: never = condition.type;
      return _exhaustive;
    }
  }
}

/**
 * Serializa una condición a JSON (para audit trail).
 */
export function serializeCondition(condition: RuleCondition): string {
  return JSON.stringify(condition);
}

/**
 * Reconstruye una condición desde JSON.
 */
export function deserializeCondition(json: string): RuleCondition {
  const parsed = JSON.parse(json);
  // Validar estructura básica
  if (!parsed.type) {
    throw new Error("Condición deserializada carece de 'type'");
  }
  return parsed as RuleCondition;
}

/**
 * Descripción humanamente legible de una condición.
 */
export function describeCondition(condition: RuleCondition): string {
  switch (condition.type) {
    case "AND": {
      const parts = (condition.operands || [])
        .filter((op): op is RuleCondition => op !== undefined && op !== null)
        .map((op) => describeCondition(op));
      return `(${parts.join(" Y ")})`;
    }

    case "OR": {
      const parts = (condition.operands || [])
        .filter((op): op is RuleCondition => op !== undefined && op !== null)
        .map((op) => describeCondition(op));
      return `(${parts.join(" O ")})`;
    }

    case "NOT": {
      if (condition.operands && condition.operands.length > 0) {
        const first = condition.operands[0];
        if (first) {
          return `NO ${describeCondition(first)}`;
        }
      }
      return "NO (vacío)";
    }

    case "CONFIDENCE_MIN": {
      const threshold = condition.minConfidence || 0.5;
      return `${condition.field} confidence >= ${threshold}`;
    }

    case "FIELD_EQUALS": {
      return `${condition.field} == ${JSON.stringify(condition.value)}`;
    }

    default: {
      const _exhaustive: never = condition.type;
      return _exhaustive;
    }
  }
}

/**
 * Calcula profundidad máxima de una condición (para optimización).
 */
export function getConditionDepth(condition: RuleCondition): number {
  if (!condition.operands || condition.operands.length === 0) {
    return 1;
  }
  const childDepths = condition.operands.map((op) => getConditionDepth(op));
  return 1 + Math.max(...childDepths, 0);
}

/**
 * Cuenta cantidad de operandos (para análisis de complejidad).
 */
export function countOperands(condition: RuleCondition): number {
  let count = 1;
  if (condition.operands) {
    for (const op of condition.operands) {
      count += countOperands(op);
    }
  }
  return count;
}
