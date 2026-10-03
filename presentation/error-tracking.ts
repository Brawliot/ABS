/**
 * Error Tracking & Recovery System
 * Maneja: captura de errores, reporting, recovery, retry automático
 */

export interface StackFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  context?: string;
}

export interface ErrorReport {
  id: string;
  message: string;
  type: string;
  stack?: StackFrame[];
  context: {
    timestamp: string;
    url: string;
    userAgent: string;
    sessionId: string;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  reported: boolean;
}

export interface ErrorRecoveryAction {
  type: 'reload' | 'navigate' | 'retry' | 'dismiss';
  target?: string;
  label: string;
}

export class ErrorTracker {
  private errors: Map<string, ErrorReport> = new Map();
  private sessionId: string;
  private endpoint = '/api/errors';
  private maxErrors = 50;
  private reportedErrors: Set<string> = new Set();
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries = 3;
  private backoffMultiplier = 2;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.initializeErrorHandlers();
  }

  /**
   * Obtiene o crea ID de sesión
   */
  private getOrCreateSessionId(): string {
    let sessionId = sessionStorage.getItem('abs-error-session-id');
    if (!sessionId) {
      sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('abs-error-session-id', sessionId);
    }
    return sessionId;
  }

  /**
   * Inicializa handlers globales de errores
   */
  private initializeErrorHandlers(): void {
    // Captura errores no capturados
    window.addEventListener('error', (event) => {
      this.captureError({
        type: 'UncaughtError',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    // Captura promesas rechazadas
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      this.captureError({
        type: 'UnhandledRejection',
        message: error.message,
        stack: error.stack,
      });
    });
  }

  /**
   * Captura un error
   */
  captureError(errorData: {
    type: string;
    message: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    stack?: string | undefined;
  }): void {
    const id = this.generateErrorId();
    const stack = this.parseStackTrace(errorData.stack ?? '');

    const report: ErrorReport = {
      id,
      message: errorData.message,
      type: errorData.type,
      stack,
      context: {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        sessionId: this.sessionId,
      },
      severity: this.determineSeverity(errorData.message),
      reported: false,
    };

    // Limita cantidad de errores almacenados
    if (this.errors.size >= this.maxErrors) {
      const firstKey = this.errors.keys().next().value;
      if (firstKey !== undefined) {
        this.errors.delete(firstKey);
      }
    }

    this.errors.set(id, report);
    this.persistErrors();

    // Auto-report si es crítico
    if (report.severity === 'critical') {
      this.reportError(id);
    }
  }

  /**
   * Genera ID único para error
   */
  private generateErrorId(): string {
    return `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Determina severidad del error
   */
  private determineSeverity(message: string): 'low' | 'medium' | 'high' | 'critical' {
    const lower = message.toLowerCase();

    if (lower.includes('fatal') || lower.includes('critical')) {
      return 'critical';
    }
    if (lower.includes('error') || lower.includes('failed')) {
      return 'high';
    }
    if (lower.includes('warning')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Parse stack trace
   */
  private parseStackTrace(stackString: string): StackFrame[] {
    if (!stackString) return [];

    const frames: StackFrame[] = [];
    const lines = stackString.split('\n');

    for (const line of lines) {
      const match = line.match(
        /at\s+(?:(\w+|<anonymous>)\s+)?\(?([^)]+):(\d+):(\d+)\)?/
      );
      if (match && match[2] && match[3]) {
        const frame: StackFrame = {
          function: match[1] || 'anonymous',
          lineno: parseInt(match[3], 10),
        };
        if (match[2]) {
          frame.filename = match[2];
        }
        if (match[4]) {
          frame.colno = parseInt(match[4], 10);
        }
        frames.push(frame);
      }
    }

    return frames;
  }

  /**
   * Reporta un error al backend con retry
   */
  async reportError(errorId: string): Promise<void> {
    const error = this.errors.get(errorId);
    if (!error) return;

    const attempts = this.retryAttempts.get(errorId) || 0;

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error }),
      });

      if (response.ok) {
        error.reported = true;
        this.reportedErrors.add(errorId);
        this.retryAttempts.delete(errorId);
        this.persistErrors();
      } else if (attempts < this.maxRetries) {
        // Retry con exponential backoff
        const delay = Math.pow(this.backoffMultiplier, attempts) * 1000;
        this.retryAttempts.set(errorId, attempts + 1);
        setTimeout(() => this.reportError(errorId), delay);
      }
    } catch (error) {
      if (attempts < this.maxRetries) {
        const delay = Math.pow(this.backoffMultiplier, attempts) * 1000;
        this.retryAttempts.set(errorId, attempts + 1);
        setTimeout(() => this.reportError(errorId), delay);
      }
    }
  }

  /**
   * Obtiene error por ID
   */
  getError(errorId: string): ErrorReport | undefined {
    return this.errors.get(errorId);
  }

  /**
   * Obtiene todos los errores
   */
  getAllErrors(): ErrorReport[] {
    return Array.from(this.errors.values());
  }

  /**
   * Obtiene errores no reportados
   */
  getUnreportedErrors(): ErrorReport[] {
    return Array.from(this.errors.values()).filter((e) => !e.reported);
  }

  /**
   * Recovery actions sugeridas
   */
  getRecoveryActions(errorId: string): ErrorRecoveryAction[] {
    const error = this.errors.get(errorId);
    if (!error) return [];

    const actions: ErrorRecoveryAction[] = [];

    if (
      error.message.includes('network') ||
      error.message.includes('timeout')
    ) {
      actions.push({
        type: 'retry',
        label: 'Reintentar',
      });
    }

    if (error.severity === 'critical') {
      actions.push({
        type: 'reload',
        label: 'Recargar página',
      });
    }

    actions.push({
      type: 'navigate',
      target: '/',
      label: 'Ir a inicio',
    });

    return actions;
  }

  /**
   * Ejecuta acción de recovery
   */
  executeRecoveryAction(action: ErrorRecoveryAction): void {
    switch (action.type) {
      case 'reload':
        window.location.reload();
        break;
      case 'navigate':
        window.location.href = action.target || '/';
        break;
      case 'retry':
        // Implementado por caller
        break;
      case 'dismiss':
        // Cerrar UI de error
        break;
    }
  }

  /**
   * Persiste errores en localStorage
   */
  private persistErrors(): void {
    try {
      const errors = Array.from(this.errors.values());
      localStorage.setItem('abs-errors', JSON.stringify(errors.slice(-20)));
    } catch (error) {
      console.error('Error persistiendo errores:', error);
    }
  }

  /**
   * Restaura errores desde localStorage
   */
  private restoreErrors(): void {
    try {
      const stored = localStorage.getItem('abs-errors');
      if (stored) {
        const errors = JSON.parse(stored) as ErrorReport[];
        for (const error of errors) {
          this.errors.set(error.id, error);
        }
      }
    } catch (error) {
      console.error('Error restaurando errores:', error);
    }
  }

  /**
   * Limpia errores reportados
   */
  clearReportedErrors(): void {
    for (const errorId of this.reportedErrors) {
      this.errors.delete(errorId);
    }
    this.reportedErrors.clear();
    this.persistErrors();
  }

  /**
   * Limpia todos los errores
   */
  clear(): void {
    this.errors.clear();
    this.reportedErrors.clear();
    this.retryAttempts.clear();
    localStorage.removeItem('abs-errors');
  }

  /**
   * Obtiene estadísticas
   */
  getStats(): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    reported: number;
  } {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let reported = 0;

    for (const error of this.errors.values()) {
      byType[error.type] = (byType[error.type] || 0) + 1;
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
      if (error.reported) reported++;
    }

    return {
      total: this.errors.size,
      byType,
      bySeverity,
      reported,
    };
  }
}

/**
 * Singleton global del Error Tracker
 */
let errorTracker: ErrorTracker | null = null;

export function getErrorTracker(): ErrorTracker {
  if (!errorTracker) {
    errorTracker = new ErrorTracker();
  }
  return errorTracker;
}

export function resetErrorTracker(): void {
  errorTracker = null;
}
