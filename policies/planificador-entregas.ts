/**
 * Planificador de Entregas (Fase 3)
 * Agrupa paquetes en rutas, asigna vehículos, detecta conflictos
 */

import type { Ruta, Parada } from './rutas-transporte.js';

export interface Paquete {
  readonly id: string;
  readonly cliente_id: string;
  readonly localizacion: { latitud: number; longitud: number };
  readonly peso_kg: number;
  readonly volumen_m3: number;
  readonly zona: string;
  readonly fecha_entrega: string;
  readonly ventana_inicio: string;
  readonly ventana_fin: string;
  readonly especial?: string;
}

export interface Vehiculo {
  readonly id: string;
  readonly matricula: string;
  readonly capacidad_kg: number;
  readonly capacidad_m3: number;
  readonly conductor_id: string;
  readonly disponible: boolean;
  readonly zona_asignada?: string;
}

export interface PlanificacionDia {
  readonly fecha: string;
  readonly rutas: Ruta[];
  readonly vehiculos_asignados: Map<string, string>; // ruta_id -> vehiculo_id
  readonly conflictos: string[];
  readonly eficiencia_global_pct: number;
}

export interface Conflicto {
  readonly tipo: 'capacidad_excedida' | 'solapamiento_tiempo' | 'vehiculo_no_disponible';
  readonly ruta_id: string;
  readonly descripcion: string;
  readonly severidad: 'info' | 'warning' | 'critical';
}

export class PlanificadorEntregas {
  /**
   * Planifica entregas para un día
   * Agrupa paquetes en rutas optimizadas
   */
  planificarDia(
    paquetes: Paquete[],
    capacidadStandardKg: number = 1000,
    capacidadStandardM3: number = 10,
  ): PlanificacionDia {
    const fecha = paquetes.length > 0 ? paquetes[0].fecha_entrega : new Date().toISOString().split('T')[0];

    // Agrupar paquetes por zona
    const paquetesPorZona = new Map<string, Paquete[]>();
    for (const paquete of paquetes) {
      const zona = paquete.zona;
      if (!paquetesPorZona.has(zona)) {
        paquetesPorZona.set(zona, []);
      }
      paquetesPorZona.get(zona)!.push(paquete);
    }

    // Crear rutas por zona
    const rutas: Ruta[] = [];
    let rutaNum = 0;

    for (const [zona, paquetesZona] of paquetesPorZona) {
      const rotasZona = this.agruparEnRotas(
        zona,
        paquetesZona,
        capacidadStandardKg,
        capacidadStandardM3,
      );
      for (const ruta of rotasZona) {
        rutaNum++;
        rutas.push({
          ...ruta,
          id: `ruta-${fecha}-${rutaNum}`,
          fecha_planificada: fecha || '',
        });
      }
    }

    return {
      fecha,
      rutas,
      vehiculos_asignados: new Map(),
      conflictos: [],
      eficiencia_global_pct: this.calcularEficienciaGlobal(rutas),
    };
  }

  /**
   * Agrupa paquetes en rutas respetando capacidad
   */
  private agruparEnRotas(
    zona: string,
    paquetes: Paquete[],
    capacidadKg: number,
    capacidadM3: number,
  ): Ruta[] {
    const rotas: Ruta[] = [];
    let rutaActual: Parada[] = [];
    let pesoActual = 0;
    let volumenActual = 0;

    for (const paquete of paquetes) {
      const parada: Parada = {
        id: paquete.id,
        cliente_id: paquete.cliente_id,
        localizacion: paquete.localizacion,
        peso_kg: paquete.peso_kg,
        volumen_m3: paquete.volumen_m3,
        ventana_inicio: paquete.ventana_inicio,
        ventana_fin: paquete.ventana_fin,
        especial: paquete.especial,
      };

      // Verificar si el paquete cabe en la ruta actual
      if (
        pesoActual + paquete.peso_kg <= capacidadKg &&
        volumenActual + paquete.volumen_m3 <= capacidadM3
      ) {
        rutaActual.push(parada);
        pesoActual += paquete.peso_kg;
        volumenActual += paquete.volumen_m3;
      } else {
        // Crear nueva ruta
        if (rutaActual.length > 0) {
          rotas.push({
            id: `temp-${Date.now()}`,
            zona,
            paradas: rutaActual,
            distancia_km: 0, // Calcular después
            tiempo_estimado_horas: 0,
            peso_total_kg: pesoActual,
            volumen_total_m3: volumenActual,
            orden_optimizado: rutaActual,
            fecha_planificada: '',
            estado: 'planificada',
          });
        }
        rutaActual = [parada];
        pesoActual = paquete.peso_kg;
        volumenActual = paquete.volumen_m3;
      }
    }

    // Agregar última ruta
    if (rutaActual.length > 0) {
      rotas.push({
        id: `temp-${Date.now()}`,
        zona,
        paradas: rutaActual,
        distancia_km: 0,
        tiempo_estimado_horas: 0,
        peso_total_kg: pesoActual,
        volumen_total_m3: volumenActual,
        orden_optimizado: rutaActual,
        fecha_planificada: '',
        estado: 'planificada',
      });
    }

    return rotas;
  }

  /**
   * Asigna vehículos a rutas
   */
  asignarVehiculos(rutas: Ruta[], vehiculos: Vehiculo[]): Map<string, string> {
    const asignaciones = new Map<string, string>();
    const vehiculosDisponibles = vehiculos.filter((v) => v.disponible);

    if (vehiculosDisponibles.length === 0) return asignaciones;

    let vehiculoIdx = 0;
    for (const ruta of rutas) {
      if (vehiculoIdx >= vehiculosDisponibles.length) {
        vehiculoIdx = 0; // Circular si hay más rutas que vehículos
      }
      const vehiculo = vehiculosDisponibles[vehiculoIdx];
      if (vehiculo) {
        asignaciones.set(ruta.id, vehiculo.id);
      }
      vehiculoIdx++;
    }

    return asignaciones;
  }

  /**
   * Detecta conflictos en las rutas
   */
  detectarConflictos(
    rutas: Ruta[],
    vehiculos: Vehiculo[],
    capacidadMaxKg: number = 1000,
  ): Conflicto[] {
    const conflictos: Conflicto[] = [];

    for (const ruta of rutas) {
      // Verificar capacidad
      if (ruta.peso_total_kg > capacidadMaxKg) {
        conflictos.push({
          tipo: 'capacidad_excedida',
          ruta_id: ruta.id,
          descripcion: `Peso ${ruta.peso_total_kg}kg excede capacidad ${capacidadMaxKg}kg`,
          severidad: 'critical',
        });
      }

      // Verificar ventanas de tiempo
      for (let i = 0; i < ruta.paradas.length - 1; i++) {
        const actual = ruta.paradas[i];
        const siguiente = ruta.paradas[i + 1];

        if (!actual || !siguiente) continue;

        const finActual = this.parseTime(actual.ventana_fin);
        const inicioSiguiente = this.parseTime(siguiente.ventana_inicio);

        if (finActual > inicioSiguiente) {
          conflictos.push({
            tipo: 'solapamiento_tiempo',
            ruta_id: ruta.id,
            descripcion: `Parada ${i} (fin ${actual.ventana_fin}) se solapa con parada ${i + 1} (inicio ${siguiente.ventana_inicio})`,
            severidad: 'warning',
          });
        }
      }
    }

    return conflictos;
  }

  private parseTime(timeStr: string): number {
    const partes = timeStr.split(':').map(Number);
    const horas = partes[0] || 0;
    const minutos = partes[1] || 0;
    return horas * 60 + minutos;
  }

  /**
   * Optimiza la planificación eliminando conflictos
   */
  optimizarPlanificacion(
    rutas: Ruta[],
    capacidadMaxKg: number = 1000,
  ): { rutas_optimizadas: Ruta[]; conflictos_resueltos: number } {
    const rutasOptimizadas: Ruta[] = [];
    let conflictosResueltos = 0;

    for (const ruta of rutas) {
      if (ruta.peso_total_kg <= capacidadMaxKg) {
        rutasOptimizadas.push(ruta);
      } else {
        // Dividir ruta si excede capacidad
        const rutasDivididas = this.dividirRuta(ruta, capacidadMaxKg);
        rutasOptimizadas.push(...rutasDivididas);
        conflictosResueltos++;
      }
    }

    return {
      rutas_optimizadas: rutasOptimizadas,
      conflictos_resueltos: conflictosResueltos,
    };
  }

  /**
   * Divide una ruta en múltiples rutas más pequeñas
   */
  private dividirRuta(ruta: Ruta, capacidadMaxKg: number): Ruta[] {
    const rutasDivididas: Ruta[] = [];
    let rutaActual: Parada[] = [];
    let pesoActual = 0;

    for (const parada of ruta.paradas) {
      if (parada && pesoActual + parada.peso_kg > capacidadMaxKg && rutaActual.length > 0) {
        rutasDivididas.push({
          ...ruta,
          id: `${ruta.id}-div-${rutasDivididas.length}`,
          paradas: rutaActual,
          peso_total_kg: pesoActual,
        });
        rutaActual = [];
        pesoActual = 0;
      }

      if (parada) {
        rutaActual.push(parada);
        pesoActual += parada.peso_kg;
      }
    }

    if (rutaActual.length > 0) {
      rutasDivididas.push({
        ...ruta,
        id: `${ruta.id}-div-${rutasDivididas.length}`,
        paradas: rutaActual,
        peso_total_kg: pesoActual,
      });
    }

    return rutasDivididas;
  }

  /**
   * Calcula eficiencia global de la planificación
   */
  private calcularEficienciaGlobal(rutas: Ruta[]): number {
    if (rutas.length === 0) return 0;

    const eficiencias = rutas.map((ruta) => {
      const capacidadMaxKg = 1000;
      return (ruta.peso_total_kg / capacidadMaxKg) * 100;
    });

    const promedio = eficiencias.reduce((a, b) => a + b, 0) / eficiencias.length;
    return Math.min(100, promedio);
  }
}
