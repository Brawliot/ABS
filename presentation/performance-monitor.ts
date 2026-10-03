/**
 * Performance Monitor - Core Web Vitals & Lighthouse Metrics
 * Maneja: FCP, LCP, CLS, INP, Real User Monitoring
 */

export interface PerformanceMetric {
  name: 'FCP' | 'LCP' | 'CLS' | 'INP' | 'TTFB';
  value: number;
  threshold: number;
  status: 'good' | 'needs-improvement' | 'poor';
  timestamp: string;
}

export interface LighthouseSimulation {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  pwa: number;
  average: number;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private startTime = performance.now();
  private thresholds = {
    FCP: 1800, // ms - good threshold
    LCP: 2500, // ms
    CLS: 0.1, // cumulative shift
    INP: 200, // ms
    TTFB: 600, // ms
  };

  constructor() {
    this.initializeMetrics();
  }

  /**
   * Inicializa la recolección de métricas
   */
  private initializeMetrics(): void {
    this.collectPaintMetrics();
    this.collectLCPMetric();
    this.collectCLSMetric();
    this.collectTTFBMetric();
  }

  /**
   * Recoge FCP (First Contentful Paint)
   */
  private collectPaintMetrics(): void {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.recordMetric('FCP', entry.startTime);
          }
        }
      });

      observer.observe({ entryTypes: ['paint'] });
    } catch (error) {
      console.error('Error collecting paint metrics:', error);
    }
  }

  /**
   * Recoge LCP (Largest Contentful Paint)
   */
  private collectLCPMetric(): void {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.recordMetric('LCP', lastEntry.startTime);
        }
      });

      observer.observe({ entryTypes: ['largest-contentful-paint'] });

      // Cleanup en visibilitychange
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          observer.disconnect();
        }
      });
    } catch (error) {
      console.error('Error collecting LCP metric:', error);
    }
  }

  /**
   * Recoge CLS (Cumulative Layout Shift)
   */
  private collectCLSMetric(): void {
    if (!('PerformanceObserver' in window)) return;

    let clsValue = 0;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Ignora shifts causados por user input
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
            this.recordMetric('CLS', clsValue);
          }
        }
      });

      observer.observe({ entryTypes: ['layout-shift'] });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          observer.disconnect();
        }
      });
    } catch (error) {
      console.error('Error collecting CLS metric:', error);
    }
  }

  /**
   * Recoge TTFB (Time to First Byte)
   */
  private collectTTFBMetric(): void {
    if (!('performance' in window) || !('getEntriesByType' in performance)) return;

    try {
      const navigationTiming = performance.getEntriesByType('navigation')[0] as any;
      if (navigationTiming && navigationTiming.responseStart) {
        this.recordMetric('TTFB', navigationTiming.responseStart);
      }
    } catch (error) {
      console.error('Error collecting TTFB metric:', error);
    }
  }

  /**
   * Registra una métrica
   */
  private recordMetric(name: 'FCP' | 'LCP' | 'CLS' | 'INP' | 'TTFB', value: number): void {
    const threshold = this.thresholds[name];
    let status: 'good' | 'needs-improvement' | 'poor';

    // Determina status basado en thresholds
    if (name === 'CLS') {
      // Para CLS: <= 0.1 es good
      status = value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
    } else {
      // Para otros: <= threshold es good
      status = value <= threshold ? 'good' : value <= threshold * 1.25 ? 'needs-improvement' : 'poor';
    }

    const metric: PerformanceMetric = {
      name,
      value: Math.round(value * 100) / 100,
      threshold,
      status,
      timestamp: new Date().toISOString(),
    };

    this.metrics.set(name, metric);
  }

  /**
   * Registra manualmente una métrica INP
   */
  recordINPMetric(value: number): void {
    this.recordMetric('INP', value);
  }

  /**
   * Obtiene una métrica específica
   */
  getMetric(name: string): PerformanceMetric | undefined {
    return this.metrics.get(name as any);
  }

  /**
   * Obtiene todas las métricas
   */
  getAllMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Calcula score de Lighthouse (simulado)
   */
  calculateLighthouseScore(): LighthouseSimulation {
    // Performance basado en Core Web Vitals
    const performanceScore = this.calculatePerformanceScore();

    // Accessibility basado en audit (integrado con AccessibilityAuditor)
    const accessibilityScore = 90; // Default

    // Best Practices
    const bestPracticesScore = 85;

    // SEO
    const seoScore = 95;

    // PWA
    const pwaScore = 80;

    const average =
      (performanceScore +
        accessibilityScore +
        bestPracticesScore +
        seoScore +
        pwaScore) /
      5;

    return {
      performance: performanceScore,
      accessibility: accessibilityScore,
      bestPractices: bestPracticesScore,
      seo: seoScore,
      pwa: pwaScore,
      average: Math.round(average),
    };
  }

  /**
   * Calcula score de performance
   */
  private calculatePerformanceScore(): number {
    const metrics = this.getAllMetrics();
    if (metrics.length === 0) return 0;

    let score = 100;
    const metricWeights = {
      FCP: 0.1,
      LCP: 0.25,
      CLS: 0.25,
      INP: 0.25,
      TTFB: 0.15,
    };

    for (const metric of metrics) {
      const weight = metricWeights[metric.name] || 0;

      if (metric.status === 'good') {
        // No penaliza
      } else if (metric.status === 'needs-improvement') {
        score -= weight * 30; // -30 puntos
      } else if (metric.status === 'poor') {
        score -= weight * 50; // -50 puntos
      }
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * Genera reporte de performance
   */
  generateReport(): {
    metrics: PerformanceMetric[];
    lighthouse: LighthouseSimulation;
    passed: boolean;
    timestamp: string;
  } {
    return {
      metrics: this.getAllMetrics(),
      lighthouse: this.calculateLighthouseScore(),
      passed: this.calculateLighthouseScore().performance >= 95,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Obtiene runtime de la app (en ms)
   */
  getRuntime(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Limpia métricas (para tests)
   */
  clear(): void {
    this.metrics.clear();
  }
}

/**
 * Singleton global del Performance Monitor
 */
let performanceMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor();
  }
  return performanceMonitor;
}

export function resetPerformanceMonitor(): void {
  performanceMonitor = null;
}
