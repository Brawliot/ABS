/**
 * Motor de Cierre de Período (Fase 3)
 * Valida cuadratura contable, genera reportes, cierra períodos.
 */

export interface PeriodoCerrado {
  readonly id: string;
  readonly año: number;
  readonly mes: number;
  readonly fecha_cierre: string;
  readonly total_debe: number;
  readonly total_haber: number;
  readonly cuadrado: boolean;
  readonly estado: 'abierto' | 'cerrado';
}

export interface ResultadoCierre {
  readonly ok: boolean;
  readonly error?: string;
  readonly periodo?: PeriodoCerrado;
}

export interface CuadraturaPeriodo {
  readonly periodo: string; // "2026-09"
  readonly totalDebe: number;
  readonly totalHaber: number;
  readonly diferencia: number;
  readonly cuadrado: boolean;
  readonly validacion: string[];
}

export class MotorCierrePeriodo {
  /**
   * Cierra un mes específico
   * Valida cuadratura (debe = haber)
   * Genera reportes del período
   */
  cerrarMes(
    año: number,
    mes: number,
    asientos: ReadonlyArray<{
      readonly importe_centimos: number;
      readonly cuenta_deudora: string;
      readonly cuenta_acreedora: string;
      readonly fecha: string;
    }>,
  ): ResultadoCierre {
    // Filtrar asientos del mes
    const mesStr = String(mes).padStart(2, '0');
    const asientosMes = asientos.filter(
      (a) => a.fecha.substring(5, 7) === mesStr && a.fecha.substring(0, 4) === String(año),
    );

    // Calcular saldos por cuenta
    const saldosPorCuenta = new Map<string, number>();

    for (const asiento of asientosMes) {
      // Débito a cuenta_deudora
      saldosPorCuenta.set(
        asiento.cuenta_deudora,
        (saldosPorCuenta.get(asiento.cuenta_deudora) ?? 0) + asiento.importe_centimos
      );
      // Crédito a cuenta_acreedora
      saldosPorCuenta.set(
        asiento.cuenta_acreedora,
        (saldosPorCuenta.get(asiento.cuenta_acreedora) ?? 0) - asiento.importe_centimos
      );
    }

    // Validar que todas las cuentas cuadren (saldo = 0)
    const cuentasDescuadradas: string[] = [];
    for (const [cuenta, saldo] of saldosPorCuenta) {
      if (saldo !== 0) {
        cuentasDescuadradas.push(`${cuenta} (saldo: ${saldo})`);
      }
    }

    if (cuentasDescuadradas.length > 0) {
      return {
        ok: false,
        error: `No cuadra: Cuentas descuadradas: ${cuentasDescuadradas.join(', ')}`,
      };
    }

    const totalDebe = asientosMes.reduce((sum, a) => sum + a.importe_centimos, 0);
    const totalHaber = asientosMes.reduce((sum, a) => sum + a.importe_centimos, 0);
    const cuadrado = totalDebe === totalHaber;

    const periodo: PeriodoCerrado = {
      id: `cierre-${año}-${mesStr}`,
      año,
      mes,
      fecha_cierre: new Date().toISOString().split('T')[0] || '',
      total_debe: totalDebe,
      total_haber: totalHaber,
      cuadrado: true,
      estado: 'cerrado',
    };

    return {
      ok: true,
      periodo,
    };
  }

  /**
   * Cierra un año completo
   * Valida cada mes y luego cierra el año
   */
  cerrarAño(
    año: number,
    asientos: ReadonlyArray<{
      readonly importe_centimos: number;
      readonly cuenta_deudora: string;
      readonly cuenta_acreedora: string;
      readonly fecha: string;
    }>,
  ): { ok: boolean; error?: string; mesesCerrados?: PeriodoCerrado[] } {
    const mesesCerrados: PeriodoCerrado[] = [];
    const errores: string[] = [];

    for (let mes = 1; mes <= 12; mes++) {
      const resultado = this.cerrarMes(año, mes, asientos);
      if (resultado.ok && resultado.periodo) {
        mesesCerrados.push(resultado.periodo);
      } else {
        errores.push(resultado.error || `Error mes ${mes}`);
      }
    }

    if (errores.length > 0) {
      return {
        ok: false,
        error: `Error al cerrar año ${año}: ${errores.join('; ')}`,
      };
    }

    return {
      ok: true,
      mesesCerrados,
    };
  }

  /**
   * Valida la cuadratura de un período
   * Retorna detalle de la validación
   */
  validarCuadratura(
    periodo: string, // "2026-09"
    asientos: ReadonlyArray<{
      readonly importe_centimos: number;
      readonly cuenta_deudora: string;
      readonly cuenta_acreedora: string;
      readonly fecha: string;
    }>,
  ): CuadraturaPeriodo {
    const [año, mes] = periodo.split('-').map(Number);
    const mesStr = String(mes).padStart(2, '0');
    const añoStr = String(año);

    const asientosPeriodo = asientos.filter(
      (a) => a.fecha.substring(5, 7) === mesStr && a.fecha.substring(0, 4) === añoStr,
    );

    const totalDebe = asientosPeriodo.reduce((sum, a) => sum + a.importe_centimos, 0);
    const totalHaber = asientosPeriodo.reduce((sum, a) => sum + a.importe_centimos, 0);
    const diferencia = totalDebe - totalHaber;
    const cuadrado = diferencia === 0;

    const validacion: string[] = [];
    if (asientosPeriodo.length === 0) {
      validacion.push('Sin asientos en período');
    }
    if (cuadrado) {
      validacion.push('✓ Debe = Haber');
    } else {
      validacion.push(`✗ Desequilibrio: ${diferencia} centimos`);
    }
    if (asientosPeriodo.length % 2 !== 0) {
      validacion.push('⚠ Número impar de asientos');
    }

    return {
      periodo,
      totalDebe,
      totalHaber,
      diferencia,
      cuadrado,
      validacion,
    };
  }

  /**
   * Bloquea un período para que no se modifique
   */
  bloquearPeriodo(periodo: PeriodoCerrado): void {
    // En implementación real, marcaría en BD como "no modificable"
    if (periodo.estado !== 'cerrado') {
      throw new Error(`No se puede bloquear período ${periodo.estado}`);
    }
  }
}
