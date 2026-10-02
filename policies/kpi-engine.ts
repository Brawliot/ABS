/**
 * Motor de KPIs (Fase 3)
 * Calcula indicadores clave, compara períodos, genera alertas
 */

export interface KPI {
  readonly id: string;
  readonly nombre: string;
  readonly valor_actual: number;
  readonly valor_anterior?: number;
  readonly variacion_pct?: number;
  readonly unidad: string;
  readonly estado: 'ok' | 'warning' | 'critical';
  readonly fecha: string;
}

export interface KPIPeriodo {
  readonly periodo: string;
  readonly ingresos_centimos: number;
  readonly gastos_centimos: number;
  readonly margen_pct: number;
  readonly roi_pct: number;
  readonly cac_centimos: number; // Customer Acquisition Cost
  readonly ltv_centimos: number; // Lifetime Value
  readonly churn_rate: number;
}

export interface ComparativaPeriodos {
  readonly periodo1: string;
  readonly periodo2: string;
  readonly kpis: Array<{
    readonly nombre: string;
    readonly valor_p1: number;
    readonly valor_p2: number;
    readonly cambio_pct: number;
    readonly tendencia: 'positiva' | 'negativa' | 'neutral';
  }>;
}

export interface Alerta {
  readonly id: string;
  readonly kpi_id: string;
  readonly tipo: 'warning' | 'critical';
  readonly umbral: number;
  readonly valor_actual: number;
  readonly accion: string;
  readonly fecha: string;
  readonly activa: boolean;
}

export class MotorKPIs {
  /**
   * Calcula un KPI usando una fórmula
   */
  calcularKPI(
    id: string,
    nombre: string,
    formula: (datos: Record<string, number>) => number,
    datos: Record<string, number>,
    unidad: string = '',
  ): KPI {
    const valor = formula(datos);

    return {
      id,
      nombre,
      valor_actual: valor,
      unidad,
      estado: 'ok',
      fecha: new Date().toISOString().split('T')[0] || '',
    };
  }

  /**
   * Obtiene KPIs principales de un período
   */
  obtenerKPIsDelPeriodo(periodo: string, datos: {
    readonly ingresos_centimos: number;
    readonly gastos_centimos: number;
    readonly inversión_centimos: number;
    readonly clientes_activos: number;
    readonly pedidos: number;
  }): KPIPeriodo {
    const ingresos = datos.ingresos_centimos;
    const gastos = datos.gastos_centimos;
    const utilidad = ingresos - gastos;

    const margenPct = ingresos > 0 ? (utilidad / ingresos) * 100 : 0;
    const roiPct = datos.inversión_centimos > 0 ? (utilidad / datos.inversión_centimos) * 100 : 0;
    const cacCentimos = datos.clientes_activos > 0 ? gastos / datos.clientes_activos : 0;
    const ltv = datos.pedidos > 0 ? ingresos / datos.pedidos : 0;
    const churnRate = 0; // Calculado en producción con datos históricos

    const kpis: KPIPeriodo = {
      periodo: periodo || '',
      ingresos_centimos: ingresos,
      gastos_centimos: gastos,
      margen_pct: margenPct,
      roi_pct: roiPct,
      cac_centimos: cacCentimos,
      ltv_centimos: ltv,
      churn_rate: churnRate,
    };
    return kpis;
  }

  /**
   * Compara KPIs entre dos períodos
   */
  compararPeriodos(p1: KPIPeriodo, p2: KPIPeriodo): ComparativaPeriodos {
    const calcularCambio = (anterior: number, actual: number): number => {
      if (anterior === 0) return 0;
      return ((actual - anterior) / anterior) * 100;
    };

    const comparativa: ComparativaPeriodos = {
      periodo1: p1.periodo || '',
      periodo2: p2.periodo || '',
      kpis: [
        {
          nombre: 'Ingresos',
          valor_p1: p1.ingresos_centimos,
          valor_p2: p2.ingresos_centimos,
          cambio_pct: calcularCambio(p1.ingresos_centimos, p2.ingresos_centimos),
          tendencia:
            p2.ingresos_centimos > p1.ingresos_centimos
              ? 'positiva'
              : p2.ingresos_centimos < p1.ingresos_centimos
                ? 'negativa'
                : 'neutral',
        },
        {
          nombre: 'Gastos',
          valor_p1: p1.gastos_centimos,
          valor_p2: p2.gastos_centimos,
          cambio_pct: calcularCambio(p1.gastos_centimos, p2.gastos_centimos),
          tendencia:
            p2.gastos_centimos < p1.gastos_centimos
              ? 'positiva'
              : p2.gastos_centimos > p1.gastos_centimos
                ? 'negativa'
                : 'neutral',
        },
        {
          nombre: 'Margen %',
          valor_p1: p1.margen_pct,
          valor_p2: p2.margen_pct,
          cambio_pct: calcularCambio(p1.margen_pct, p2.margen_pct),
          tendencia:
            p2.margen_pct > p1.margen_pct
              ? 'positiva'
              : p2.margen_pct < p1.margen_pct
                ? 'negativa'
                : 'neutral',
        },
        {
          nombre: 'ROI %',
          valor_p1: p1.roi_pct,
          valor_p2: p2.roi_pct,
          cambio_pct: calcularCambio(p1.roi_pct, p2.roi_pct),
          tendencia:
            p2.roi_pct > p1.roi_pct
              ? 'positiva'
              : p2.roi_pct < p1.roi_pct
                ? 'negativa'
                : 'neutral',
        },
      ],
    };
    return comparativa;
  }

  /**
   * Crea una alerta basada en un KPI
   */
  crearAlerta(
    kpiId: string,
    tipo: 'warning' | 'critical',
    umbral: number,
    valorActual: number,
    accion: string,
  ): Alerta | null {
    if (valorActual < umbral) {
      const fecha = new Date().toISOString().split('T')[0] || '';
      return {
        id: `alerta-${Date.now()}`,
        kpi_id: kpiId,
        tipo,
        umbral,
        valor_actual: valorActual,
        accion,
        fecha,
        activa: true,
      };
    }
    return null;
  }

  /**
   * Evalúa el estado de un KPI y retorna estado
   */
  evaluarEstado(valor: number, umbralWarning: number, umbralCritical: number): 'ok' | 'warning' | 'critical' {
    if (valor < umbralCritical) return 'critical';
    if (valor < umbralWarning) return 'warning';
    return 'ok';
  }
}
