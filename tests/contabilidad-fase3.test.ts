/**
 * Tests de Contabilidad Fase 3
 * Asientos automáticos, cierre, reportes, validaciones
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { GeneradorAsientosAutomático } from '../policies/contabilidad-automatica.js';
import { MotorCierrePeriodo } from '../policies/cierre-periodo.js';
import { GeneradorReportesContables } from '../web/reportes-contables.js';
import { SqliteContabilidadStore } from '../adapters/sqlite-contabilidad-store.js';

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

describe('Contabilidad Fase 3', () => {
  describe('GeneradorAsientosAutomático', () => {
    it('genera asiento de nómina correctamente', () => {
      const generador = new GeneradorAsientosAutomático();
      const asiento = generador.asientosNómina(
        '2026-10-01',
        '2026-09',
        100000, // 1000 EUR
        'nomina-2026-09',
      );

      expect(asiento.tipo).toBe('nomina');
      expect(asiento.cuenta_deudora).toBe('640');
      expect(asiento.cuenta_acreedora).toBe('570');
      expect(asiento.importe_centimos).toBe(100000);
    });

    it('genera asiento de logística correctamente', () => {
      const generador = new GeneradorAsientosAutomático();
      const asiento = generador.asientosLogística(
        '2026-10-02',
        50000, // 500 EUR
        'logistica-001',
        'Fedex',
      );

      expect(asiento.tipo).toBe('logistica');
      expect(asiento.cuenta_deudora).toBe('648');
      expect(asiento.cuenta_acreedora).toBe('570');
      expect(asiento.importe_centimos).toBe(50000);
    });

    it('genera asiento de depreciación correctamente', () => {
      const generador = new GeneradorAsientosAutomático();
      const asiento = generador.asientosDepreciación(
        '2026-09-30',
        'activo-001',
        10000, // 100 EUR
        'Maquinaria',
      );

      expect(asiento.tipo).toBe('depreciacion');
      expect(asiento.cuenta_deudora).toBe('681');
      expect(asiento.cuenta_acreedora).toBe('281');
    });

    it('genera asiento de venta al contado', () => {
      const generador = new GeneradorAsientosAutomático();
      const asiento = generador.asientoVenta(
        '2026-10-01',
        250000, // 2500 EUR
        'factura-001',
        'Cliente ABC',
        true,
      );

      expect(asiento.tipo).toBe('venta');
      expect(asiento.cuenta_deudora).toBe('570'); // Caja
      expect(asiento.cuenta_acreedora).toBe('700'); // Ingresos
      expect(asiento.importe_centimos).toBe(250000);
    });

    it('genera asiento de venta a crédito', () => {
      const generador = new GeneradorAsientosAutomático();
      const asiento = generador.asientoVenta(
        '2026-10-01',
        250000,
        'factura-002',
        'Cliente XYZ',
        false,
      );

      expect(asiento.cuenta_deudora).toBe('430'); // Cuentas por Cobrar
      expect(asiento.cuenta_acreedora).toBe('700');
    });

    it('genera asiento de compra de inventario', () => {
      const generador = new GeneradorAsientosAutomático();
      const asiento = generador.asientoCompra(
        '2026-09-28',
        150000, // 1500 EUR
        'compra-001',
        'Proveedor ABC',
        'inventario',
      );

      expect(asiento.tipo).toBe('compra');
      expect(asiento.cuenta_deudora).toBe('300'); // Inventario
      expect(asiento.cuenta_acreedora).toBe('400'); // Cuentas por Pagar
    });

    it('genera asiento de compra de gasto', () => {
      const generador = new GeneradorAsientosAutomático();
      const asiento = generador.asientoCompra(
        '2026-09-28',
        75000,
        'compra-gasto-001',
        'Proveedor Servicios',
        'gasto',
      );

      expect(asiento.cuenta_deudora).toBe('600'); // Gasto General
      expect(asiento.cuenta_acreedora).toBe('400');
    });

    it('valida que asiento tenga importe positivo', () => {
      const generador = new GeneradorAsientosAutomático();
      const asiento = generador.asientosNómina('2026-10-01', '2026-09', 100000, 'ref');

      expect(generador.validarAsiento(asiento)).toBe(true);
    });
  });

  describe('MotorCierrePeriodo', () => {
    it('cierra un mes con asientos balanceados', () => {
      const motor = new MotorCierrePeriodo();
      const asientos = [
        {
          importe_centimos: 100000,
          cuenta_deudora: '570',
          cuenta_acreedora: '640',
          fecha: '2026-09-15',
        },
        {
          importe_centimos: 100000,
          cuenta_deudora: '640',
          cuenta_acreedora: '570',
          fecha: '2026-09-20',
        },
      ];

      const resultado = motor.cerrarMes(2026, 9, asientos);

      expect(resultado.ok).toBe(true);
      expect(resultado.periodo?.cuadrado).toBe(true);
      expect(resultado.periodo?.estado).toBe('cerrado');
    });

    it('rechaza cierre cuando no cuadra', () => {
      const motor = new MotorCierrePeriodo();
      const asientos = [
        {
          importe_centimos: 100000,
          cuenta_deudora: '570',
          cuenta_acreedora: '640',
          fecha: '2026-09-15',
        },
        {
          importe_centimos: 50000,
          cuenta_deudora: '640',
          cuenta_acreedora: '570',
          fecha: '2026-09-20',
        },
      ];

      const resultado = motor.cerrarMes(2026, 9, asientos);

      expect(resultado.ok).toBe(false);
      expect(resultado.error).toContain('No cuadra');
    });

    it('cierra un año completo correctamente', () => {
      const motor = new MotorCierrePeriodo();
      const asientos = [
        {
          importe_centimos: 100000,
          cuenta_deudora: '570',
          cuenta_acreedora: '640',
          fecha: '2026-01-15',
        },
        {
          importe_centimos: 100000,
          cuenta_deudora: '640',
          cuenta_acreedora: '570',
          fecha: '2026-01-20',
        },
      ];

      const resultado = motor.cerrarAño(2026, asientos);

      expect(resultado.ok).toBe(true);
      expect(resultado.mesesCerrados?.length).toBeGreaterThan(0);
    });

    it('valida cuadratura de período', () => {
      const motor = new MotorCierrePeriodo();
      const asientos = [
        {
          importe_centimos: 100000,
          cuenta_deudora: '570',
          cuenta_acreedora: '640',
          fecha: '2026-09-15',
        },
        {
          importe_centimos: 100000,
          cuenta_deudora: '640',
          cuenta_acreedora: '570',
          fecha: '2026-09-20',
        },
      ];

      const validacion = motor.validarCuadratura('2026-09', asientos);

      expect(validacion.cuadrado).toBe(true);
      expect(validacion.totalDebe).toBe(validacion.totalHaber);
    });

    it('bloquea período cerrado', () => {
      const motor = new MotorCierrePeriodo();
      const periodo = {
        id: 'cierre-2026-09',
        año: 2026,
        mes: 9,
        fecha_cierre: '2026-09-30',
        total_debe: 100000,
        total_haber: 100000,
        cuadrado: true,
        estado: 'cerrado' as const,
      };

      expect(() => motor.bloquearPeriodo(periodo)).not.toThrow();
    });
  });

  describe('GeneradorReportesContables', () => {
    it('genera balance general', () => {
      const generador = new GeneradorReportesContables();
      const asientos = [
        {
          cuenta_deudora: '100',
          cuenta_acreedora: '500',
          importe_centimos: 1000000,
          fecha: '2026-09-01',
        },
        {
          cuenta_deudora: '300',
          cuenta_acreedora: '410',
          importe_centimos: 500000,
          fecha: '2026-09-15',
        },
      ];

      const balance = generador.generarBalance('2026-09-30', asientos);

      expect(balance.fecha).toBe('2026-09-30');
      expect(balance.activos.length).toBeGreaterThan(0);
      expect(balance.total_activos).toBeGreaterThanOrEqual(0);
    });

    it('genera P&L con ingresos y gastos', () => {
      const generador = new GeneradorReportesContables();
      const asientos = [
        {
          cuenta_deudora: '570',
          cuenta_acreedora: '700', // Ingresos
          importe_centimos: 500000,
          fecha: '2026-09-15',
          concepto: 'Venta productos',
        },
        {
          cuenta_deudora: '640', // Gasto
          cuenta_acreedora: '570',
          importe_centimos: 200000,
          fecha: '2026-09-20',
          concepto: 'Salarios',
        },
      ];

      const pyl = generador.generarPyL('2026-09-01', '2026-09-30', asientos);

      expect(pyl.periodo).toContain('2026-09-01');
      expect(pyl.total_ingresos).toBe(500000);
      expect(pyl.total_gastos).toBe(200000);
      expect(pyl.utilidad_neta).toBe(300000);
    });

    it('calcula margen neto correctamente', () => {
      const generador = new GeneradorReportesContables();
      const asientos = [
        {
          cuenta_deudora: '570',
          cuenta_acreedora: '700',
          importe_centimos: 1000000, // 10000 EUR
          fecha: '2026-09-15',
          concepto: 'Ventas',
        },
        {
          cuenta_deudora: '640',
          cuenta_acreedora: '570',
          importe_centimos: 300000, // 3000 EUR
          fecha: '2026-09-20',
          concepto: 'Gastos',
        },
      ];

      const pyl = generador.generarPyL('2026-09-01', '2026-09-30', asientos);

      // Margen = 700000 / 1000000 = 70%
      expect(pyl.margen_neto_pct).toBeCloseTo(70, 1);
    });

    it('genera flujo de efectivo', () => {
      const generador = new GeneradorReportesContables();
      const asientos = [
        {
          cuenta_deudora: '570',
          cuenta_acreedora: '700',
          importe_centimos: 500000,
          fecha: '2026-09-10',
          concepto: 'Ingresos',
        },
        {
          cuenta_deudora: '640',
          cuenta_acreedora: '570',
          importe_centimos: 200000,
          fecha: '2026-09-20',
          concepto: 'Gastos',
        },
      ];

      const flujo = generador.generarFlujoEfectivo('2026-09-01', '2026-09-30', asientos, 100000);

      expect(flujo.periodo).toContain('2026-09-01');
      expect(flujo.saldo_inicial).toBe(100000);
      expect(flujo.saldo_final).toBeGreaterThanOrEqual(flujo.saldo_inicial);
    });
  });

  describe('SqliteContabilidadStore', () => {
    it('registra y recupera asientos', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-contab-'));
      dirs.push(dir);
      const store = new SqliteContabilidadStore(join(dir, 'db.sqlite'));

      const numeroAsiento = store.registrarAsiento('tenant1', {
        fecha: '2026-09-15',
        cuenta_deudora: '570',
        cuenta_acreedora: '640',
        importe_centimos: 100000,
        concepto: 'Nómina',
        referencia: 'nomina-2026-09',
        evento_origen: 'nomina:2026-09',
      });

      expect(numeroAsiento).toContain('tenant1');

      const asientos = store.obtenerAsientosPeriodo('tenant1', '2026-09-01', '2026-09-30');
      expect(asientos).toHaveLength(1);
      expect(asientos[0]!.concepto).toBe('Nómina');

      store.close();
    });

    it('calcula saldo de cuenta', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-contab-'));
      dirs.push(dir);
      const store = new SqliteContabilidadStore(join(dir, 'db.sqlite'));

      store.registrarAsiento('tenant1', {
        fecha: '2026-09-15',
        cuenta_deudora: '570',
        cuenta_acreedora: '640',
        importe_centimos: 100000,
        concepto: 'Asiento 1',
        referencia: 'ref1',
        evento_origen: 'ev1',
      });

      const saldo = store.obtenerSaldoCuenta('tenant1', '570', '2026-09-30');
      expect(saldo).toBe(100000);

      store.close();
    });

    it('registra cuentas en plan de cuentas', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-contab-'));
      dirs.push(dir);
      const store = new SqliteContabilidadStore(join(dir, 'db.sqlite'));

      store.registrarCuenta('tenant1', '570', 'Caja', 'Activo');
      store.registrarCuenta('tenant1', '640', 'Gastos Personal', 'Gasto');

      const cuentas = store.obtenerCuentas('tenant1');
      expect(cuentas.length).toBeGreaterThan(0);
      expect(cuentas.some((c) => c.codigo === '570')).toBe(true);

      store.close();
    });

    it('cierra período correctamente', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-contab-'));
      dirs.push(dir);
      const store = new SqliteContabilidadStore(join(dir, 'db.sqlite'));

      const cierre = store.cerrarPeriodo('tenant1', '2026-09', 100000, 100000);

      expect(cierre.cuadrado).toBe(true);
      expect(cierre.estado).toBe('cerrado');

      const cerrado = store.periodoCerrado('tenant1', '2026-09');
      expect(cerrado).toBe(true);

      store.close();
    });

    it('registra eventos contables para auditoría', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-contab-'));
      dirs.push(dir);
      const store = new SqliteContabilidadStore(join(dir, 'db.sqlite'));

      store.registrarEvento(
        'tenant1',
        'ASIENTO_REGISTRADO',
        'Se registró asiento de nómina',
        'nomina-2026-09',
        { total: 100000, periodo: '2026-09' },
      );

      expect(true).toBe(true); // Verificar que no lanza error

      store.close();
    });

    it('previene UPDATE en asientos', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-contab-'));
      dirs.push(dir);
      const store = new SqliteContabilidadStore(join(dir, 'db.sqlite'));

      store.registrarAsiento('tenant1', {
        fecha: '2026-09-15',
        cuenta_deudora: '570',
        cuenta_acreedora: '640',
        importe_centimos: 100000,
        concepto: 'Test',
        referencia: 'test-ref',
        evento_origen: 'test-ev',
      });

      // Intentar UPDATE debería fallar (verificar que trigger funciona)
      expect(() => {
        const db = require('better-sqlite3')(join(dir, 'db.sqlite'));
        db.prepare(`UPDATE asientos_contables_fase3 SET importe_centimos = 200000 WHERE seq = 1`).run();
        db.close();
      }).toThrow();

      store.close();
    });
  });
});
