/**
 * Motor de Rutas de Transporte (Fase 3)
 * Gestión de rutas, optimización, cálculo de distancias y tiempos
 */

export interface Coordenadas {
  readonly latitud: number;
  readonly longitud: number;
}

export interface Parada {
  readonly id: string;
  readonly cliente_id: string;
  readonly localizacion: Coordenadas;
  readonly peso_kg: number;
  readonly volumen_m3: number;
  readonly ventana_inicio: string; // HH:MM
  readonly ventana_fin: string; // HH:MM
  readonly especial?: string | undefined;
}

export interface Ruta {
  readonly id: string;
  readonly zona: string;
  readonly paradas: Parada[];
  readonly distancia_km: number;
  readonly tiempo_estimado_horas: number;
  readonly peso_total_kg: number;
  readonly volumen_total_m3: number;
  readonly orden_optimizado: Parada[];
  readonly fecha_planificada: string;
  readonly estado: 'planificada' | 'en_curso' | 'completada' | 'cancelada';
}

export interface ResultadoOptimizacion {
  readonly ruta_original_km: number;
  readonly ruta_optimizada_km: number;
  readonly ahorro_km: number;
  readonly ahorro_pct: number;
  readonly paradas_ordenadas: Parada[];
}

export class MotorRutas {
  /**
   * Calcula distancia entre dos puntos usando fórmula de Haversine
   * Retorna distancia en km
   */
  calcularDistancia(punto1: Coordenadas, punto2: Coordenadas): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.toRad(punto2.latitud - punto1.latitud);
    const dLon = this.toRad(punto2.longitud - punto1.longitud);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(punto1.latitud)) *
        Math.cos(this.toRad(punto2.latitud)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(grados: number): number {
    return (grados * Math.PI) / 180;
  }

  // Helpers para verificación de valores
  private notNull<T>(value: T | undefined | null): T {
    if (value === undefined || value === null) throw new Error('Unexpected null/undefined');
    return value;
  }

  /**
   * Calcula tiempo de entrega en horas
   * Considerando: distancia / velocidad + tiempo de paradas
   */
  calcularTiempoEntrega(
    distanciaKm: number,
    numParadas: number,
    velocidadKmxHora: number = 50,
    tiempoParadaMinutos: number = 10,
  ): number {
    const tiempoManejo = distanciaKm / velocidadKmxHora;
    const tiempoParadas = (numParadas * tiempoParadaMinutos) / 60;
    return tiempoManejo + tiempoParadas;
  }

  /**
   * Crea una ruta agrupando paquetes por zona
   */
  crearRuta(
    id: string,
    zona: string,
    paradas: Parada[],
    fechaPlanificada: string,
  ): Ruta {
    let distanciaTotal = 0;
    let pesoTotal = 0;
    let volumenTotal = 0;

    for (const parada of paradas) {
      pesoTotal += parada.peso_kg;
      volumenTotal += parada.volumen_m3;
    }

    // Estimar distancia inicial (sin optimizar)
    if (paradas.length > 1) {
      for (let i = 0; i < paradas.length - 1; i++) {
        distanciaTotal += this.calcularDistancia(
          paradas[i].localizacion,
          paradas[i + 1].localizacion,
        );
      }
    }

    const tiempoEstimado = this.calcularTiempoEntrega(
      distanciaTotal,
      paradas.length,
    );

    return {
      id,
      zona,
      paradas,
      distancia_km: distanciaTotal,
      tiempo_estimado_horas: tiempoEstimado,
      peso_total_kg: pesoTotal,
      volumen_total_m3: volumenTotal,
      orden_optimizado: paradas,
      fecha_planificada: fechaPlanificada,
      estado: 'planificada',
    };
  }

  /**
   * Optimiza ruta usando nearest neighbor (TSP)
   */
  optimizarRuta(ruta: Ruta): ResultadoOptimizacion {
    if (ruta.paradas.length <= 2) {
      return {
        ruta_original_km: ruta.distancia_km,
        ruta_optimizada_km: ruta.distancia_km,
        ahorro_km: 0,
        ahorro_pct: 0,
        paradas_ordenadas: ruta.paradas,
      };
    }

    // Implementar nearest neighbor
    const paradas = [...ruta.paradas];
    const ordenOptimizado: Parada[] = [];
    let distanciaOptimizada = 0;

    // Comenzar con la primera parada
    ordenOptimizado.push(paradas[0]);
    const visitadas = new Set([0]);

    // Nearest neighbor: siempre ir a la parada no visitada más cercana
    while (visitadas.size < paradas.length) {
      const ultimaParada = ordenOptimizado[ordenOptimizado.length - 1];
      if (!ultimaParada) break;

      let proximaParada: Parada | null = null;
      let distanciaMinima = Infinity;
      let indiceMinimo = -1;

      for (let i = 0; i < paradas.length; i++) {
        if (!visitadas.has(i)) {
          const dist = this.calcularDistancia(
            ultimaParada.localizacion,
            paradas[i]!.localizacion,
          );
          if (dist < distanciaMinima) {
            distanciaMinima = dist;
            proximaParada = paradas[i];
            indiceMinimo = i;
          }
        }
      }

      if (proximaParada) {
        ordenOptimizado.push(proximaParada);
        distanciaOptimizada += distanciaMinima;
        visitadas.add(indiceMinimo);
      }
    }

    const distanciaOriginal = ruta.distancia_km;
    const ahorro = distanciaOriginal - distanciaOptimizada;
    const ahorroPercent = distanciaOriginal > 0 ? (ahorro / distanciaOriginal) * 100 : 0;

    return {
      ruta_original_km: distanciaOriginal,
      ruta_optimizada_km: distanciaOptimizada,
      ahorro_km: ahorro,
      ahorro_pct: ahorroPercent,
      paradas_ordenadas: ordenOptimizado,
    };
  }

  /**
   * Agrega una parada a una ruta existente
   * Inserta en la posición óptima
   */
  agregarParada(ruta: Ruta, nuevaParada: Parada, posicion?: number): Ruta {
    const paradasCopia = [...ruta.paradas];

    if (posicion !== undefined && posicion >= 0 && posicion <= paradasCopia.length) {
      paradasCopia.splice(posicion, 0, nuevaParada);
    } else {
      paradasCopia.push(nuevaParada);
    }

    // Recalcular distancia
    let distancia = 0;
    for (let i = 0; i < paradasCopia.length - 1; i++) {
      distancia += this.calcularDistancia(
        paradasCopia[i].localizacion,
        paradasCopia[i + 1].localizacion,
      );
    }

    return {
      ...ruta,
      paradas: paradasCopia,
      distancia_km: distancia,
      peso_total_kg: ruta.peso_total_kg + nuevaParada.peso_kg,
      volumen_total_m3: ruta.volumen_total_m3 + nuevaParada.volumen_m3,
      tiempo_estimado_horas: this.calcularTiempoEntrega(
        distancia,
        paradasCopia.length,
      ),
    };
  }

  /**
   * Calcula eficiencia de ruta (carga real vs capacidad)
   */
  calcularEficiencia(
    ruta: Ruta,
    capacidadMaxKg: number = 1000,
    capacidadMaxM3: number = 10,
  ): { eficiencia_peso_pct: number; eficiencia_volumen_pct: number; promedio_pct: number } {
    const eficienciaPeso =
      (ruta.peso_total_kg / capacidadMaxKg) * 100;
    const eficienciaVolumen =
      (ruta.volumen_total_m3 / capacidadMaxM3) * 100;
    const promedio = (eficienciaPeso + eficienciaVolumen) / 2;

    return {
      eficiencia_peso_pct: Math.min(100, eficienciaPeso),
      eficiencia_volumen_pct: Math.min(100, eficienciaVolumen),
      promedio_pct: Math.min(100, promedio),
    };
  }
}
