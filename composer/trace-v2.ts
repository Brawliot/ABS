/**
 * Traceabilidad V2 (Fase 2 Compositor)
 * Auditoría exhaustiva: por qué cada decisión.
 * Snapshots antes/después, metadata completa.
 */

import type { RuleAction } from "./types.js";
import type { RuleCondition } from "./dsl-extended.js";
import { describeCondition } from "./dsl-extended.js";

/**
 * Decisión de una regla: aplicar, saltar, conflicto, inválida.
 */
export type RuleDecision = "APPLY" | "SKIP" | "CONFLICT" | "INVALID";

/**
 * Snapshot de un campo en contexto.
 */
export interface FieldSnapshot {
  readonly fieldPath: string;
  readonly valueBefore: any;
  readonly valueAfter: any;
  readonly confidenceBefore: number | undefined;
  readonly confidenceAfter: number | undefined;
}

/**
 * Entrada de traceabilidad V2.
 */
export interface TraceEntryV2 {
  readonly timestamp: Date;
  readonly ruleId: string;
  readonly rulePriority: number;
  readonly ruleDescription: string;

  // Condición evaluada
  readonly condition?: RuleCondition;
  readonly conditionResult?: boolean;

  // Snapshot antes/después
  readonly affectedFields: readonly FieldSnapshot[];

  // Decisión + razón
  readonly decision: RuleDecision;
  readonly reason: string; // "Financiera no tiene razón válida"

  // Acciones aplicadas
  readonly actionsApplied: readonly RuleAction[];

  // Warnings + metadata
  readonly warnings: readonly string[];
  readonly metadata: {
    readonly evaluationTimeMs?: number;
    readonly conditionDepth?: number;
    readonly [key: string]: any;
  };
}

/**
 * Trazador: registra todas las decisiones.
 */
export class Tracer {
  private entries: TraceEntryV2[] = [];
  private startTime: number = Date.now();

  /**
   * Registra una entrada de traceabilidad.
   */
  record(entry: TraceEntryV2): void {
    this.entries.push(entry);
  }

  /**
   * Obtiene todas las entradas.
   */
  getTrace(): readonly TraceEntryV2[] {
    return Object.freeze([...this.entries]);
  }

  /**
   * Obtiene entradas de una regla específica.
   */
  getTraceFor(ruleId: string): readonly TraceEntryV2[] {
    return Object.freeze(this.entries.filter((e) => e.ruleId === ruleId));
  }

  /**
   * Obtiene entradas de una decisión.
   */
  getTraceByDecision(decision: RuleDecision): readonly TraceEntryV2[] {
    return Object.freeze(this.entries.filter((e) => e.decision === decision));
  }

  /**
   * Genera un trail auditable: lista de decisiones en orden.
   */
  auditTrail(): string {
    const lines: string[] = [];
    lines.push("=== AUDIT TRAIL ===");
    lines.push(`Decisiones totales: ${this.entries.length}`);
    lines.push("");

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i]!;
      lines.push(`${String(i + 1).padStart(3, " ")}. [${entry.ruleId}]`);
      lines.push(`    Descripción: ${entry.ruleDescription}`);
      lines.push(`    Decisión: ${entry.decision}`);
      lines.push(`    Razón: ${entry.reason}`);

      if (entry.condition) {
        lines.push(`    Condición: ${describeCondition(entry.condition)}`);
        lines.push(`    Resultado: ${entry.conditionResult}`);
      }

      if (entry.affectedFields.length > 0) {
        for (const field of entry.affectedFields) {
          const before = JSON.stringify(field.valueBefore);
          const after = JSON.stringify(field.valueAfter);
          const confBefore = field.confidenceBefore ? ` (conf: ${field.confidenceBefore})` : "";
          const confAfter = field.confidenceAfter ? ` (conf: ${field.confidenceAfter})` : "";

          lines.push(`    ${field.fieldPath}:`);
          lines.push(`      Antes:  ${before}${confBefore}`);
          lines.push(`      Después: ${after}${confAfter}`);
        }
      }

      if (entry.actionsApplied.length > 0) {
        lines.push(`    Acciones: ${entry.actionsApplied.length}`);
        for (const action of entry.actionsApplied) {
          lines.push(`      - ${action.type}`);
        }
      }

      if (entry.warnings.length > 0) {
        lines.push(`    ⚠️ Warnings:`);
        for (const warning of entry.warnings) {
          lines.push(`      - ${warning}`);
        }
      }

      if (entry.metadata.evaluationTimeMs !== undefined) {
        lines.push(`    Tiempo: ${entry.metadata.evaluationTimeMs}ms`);
      }

      lines.push("");
    }

    lines.push("=== FIN AUDIT TRAIL ===");
    return lines.join("\n");
  }

  /**
   * Estadísticas de traceabilidad.
   */
  stats(): {
    totalEntries: number;
    applied: number;
    skipped: number;
    conflicts: number;
    invalid: number;
    totalTimeMs: number;
    avgTimePerRule: number;
  } {
    const totalEntries = this.entries.length;
    const applied = this.entries.filter((e) => e.decision === "APPLY").length;
    const skipped = this.entries.filter((e) => e.decision === "SKIP").length;
    const conflicts = this.entries.filter((e) => e.decision === "CONFLICT").length;
    const invalid = this.entries.filter((e) => e.decision === "INVALID").length;

    const totalTimeMs = this.entries.reduce(
      (sum, e) => sum + (e.metadata.evaluationTimeMs || 0),
      0,
    );
    const avgTimePerRule = totalEntries > 0 ? totalTimeMs / totalEntries : 0;

    return {
      totalEntries,
      applied,
      skipped,
      conflicts,
      invalid,
      totalTimeMs,
      avgTimePerRule,
    };
  }

  /**
   * Exporta trace a JSON (determinista).
   */
  toJSON(): string {
    // Serializar de forma determinista
    const entries = this.entries.map((e) => ({
      timestamp: e.timestamp.toISOString(),
      ruleId: e.ruleId,
      rulePriority: e.rulePriority,
      ruleDescription: e.ruleDescription,
      condition: e.condition ? JSON.stringify(e.condition) : undefined,
      conditionResult: e.conditionResult,
      affectedFields: e.affectedFields,
      decision: e.decision,
      reason: e.reason,
      actionsApplied: e.actionsApplied.map((a) => a.type),
      warnings: e.warnings,
      metadata: e.metadata,
    }));

    return JSON.stringify(
      {
        version: "2.0",
        exportedAt: new Date().toISOString(),
        totalEntries: this.entries.length,
        stats: this.stats(),
        entries,
      },
      null,
      2,
    );
  }

  /**
   * Importa trace desde JSON.
   */
  static fromJSON(json: string): Tracer {
    const data = JSON.parse(json);
    const tracer = new Tracer();

    if (data.entries && Array.isArray(data.entries)) {
      for (const entry of data.entries) {
        // Reconstruir entry (nota: perdemos RuleAction completa, solo type)
        const reconstructed: TraceEntryV2 = {
          timestamp: new Date(entry.timestamp),
          ruleId: entry.ruleId,
          rulePriority: entry.rulePriority,
          ruleDescription: entry.ruleDescription,
          affectedFields: entry.affectedFields,
          decision: entry.decision,
          reason: entry.reason,
          actionsApplied: (entry.actionsApplied || []).map((type: string) => ({
            type: type as any,
          })),
          warnings: entry.warnings,
          metadata: entry.metadata,
        };
        tracer.record(reconstructed);
      }
    }

    return tracer;
  }

  /**
   * Genera un reporte textual resumido.
   */
  summary(): string {
    const s = this.stats();
    const lines: string[] = [];

    lines.push("=== TRACE V2 SUMMARY ===");
    lines.push(`Total de decisiones: ${s.totalEntries}`);
    lines.push(`  ✓ APPLY:     ${s.applied}`);
    lines.push(`  ○ SKIP:      ${s.skipped}`);
    lines.push(`  ⚠️ CONFLICT: ${s.conflicts}`);
    lines.push(`  ✗ INVALID:   ${s.invalid}`);
    lines.push(`Tiempo total: ${s.totalTimeMs}ms`);
    lines.push(`Promedio/regla: ${s.avgTimePerRule.toFixed(2)}ms`);

    return lines.join("\n");
  }

  /**
   * Limpia todas las entradas.
   */
  clear(): void {
    this.entries = [];
    this.startTime = Date.now();
  }

  /**
   * Calcula hash canónico de la traza (para determinismo).
   */
  hash(): string {
    const canonical = this.entries
      .map(
        (e) =>
          `${e.ruleId}:${e.decision}:${e.reason}:${JSON.stringify(e.affectedFields)}`,
      )
      .join("|");

    // Hash simple (en producción usar crypto.createHash)
    let hash = 0;
    for (let i = 0; i < canonical.length; i++) {
      const char = canonical.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(16).padStart(8, "0");
  }
}

/**
 * Construye una FieldSnapshot comparando before/after.
 */
export function buildFieldSnapshot(
  fieldPath: string,
  valueBefore: any,
  valueAfter: any,
  confidenceBefore?: number,
  confidenceAfter?: number,
): FieldSnapshot {
  return {
    fieldPath,
    valueBefore,
    valueAfter,
    confidenceBefore,
    confidenceAfter,
  } as FieldSnapshot;
}
