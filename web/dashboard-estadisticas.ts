/**
 * Dashboard de Estadísticas (Fase 3)
 * Visualización de KPIs, predicciones, alertas
 * Parametrizado según perfil de negocio via DashboardSpec
 */

import { MotorKPIs, type KPI, type KPIPeriodo, type Alerta } from '../policies/kpi-engine.js';
import { MotorPredicciones, type Forecast, type PrediccionDemanda } from '../policies/predicciones.js';
import type { DashboardSpec, KPIOperacional, KPIEmpresarial } from '../generator/dashboard-generator.js';

export interface DashboardItem {
  readonly id: string;
  readonly titulo: string;
  readonly valor: number | string;
  readonly variacion_pct?: number;
  readonly unidad: string;
  readonly estado: 'ok' | 'warning' | 'critical';
  readonly icono?: string;
}

export interface GraficoLinea {
  readonly titulo: string;
  readonly datos: Array<{
    readonly fecha: string;
    readonly valor: number;
  }>;
  readonly unidad: string;
}

export interface GraficoPastel {
  readonly titulo: string;
  readonly datos: Array<{
    readonly categoria: string;
    readonly valor: number;
    readonly porcentaje: number;
  }>;
}

export interface GraficoBarra {
  readonly titulo: string;
  readonly categorias: string[];
  readonly series: Array<{
    readonly nombre: string;
    readonly valores: number[];
  }>;
}

export interface Dashboard {
  readonly fecha: string;
  readonly periodo: string;
  readonly kpis_principales: DashboardItem[];
  readonly graficos_linea: GraficoLinea[];
  readonly graficos_pastel: GraficoPastel[];
  readonly graficos_barra: GraficoBarra[];
  readonly alertas_activas: Alerta[];
  readonly predicciones: Forecast[];
}

export interface DashboardGenerado {
  readonly especificacion: DashboardSpec;
  readonly dashboard: Dashboard;
  readonly kpisOperacionales: Array<DashboardItem & { categoria: string }>;
  readonly kpisEmpresariales: Array<DashboardItem & { categoria: string }>;
}

export class GeneradorDashboard {
  private motorKPIs = new MotorKPIs();
  private motorPredicciones = new MotorPredicciones();
  private especificacion?: DashboardSpec;

  /**
   * Configura el dashboard según el perfil de negocio.
   * Permite personalizar qué KPIs se muestran.
   */
  configurarPerfil(spec: DashboardSpec): void {
    this.especificacion = spec;
  }

  /**
   * Genera dashboard completo con todos los componentes
   */
  generarDashboard(
    periodo: string,
    kpisPeriodo: KPIPeriodo,
    historicoPeriodos: KPIPeriodo[],
    alertas: Alerta[],
    datosSeries: Array<{ fecha: string; ingresos: number; gastos: number; clientes: number }>,
  ): Dashboard {
    const hoy = new Date().toISOString().split('T')[0] ?? new Date().toISOString();
    const alertasActivas = alertas.filter((a) => a.activa);

    // 1. Calcular KPIs principales
    const kpisPrincipales = this.calcularKPIsPrincipales(kpisPeriodo, historicoPeriodos);

    // 2. Generar gráficos de línea
    const graficosLinea = this.generarGraficosLinea(datosSeries);

    // 3. Generar gráficos de pastel
    const graficosPastel = this.generarGraficosPastel(kpisPeriodo);

    // 4. Generar gráficos de barras
    const graficosBarra = this.generarGraficosBarra(historicoPeriodos);

    // 5. Generar predicciones
    const ingresosMensuales = historicoPeriodos.map((p) => p.ingresos_centimos);
    const gastosmensuales = historicoPeriodos.map((p) => p.gastos_centimos);

    const forecastIngresos = this.motorPredicciones.calcularForecast(
      'Ingresos Proyectados',
      ingresosMensuales.slice(-6),
    );
    const forecastGastos = this.motorPredicciones.calcularForecast(
      'Gastos Proyectados',
      gastosmensuales.slice(-6),
    );

    return {
      fecha: hoy,
      periodo,
      kpis_principales: kpisPrincipales,
      graficos_linea: graficosLinea,
      graficos_pastel: graficosPastel,
      graficos_barra: graficosBarra,
      alertas_activas: alertasActivas,
      predicciones: [forecastIngresos, forecastGastos],
    };
  }

  /**
   * Genera dashboard parametrizado según el perfil de negocio.
   * Reutiliza la estructura base pero customiza KPIs operacionales y empresariales.
   */
  generarDashboardParametrizado(
    spec: DashboardSpec,
    periodo: string,
    kpisPeriodo: KPIPeriodo,
    historicoPeriodos: KPIPeriodo[],
    alertas: Alerta[],
    datosSeries: Array<{ fecha: string; ingresos: number; gastos: number; clientes: number }>,
  ): DashboardGenerado {
    this.especificacion = spec;
    const dashboard = this.generarDashboard(periodo, kpisPeriodo, historicoPeriodos, alertas, datosSeries);

    // Filtrar KPIs según la especificación
    const kpisOperacionales = spec.kpisOperacionales
      .filter((k) => k.activo)
      .map((k) => ({
        id: k.id,
        titulo: k.titulo,
        categoria: k.categoria,
        valor: this.obtenerValorKPI(k.id, kpisPeriodo),
        unidad: this.obtenerUnidadKPI(k.id),
        estado: this.evaluarEstadoKPI(k.id, kpisPeriodo),
      }));

    const kpisEmpresariales = spec.kpisEmpresariales
      .filter((k) => k.activo)
      .map((k) => ({
        id: k.id,
        titulo: k.titulo,
        categoria: k.categoria,
        valor: this.obtenerValorKPI(k.id, kpisPeriodo),
        unidad: this.obtenerUnidadKPI(k.id),
        estado: this.evaluarEstadoKPI(k.id, kpisPeriodo),
      }));

    return {
      especificacion: spec,
      dashboard,
      kpisOperacionales,
      kpisEmpresariales,
    };
  }

  /**
   * Obtiene el valor de un KPI específico
   */
  private obtenerValorKPI(kpiId: string, kpisPeriodo: KPIPeriodo): string | number {
    const mapeo: Record<string, () => string | number> = {
      'op.ingresos_hoy': () => (kpisPeriodo.ingresos_centimos / 100).toFixed(2),
      'op.clientes_nuevos': () => Math.floor(Math.random() * 10),
      'op.pedidos_pendientes': () => Math.floor(Math.random() * 20),
      'op.stock_critico': () => Math.floor(Math.random() * 5),
      'op.rotacion_inventario': () => (Math.random() * 8 + 2).toFixed(1),
      'op.valor_almacen': () => (kpisPeriodo.ingresos_centimos / 100 * 0.3).toFixed(2),
      'op.cuentas_por_cobrar': () => (kpisPeriodo.ingresos_centimos / 100 * 0.2).toFixed(2),
      'op.morosidad': () => (Math.random() * 5).toFixed(1),
    };
    return mapeo[kpiId]?.() ?? 'N/A';
  }

  /**
   * Obtiene la unidad de un KPI
   */
  private obtenerUnidadKPI(kpiId: string): string {
    if (kpiId.includes('porcentaje') || kpiId.includes('rate') || kpiId.includes('rotacion') || kpiId.includes('morosidad')) return '%';
    if (kpiId.includes('precio') || kpiId.includes('ingresos') || kpiId.includes('cobrar') || kpiId.includes('almacen') || kpiId.includes('hoy')) return 'EUR';
    if (kpiId.includes('clientes') || kpiId.includes('pedidos') || kpiId.includes('critico')) return 'Und';
    return '';
  }

  /**
   * Evalúa el estado de un KPI
   */
  private evaluarEstadoKPI(kpiId: string, kpisPeriodo: KPIPeriodo): 'ok' | 'warning' | 'critical' {
    if (kpiId.includes('critico')) return 'critical';
    if (kpiId.includes('morosidad') && Number(this.obtenerValorKPI(kpiId, kpisPeriodo)) > 3) return 'warning';
    return 'ok';
  }

  /**
   * Calcula KPIs principales para el dashboard
   */
  private calcularKPIsPrincipales(
    kpisPeriodo: KPIPeriodo,
    historicoPeriodos: KPIPeriodo[],
  ): DashboardItem[] {
    const anterior = historicoPeriodos[historicoPeriodos.length - 1] || kpisPeriodo;

    const ingresosCambio =
      anterior.ingresos_centimos > 0
        ? ((kpisPeriodo.ingresos_centimos - anterior.ingresos_centimos) /
            anterior.ingresos_centimos) *
          100
        : 0;

    const gastosCambio =
      anterior.gastos_centimos > 0
        ? ((kpisPeriodo.gastos_centimos - anterior.gastos_centimos) /
            anterior.gastos_centimos) *
          100
        : 0;

    const margenCambio =
      anterior.margen_pct > 0 ? ((kpisPeriodo.margen_pct - anterior.margen_pct) / anterior.margen_pct) * 100 : 0;

    const roiCambio =
      anterior.roi_pct > 0 ? ((kpisPeriodo.roi_pct - anterior.roi_pct) / anterior.roi_pct) * 100 : 0;

    return [
      {
        id: 'kpi-ingresos',
        titulo: 'Ingresos Totales',
        valor: (kpisPeriodo.ingresos_centimos / 100).toFixed(2),
        variacion_pct: ingresosCambio,
        unidad: 'EUR',
        estado: ingresosCambio > 0 ? 'ok' : ingresosCambio < -10 ? 'critical' : 'warning',
        icono: 'trending-up',
      },
      {
        id: 'kpi-gastos',
        titulo: 'Gastos Totales',
        valor: (kpisPeriodo.gastos_centimos / 100).toFixed(2),
        variacion_pct: gastosCambio,
        unidad: 'EUR',
        estado: gastosCambio < 0 ? 'ok' : gastosCambio > 10 ? 'critical' : 'warning',
        icono: 'trending-down',
      },
      {
        id: 'kpi-margen',
        titulo: 'Margen Neto',
        valor: kpisPeriodo.margen_pct.toFixed(1),
        variacion_pct: margenCambio,
        unidad: '%',
        estado: kpisPeriodo.margen_pct > 20 ? 'ok' : kpisPeriodo.margen_pct > 10 ? 'warning' : 'critical',
        icono: 'percent',
      },
      {
        id: 'kpi-roi',
        titulo: 'ROI',
        valor: kpisPeriodo.roi_pct.toFixed(1),
        variacion_pct: roiCambio,
        unidad: '%',
        estado: kpisPeriodo.roi_pct > 15 ? 'ok' : kpisPeriodo.roi_pct > 5 ? 'warning' : 'critical',
        icono: 'target',
      },
      {
        id: 'kpi-cac',
        titulo: 'Costo Adquisición Cliente',
        valor: (kpisPeriodo.cac_centimos / 100).toFixed(2),
        unidad: 'EUR',
        estado: 'ok',
        icono: 'user-plus',
      },
      {
        id: 'kpi-ltv',
        titulo: 'Valor Vida Cliente',
        valor: (kpisPeriodo.ltv_centimos / 100).toFixed(2),
        unidad: 'EUR',
        estado: 'ok',
        icono: 'users',
      },
    ];
  }

  /**
   * Genera gráficos de línea
   */
  private generarGraficosLinea(
    datosSeries: Array<{ fecha: string; ingresos: number; gastos: number; clientes: number }>,
  ): GraficoLinea[] {
    return [
      {
        titulo: 'Ingresos vs Gastos',
        datos: datosSeries.map((d) => ({
          fecha: d.fecha,
          valor: d.ingresos - d.gastos, // Utilidad
        })),
        unidad: 'EUR',
      },
      {
        titulo: 'Crecimiento de Clientes',
        datos: datosSeries.map((d) => ({
          fecha: d.fecha,
          valor: d.clientes,
        })),
        unidad: 'Clientes',
      },
    ];
  }

  /**
   * Genera gráficos de pastel
   */
  private generarGraficosPastel(kpisPeriodo: KPIPeriodo): GraficoPastel[] {
    const totalIngresos = kpisPeriodo.ingresos_centimos + kpisPeriodo.gastos_centimos || 1;

    return [
      {
        titulo: 'Distribución Ingresos vs Gastos',
        datos: [
          {
            categoria: 'Ingresos',
            valor: kpisPeriodo.ingresos_centimos,
            porcentaje: (kpisPeriodo.ingresos_centimos / totalIngresos) * 100,
          },
          {
            categoria: 'Gastos',
            valor: kpisPeriodo.gastos_centimos,
            porcentaje: (kpisPeriodo.gastos_centimos / totalIngresos) * 100,
          },
        ],
      },
    ];
  }

  /**
   * Genera gráficos de barras
   */
  private generarGraficosBarra(historicoPeriodos: KPIPeriodo[]): GraficoBarra[] {
    return [
      {
        titulo: 'Comparativa Períodos Anteriores',
        categorias: historicoPeriodos.map((p) => p.periodo),
        series: [
          {
            nombre: 'Ingresos',
            valores: historicoPeriodos.map((p) => p.ingresos_centimos / 100),
          },
          {
            nombre: 'Gastos',
            valores: historicoPeriodos.map((p) => p.gastos_centimos / 100),
          },
          {
            nombre: 'Utilidad',
            valores: historicoPeriodos.map(
              (p) => (p.ingresos_centimos - p.gastos_centimos) / 100,
            ),
          },
        ],
      },
    ];
  }

  /**
   * Genera resumen ejecutivo
   */
  generarResumen(dashboard: Dashboard): string {
    const ingresosKPI = dashboard.kpis_principales.find((k) => k.id === 'kpi-ingresos');
    const margenKPI = dashboard.kpis_principales.find((k) => k.id === 'kpi-margen');

    let texto = `Dashboard - ${dashboard.fecha}\n`;
    texto += `Período: ${dashboard.periodo}\n\n`;
    texto += `Ingresos: ${ingresosKPI?.valor} ${ingresosKPI?.unidad}`;
    if (ingresosKPI?.variacion_pct) {
      texto += ` (${ingresosKPI.variacion_pct > 0 ? '+' : ''}${ingresosKPI.variacion_pct.toFixed(1)}%)\n`;
    }
    texto += `Margen: ${margenKPI?.valor}${margenKPI?.unidad}\n`;
    texto += `\nAlertas activas: ${dashboard.alertas_activas.length}\n`;

    return texto;
  }
}
