/**
 * Analytics & Telemetry Manager
 * Maneja: page views, user interactions, performance metrics, custom events, error tracking
 */

export interface AnalyticsEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  sessionId: string;
}

export interface PageViewEvent extends AnalyticsEvent {
  type: 'page_view';
  data: {
    path: string;
    referrer?: string;
    title?: string;
  };
}

export interface InteractionEvent extends AnalyticsEvent {
  type: 'interaction';
  data: {
    element: string;
    action: 'click' | 'submit' | 'scroll' | 'input';
    target?: string;
    value?: unknown;
  };
}

export interface PerformanceEvent extends AnalyticsEvent {
  type: 'performance';
  data: {
    metric: 'FCP' | 'LCP' | 'CLS' | 'INP' | 'TTFB';
    value: number;
    threshold: number;
  };
}

export interface CustomEvent extends AnalyticsEvent {
  type: 'custom';
  data: {
    event: string;
    properties: Record<string, unknown>;
  };
}

export class AnalyticsManager {
  private sessionId: string;
  private eventQueue: AnalyticsEvent[] = [];
  private batchSize = 10;
  private flushInterval = 30000; // 30 segundos
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isTracking = false;
  private endpoint = '/api/analytics';

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeTracking();
  }

  /**
   * Genera un ID único de sesión
   */
  private generateSessionId(): string {
    const existingId = sessionStorage.getItem('abs-session-id');
    if (existingId) return existingId;

    const id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('abs-session-id', id);
    return id;
  }

  /**
   * Inicializa tracking automático
   */
  private initializeTracking(): void {
    if (this.isTracking) return;
    this.isTracking = true;

    // Track page views
    this.trackPageView();

    // Track user interactions
    document.addEventListener('click', (e) => this.trackClickEvent(e));
    document.addEventListener('submit', (e) => this.trackFormSubmit(e));
    window.addEventListener('scroll', () => this.trackScrollEvent());

    // Track performance metrics
    this.trackPerformanceMetrics();

    // Auto-flush
    this.startAutoFlush();
  }

  /**
   * Track page view
   */
  private trackPageView(): void {
    const event: PageViewEvent = {
      type: 'page_view',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      data: {
        path: window.location.pathname,
        referrer: document.referrer,
        title: document.title,
      },
    };
    this.addEvent(event);
  }

  /**
   * Track click events
   */
  private trackClickEvent(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target) return;

    const interactionEvent: InteractionEvent = {
      type: 'interaction',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      data: {
        element: target.tagName,
        action: 'click',
        target: target.id || target.className,
        value: (target as any).value,
      },
    };
    this.addEvent(interactionEvent);
  }

  /**
   * Track form submissions
   */
  private trackFormSubmit(event: Event): void {
    const form = event.target as HTMLFormElement;
    if (!form) return;

    const interactionEvent: InteractionEvent = {
      type: 'interaction',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      data: {
        element: 'FORM',
        action: 'submit',
        target: form.id || form.name,
      },
    };
    this.addEvent(interactionEvent);
  }

  /**
   * Track scroll events (throttled)
   */
  private lastScrollTrack = 0;
  private trackScrollEvent(): void {
    const now = Date.now();
    if (now - this.lastScrollTrack < 5000) return; // Throttle a cada 5s

    this.lastScrollTrack = now;
    const scrollPercent = Math.round(
      (window.scrollY /
        (document.documentElement.scrollHeight - window.innerHeight)) *
        100
    );

    const interactionEvent: InteractionEvent = {
      type: 'interaction',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      data: {
        element: 'WINDOW',
        action: 'scroll',
        value: scrollPercent,
      },
    };
    this.addEvent(interactionEvent);
  }

  /**
   * Track performance metrics (Core Web Vitals)
   */
  private trackPerformanceMetrics(): void {
    // First Contentful Paint
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.trackPerformance('FCP', entry.startTime, 1200);
          }
        }
      });

      try {
        observer.observe({ entryTypes: ['paint'] });
      } catch (e) {
        // Safari no soporta
      }
    }

    // Largest Contentful Paint
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            this.trackPerformance('LCP', lastEntry.startTime, 2500);
          }
        });
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (e) {
        // No soportado
      }
    }

    // Cumulative Layout Shift
    if ('PerformanceObserver' in window) {
      try {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
              this.trackPerformance('CLS', clsValue, 0.1);
            }
          }
        });
        observer.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        // No soportado
      }
    }
  }

  /**
   * Track performance metric
   */
  private trackPerformance(
    metric: 'FCP' | 'LCP' | 'CLS' | 'INP' | 'TTFB',
    value: number,
    threshold: number
  ): void {
    const event: PerformanceEvent = {
      type: 'performance',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      data: {
        metric,
        value: Math.round(value * 100) / 100,
        threshold,
      },
    };
    this.addEvent(event);
  }

  /**
   * Track custom event
   */
  trackCustomEvent(eventName: string, properties: Record<string, unknown>): void {
    const event: CustomEvent = {
      type: 'custom',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      data: {
        event: eventName,
        properties,
      },
    };
    this.addEvent(event);
  }

  /**
   * Añade evento a la cola
   */
  private addEvent(event: AnalyticsEvent): void {
    this.eventQueue.push(event);

    // Persiste en localStorage si offline
    this.persistEventQueue();

    // Flush si alcanzamos batch size
    if (this.eventQueue.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Persiste cola de eventos en localStorage
   */
  private persistEventQueue(): void {
    try {
      const maxEvents = 100;
      const toStore = this.eventQueue.slice(-maxEvents);
      localStorage.setItem('abs-analytics-queue', JSON.stringify(toStore));
    } catch (error) {
      console.error('Error persistiendo analytics:', error);
    }
  }

  /**
   * Restaura cola desde localStorage
   */
  private restoreEventQueue(): void {
    try {
      const stored = localStorage.getItem('abs-analytics-queue');
      if (stored) {
        const events = JSON.parse(stored) as AnalyticsEvent[];
        this.eventQueue = events;
      }
    } catch (error) {
      console.error('Error restaurando analytics:', error);
    }
  }

  /**
   * Inicia auto-flush
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }

  /**
   * Envía eventos al backend
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const eventsToSend = this.eventQueue.slice(0, this.batchSize);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: eventsToSend }),
      });

      if (response.ok) {
        // Elimina eventos enviados
        this.eventQueue = this.eventQueue.slice(this.batchSize);
        this.persistEventQueue();
      }
    } catch (error) {
      console.error('Error enviando analytics:', error);
      // Los eventos permanecen en la cola para reintentar
    }
  }

  /**
   * Obtiene eventos pendientes
   */
  getPendingEvents(): AnalyticsEvent[] {
    return [...this.eventQueue];
  }

  /**
   * Obtiene ID de sesión
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Limpia todos los eventos
   */
  clear(): void {
    this.eventQueue = [];
    localStorage.removeItem('abs-analytics-queue');
  }

  /**
   * Detiene tracking
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.isTracking = false;
  }
}

/**
 * Singleton global del Analytics Manager
 */
let analyticsManager: AnalyticsManager | null = null;

export function getAnalyticsManager(): AnalyticsManager {
  if (!analyticsManager) {
    analyticsManager = new AnalyticsManager();
  }
  return analyticsManager;
}

export function resetAnalyticsManager(): void {
  analyticsManager?.stop();
  analyticsManager = null;
}
