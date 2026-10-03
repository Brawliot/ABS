/**
 * Motor de Costos de Transporte (Fase 3)
 * Cálculo de costos, comparación de proveedores, márgenes
 */

import type { Ruta } from './rutas-transporte.js';

export interface TarifaProveedor {
  readonly id: string;
  readonly nombre: string;
  readonly costo_base_centimos: number;
  readonly costo_por_km_centimos: number;
  readonly costo_por_kg_centimos: number;
  readonly tiempo_entrega_horas: number;
  readonly cobertura_zonas: string[];
  readonly rating: number; // 1-5
}

export interface CostoRuta {
  readonly proveedor_id: string;
  readonly proveedor_nombre: string;
  readonly costo_base: number;
  readonly costo_distancia: number;
  readonly costo_peso: number;
  readonly costo_total_centimos: number;
  readonly tiempo_entrega_horas: number;
  readonly rating: number;
}

export interface ComparativaProveedores {
  readonly ruta_id: string;
  readonly opciones: CostoRuta[];
  readonly mas_economico: CostoRuta;
  readonly mas_rapido: CostoRuta;
  readonly mejor_balance: CostoRuta;
}

export interface Margen {
  readonly costo_centimos: number;
  readonly tarifa_cliente_centimos: number;
  readonly margen_centimos: number;
  readonly margen_pct: number;
  readonly rentable: boolean;
}

export class MotorCostosTransporte {
  private proveedores: TarifaProveedor[] = [];

  constructor(proveedoresInicial?: TarifaProveedor[]) {
    if (proveedoresInicial) {
      this.proveedores = proveedoresInicial;
    }
  }

  /**
   * Registra un proveedor de transporte
   */
  registrarProveedor(proveedor: TarifaProveedor): void {
    // Reemplazar si existe, sino agregar
    const indice = this.proveedores.findIndex((p) => p.id === proveedor.id);
    if (indice >= 0) {
      this.proveedores[indice] = proveedor;
    } else {
      this.proveedores.push(proveedor);
    }
  }

  /**
   * Calcula costo de transporte para una ruta con un proveedor
   */
  calcularCosto(ruta: Ruta, proveedor: TarifaProveedor): CostoRuta {
    const costoBase = proveedor.costo_base_centimos;
    const costoDistancia = ruta.distancia_km * proveedor.costo_por_km_centimos;
    const costoPeso = ruta.peso_total_kg * proveedor.costo_por_kg_centimos;

    const costoTotal = costoBase + costoDistancia + costoPeso;

    return {
      proveedor_id: proveedor.id,
      proveedor_nombre: proveedor.nombre,
      costo_base: costoBase,
      costo_distancia: costoDistancia,
      costo_peso: costoPeso,
      costo_total_centimos: Math.round(costoTotal),
      tiempo_entrega_horas: proveedor.tiempo_entrega_horas,
      rating: proveedor.rating,
    };
  }

  /**
   * Compara costos con todos los proveedores disponibles
   */
  compararProveedores(ruta: Ruta): ComparativaProveedores {
    const opciones: CostoRuta[] = [];

    for (const proveedor of this.proveedores) {
      // Verificar si el proveedor cubre la zona
      if (proveedor.cobertura_zonas.includes(ruta.zona)) {
        const costo = this.calcularCosto(ruta, proveedor);
        opciones.push(costo);
      }
    }

    // Ordenar por costo
    opciones.sort((a, b) => a.costo_total_centimos - b.costo_total_centimos);

    const masEconomico = opciones[0] || {
      proveedor_id: '', proveedor_nombre: '', costo_base: 0,
      costo_distancia: 0, costo_peso: 0, costo_total_centimos: 0,
      tiempo_entrega_horas: 0, rating: 0
    };
    const masRapido = [...opciones].sort(
      (a, b) => a.tiempo_entrega_horas - b.tiempo_entrega_horas,
    )[0] || masEconomico;

    // Mejor balance: combine costo + tiempo + rating
    const mejorBalance = [...opciones].sort((a, b) => {
      const scoreA = a.costo_total_centimos / 100000 + a.tiempo_entrega_horas - a.rating;
      const scoreB = b.costo_total_centimos / 100000 + b.tiempo_entrega_horas - b.rating;
      return scoreA - scoreB;
    })[0] || masEconomico;

    return {
      ruta_id: ruta.id,
      opciones,
      mas_economico: masEconomico,
      mas_rapido: masRapido,
      mejor_balance: mejorBalance,
    };
  }

  /**
   * Selecciona el proveedor óptimo según criterio
   */
  seleccionarOptimal(
    ruta: Ruta,
    criterio: 'costo' | 'velocidad' | 'equilibrio' = 'equilibrio',
  ): CostoRuta | null {
    const comparativa = this.compararProveedores(ruta);

    if (comparativa.opciones.length === 0) {
      return null;
    }

    switch (criterio) {
      case 'costo':
        return comparativa.mas_economico;
      case 'velocidad':
        return comparativa.mas_rapido;
      case 'equilibrio':
      default:
        return comparativa.mejor_balance;
    }
  }

  /**
   * Calcula margen de ganancia
   */
  calcularMargen(
    costoRutaCentimos: number,
    tarifaClienteCentimos: number,
  ): Margen {
    const margenCentimos = tarifaClienteCentimos - costoRutaCentimos;
    const margenPct =
      tarifaClienteCentimos > 0
        ? (margenCentimos / tarifaClienteCentimos) * 100
        : 0;

    return {
      costo_centimos: costoRutaCentimos,
      tarifa_cliente_centimos: tarifaClienteCentimos,
      margen_centimos: margenCentimos,
      margen_pct: margenPct,
      rentable: margenCentimos > 0,
    };
  }

  /**
   * Calcula tarifa recomendada con margen objetivo
   */
  calcularTarifaConMargen(
    costoRutaCentimos: number,
    margenObjetivoPct: number = 30,
  ): number {
    // tarifa = costo / (1 - margen%)
    const margenDecimal = margenObjetivoPct / 100;
    return costoRutaCentimos / (1 - margenDecimal);
  }

  /**
   * Obtiene proveedores para una zona
   */
  obtenerProveedoresZona(zona: string): TarifaProveedor[] {
    return this.proveedores.filter((p) => p.cobertura_zonas.includes(zona));
  }

  /**
   * Obtiene el proveedor con mejor rating
   */
  obtenerProveedorMejorRating(): TarifaProveedor | null {
    if (this.proveedores.length === 0) return null;
    const mejor = [...this.proveedores].sort((a, b) => b.rating - a.rating)[0];
    return mejor || null;
  }
}
