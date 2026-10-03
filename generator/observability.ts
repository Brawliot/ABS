/**
 * Sistema de Observabilidad: Métricas, Trazas y Logs exhaustivos.
 * Fase 3: Visibilidad total de performance y bottlenecks.
 */

/**
 * Métricas del generador: contadores de output y performance.
 */
export interface GeneratorMetrics {
  executionTime: number; // ms total
  viewsGenerated: number;
  actionsGenerated: number;
  formsGenerated: number;
  modulesGenerated: number;
  recorridosGenerated: number;
  pluginsExecuted: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  validationErrors: number;
}

/**
 * Fase de ejecución en el pipeline.
 */
export type GeneratorPhase =
  | "normalize"
  | "generate_views"
  | "generate_actions"
  | "generate_forms"
  | "build_modules"
  | "apply_plugins"
  | "validate"
  | "finalize";

/**
 * Traza de una fase: duración, detalles y metadatos.
 */
export interface GeneratorTrace {
  id: string;
  timestamp: Date;
  phase: GeneratorPhase;
  duration: number; // ms
  details: Record<string, any>;
  metadata: {
    inputSize: number;
    outputSize: number;
    cacheHit?: boolean | undefined;
    success: boolean;
    errorMessage?: string | undefined;
  };
}

/**
 * Nivel de severidad para logs.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Entrada de log.
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  phase?: GeneratorPhase | undefined;
  message: string;
  context?: Record<string, any> | undefined;
}

/**
 * Gestor de observabilidad: métricas, trazas y logs.
 */
export class ObservabilityManager {
  private metrics: GeneratorMetrics = {
    executionTime: 0,
    viewsGenerated: 0,
    actionsGenerated: 0,
    formsGenerated: 0,
    modulesGenerated: 0,
    recorridosGenerated: 0,
    pluginsExecuted: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
    validationErrors: 0,
  };

  private traces: GeneratorTrace[] = [];
  private logs: LogEntry[] = [];
  private timers: Map<string, number> = new Map();
  private phaseStartTime: number = 0;

  /**
   * Inicia un timer para una fase.
   */
  startPhase(phase: GeneratorPhase): void {
    this.phaseStartTime = Date.now();
    this.timers.set(phase, this.phaseStartTime);
    this.log("debug", phase, `Iniciando fase: ${phase}`);
  }

  /**
   * Finaliza una fase y registra la traza.
   */
  endPhase(
    phase: GeneratorPhase,
    details: Record<string, any> = {},
    success: boolean = true,
    errorMessage?: string,
  ): void {
    const start = this.timers.get(phase);
    if (!start) {
      this.log("warn", phase, `Fase ${phase} no iniciada`);
      return;
    }

    const duration = Date.now() - start;

    const metadata: {
      inputSize: number;
      outputSize: number;
      cacheHit?: boolean | undefined;
      success: boolean;
      errorMessage?: string | undefined;
    } = {
      inputSize: details.inputSize ?? 0,
      outputSize: details.outputSize ?? 0,
      success,
    };

    if (details.cacheHit !== undefined) {
      metadata.cacheHit = details.cacheHit;
    }

    if (errorMessage !== undefined) {
      metadata.errorMessage = errorMessage;
    }

    this.traces.push({
      id: `trace-${this.traces.length}`,
      timestamp: new Date(),
      phase,
      duration,
      details,
      metadata,
    });

    if (!success) {
      this.metrics.errors++;
      this.log("error", phase, `Fase ${phase} falló: ${errorMessage}`);
    } else {
      this.log(
        "debug",
        phase,
        `Fase ${phase} completada en ${duration}ms`,
      );
    }

    this.timers.delete(phase);
  }

  /**
   * Registra una métrica.
   */
  recordMetric(name: keyof GeneratorMetrics, value: number): void {
    this.metrics[name] = (this.metrics[name] as number) + value;
  }

  /**
   * Registra una métrica absoluta (no acumulativa).
   */
  setMetric(name: keyof GeneratorMetrics, value: number): void {
    this.metrics[name] = value;
  }

  /**
   * Registra un log.
   */
  log(
    level: LogLevel,
    phase: GeneratorPhase | string,
    message: string,
    context?: Record<string, any>,
  ): void {
    const validPhases = ["normalize", "generate_views", "generate_actions", "generate_forms", "build_modules", "apply_plugins", "validate", "finalize"];
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
    };

    if (validPhases.includes(phase)) {
      entry.phase = phase as GeneratorPhase;
    }

    if (context !== undefined) {
      entry.context = context;
    }

    this.logs.push(entry);
  }

  /**
   * Obtiene las métricas actuales.
   */
  getMetrics(): Readonly<GeneratorMetrics> {
    return Object.freeze({ ...this.metrics });
  }

  /**
   * Obtiene las trazas registradas.
   */
  getTraces(): readonly GeneratorTrace[] {
    return Object.freeze([...this.traces]);
  }

  /**
   * Obtiene los logs registrados.
   */
  getLogs(): readonly LogEntry[] {
    return Object.freeze([...this.logs]);
  }

  /**
   * Obtiene los logs filtrados por nivel.
   */
  getLogsByLevel(level: LogLevel): readonly LogEntry[] {
    return Object.freeze(this.logs.filter((l) => l.level === level));
  }

  /**
   * Obtiene las trazas filtradas por fase.
   */
  getTracesByPhase(phase: GeneratorPhase): readonly GeneratorTrace[] {
    return Object.freeze(this.traces.filter((t) => t.phase === phase));
  }

  /**
   * Calcula estadísticas de performance por fase.
   */
  getPhaseStats(): Record<GeneratorPhase, { count: number; totalTime: number; avgTime: number }> {
    const stats: Record<
      GeneratorPhase,
      { count: number; totalTime: number; avgTime: number }
    > = {} as any;

    for (const phase of [
      "normalize",
      "generate_views",
      "generate_actions",
      "generate_forms",
      "build_modules",
      "apply_plugins",
      "validate",
      "finalize",
    ] as const) {
      const phaseTraces = this.traces.filter((t) => t.phase === phase);
      const count = phaseTraces.length;
      const totalTime = phaseTraces.reduce((sum, t) => sum + t.duration, 0);

      stats[phase] = {
        count,
        totalTime,
        avgTime: count > 0 ? totalTime / count : 0,
      };
    }

    return stats;
  }

  /**
   * Exporta las métricas como JSON.
   */
  exportMetricsJSON(): string {
    return JSON.stringify(this.metrics, null, 2);
  }

  /**
   * Exporta las trazas como JSON.
   */
  exportTracesJSON(): string {
    return JSON.stringify(this.traces, null, 2);
  }

  /**
   * Exporta los logs como JSON.
   */
  exportLogsJSON(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Exporta un reporte completo de observabilidad.
   */
  exportReport(): {
    metrics: GeneratorMetrics;
    traces: GeneratorTrace[];
    logs: LogEntry[];
    phaseStats: Record<
      GeneratorPhase,
      { count: number; totalTime: number; avgTime: number }
    >;
  } {
    return {
      metrics: { ...this.metrics },
      traces: [...this.traces],
      logs: [...this.logs],
      phaseStats: this.getPhaseStats(),
    };
  }

  /**
   * Limpia todas las métricas, trazas y logs.
   */
  clear(): void {
    this.metrics = {
      executionTime: 0,
      viewsGenerated: 0,
      actionsGenerated: 0,
      formsGenerated: 0,
      modulesGenerated: 0,
      recorridosGenerated: 0,
      pluginsExecuted: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      validationErrors: 0,
    };
    this.traces = [];
    this.logs = [];
    this.timers.clear();
  }

  /**
   * Obtiene el tiempo total de ejecución.
   */
  getTotalExecutionTime(): number {
    return this.traces.reduce((sum, t) => sum + t.duration, 0);
  }

  /**
   * Genera un resumen textual de performance.
   */
  getSummary(): string {
    const stats = this.getPhaseStats();
    const totalTime = this.getTotalExecutionTime();
    const errorCount = this.metrics.errors;
    const cacheHitRate =
      this.metrics.cacheHits + this.metrics.cacheMisses > 0
        ? (
            (this.metrics.cacheHits /
              (this.metrics.cacheHits + this.metrics.cacheMisses)) *
            100
          ).toFixed(2)
        : "0.00";

    let summary = "=== GENERADOR OBSERVABILIDAD REPORTE ===\n";
    summary += `Tiempo total: ${totalTime}ms\n`;
    summary += `Vistas generadas: ${this.metrics.viewsGenerated}\n`;
    summary += `Acciones generadas: ${this.metrics.actionsGenerated}\n`;
    summary += `Formas generadas: ${this.metrics.formsGenerated}\n`;
    summary += `Cache hit rate: ${cacheHitRate}%\n`;
    summary += `Errores: ${errorCount}\n`;
    summary += "\n--- Por Fase ---\n";

    for (const [phase, data] of Object.entries(stats)) {
      if (data.count > 0) {
        summary += `${phase}: ${data.count}x, ${data.totalTime}ms total, ${data.avgTime.toFixed(2)}ms avg\n`;
      }
    }

    return summary;
  }
}
