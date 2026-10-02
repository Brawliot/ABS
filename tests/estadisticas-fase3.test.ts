/**
 * Tests de Estadísticas Fase 3
 * KPIs, predicciones, dashboard, alertas
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { MotorKPIs, type KPIPeriodo } from '../policies/kpi-engine.js';
import { MotorPredicciones } from '../policies/predicciones.js';
import { GeneradorDashboard } from '../web/dashboard-estadisticas.js';
import { SqliteEstadisticasStore } from '../adapters/sqlite-estadisticas-store.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('Estadísticas Fase 3', () => {
  describe('MotorKPIs', () => {
    it('calcula KPI con fórmula personalizada', () => {
      const motor = new MotorKPIs();
      const kpi = motor.calcularKPI(
        'kpi-test',
        'Test KPI',
        (datos) => datos.ingresos - datos.gastos,
        { ingresos: 100000, gastos: 30000 },
        'EUR',
      );

      expect(kpi.id).toBe('kpi-test');
      expect(kpi.valor_actual).toBe(70000);
      expect(kpi.unidad).toBe('EUR');
    });

    it('obtiene KPIs de un período', () => {
      const motor = new MotorKPIs();
      const kpis = motor.obtenerKPIsDelPeriodo('2026-09', {
        ingresos_centimos: 500000,
        gastos_centimos: 150000,
        inversión_centimos: 100000,
        clientes_activos: 50,
        pedidos: 100,
      });

      expect(kpis.periodo).toBe('2026-09');
      expect(kpis.margen_pct).toBeCloseTo(70, 1); // (500000-150000)/500000*100
      expect(kpis.roi_pct).toBeCloseTo(350, 1); // (500000-150000)/100000*100
      expect(kpis.cac_centimos).toBe(3000); // 150000/50
      expect(kpis.ltv_centimos).toBe(5000); // 500000/100
    });

    it('compara períodos', () => {
      const motor = new MotorKPIs();

      const p1: KPIPeriodo = {
        periodo: '2026-08',
        ingresos_centimos: 400000,
        gastos_centimos: 100000,
        margen_pct: 75,
        roi_pct: 300,
        cac_centimos: 2000,
        ltv_centimos: 8000,
        churn_rate: 5,
      };

      const p2: KPIPeriodo = {
        periodo: '2026-09',
        ingresos_centimos: 500000,
        gastos_centimos: 150000,
        margen_pct: 70,
        roi_pct: 350,
        cac_centimos: 3000,
        ltv_centimos: 5000,
        churn_rate: 5,
      };

      const comparativa = motor.compararPeriodos(p1, p2);

      expect(comparativa.periodo1).toBe('2026-08');
      expect(comparativa.periodo2).toBe('2026-09');
      expect(comparativa.kpis[0].nombre).toBe('Ingresos');
      expect(comparativa.kpis[0].cambio_pct).toBeCloseTo(25, 1); // (500000-400000)/400000*100
      expect(comparativa.kpis[0].tendencia).toBe('positiva');
    });

    it('crea alerta si KPI cae por debajo de umbral', () => {
      const motor = new MotorKPIs();
      const alerta = motor.crearAlerta('kpi-margen', 'critical', 20, 15, 'Revisar costos');

      expect(alerta).not.toBeNull();
      expect(alerta?.tipo).toBe('critical');
      expect(alerta?.valor_actual).toBe(15);
    });

    it('no crea alerta si KPI está sobre umbral', () => {
      const motor = new MotorKPIs();
      const alerta = motor.crearAlerta('kpi-margen', 'critical', 20, 25, 'Revisar costos');

      expect(alerta).toBeNull();
    });

    it('evalúa estado de KPI', () => {
      const motor = new MotorKPIs();

      expect(motor.evaluarEstado(50, 30, 10)).toBe('ok');
      expect(motor.evaluarEstado(20, 30, 10)).toBe('warning');
      expect(motor.evaluarEstado(5, 30, 10)).toBe('critical');
    });
  });

  describe('MotorPredicciones', () => {
    it('proyecta tendencia lineal simple', () => {
      const motor = new MotorPredicciones();
      const datos = [100, 110, 120, 130, 140];
      const tendencia = motor.proyectarTendencia(datos, 3);

      expect(tendencia.valores).toEqual(datos);
      expect(tendencia.proyecciones).toHaveLength(3);
      expect(tendencia.proyecciones[0]).toBeGreaterThan(140); // Tendencia creciente
      expect(tendencia.confianza_pct).toBeGreaterThan(80);
    });

    it('predice demanda para próximas semanas', () => {
      const motor = new MotorPredicciones();
      const historico = [100, 110, 120, 130, 140, 150];
      const predicciones = motor.predecirDemanda(historico, 4);

      expect(predicciones).toHaveLength(4);
      expect(predicciones[0].semana).toBe(7);
      expect(predicciones[0].demanda_predicha).toBeGreaterThan(0);
      expect(
        predicciones[0].intervalo_confianza_min <=
          predicciones[0].demanda_predicha,
      ).toBe(true);
      expect(
        predicciones[0].intervalo_confianza_max >=
          predicciones[0].demanda_predicha,
      ).toBe(true);
    });

    it('detecta anomalías con Z-score', () => {
      const motor = new MotorPredicciones();
      const datos = [
        { fecha: '2026-09-01', valor: 100 },
        { fecha: '2026-09-02', valor: 105 },
        { fecha: '2026-09-03', valor: 102 },
        { fecha: '2026-09-04', valor: 500 }, // Anomalía
        { fecha: '2026-09-05', valor: 98 },
      ];

      const anomalias = motor.detectarAnomalias(datos, 2);

      expect(anomalias).toHaveLength(5);
      const anomalia500 = anomalias.find((a) => a.valor === 500);
      expect(anomalia500?.es_anomalia).toBe(true);
      expect(Math.abs(anomalia500?.z_score || 0)).toBeGreaterThan(2);
    });

    it('genera forecast con intervalos de confianza', () => {
      const motor = new MotorPredicciones();
      const historico = [1000, 1100, 1200, 1300, 1400, 1500];
      const forecast = motor.calcularForecast('Ingresos', historico, 30);

      expect(forecast.metrica).toBe('Ingresos');
      expect(forecast.horizonte_dias).toBe(30);
      expect(forecast.predicciones.length).toBeGreaterThan(0);
      expect(forecast.confianza_general_pct).toBeGreaterThan(0);

      // Verificar estructura de predicciones
      const primera = forecast.predicciones[0];
      expect(primera.intervalo_min <= primera.valor).toBe(true);
      expect(primera.intervalo_max >= primera.valor).toBe(true);
    });

    it('valida predicción dentro de rango', () => {
      const motor = new MotorPredicciones();

      expect(motor.validarPrediccion(100, 50, 150)).toBe(true);
      expect(motor.validarPrediccion(100, 110, 150)).toBe(false);
      expect(motor.validarPrediccion(100, 50, 90)).toBe(false);
    });

    it('requiere mínimo 2 puntos para proyectar', () => {
      const motor = new MotorPredicciones();

      expect(() => motor.proyectarTendencia([], 3)).toThrow();
      expect(() => motor.proyectarTendencia([100], 3)).toThrow();
    });
  });

  describe('GeneradorDashboard', () => {
    it('genera dashboard completo', () => {
      const generador = new GeneradorDashboard();

      const kpisPeriodo: KPIPeriodo = {
        periodo: '2026-09',
        ingresos_centimos: 500000,
        gastos_centimos: 150000,
        margen_pct: 70,
        roi_pct: 350,
        cac_centimos: 3000,
        ltv_centimos: 5000,
        churn_rate: 5,
      };

      const historico: KPIPeriodo[] = [
        {
          periodo: '2026-07',
          ingresos_centimos: 300000,
          gastos_centimos: 100000,
          margen_pct: 66,
          roi_pct: 200,
          cac_centimos: 2000,
          ltv_centimos: 6000,
          churn_rate: 5,
        },
        {
          periodo: '2026-08',
          ingresos_centimos: 400000,
          gastos_centimos: 120000,
          margen_pct: 70,
          roi_pct: 280,
          cac_centimos: 2400,
          ltv_centimos: 8000,
          churn_rate: 5,
        },
      ];

      const dashboard = generador.generarDashboard(
        '2026-09',
        kpisPeriodo,
        historico,
        [],
        [
          { fecha: '2026-09-01', ingresos: 50000, gastos: 15000, clientes: 10 },
          { fecha: '2026-09-02', ingresos: 55000, gastos: 16000, clientes: 11 },
        ],
      );

      expect(dashboard.periodo).toBe('2026-09');
      expect(dashboard.kpis_principales.length).toBeGreaterThan(0);
      expect(dashboard.graficos_linea.length).toBeGreaterThan(0);
      expect(dashboard.graficos_pastel.length).toBeGreaterThan(0);
      expect(dashboard.graficos_barra.length).toBeGreaterThan(0);
      expect(dashboard.predicciones.length).toBeGreaterThan(0);
    });

    it('genera resumen ejecutivo', () => {
      const generador = new GeneradorDashboard();
      const kpisPeriodo: KPIPeriodo = {
        periodo: '2026-09',
        ingresos_centimos: 500000,
        gastos_centimos: 150000,
        margen_pct: 70,
        roi_pct: 350,
        cac_centimos: 3000,
        ltv_centimos: 5000,
        churn_rate: 5,
      };

      const dashboard = generador.generarDashboard(
        '2026-09',
        kpisPeriodo,
        [],
        [],
        [],
      );

      const resumen = generador.generarResumen(dashboard);

      expect(resumen).toContain('Dashboard');
      expect(resumen).toContain('2026-09');
      expect(resumen).toContain('EUR');
    });
  });

  describe('SqliteEstadisticasStore', () => {
    it('guarda y recupera snapshots de KPI', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-stats-'));
      dirs.push(dir);
      const store = new SqliteEstadisticasStore(join(dir, 'db.sqlite'));

      store.guardarSnapshot(
        'tenant1',
        '2026-09-30',
        '2026-09',
        'kpi-margen',
        70.5,
        'ok',
        { detalles: 'test' },
      );

      const snapshots = store.obtenerSnapshotsPeriodo('tenant1', '2026-09');

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].kpi_id).toBe('kpi-margen');
      expect(snapshots[0].valor).toBe(70.5);

      store.close();
    });

    it('obtiene histórico de un KPI', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-stats-'));
      dirs.push(dir);
      const store = new SqliteEstadisticasStore(join(dir, 'db.sqlite'));

      for (let i = 1; i <= 3; i++) {
        store.guardarSnapshot(
          'tenant1',
          `2026-0${i}-30`,
          `2026-0${i}`,
          'kpi-margen',
          60 + i * 5,
          'ok',
          {},
        );
      }

      const historico = store.obtenerHistoricoKPI('tenant1', 'kpi-margen', 12);

      expect(historico.length).toBeGreaterThan(0);
      expect(historico[0].kpi_id).toBe('kpi-margen');

      store.close();
    });

    it('guarda y recupera datos históricos', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-stats-'));
      dirs.push(dir);
      const store = new SqliteEstadisticasStore(join(dir, 'db.sqlite'));

      store.guardarDatoHistorico('tenant1', '2026-09-01', 'ingresos', 50000, {
        categoria: 'ventas',
      });
      store.guardarDatoHistorico('tenant1', '2026-09-02', 'ingresos', 55000, {
        categoria: 'ventas',
      });

      const datos = store.obtenerDatosHistoricos(
        'tenant1',
        'ingresos',
        '2026-09-01',
        '2026-09-30',
      );

      expect(datos).toHaveLength(2);
      expect(datos[0].metrica).toBe('ingresos');

      store.close();
    });

    it('guarda y recupera alertas', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-stats-'));
      dirs.push(dir);
      const store = new SqliteEstadisticasStore(join(dir, 'db.sqlite'));

      store.guardarAlerta(
        'tenant1',
        'kpi-margen',
        'critical',
        20,
        15,
        'Revisar costos',
        '2026-09-15',
      );

      const alertas = store.obtenerAlertasActivas('tenant1');

      expect(alertas).toHaveLength(1);
      expect(alertas[0].tipo).toBe('critical');
      expect(alertas[0].activa).toBe(true);

      store.close();
    });

    it('desactiva alertas', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-stats-'));
      dirs.push(dir);
      const store = new SqliteEstadisticasStore(join(dir, 'db.sqlite'));

      store.guardarAlerta(
        'tenant1',
        'kpi-margen',
        'warning',
        30,
        25,
        'Revisar',
        '2026-09-15',
      );

      let alertas = store.obtenerAlertasActivas('tenant1');
      expect(alertas).toHaveLength(1);

      if (alertas[0].seq) {
        store.desactivarAlerta(alertas[0].seq);
      }

      alertas = store.obtenerAlertasActivas('tenant1');
      expect(alertas).toHaveLength(0);

      store.close();
    });

    it('obtiene tendencia de métrica', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-stats-'));
      dirs.push(dir);
      const store = new SqliteEstadisticasStore(join(dir, 'db.sqlite'));

      const fechas = ['2026-09-01', '2026-09-02', '2026-09-03'];
      for (let i = 0; i < fechas.length; i++) {
        store.guardarDatoHistorico(
          'tenant1',
          fechas[i],
          'ingresos',
          100000 + i * 10000,
        );
      }

      const tendencia = store.obtenerTendencia('tenant1', 'ingresos', 6);

      expect(tendencia).toHaveLength(3);
      expect(tendencia[0].valor).toBe(100000);
      expect(tendencia[1].valor).toBe(110000);
    });
  });
});
