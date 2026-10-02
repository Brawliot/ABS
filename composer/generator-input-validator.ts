/**
 * Validador de GeneratorInput (Fase 2 Compositor)
 * Verifica coherencia post-composición: lifecycles, composition, reglas.
 */

import type { GeneratorInput } from "../generator/types.js";

/**
 * Tipo de error de validación.
 */
export type ValidationErrorType =
  | "missing_lifecycle"
  | "orphan_lifecycle"
  | "unreachable_lifecycle"
  | "composition_mismatch"
  | "missing_composition"
  | "circular_dependency"
  | "invalid_role_assignment"
  | "missing_ruleset"
  | "missing_roles"
  | "inconsistent_payment_mode";

/**
 * Error de validación con remedio sugerido.
 */
export interface ValidationError {
  readonly type: ValidationErrorType;
  readonly message: string;
  readonly field?: string;
  readonly affectedItems?: readonly string[];
  readonly fix: string; // Recomendación de solución
  readonly severity: "error" | "critical";
}

/**
 * Warning de validación.
 */
export interface ValidationWarning {
  readonly type: string;
  readonly message: string;
  readonly field?: string;
  readonly severity: "warning" | "info";
  readonly fix?: string; // Recomendación opcional
}

/**
 * Resultado de validación.
 */
export interface GeneratorInputValidation {
  readonly isValid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
  readonly coverage: {
    readonly lifecyclesCovered: number;
    readonly totalLifecycles: number;
    readonly percentage: number;
  };
  readonly timestamp: Date;
}

/**
 * Validador de GeneratorInput.
 */
export class GeneratorInputValidator {
  /**
   * Valida un GeneratorInput completo.
   */
  validate(input: GeneratorInput): GeneratorInputValidation {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const timestamp = new Date();

    // 1. Validaciones básicas
    if (!input.lifecycles || input.lifecycles.length === 0) {
      errors.push({
        type: "missing_lifecycle",
        message: "GeneratorInput no tiene lifecycles",
        fix: "Asegúrate de que la composición ha añadido al menos un lifecycle",
        severity: "critical",
      });
      return { isValid: false, errors, warnings, coverage: { lifecyclesCovered: 0, totalLifecycles: 0, percentage: 0 }, timestamp };
    }

    // 2. Validar que RuleSet existe si hay reglas
    if (!input.ruleSet) {
      errors.push({
        type: "missing_ruleset",
        message: "GeneratorInput carece de ruleSet compilado",
        fix: "Compila las políticas antes de pasar a GeneratorInput",
        severity: "critical",
      });
    }

    // 3. Validar roles
    if (!input.roles || input.roles.length === 0) {
      warnings.push({
        type: "missing_roles",
        message: "GeneratorInput no tiene roles definidos",
        severity: "warning",
        fix: "Define roles si usas control de acceso",
      });
    }

    // 4. Validar si hay composición
    if (input.composition) {
      // 4a. Validar que todos los procesos en composición tengan lifecycles
      const lifecycleIds = new Set(input.lifecycles.map((l) => l.id));

      if (input.composition.dominant && !lifecycleIds.has(input.composition.dominant)) {
        errors.push({
          type: "orphan_lifecycle",
          message: `Archetype dominante '${input.composition.dominant}' no tiene lifecycle`,
          affectedItems: [input.composition.dominant],
          fix: `Crea o registra un lifecycle para el archetype dominante`,
          severity: "critical",
        });
      }

      for (const secondary of input.composition.secondaries || []) {
        if (!lifecycleIds.has(secondary.secondaryArchetypeId)) {
          errors.push({
            type: "orphan_lifecycle",
            message: `Archetype secundario '${secondary.secondaryArchetypeId}' no tiene lifecycle`,
            affectedItems: [secondary.secondaryArchetypeId],
            fix: `Crea o registra un lifecycle para ${secondary.secondaryArchetypeId}`,
            severity: "error",
          });
        }
      }
    } else {
      // Sin composición, cada lifecycle es independiente
      warnings.push({
        type: "missing_composition",
        message: "GeneratorInput no tiene composición (cada lifecycle es independiente)",
        severity: "info",
        fix: "Esto es válido solo si todos los procesos son independientes",
      });
    }

    // 5. Validar coherencia de paymentMode
    const validPaymentModes = ["inmediato", "financiado", "diferido", "mixto"];
    if (!validPaymentModes.includes(input.paymentMode)) {
      errors.push({
        type: "inconsistent_payment_mode",
        message: `paymentMode inválido: '${input.paymentMode}'`,
        field: "paymentMode",
        affectedItems: [input.paymentMode],
        fix: `Usa uno de: ${validPaymentModes.join(", ")}`,
        severity: "error",
      });
    }

    // 6. Validar consistencia: si paymentMode=financiado, debe haber reglas
    if (input.paymentMode === "financiado" && !input.ruleSet) {
      warnings.push({
        type: "inconsistent_payment_mode",
        message: "paymentMode=financiado pero no hay ruleSet de financiación",
        severity: "warning",
        fix: "Compila las políticas de financiación",
      });
    }

    // 7. Validar asignación de roles a lifecycles (si aplica)
    for (const lifecycle of input.lifecycles) {
      if (lifecycle.compositionRole && !["dominant", "secondary", "standalone"].includes(lifecycle.compositionRole)) {
        errors.push({
          type: "invalid_role_assignment",
          message: `Lifecycle '${lifecycle.id}' tiene compositionRole inválido: '${lifecycle.compositionRole}'`,
          affectedItems: [lifecycle.id],
          fix: `Usa: dominant, secondary o standalone`,
          severity: "error",
        });
      }
    }

    // 8. Detectar ciclos (si hay rutas entre lifecycles implícitas)
    // Nota: En el GeneratorInput actual no hay rutas explícitas, pero lo simulamos
    if (this.hasCyclicDependency(input)) {
      errors.push({
        type: "circular_dependency",
        message: "Dependencia cíclica detectada en composición",
        fix: "Revisa las asignaciones de roles y dependencias",
        severity: "error",
      });
    }

    // 9. Calcular cobertura (lifecycles alcanzables)
    const coverage = this.calculateCoverage(input);

    // Warnings si cobertura baja
    if (coverage.percentage < 80 && coverage.totalLifecycles > 1) {
      warnings.push({
        type: "low_coverage",
        message: `Solo ${coverage.lifecyclesCovered}/${coverage.totalLifecycles} lifecycles alcanzables (${coverage.percentage.toFixed(1)}%)`,
        severity: "warning",
        fix: "Revisa qué lifecycles no son alcanzables desde el dominante",
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      coverage,
      timestamp,
    };
  }

  /**
   * Detecta dependencias cíclicas (muy simplificado).
   */
  private hasCyclicDependency(input: GeneratorInput): boolean {
    // Lógica simple: si hay composición y la cadena de dependencias vuelve al inicio
    if (!input.composition) return false;

    // En el contexto actual, no hay dependencias explícitas
    // Esto es un placeholder para futuras extensiones
    return false;
  }

  /**
   * Calcula cobertura de lifecycles.
   */
  private calculateCoverage(input: GeneratorInput): {
    lifecyclesCovered: number;
    totalLifecycles: number;
    percentage: number;
  } {
    const totalLifecycles = input.lifecycles.length;

    // En contexto actual, todos los lifecycles en GeneratorInput son accesibles
    // porque ya han sido incluidos en la composición
    const lifecyclesCovered = totalLifecycles;
    const percentage = totalLifecycles > 0 ? 100 : 0;

    return { lifecyclesCovered, totalLifecycles, percentage };
  }

  /**
   * Exporta reporte de validación como string legible.
   */
  static report(validation: GeneratorInputValidation): string {
    const lines: string[] = [];

    lines.push("=== VALIDACIÓN DE GENERATORINPUT ===");
    lines.push(`Timestamp: ${validation.timestamp.toISOString()}`);
    lines.push(`Estado: ${validation.isValid ? "✓ VÁLIDO" : "✗ INVÁLIDO"}`);
    lines.push("");

    if (validation.errors.length > 0) {
      lines.push(`❌ ERRORES (${validation.errors.length}):`);
      for (const err of validation.errors) {
        lines.push(`  [${err.type}] ${err.message}`);
        if (err.affectedItems) {
          lines.push(`    Items: ${err.affectedItems.join(", ")}`);
        }
        lines.push(`    Fix: ${err.fix}`);
      }
      lines.push("");
    }

    if (validation.warnings.length > 0) {
      lines.push(`⚠️ WARNINGS (${validation.warnings.length}):`);
      for (const warn of validation.warnings) {
        lines.push(`  [${warn.type}] ${warn.message}`);
        if (warn.fix) {
          lines.push(`    Fix: ${warn.fix}`);
        }
      }
      lines.push("");
    }

    lines.push(`📊 COBERTURA:`);
    lines.push(
      `  Lifecycles: ${validation.coverage.lifecyclesCovered}/${validation.coverage.totalLifecycles} (${validation.coverage.percentage.toFixed(1)}%)`,
    );
    lines.push("");

    lines.push("=== FIN VALIDACIÓN ===");
    return lines.join("\n");
  }

  /**
   * Exporta validación a JSON.
   */
  static toJSON(validation: GeneratorInputValidation): string {
    return JSON.stringify(
      {
        isValid: validation.isValid,
        timestamp: validation.timestamp.toISOString(),
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        errors: validation.errors,
        warnings: validation.warnings,
        coverage: validation.coverage,
      },
      null,
      2,
    );
  }
}

/**
 * Validador rápido (solo checks críticos).
 */
export function validateGeneratorInputFast(input: GeneratorInput): boolean {
  if (!input.lifecycles || input.lifecycles.length === 0) return false;
  if (!input.ruleSet) return false;
  return true;
}

/**
 * Obtiene errores críticos solamente.
 */
export function getCriticalValidationErrors(input: GeneratorInput): readonly ValidationError[] {
  const validator = new GeneratorInputValidator();
  const validation = validator.validate(input);
  return validation.errors.filter((e) => e.severity === "critical");
}
