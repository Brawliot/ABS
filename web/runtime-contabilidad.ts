/**
 * Runtime Contabilidad: Gestión de asientos, balance y resultados
 * Métodos delegados desde AppRuntime
 */

import type { AppRuntime } from "./runtime.js";

export interface ContabilidadRuntimeFunctions {
  registrarAsiento(
    fecha: string,
    cuentaDeudora: string,
    cuentaAcreedora: string,
    importeCentimos: number,
    concepto: string,
    referencia: string,
  ): { ok: true; numeroAsiento: string } | { ok: false; error: string };
  obtenerMayor(
    cuenta: string,
    desde?: string,
    hasta?: string,
  ): readonly {
    readonly fecha: string;
    readonly numero_asiento: string;
    readonly concepto: string;
    readonly referencia: string;
    readonly debe: number;
    readonly haber: number;
  }[];
  verificarCuadre(): {
    readonly balanceado: boolean;
    readonly totalDebitos: number;
    readonly totalCreditos: number;
    readonly cuentasDesbalanceadas: readonly string[];
  };
  obtenerBalance(fecha?: string): {
    readonly activo: number;
    readonly pasivo: number;
    readonly capital: number;
    readonly valido: boolean;
  };
  obtenerResultado(desde?: string, hasta?: string): {
    readonly ingresos: number;
    readonly gastos: number;
    readonly resultado: number;
  };
  exportarAsientosCSV(desde?: string, hasta?: string): string;
  exportarAsientosJSON(desde?: string, hasta?: string): string;
}

export function createContabilidadFunctions(runtime: AppRuntime): ContabilidadRuntimeFunctions {
  return {
    registrarAsiento(
      fecha: string,
      cuentaDeudora: string,
      cuentaAcreedora: string,
      importeCentimos: number,
      concepto: string,
      referencia: string,
    ): { ok: true; numeroAsiento: string } | { ok: false; error: string } {
      if (!Number.isSafeInteger(importeCentimos) || importeCentimos <= 0) {
        return { ok: false, error: "El importe debe ser mayor que 0." };
      }
      if (!runtime.cuentas.obtener(cuentaDeudora, runtime.tenantId)) {
        return { ok: false, error: `Cuenta deudora no existe: ${cuentaDeudora}` };
      }
      if (!runtime.cuentas.obtener(cuentaAcreedora, runtime.tenantId)) {
        return { ok: false, error: `Cuenta acreedora no existe: ${cuentaAcreedora}` };
      }
      const numeroAsiento = runtime.asientos.registrar(runtime.tenantId, {
        fecha,
        cuenta_deudora: cuentaDeudora,
        cuenta_acreedora: cuentaAcreedora,
        importe_centimos: importeCentimos,
        concepto,
        referencia,
      });
      // Actualizar saldos
      runtime.cuentas.actualizarSaldo(cuentaDeudora, runtime.tenantId, importeCentimos);
      runtime.cuentas.actualizarSaldo(cuentaAcreedora, runtime.tenantId, -importeCentimos);
      return { ok: true, numeroAsiento };
    },

    obtenerMayor(
      cuenta: string,
      desde?: string,
      hasta?: string,
    ): readonly {
      readonly fecha: string;
      readonly numero_asiento: string;
      readonly concepto: string;
      readonly referencia: string;
      readonly debe: number;
      readonly haber: number;
    }[] {
      const asientos = runtime.asientos.porCuenta(runtime.tenantId, cuenta, desde, hasta);
      return asientos.map((a) => ({
        fecha: a.fecha,
        numero_asiento: a.numero_asiento,
        concepto: a.concepto,
        referencia: a.referencia,
        debe: a.cuenta_deudora === cuenta ? a.importe_centimos : 0,
        haber: a.cuenta_acreedora === cuenta ? a.importe_centimos : 0,
      }));
    },

    verificarCuadre(): {
      readonly balanceado: boolean;
      readonly totalDebitos: number;
      readonly totalCreditos: number;
      readonly cuentasDesbalanceadas: readonly string[];
    } {
      const asientos = runtime.asientos.todos(runtime.tenantId);
      let totalDebitos = 0;
      let totalCreditos = 0;
      const saldosPorCuenta = new Map<string, number>();

      for (const a of asientos) {
        totalDebitos += a.importe_centimos;
        totalCreditos += a.importe_centimos;
        saldosPorCuenta.set(
          a.cuenta_deudora,
          (saldosPorCuenta.get(a.cuenta_deudora) ?? 0) + a.importe_centimos,
        );
        saldosPorCuenta.set(
          a.cuenta_acreedora,
          (saldosPorCuenta.get(a.cuenta_acreedora) ?? 0) - a.importe_centimos,
        );
      }

      const cuentasDesbalanceadas = Array.from(saldosPorCuenta.entries())
        .filter(([_, saldo]) => saldo !== (runtime.cuentas.obtener(_, runtime.tenantId)?.saldo_centimos ?? 0))
        .map(([cuenta]) => cuenta);

      return {
        balanceado: totalDebitos === totalCreditos,
        totalDebitos,
        totalCreditos,
        cuentasDesbalanceadas,
      };
    },

    obtenerBalance(fecha?: string): {
      readonly activo: number;
      readonly pasivo: number;
      readonly capital: number;
      readonly valido: boolean;
    } {
      const cuentas = runtime.cuentas.todasCuentas(runtime.tenantId);
      let activo = 0;
      let pasivo = 0;
      let capital = 0;

      for (const cuenta of cuentas) {
        const tipo = parseInt(cuenta.codigo) / 1000;
        if (tipo >= 1 && tipo < 2) {
          activo += cuenta.saldo_centimos;
        } else if (tipo >= 2 && tipo < 3) {
          pasivo += cuenta.saldo_centimos;
        } else if (tipo >= 3 && tipo < 4) {
          capital += cuenta.saldo_centimos;
        }
      }

      const valido = activo === pasivo + capital;
      return { activo, pasivo, capital, valido };
    },

    obtenerResultado(desde?: string, hasta?: string): {
      readonly ingresos: number;
      readonly gastos: number;
      readonly resultado: number;
    } {
      const asientos = runtime.asientos.todos(runtime.tenantId, desde, hasta);
      let ingresos = 0;
      let gastos = 0;

      for (const asiento of asientos) {
        const codigoDeu = parseInt(asiento.cuenta_deudora);
        const codigoAcr = parseInt(asiento.cuenta_acreedora);

        if (codigoAcr >= 4000 && codigoAcr < 5000) {
          ingresos += asiento.importe_centimos;
        }
        if (codigoDeu >= 5000 && codigoDeu < 6000) {
          gastos += asiento.importe_centimos;
        }
      }

      return { ingresos, gastos, resultado: ingresos - gastos };
    },

    exportarAsientosCSV(desde?: string, hasta?: string): string {
      const asientos = runtime.asientos.todos(runtime.tenantId, desde, hasta);
      const lineas: string[] = [
        "fecha,asiento,cuenta_deudora,cuenta_acreedora,debe,haber,concepto,referencia",
      ];

      for (const asiento of asientos) {
        const fecha = asiento.fecha;
        const numeroAsiento = asiento.numero_asiento;
        const cuentaDeu = asiento.cuenta_deudora;
        const cuentaAcr = asiento.cuenta_acreedora;
        const importe = asiento.importe_centimos / 100;
        const concepto = asiento.concepto.replace(/"/g, '""');
        const referencia = asiento.referencia.replace(/"/g, '""');

        lineas.push(
          `${fecha},${numeroAsiento},${cuentaDeu},${cuentaAcr},${importe},${importe},"${concepto}","${referencia}"`,
        );
      }

      return lineas.join("\n");
    },

    exportarAsientosJSON(desde?: string, hasta?: string): string {
      const asientos = runtime.asientos.todos(runtime.tenantId, desde, hasta);
      const resultado = {
        tenant: runtime.tenantId,
        exportedAt: new Date().toISOString(),
        periodo: {
          desde: desde || null,
          hasta: hasta || null,
        },
        asientos: asientos.map((a) => ({
          fecha: a.fecha,
          numero_asiento: a.numero_asiento,
          cuenta_deudora: a.cuenta_deudora,
          cuenta_acreedora: a.cuenta_acreedora,
          importe_eur: a.importe_centimos / 100,
          concepto: a.concepto,
          referencia: a.referencia,
        })),
      };

      return JSON.stringify(resultado, null, 2);
    },
  };
}
