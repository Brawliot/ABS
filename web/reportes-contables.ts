/**
 * Generador de Reportes Contables (Fase 3)
 * Balance, P&L, Flujo de Efectivo
 */

export interface BalanceGeneralLinea {
  readonly cuenta: string;
  readonly descripcion: string;
  readonly monto_centimos: number;
}

export interface BalanceGeneral {
  readonly fecha: string;
  readonly activos: BalanceGeneralLinea[];
  readonly pasivos: BalanceGeneralLinea[];
  readonly patrimonio: BalanceGeneralLinea[];
  readonly total_activos: number;
  readonly total_pasivos: number;
  readonly total_patrimonio: number;
  readonly balanceado: boolean;
}

export interface PyLLinea {
  readonly concepto: string;
  readonly monto_centimos: number;
}

export interface PerdidayGanancia {
  readonly periodo: string; // "2026-09-01 a 2026-09-30"
  readonly ingresos: PyLLinea[];
  readonly costos: PyLLinea[];
  readonly gastos: PyLLinea[];
  readonly total_ingresos: number;
  readonly total_costos: number;
  readonly total_gastos: number;
  readonly utilidad_bruta: number;
  readonly utilidad_neta: number;
  readonly margen_neto_pct: number;
}

export interface FlujoEfectivoLinea {
  readonly concepto: string;
  readonly monto_centimos: number;
  readonly tipo: 'operativo' | 'inversión' | 'financiero';
}

export interface FlujoEfectivo {
  readonly periodo: string;
  readonly lineas: FlujoEfectivoLinea[];
  readonly flujo_operativo: number;
  readonly flujo_inversion: number;
  readonly flujo_financiero: number;
  readonly flujo_neto: number;
  readonly saldo_inicial: number;
  readonly saldo_final: number;
}

export class GeneradorReportesContables {
  /**
   * Genera Balance General a una fecha
   */
  generarBalance(
    fecha: string,
    asientos: ReadonlyArray<{
      readonly cuenta_deudora: string;
      readonly cuenta_acreedora: string;
      readonly importe_centimos: number;
      readonly fecha: string;
    }>,
  ): BalanceGeneral {
    // Filtrar asientos hasta la fecha
    const asientosAFecha = asientos.filter((a) => a.fecha <= fecha);

    // Agrupar por cuenta y calcular saldos (débito - crédito)
    const saldos = new Map<string, number>();
    for (const asiento of asientosAFecha) {
      const deudor = saldos.get(asiento.cuenta_deudora) ?? 0;
      const acreedor = saldos.get(asiento.cuenta_acreedora) ?? 0;

      saldos.set(asiento.cuenta_deudora, deudor + asiento.importe_centimos);
      saldos.set(asiento.cuenta_acreedora, acreedor - asiento.importe_centimos);
    }

    // Clasificar cuentas
    const activos: BalanceGeneralLinea[] = [];
    const pasivos: BalanceGeneralLinea[] = [];
    const patrimonio: BalanceGeneralLinea[] = [];

    const cuentasClasificacion: Record<string, { tipo: string; desc: string }> = {
      '100': { tipo: 'activo', desc: 'Caja' },
      '110': { tipo: 'activo', desc: 'Bancos' },
      '120': { tipo: 'activo', desc: 'Inversiones' },
      '200': { tipo: 'activo', desc: 'Cuentas por Cobrar' },
      '210': { tipo: 'activo', desc: 'Clientes' },
      '220': { tipo: 'activo', desc: 'Documentos por Cobrar' },
      '300': { tipo: 'activo', desc: 'Inventario' },
      '400': { tipo: 'pasivo', desc: 'Cuentas por Pagar' },
      '410': { tipo: 'pasivo', desc: 'Proveedores' },
      '420': { tipo: 'pasivo', desc: 'Impuestos por Pagar' },
      '500': { tipo: 'patrimonio', desc: 'Capital' },
      '510': { tipo: 'patrimonio', desc: 'Resultados' },
    };

    for (const [cuenta, saldo] of saldos) {
      if (saldo === 0) continue;

      const info = cuentasClasificacion[cuenta] || {
        tipo: 'activo',
        desc: `Cuenta ${cuenta}`,
      };

      const linea: BalanceGeneralLinea = {
        cuenta,
        descripcion: info.desc,
        monto_centimos: Math.abs(saldo),
      };

      if (info.tipo === 'activo') activos.push(linea);
      else if (info.tipo === 'pasivo') pasivos.push(linea);
      else patrimonio.push(linea);
    }

    const totalActivos = activos.reduce((sum, l) => sum + l.monto_centimos, 0);
    const totalPasivos = pasivos.reduce((sum, l) => sum + l.monto_centimos, 0);
    const totalPatrimonio = patrimonio.reduce(
      (sum, l) => sum + l.monto_centimos,
      0,
    );

    return {
      fecha,
      activos,
      pasivos,
      patrimonio,
      total_activos: totalActivos,
      total_pasivos: totalPasivos,
      total_patrimonio: totalPatrimonio,
      balanceado: totalActivos === totalPasivos + totalPatrimonio,
    };
  }

  /**
   * Genera Pérdida y Ganancia (P&L) en un período
   */
  generarPyL(
    desde: string,
    hasta: string,
    asientos: ReadonlyArray<{
      readonly cuenta_deudora: string;
      readonly cuenta_acreedora: string;
      readonly importe_centimos: number;
      readonly fecha: string;
      readonly concepto: string;
    }>,
  ): PerdidayGanancia {
    // Filtrar asientos en rango - usar comparación numérica de fechas
    const desdeNum = new Date(desde).getTime();
    const hastaNum = new Date(hasta).getTime();

    const asientosPeriodo = asientos.filter((a) => {
      const fechaNum = new Date(a.fecha).getTime();
      return fechaNum >= desdeNum && fechaNum <= hastaNum;
    });

    const ingresos: PyLLinea[] = [];
    const costos: PyLLinea[] = [];
    const gastos: PyLLinea[] = [];

    // Clasificar por cuenta
    for (const asiento of asientosPeriodo) {
      const cuentaDeudora = String(asiento.cuenta_deudora || '');
      const cuentaAcreedora = String(asiento.cuenta_acreedora || '');
      const importe = Number(asiento.importe_centimos || 0);
      const concepto = String(asiento.concepto || '');

      // Ingresos: Acreditados a cuentas 700-799
      if (cuentaAcreedora[0] === '7') {
        ingresos.push({
          concepto,
          monto_centimos: importe,
        });
      }

      // Costos: Debitados a cuentas 500-599
      if (cuentaDeudora[0] === '5') {
        costos.push({
          concepto,
          monto_centimos: importe,
        });
      }

      // Gastos: Debitados a cuentas 600-699
      if (cuentaDeudora[0] === '6') {
        gastos.push({
          concepto,
          monto_centimos: importe,
        });
      }
    }

    const totalIngresos = ingresos.reduce((sum, l) => sum + (l.monto_centimos ?? 0), 0);
    const totalCostos = costos.reduce((sum, l) => sum + (l.monto_centimos ?? 0), 0);
    const totalGastos = gastos.reduce((sum, l) => sum + (l.monto_centimos ?? 0), 0);

    const utilidadBruta = totalIngresos - totalCostos;
    const utilidadNeta = utilidadBruta - totalGastos;
    const margenNetoPct =
      totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;

    return {
      periodo: `${desde} a ${hasta}`,
      ingresos,
      costos,
      gastos,
      total_ingresos: totalIngresos,
      total_costos: totalCostos,
      total_gastos: totalGastos,
      utilidad_bruta: utilidadBruta,
      utilidad_neta: utilidadNeta,
      margen_neto_pct: margenNetoPct,
    };
  }

  /**
   * Genera Estado de Flujo de Efectivo
   */
  generarFlujoEfectivo(
    desde: string,
    hasta: string,
    asientos: ReadonlyArray<{
      readonly cuenta_deudora: string;
      readonly cuenta_acreedora: string;
      readonly importe_centimos: number;
      readonly fecha: string;
      readonly concepto: string;
    }>,
    saldoInicial: number = 0,
  ): FlujoEfectivo {
    const asientosPeriodo = asientos.filter(
      (a) => a.fecha >= desde && a.fecha <= hasta,
    );

    const lineas: FlujoEfectivoLinea[] = [];
    let flujoOperativo = 0;
    let flujoInversion = 0;
    let flujoFinanciero = 0;

    // Clasificar flujos por tipo
    for (const asiento of asientosPeriodo) {
      let tipo: 'operativo' | 'inversión' | 'financiero' = 'operativo';

      // Operativo: ventas, gastos (600-799)
      if (asiento.cuenta_deudora.startsWith('6') || asiento.cuenta_acreedora.startsWith('7')) {
        tipo = 'operativo';
        flujoOperativo += asiento.importe_centimos;
      }
      // Inversión: activos (100-399)
      if (asiento.cuenta_deudora.startsWith('1') || asiento.cuenta_deudora.startsWith('2') ||
          asiento.cuenta_deudora.startsWith('3')) {
        tipo = 'inversión';
        flujoInversion -= asiento.importe_centimos;
      }
      // Financiero: deudas, capital (400-500)
      if (asiento.cuenta_acreedora.startsWith('4') || asiento.cuenta_acreedora.startsWith('5')) {
        tipo = 'financiero';
        flujoFinanciero += asiento.importe_centimos;
      }

      lineas.push({
        concepto: asiento.concepto,
        monto_centimos: asiento.importe_centimos,
        tipo,
      });
    }

    const flujoNeto = flujoOperativo + flujoInversion + flujoFinanciero;
    const saldoFinal = saldoInicial + flujoNeto;

    return {
      periodo: `${desde} a ${hasta}`,
      lineas,
      flujo_operativo: flujoOperativo,
      flujo_inversion: flujoInversion,
      flujo_financiero: flujoFinanciero,
      flujo_neto: flujoNeto,
      saldo_inicial: saldoInicial,
      saldo_final: saldoFinal,
    };
  }
}
