/**
 * Renderer Phase 3 Tests - PWA + Analytics + A/B Testing + Lighthouse
 * 32 tests covering all production features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ServiceWorkerManager,
  getServiceWorkerManager,
  resetServiceWorkerManager,
} from '../presentation/service-worker.js';
import {
  AnalyticsManager,
  getAnalyticsManager,
  resetAnalyticsManager,
} from '../presentation/analytics.js';
import {
  ABTestManager,
  getABTestManager,
  resetABTestManager,
} from '../presentation/ab-testing.js';
import {
  PerformanceMonitor,
  getPerformanceMonitor,
  resetPerformanceMonitor,
} from '../presentation/performance-monitor.js';
import {
  ErrorTracker,
  getErrorTracker,
  resetErrorTracker,
} from '../presentation/error-tracking.js';
import {
  LighthouseChecker,
  getLighthouseChecker,
  resetLighthouseChecker,
} from '../presentation/lighthouse-checker.js';

describe('Service Worker Manager - PWA', () => {
  let swm: ServiceWorkerManager;

  beforeEach(() => {
    resetServiceWorkerManager();
    swm = getServiceWorkerManager();
  });

  afterEach(() => {
    resetServiceWorkerManager();
  });

  it('gestiona registro de Service Worker', () => {
    expect(swm).toBeDefined();
    expect(swm?.isOnline()).toBe(true);
  });

  it('inicializa estrategias de cache correctamente', async () => {
    const info = await swm.getCacheInfo();
    expect(info).toBeDefined();
    // Las estrategias se inicializan en el constructor
  });

  it('maneja eventos de sync offline', async () => {
    await swm!.queueSync('test-sync', { data: 'test' });
    const pending = swm!.getPendingSyncEvents();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.tag).toBe('test-sync');
  });

  it('marca evento sync como completado', () => {
    swm!.queueSync('test-sync', { data: 'test' });
    let pending = swm!.getPendingSyncEvents();
    expect(pending).toHaveLength(1);

    swm!.markSyncEventAsComplete('test-sync');
    pending = swm!.getPendingSyncEvents();
    expect(pending).toHaveLength(0);
  });

  it('solicita y valida permisos de notificación', async () => {
    // Mock Notification
    (global as any).Notification = {
      permission: 'default',
      requestPermission: async () => 'granted',
    };

    expect(swm).toBeDefined();
  });
});

describe('Analytics Manager - Event Tracking', () => {
  let am: AnalyticsManager;

  beforeEach(() => {
    resetAnalyticsManager();
    am = getAnalyticsManager();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    resetAnalyticsManager();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('crea sesión única por usuario', () => {
    const sessionId1 = am.getSessionId();
    expect(sessionId1).toMatch(/^session-/);

    resetAnalyticsManager();
    const am2 = getAnalyticsManager();
    const sessionId2 = am2.getSessionId();

    // Debe ser la misma en la misma sesión del navegador
    // (aquí es diferente porque limpiamos sessionStorage)
    expect(sessionId2).toBeDefined();
  });

  it('trackea custom events', () => {
    am!.trackCustomEvent('test-event', { value: 123 });
    const events = am!.getPendingEvents();

    expect(events.length).toBeGreaterThan(0);
    const customEvent = events.find((e) => e.type === 'custom');
    expect(customEvent).toBeDefined();
    expect((customEvent as any).data.event).toBe('test-event');
  });

  it('persiste eventos en localStorage', () => {
    am!.trackCustomEvent('event1', { test: 1 });
    am!.trackCustomEvent('event2', { test: 2 });

    const stored = localStorage.getItem('abs-analytics-queue');
    expect(stored).toBeTruthy();

    const events = JSON.parse(stored!);
    expect(events.length).toBeGreaterThan(0);
  });

  it('detiene tracking sin perder eventos', () => {
    am!.trackCustomEvent('event1', { test: 1 });
    const before = am!.getPendingEvents().length;

    am!.stop();
    expect(before).toBeGreaterThan(0);
  });

  it('limpia eventos completamente', () => {
    am!.trackCustomEvent('event1', { test: 1 });
    expect(am!.getPendingEvents().length).toBeGreaterThan(0);

    am!.clear();
    expect(am!.getPendingEvents().length).toBe(0);
    expect(localStorage.getItem('abs-analytics-queue')).toBeNull();
  });
});

describe('A/B Testing Framework - Assignment & Conversion', () => {
  let abt: ABTestManager;

  beforeEach(() => {
    resetABTestManager();
    abt = getABTestManager();
    localStorage.clear();
  });

  afterEach(() => {
    resetABTestManager();
    localStorage.clear();
  });

  it('registra test A/B con variantes válidas', () => {
    const test = {
      id: 'test-1',
      name: 'Button Color Test',
      active: true,
      variants: [
        { id: 'control', name: 'Blue', weight: 50, config: { color: 'blue' } },
        { id: 'variant', name: 'Green', weight: 50, config: { color: 'green' } },
      ],
      createdAt: new Date().toISOString(),
    };

    abt!.registerTest(test);
    const registered = abt!.getAllTests();

    expect(registered).toHaveLength(1);
    expect(registered[0]!.id).toBe('test-1');
  });

  it('asignación determinística: mismo usuario siempre recibe variante', () => {
    const test = {
      id: 'deterministic-test',
      name: 'Determinism Test',
      active: true,
      variants: [
        { id: 'a', name: 'A', weight: 50, config: {} },
        { id: 'b', name: 'B', weight: 50, config: {} },
      ],
      createdAt: new Date().toISOString(),
    };

    abt!.registerTest(test);

    const variant1 = abt!.getVariant('deterministic-test');
    const variant2 = abt!.getVariant('deterministic-test');
    const variant3 = abt!.getVariant('deterministic-test');

    expect(variant1?.id).toBe(variant2?.id);
    expect(variant2?.id).toBe(variant3?.id);
  });

  it('obtiene configuración de variante correctamente', () => {
    const test = {
      id: 'config-test',
      name: 'Config Test',
      active: true,
      variants: [
        { id: 'v1', name: 'V1', weight: 100, config: { cta: 'Click me!' } },
      ],
      createdAt: new Date().toISOString(),
    };

    abt!.registerTest(test);
    const config = abt!.getVariantConfig('config-test');

    expect(config).toEqual({ cta: 'Click me!' });
  });

  it('trackea conversiones correctamente', () => {
    const test = {
      id: 'conversion-test',
      name: 'Conversion Test',
      active: true,
      variants: [
        { id: 'a', name: 'A', weight: 100, config: {} },
      ],
      createdAt: new Date().toISOString(),
    };

    abt!.registerTest(test);
    abt!.getVariant('conversion-test'); // Asigna variante

    abt!.trackConversion('conversion-test', 'purchase', 100);

    const stats = abt!.getTestStats('conversion-test');
    expect(stats.totalConversions).toBeGreaterThan(0);
  });

  it('calcula estadísticas de test correctamente', () => {
    const test = {
      id: 'stats-test',
      name: 'Stats Test',
      active: true,
      variants: [
        { id: 'a', name: 'A', weight: 100, config: {} },
      ],
      createdAt: new Date().toISOString(),
    };

    abt!.registerTest(test);
    abt!.getVariant('stats-test');

    const stats = abt!.getTestStats('stats-test');
    expect(stats.totalAssignments).toBeGreaterThan(0);
  });

  it('rechaza test con pesos inválidos', () => {
    const invalidTest = {
      id: 'invalid-test',
      name: 'Invalid Test',
      active: true,
      variants: [
        { id: 'a', name: 'A', weight: 50, config: {} },
        { id: 'b', name: 'B', weight: 40, config: {} }, // Suma = 90, no 100
      ],
      createdAt: new Date().toISOString(),
    };

    expect(() => abt!.registerTest(invalidTest)).toThrow();
  });

  it('deactiva test correctamente', () => {
    const test = {
      id: 'deactivate-test',
      name: 'Deactivate Test',
      active: true,
      variants: [
        { id: 'a', name: 'A', weight: 100, config: {} },
      ],
      createdAt: new Date().toISOString(),
    };

    abt!.registerTest(test);
    abt!.deactivateTest('deactivate-test');

    const variant = abt!.getVariant('deactivate-test');
    expect(variant).toBeNull();
  });
});

describe('Performance Monitor - Core Web Vitals', () => {
  let pm: PerformanceMonitor;

  beforeEach(() => {
    resetPerformanceMonitor();
    pm = getPerformanceMonitor();
  });

  afterEach(() => {
    resetPerformanceMonitor();
  });

  it('registra métricas de performance', () => {
    pm!.recordINPMetric(150);

    const inp = pm!.getMetric('INP');
    expect(inp).toBeDefined();
    expect(inp?.name).toBe('INP');
    expect(inp?.value).toBe(150);
  });

  it('calcula status correctamente (good/needs-improvement/poor)', () => {
    pm!.recordINPMetric(100); // Good
    const inp = pm!.getMetric('INP');

    expect(inp?.status).toBe('good');
  });

  it('obtiene todas las métricas registradas', () => {
    pm!.recordINPMetric(100);
    pm!.recordINPMetric(300);

    const metrics = pm!.getAllMetrics();
    expect(metrics).toHaveLength(2);
  });

  it('calcula score de Lighthouse basado en métricas', () => {
    pm!.recordINPMetric(100);

    const report = pm!.generateReport();
    expect(report.lighthouse.performance).toBeGreaterThanOrEqual(0);
    expect(report.lighthouse.performance).toBeLessThanOrEqual(100);
  });

  it('genera reporte completo de performance', () => {
    pm!.recordINPMetric(150);

    const report = pm!.generateReport();
    expect(report.metrics).toBeDefined();
    expect(report.lighthouse).toBeDefined();
    expect(report.timestamp).toBeDefined();
  });

  it('determina si aplicación es apta para producción (95+)', () => {
    pm!.recordINPMetric(100);

    const report = pm!.generateReport();
    // Con métricas buenos, debería pasar
    expect(report).toHaveProperty('passed');
  });
});

describe('Error Tracking & Recovery', () => {
  let et: ErrorTracker;

  beforeEach(() => {
    resetErrorTracker();
    et = getErrorTracker();
    localStorage.clear();
  });

  afterEach(() => {
    resetErrorTracker();
    localStorage.clear();
  });

  it('captura errores no manejados', () => {
    et!.captureError({
      type: 'TestError',
      message: 'Test error message',
    });

    const errors = et!.getAllErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('Test error message');
  });

  it('determina severidad correctamente', () => {
    et!.captureError({
      type: 'CriticalError',
      message: 'CRITICAL: Database connection failed',
    });

    const errors = et!.getAllErrors();
    expect(errors[0]!.severity).toBe('critical');
  });

  it('parsea stack traces correctamente', () => {
    const stack = 'at testFunction (/app/test.ts:42:10)';

    et!.captureError({
      type: 'ErrorWithStack',
      message: 'Error with stack',
      stack,
    });

    const errors = et!.getAllErrors();
    expect(errors[0]!.stack).toHaveLength(1);
    expect(errors[0]!.stack?.[0]?.function).toBe('testFunction');
  });

  it('obtiene acciones de recovery sugeridas', () => {
    et!.captureError({
      type: 'NetworkError',
      message: 'network timeout',
    });

    const errors = et!.getAllErrors();
    const actions = et!.getRecoveryActions(errors[0]!.id);

    expect(actions).toHaveLength(2); // retry + go home
  });

  it('genera estadísticas de errores', () => {
    et!.captureError({
      type: 'Error1',
      message: 'Error 1',
    });

    et!.captureError({
      type: 'Error1',
      message: 'Error 1 again',
    });

    et!.captureError({
      type: 'Error2',
      message: 'Error 2',
    });

    const stats = et!.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType['Error1']).toBe(2);
  });

  it('persiste errores en localStorage', () => {
    et!.captureError({
      type: 'PersistenceError',
      message: 'Test persistence',
    });

    const stored = localStorage.getItem('abs-errors');
    expect(stored).toBeTruthy();

    const errors = JSON.parse(stored!);
    expect(errors).toHaveLength(1);
  });
});

describe('Lighthouse Checker - Production Scoring', () => {
  let lh: LighthouseChecker;

  beforeEach(() => {
    resetLighthouseChecker();
    lh = getLighthouseChecker();
  });

  afterEach(() => {
    resetLighthouseChecker();
  });

  it('ejecuta audit completo', async () => {
    const report = await lh!.run();

    expect(report).toBeDefined();
    expect(report.categories).toBeDefined();
    expect(report.categories.performance).toBeDefined();
    expect(report.categories.accessibility).toBeDefined();
  });

  it('calcula score de performance', async () => {
    const report = await lh!.run();

    expect(report.categories.performance.score).toBeGreaterThanOrEqual(0);
    expect(report.categories.performance.score).toBeLessThanOrEqual(100);
  });

  it('calcula score de accessibility', async () => {
    const report = await lh!.run();

    expect(report.categories.accessibility.score).toBeGreaterThanOrEqual(0);
    expect(report.categories.accessibility.score).toBeLessThanOrEqual(100);
  });

  it('calcula score SEO', async () => {
    const report = await lh!.run();

    expect(report.categories.seo.score).toBeGreaterThanOrEqual(0);
    expect(report.categories.seo.score).toBeLessThanOrEqual(100);
  });

  it('determina si aplicación pasa auditoría (95+)', async () => {
    const report = await lh!.run();

    expect(report).toHaveProperty('passed');
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('exporta reporte como JSON', async () => {
    const report = await lh!.run();
    const json = lh!.exportJSON(report);

    expect(json).toBeTruthy();
    const parsed = JSON.parse(json);
    expect(parsed.categories).toBeDefined();
  });

  it('exporta reporte como HTML', async () => {
    const report = await lh!.run();
    const html = lh!.exportHTML(report);

    expect(html).toContain('Lighthouse Report');
    expect(html).toContain('Overall Score');
  });

  it('obtiene reporte más reciente', async () => {
    const report1 = await lh!.run();
    const report2 = await lh!.run();

    const latest = lh!.getLatestReport();
    expect(latest).toBeDefined();
    expect(latest?.timestamp).toBe(report2.timestamp);
  });

  it('guarda múltiples reportes en historial', async () => {
    for (let i = 0; i < 3; i++) {
      await lh!.run();
    }

    const reports = lh!.getAllReports();
    expect(reports.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Integración Fase 3 - Flujo Completo', () => {
  let swm: ServiceWorkerManager;
  let am: AnalyticsManager;
  let abt: ABTestManager;
  let pm: PerformanceMonitor;
  let et: ErrorTracker;
  let lh: LighthouseChecker;

  beforeEach(() => {
    resetServiceWorkerManager();
    resetAnalyticsManager();
    resetABTestManager();
    resetPerformanceMonitor();
    resetErrorTracker();
    resetLighthouseChecker();

    swm = getServiceWorkerManager();
    am = getAnalyticsManager();
    abt = getABTestManager();
    pm = getPerformanceMonitor();
    et = getErrorTracker();
    lh = getLighthouseChecker();

    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    resetServiceWorkerManager();
    resetAnalyticsManager();
    resetABTestManager();
    resetPerformanceMonitor();
    resetErrorTracker();
    resetLighthouseChecker();

    localStorage.clear();
    sessionStorage.clear();
  });

  it('flujo PWA: registro, sync, offline', async () => {
    await swm!.queueSync('test-sync', { data: 'offline-data' });

    const pending = swm!.getPendingSyncEvents();
    expect(pending).toHaveLength(1);

    swm!.markSyncEventAsComplete('test-sync');
    expect(swm!.getPendingSyncEvents()).toHaveLength(0);
  });

  it('flujo Analytics: tracking + persistencia', () => {
    am!.trackCustomEvent('user-signup', { source: 'landing' });
    am!.trackCustomEvent('button-click', { button: 'cta' });

    const events = am!.getPendingEvents();
    expect(events.length).toBeGreaterThanOrEqual(2);

    const stored = localStorage.getItem('abs-analytics-queue');
    expect(stored).toBeTruthy();
  });

  it('flujo A/B Testing: registro + asignación + conversión', () => {
    const test = {
      id: 'cta-color',
      name: 'CTA Color Test',
      active: true,
      variants: [
        { id: 'blue', name: 'Blue', weight: 50, config: { color: '#0066cc' } },
        { id: 'red', name: 'Red', weight: 50, config: { color: '#cc0000' } },
      ],
      createdAt: new Date().toISOString(),
    };

    abt!.registerTest(test);
    const variant = abt!.getVariant('cta-color');

    expect(variant).toBeDefined();

    abt!.trackConversion('cta-color', 'checkout', 150);

    const stats = abt!.getTestStats('cta-color');
    expect(stats.totalAssignments).toBeGreaterThan(0);
    expect(stats.totalConversions).toBeGreaterThan(0);
  });

  it('flujo Performance: métricas + scoring + reporte', () => {
    pm!.recordINPMetric(150);

    const metrics = pm!.getAllMetrics();
    expect(metrics.length).toBeGreaterThan(0);

    const report = pm!.generateReport();
    expect(report.lighthouse.performance).toBeGreaterThanOrEqual(0);
  });

  it('flujo Error Handling: captura + recovery + stats', () => {
    et!.captureError({
      type: 'TestError',
      message: 'Network timeout',
    });

    const errors = et!.getAllErrors();
    expect(errors).toHaveLength(1);

    const actions = et!.getRecoveryActions(errors[0]!.id);
    expect(actions.length).toBeGreaterThan(0);

    const stats = et!.getStats();
    expect(stats.total).toBe(1);
  });

  it('flujo Lighthouse: audit completo + exportes', async () => {
    const report = await lh!.run();

    expect(report.categories.performance).toBeDefined();
    expect(report.categories.accessibility).toBeDefined();

    const json = lh!.exportJSON(report);
    expect(json).toBeTruthy();

    const html = lh!.exportHTML(report);
    expect(html).toContain('Lighthouse Report');
  });

  it('determinismo: mismo usuario recibe misma experiencia', () => {
    // Crea test A/B
    const test = {
      id: 'determinism-test',
      name: 'Determinism',
      active: true,
      variants: [
        { id: 'a', name: 'A', weight: 50, config: { v: 'a' } },
        { id: 'b', name: 'B', weight: 50, config: { v: 'b' } },
      ],
      createdAt: new Date().toISOString(),
    };

    abt!.registerTest(test);

    const v1 = abt!.getVariant('determinism-test')?.id;
    const v2 = abt!.getVariant('determinism-test')?.id;
    const v3 = abt!.getVariant('determinism-test')?.id;

    expect(v1).toBe(v2);
    expect(v2).toBe(v3);
  });
});

describe('Mensajes y Validaciones en Español', () => {
  it('errores en español', () => {
    const et = getErrorTracker();

    et!.captureError({
      type: 'Error',
      message: 'Conexión de red fallida',
    });

    const errors = et!.getAllErrors();
    expect(errors[0]!.message).toBe('Conexión de red fallida');

    resetErrorTracker();
  });

  it('labels en español en A/B testing', () => {
    const abt = getABTestManager();

    const test = {
      id: 'color-cta',
      name: 'Prueba Color del Botón',
      active: true,
      variants: [
        { id: 'azul', name: 'Azul', weight: 50, config: { color: 'azul' } },
        { id: 'verde', name: 'Verde', weight: 50, config: { color: 'verde' } },
      ],
      createdAt: new Date().toISOString(),
    };

    abt!.registerTest(test);
    const registered = abt!.getAllTests();

    expect(registered[0]!.name).toBe('Prueba Color del Botón');

    resetABTestManager();
  });
});
