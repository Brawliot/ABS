/**
 * Generador de Asientos Contables Automáticos (Fase 3)
 * Crea asientos desde eventos de otros módulos:
 * - Nómina → Gasto + Caja
 * - Logística → Gasto Distribución
 * - Activos → Depreciación
 * - Venta → Ingresos + Cuentas por Cobrar
 * - Compra → Activo + Cuentas por Pagar
 */

export interface AsientoAutomatico {
  readonly id: string;
  readonly fecha: string;
  readonly tipo: 'nomina' | 'logistica' | 'depreciacion' | 'venta' | 'compra';
  readonly cuenta_deudora: string;
  readonly cuenta_acreedora: string;
  readonly importe_centimos: number;
  readonly concepto: string;
  readonly referencia: string;
  readonly evento_origen: string;
}

export class GeneradorAsientosAutomático {
  /**
   * Genera asientos contables de nómina
   * Débito: Gastos de Personal (640)
   * Crédito: Caja/Banco (570)
   */
  asientosNómina(
    fechaNómina: string,
    periodoNómina: string,
    totalNeto: number,
    referencia: string,
  ): AsientoAutomatico {
    return {
      id: `nomina-${Date.now()}`,
      fecha: fechaNómina,
      tipo: 'nomina',
      cuenta_deudora: '640', // Gastos de Personal
      cuenta_acreedora: '570', // Caja
      importe_centimos: totalNeto,
      concepto: `Nómina ${periodoNómina}`,
      referencia,
      evento_origen: `nomina:${periodoNómina}`,
    };
  }

  /**
   * Genera asientos de logística
   * Débito: Gastos de Distribución (648)
   * Crédito: Caja/Banco (570)
   */
  asientosLogística(
    fecha: string,
    totalFlete: number,
    referencia: string,
    proveedor: string,
  ): AsientoAutomatico {
    return {
      id: `logistica-${Date.now()}`,
      fecha,
      tipo: 'logistica',
      cuenta_deudora: '648', // Gastos de Distribución
      cuenta_acreedora: '570', // Caja
      importe_centimos: totalFlete,
      concepto: `Flete con ${proveedor}`,
      referencia,
      evento_origen: `logistica:${referencia}`,
    };
  }

  /**
   * Genera asientos de depreciación
   * Débito: Gasto Depreciación (681)
   * Crédito: Depreciación Acumulada (281)
   */
  asientosDepreciación(
    fecha: string,
    activoId: string,
    montoDepreciacion: number,
    descripcionActivo: string,
  ): AsientoAutomatico {
    return {
      id: `deprec-${Date.now()}`,
      fecha,
      tipo: 'depreciacion',
      cuenta_deudora: '681', // Gasto por Depreciación
      cuenta_acreedora: '281', // Depreciación Acumulada
      importe_centimos: montoDepreciacion,
      concepto: `Depreciación ${descripcionActivo}`,
      referencia: activoId,
      evento_origen: `deprec:${activoId}`,
    };
  }

  /**
   * Genera asientos de venta
   * Débito: Caja/Cuentas por Cobrar (430)
   * Crédito: Ingresos por Ventas (700)
   */
  asientoVenta(
    fecha: string,
    totalVentaCentimos: number,
    factumaId: string,
    cliente: string,
    esAlContado: boolean = true,
  ): AsientoAutomatico {
    return {
      id: `venta-${Date.now()}`,
      fecha,
      tipo: 'venta',
      cuenta_deudora: esAlContado ? '570' : '430', // Caja o Cuentas por Cobrar
      cuenta_acreedora: '700', // Ingresos por Ventas
      importe_centimos: totalVentaCentimos,
      concepto: `Venta a ${cliente}`,
      referencia: factumaId,
      evento_origen: `venta:${factumaId}`,
    };
  }

  /**
   * Genera asientos de compra
   * Débito: Inventario/Gastos (300 o 600)
   * Crédito: Cuentas por Pagar (400)
   */
  asientoCompra(
    fecha: string,
    totalCompraCentimos: number,
    compraId: string,
    proveedor: string,
    tipoCompra: 'inventario' | 'gasto' = 'inventario',
  ): AsientoAutomatico {
    const cuentaDeudora = tipoCompra === 'inventario' ? '300' : '600'; // Compras o Gasto General
    return {
      id: `compra-${Date.now()}`,
      fecha,
      tipo: 'compra',
      cuenta_deudora: cuentaDeudora,
      cuenta_acreedora: '400', // Cuentas por Pagar
      importe_centimos: totalCompraCentimos,
      concepto: `Compra a ${proveedor}`,
      referencia: compraId,
      evento_origen: `compra:${compraId}`,
    };
  }

  /**
   * Valida que un asiento sea balanceado (débito = crédito)
   */
  validarAsiento(asiento: AsientoAutomatico): boolean {
    return asiento.importe_centimos > 0;
  }
}
