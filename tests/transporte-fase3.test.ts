/**
 * Tests de Transporte Fase 3
 * Rutas, costos, planificación, tracking
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { MotorRutas, type Coordenadas, type Parada } from '../policies/rutas-transporte.js';
import { MotorCostosTransporte, type TarifaProveedor } from '../policies/costos-transporte.js';
import { PlanificadorEntregas, type Paquete, type Vehiculo } from '../policies/planificador-entregas.js';
import { SqliteTransporteStore } from '../adapters/sqlite-transporte-store.js';

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

describe('Transporte Fase 3', () => {
  describe('MotorRutas', () => {
    it('calcula distancia con Haversine', () => {
      const motor = new MotorRutas();

      // Madrid a Barcelona aprox. 600 km
      const madrid: Coordenadas = { latitud: 40.4168, longitud: -3.7038 };
      const barcelona: Coordenadas = { latitud: 41.3851, longitud: 2.1734 };

      const distancia = motor.calcularDistancia(madrid, barcelona);

      expect(distancia).toBeGreaterThan(500);
      expect(distancia).toBeLessThan(700);
    });

    it('calcula tiempo de entrega', () => {
      const motor = new MotorRutas();

      const tiempo = motor.calcularTiempoEntrega(100, 5, 50, 10);

      // 100km / 50 km/h = 2 horas + 5 paradas * 10 min = 0.833 horas ≈ 2.833 horas
      expect(tiempo).toBeCloseTo(2.833, 1);
    });

    it('crea una ruta con paradas', () => {
      const motor = new MotorRutas();

      const paradas: Parada[] = [
        {
          id: 'parada-1',
          cliente_id: 'cliente-1',
          localizacion: { latitud: 40.4168, longitud: -3.7038 },
          peso_kg: 10,
          volumen_m3: 0.5,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
        {
          id: 'parada-2',
          cliente_id: 'cliente-2',
          localizacion: { latitud: 40.5, longitud: -3.6 },
          peso_kg: 15,
          volumen_m3: 0.8,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
      ];

      const ruta = motor.crearRuta('ruta-1', 'centro', paradas, '2026-10-01');

      expect(ruta.id).toBe('ruta-1');
      expect(ruta.zona).toBe('centro');
      expect(ruta.paradas).toHaveLength(2);
      expect(ruta.peso_total_kg).toBe(25);
      expect(ruta.volumen_total_m3).toBe(1.3);
    });

    it('optimiza ruta con nearest neighbor', () => {
      const motor = new MotorRutas();

      const paradas: Parada[] = [
        {
          id: 'p1',
          cliente_id: 'c1',
          localizacion: { latitud: 40.0, longitud: -3.0 },
          peso_kg: 10,
          volumen_m3: 0.5,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
        {
          id: 'p2',
          cliente_id: 'c2',
          localizacion: { latitud: 40.1, longitud: -3.0 },
          peso_kg: 10,
          volumen_m3: 0.5,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
        {
          id: 'p3',
          cliente_id: 'c3',
          localizacion: { latitud: 40.05, longitud: -2.9 },
          peso_kg: 10,
          volumen_m3: 0.5,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
      ];

      const ruta = motor.crearRuta('ruta-opt', 'centro', paradas, '2026-10-01');
      const resultado = motor.optimizarRuta(ruta);

      expect(resultado.ruta_optimizada_km).toBeLessThanOrEqual(resultado.ruta_original_km);
      expect(resultado.paradas_ordenadas).toHaveLength(3);
      expect(resultado.ahorro_km).toBeGreaterThanOrEqual(0);
    });

    it('agrega parada a ruta existente', () => {
      const motor = new MotorRutas();

      const paradas: Parada[] = [
        {
          id: 'p1',
          cliente_id: 'c1',
          localizacion: { latitud: 40.0, longitud: -3.0 },
          peso_kg: 10,
          volumen_m3: 0.5,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
      ];

      let ruta = motor.crearRuta('ruta-test', 'centro', paradas, '2026-10-01');
      expect(ruta.paradas).toHaveLength(1);

      const nuevaParada: Parada = {
        id: 'p2',
        cliente_id: 'c2',
        localizacion: { latitud: 40.1, longitud: -3.0 },
        peso_kg: 5,
        volumen_m3: 0.3,
        ventana_inicio: '09:00',
        ventana_fin: '17:00',
      };

      ruta = motor.agregarParada(ruta, nuevaParada);

      expect(ruta.paradas).toHaveLength(2);
      expect(ruta.peso_total_kg).toBe(15);
    });

    it('calcula eficiencia de ruta', () => {
      const motor = new MotorRutas();

      const paradas: Parada[] = [
        {
          id: 'p1',
          cliente_id: 'c1',
          localizacion: { latitud: 40.0, longitud: -3.0 },
          peso_kg: 500,
          volumen_m3: 5,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
      ];

      const ruta = motor.crearRuta('ruta-eff', 'centro', paradas, '2026-10-01');
      const eficiencia = motor.calcularEficiencia(ruta, 1000, 10);

      expect(eficiencia.eficiencia_peso_pct).toBeCloseTo(50, 0); // 500/1000
      expect(eficiencia.eficiencia_volumen_pct).toBeCloseTo(50, 0); // 5/10
    });
  });

  describe('MotorCostosTransporte', () => {
    it('registra proveedor', () => {
      const motor = new MotorCostosTransporte();

      const proveedor: TarifaProveedor = {
        id: 'prov-1',
        nombre: 'Fedex',
        costo_base_centimos: 500,
        costo_por_km_centimos: 50,
        costo_por_kg_centimos: 10,
        tiempo_entrega_horas: 24,
        cobertura_zonas: ['centro', 'norte'],
        rating: 4.5,
      };

      motor.registrarProveedor(proveedor);

      const proveedoresZona = motor.obtenerProveedoresZona('centro');
      expect(proveedoresZona).toHaveLength(1);
      expect(proveedoresZona[0].nombre).toBe('Fedex');
    });

    it('calcula costo de ruta', () => {
      const motorRutas = new MotorRutas();
      const motorCostos = new MotorCostosTransporte();

      const proveedor: TarifaProveedor = {
        id: 'prov-1',
        nombre: 'Fedex',
        costo_base_centimos: 1000, // 10 EUR
        costo_por_km_centimos: 50, // 0.50 EUR/km
        costo_por_kg_centimos: 10, // 0.10 EUR/kg
        tiempo_entrega_horas: 24,
        cobertura_zonas: ['centro'],
        rating: 4.5,
      };

      motorCostos.registrarProveedor(proveedor);

      const paradas: Parada[] = [
        {
          id: 'p1',
          cliente_id: 'c1',
          localizacion: { latitud: 40.0, longitud: -3.0 },
          peso_kg: 100,
          volumen_m3: 1,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
      ];

      const ruta = motorRutas.crearRuta('ruta-costo', 'centro', paradas, '2026-10-01');
      const costo = motorCostos.calcularCosto(ruta, proveedor);

      expect(costo.costo_base).toBe(1000);
      expect(costo.costo_peso).toBe(1000); // 100kg * 10 centimos
    });

    it('compara proveedores', () => {
      const motorRutas = new MotorRutas();
      const motorCostos = new MotorCostosTransporte();

      // Registrar dos proveedores
      motorCostos.registrarProveedor({
        id: 'prov-1',
        nombre: 'Fedex',
        costo_base_centimos: 1000,
        costo_por_km_centimos: 50,
        costo_por_kg_centimos: 10,
        tiempo_entrega_horas: 24,
        cobertura_zonas: ['centro'],
        rating: 4.5,
      });

      motorCostos.registrarProveedor({
        id: 'prov-2',
        nombre: 'UPS',
        costo_base_centimos: 800,
        costo_por_km_centimos: 40,
        costo_por_kg_centimos: 8,
        tiempo_entrega_horas: 48,
        cobertura_zonas: ['centro'],
        rating: 4.0,
      });

      const paradas: Parada[] = [
        {
          id: 'p1',
          cliente_id: 'c1',
          localizacion: { latitud: 40.0, longitud: -3.0 },
          peso_kg: 100,
          volumen_m3: 1,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
      ];

      const ruta = motorRutas.crearRuta('ruta-comp', 'centro', paradas, '2026-10-01');
      const comparativa = motorCostos.compararProveedores(ruta);

      expect(comparativa.opciones.length).toBeGreaterThan(0);
      expect(comparativa.mas_economico).toBeDefined();
    });

    it('calcula margen de ganancia', () => {
      const motor = new MotorCostosTransporte();

      const margen = motor.calcularMargen(1000, 2500); // Costo 10 EUR, tarifa 25 EUR

      expect(margen.costo_centimos).toBe(1000);
      expect(margen.tarifa_cliente_centimos).toBe(2500);
      expect(margen.margen_centimos).toBe(1500);
      expect(margen.margen_pct).toBeCloseTo(60, 1); // 1500/2500 = 60%
      expect(margen.rentable).toBe(true);
    });

    it('calcula tarifa con margen objetivo', () => {
      const motor = new MotorCostosTransporte();

      const tarifa = motor.calcularTarifaConMargen(1000, 30); // Costo 10 EUR, margen 30%

      // tarifa = 1000 / (1 - 0.3) = 1000 / 0.7 ≈ 1428.57
      expect(tarifa).toBeCloseTo(1428.57, 1);
    });
  });

  describe('PlanificadorEntregas', () => {
    it('planifica entregas diarias', () => {
      const planificador = new PlanificadorEntregas();

      const paquetes: Paquete[] = [
        {
          id: 'paq-1',
          cliente_id: 'cli-1',
          localizacion: { latitud: 40.0, longitud: -3.0 },
          peso_kg: 10,
          volumen_m3: 0.5,
          zona: 'centro',
          fecha_entrega: '2026-10-01',
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
        {
          id: 'paq-2',
          cliente_id: 'cli-2',
          localizacion: { latitud: 40.1, longitud: -3.0 },
          peso_kg: 15,
          volumen_m3: 0.8,
          zona: 'centro',
          fecha_entrega: '2026-10-01',
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
      ];

      const planificacion = planificador.planificarDia(paquetes);

      expect(planificacion.fecha).toBe('2026-10-01');
      expect(planificacion.rutas.length).toBeGreaterThan(0);
      expect(planificacion.eficiencia_global_pct).toBeGreaterThan(0);
    });

    it('asigna vehículos a rutas', () => {
      const motorRutas = new MotorRutas();
      const planificador = new PlanificadorEntregas();

      const paradas: Parada[] = [
        {
          id: 'p1',
          cliente_id: 'c1',
          localizacion: { latitud: 40.0, longitud: -3.0 },
          peso_kg: 10,
          volumen_m3: 0.5,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
      ];

      const ruta = motorRutas.crearRuta('ruta-1', 'centro', paradas, '2026-10-01');

      const vehiculos: Vehiculo[] = [
        {
          id: 'veh-1',
          matricula: 'MAD-001',
          capacidad_kg: 1000,
          capacidad_m3: 10,
          conductor_id: 'cond-1',
          disponible: true,
        },
      ];

      const asignaciones = planificador.asignarVehiculos([ruta], vehiculos);

      expect(asignaciones.size).toBeGreaterThan(0);
      expect(asignaciones.get(ruta.id)).toBe('veh-1');
    });

    it('detecta conflictos de capacidad', () => {
      const motorRutas = new MotorRutas();
      const planificador = new PlanificadorEntregas();

      const paradas: Parada[] = [
        {
          id: 'p1',
          cliente_id: 'c1',
          localizacion: { latitud: 40.0, longitud: -3.0 },
          peso_kg: 1500, // Excede capacidad
          volumen_m3: 0.5,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
      ];

      const ruta = motorRutas.crearRuta('ruta-conf', 'centro', paradas, '2026-10-01');
      const conflictos = planificador.detectarConflictos([ruta], [], 1000);

      expect(conflictos.length).toBeGreaterThan(0);
      expect(conflictos[0].tipo).toBe('capacidad_excedida');
    });

    it('optimiza planificación', () => {
      const motorRutas = new MotorRutas();
      const planificador = new PlanificadorEntregas();

      const paradas: Parada[] = [
        {
          id: 'p1',
          cliente_id: 'c1',
          localizacion: { latitud: 40.0, longitud: -3.0 },
          peso_kg: 1500,
          volumen_m3: 0.5,
          ventana_inicio: '09:00',
          ventana_fin: '17:00',
        },
      ];

      const ruta = motorRutas.crearRuta('ruta-opt', 'centro', paradas, '2026-10-01');
      const resultado = planificador.optimizarPlanificacion([ruta], 1000);

      expect(resultado.rutas_optimizadas.length).toBeGreaterThan(1); // Dividida
      expect(resultado.conflictos_resueltos).toBeGreaterThan(0);
    });
  });

  describe('SqliteTransporteStore', () => {
    it('guarda y recupera rutas', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-transp-'));
      dirs.push(dir);
      const store = new SqliteTransporteStore(join(dir, 'db.sqlite'));

      store.guardarRuta('tenant1', 'ruta-1', '2026-10-01', 'centro', 100, 2.5, 200, 2);

      const rutas = store.obtenerRutasDia('tenant1', '2026-10-01');

      expect(rutas).toHaveLength(1);
      expect(rutas[0].zona).toBe('centro');
      expect(rutas[0].distancia_km).toBe(100);

      store.close();
    });

    it('registra paradas', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-transp-'));
      dirs.push(dir);
      const store = new SqliteTransporteStore(join(dir, 'db.sqlite'));

      store.guardarRuta('tenant1', 'ruta-1', '2026-10-01', 'centro', 50, 2, 100, 1);
      store.registrarParada(
        'tenant1',
        'ruta-1',
        1,
        'cliente-1',
        40.0,
        -3.0,
        '09:00',
        '10:00',
      );

      const paradas = store.obtenerParadas('tenant1', 'ruta-1');

      expect(paradas).toHaveLength(1);
      expect(paradas[0].cliente_id).toBe('cliente-1');

      store.close();
    });

    it('registra entregas completadas', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-transp-'));
      dirs.push(dir);
      const store = new SqliteTransporteStore(join(dir, 'db.sqlite'));

      store.guardarRuta('tenant1', 'ruta-1', '2026-10-01', 'centro', 50, 2, 100, 1);
      store.registrarEntrega(
        'tenant1',
        'ruta-1',
        'parada-1',
        '2026-10-01',
        '10:30',
        'firma-cliente',
      );

      const entregas = store.obtenerEntregasRuta('tenant1', 'ruta-1');

      expect(entregas).toHaveLength(1);
      expect(entregas[0].firma_cliente).toBe('firma-cliente');

      store.close();
    });

    it('registra tarifas de transportistas', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-transp-'));
      dirs.push(dir);
      const store = new SqliteTransporteStore(join(dir, 'db.sqlite'));

      store.registrarTarifa('tenant1', 'fedex', 'centro', 1000, 50, 10);

      const tarifas = store.obtenerTarifasZona('tenant1', 'centro');

      expect(tarifas).toHaveLength(1);
      expect(tarifas[0].proveedor_id).toBe('fedex');

      store.close();
    });

    it('registra tracking GPS', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-transp-'));
      dirs.push(dir);
      const store = new SqliteTransporteStore(join(dir, 'db.sqlite'));

      store.registrarGPS('tenant1', 'ruta-1', 'veh-1', 40.0, -3.0, 60);

      const tracking = store.obtenerTrackingRuta('tenant1', 'ruta-1');

      expect(tracking).toHaveLength(1);
      expect(tracking[0].velocidad_kmh).toBe(60);

      store.close();
    });

    it('obtiene última posición de ruta', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-transp-'));
      dirs.push(dir);
      const store = new SqliteTransporteStore(join(dir, 'db.sqlite'));

      store.registrarGPS('tenant1', 'ruta-1', 'veh-1', 40.0, -3.0, 60);
      store.registrarGPS('tenant1', 'ruta-1', 'veh-1', 40.1, -3.1, 65);

      const ultima = store.obtenerUltimaPosicion('tenant1', 'ruta-1');

      expect(ultima).not.toBeNull();
      expect(ultima?.latitud).toBe(40.1);

      store.close();
    });

    it('calcula estadísticas de entregas', () => {
      const dir = mkdtempSync(join(tmpdir(), 'abs-transp-'));
      dirs.push(dir);
      const store = new SqliteTransporteStore(join(dir, 'db.sqlite'));

      store.guardarRuta('tenant1', 'ruta-1', '2026-10-01', 'centro', 50, 2, 100, 1);
      store.registrarEntrega(
        'tenant1',
        'ruta-1',
        'p1',
        '2026-10-01',
        '10:30',
        'firma',
      );

      const stats = store.obtenerEstadisticasEntregas('tenant1', '2026-10-01');

      expect(stats.total_entregas).toBeGreaterThan(0);
      expect(stats.completadas).toBeGreaterThan(0);

      store.close();
    });
  });
});
