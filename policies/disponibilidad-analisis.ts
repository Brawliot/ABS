/**
 * Motor de Análisis de Ocupación: Métricas de ocupación,
 * detección de patrones y predicción de demanda.
 */

import type { Reserva, Cancelación } from "./disponibilidad-motor.js";

export interface MetricasOcupación {
  readonly ocupación: number; // %
  readonly cancelaciones: number;
  readonly noShows: number;
  readonly tasaCancelación: number; // %
  readonly tasaNoShow: number; // %
  readonly ingresoPromedio: number;
}

export interface PatrónOcupación {
  readonly diaLaborable?: number; // % ocupación en lunes-viernes
  readonly finDeSemana?: number; // % ocupación en sábado-domingo
  readonly horasPico: string[]; // ["09:00", "14:00"]
  readonly horasValles: string[];
}

export interface ProyecciónDemanda {
  readonly fecha: Date;
  readonly ocupacionEsperada: number; // %
  readonly confianza: number; // 0-100
}

export interface PreciosDinámicos {
  readonly precioBase: number;
  readonly factor: number; // 0.5 a 2.0
  readonly precioFinal: number;
  readonly razon: string;
}

export class MotorAnálisisOcupación {
  obtenerMetricasOcupación(
    reservas: readonly Reserva[],
    cancelaciones: readonly Cancelación[]
  ): MetricasOcupación {
    const horasTotales = 30 * 24; // Últimos 30 días
    const horasReservadas = reservas
      .filter(r => r.estado === "confirmada" || r.estado === "completada")
      .reduce((sum, r) => {
        const ms = r.fechaFin.getTime() - r.fechaInicio.getTime();
        return sum + ms / (1000 * 60 * 60);
      }, 0);

    const ocupación = Math.round((horasReservadas / horasTotales) * 100);
    const tasaCancelación = Math.round(
      (cancelaciones.length / (reservas.length || 1)) * 100
    );

    return {
      ocupación,
      cancelaciones: cancelaciones.length,
      noShows: 0, // Placeholder
      tasaCancelación,
      tasaNoShow: 0,
      ingresoPromedio: Math.round(
        reservas.reduce((sum, r) => sum + (r.contacto ? 100 : 0), 0) / (reservas.length || 1)
      ),
    };
  }

  detectarPatronesOcupación(reservas: readonly Reserva[]): PatrónOcupación {
    const diaLaboral: number[] = [];
    const finSemana: number[] = [];
    const horasCuenta = new Map<string, number>();

    for (const reserva of reservas) {
      const diaSemana = reserva.fechaInicio.getDay();
      const hora = String(reserva.fechaInicio.getHours()).padStart(2, "0") + ":00";

      const ms = reserva.fechaFin.getTime() - reserva.fechaInicio.getTime();
      const horas = ms / (1000 * 60 * 60);

      if (diaSemana >= 1 && diaSemana <= 5) {
        diaLaboral.push(horas);
      } else {
        finSemana.push(horas);
      }

      horasCuenta.set(hora, (horasCuenta.get(hora) || 0) + horas);
    }

    const promedioLaboral =
      diaLaboral.length > 0
        ? Math.round(
            (diaLaboral.reduce((a, b) => a + b, 0) / diaLaboral.length / 24) * 100
          )
        : 0;

    const promedioFinSemana =
      finSemana.length > 0
        ? Math.round(
            (finSemana.reduce((a, b) => a + b, 0) / finSemana.length / 24) * 100
          )
        : 0;

    // Detectar horas pico (más reservas)
    const horasOrdenadas = Array.from(horasCuenta.entries())
      .sort((a, b) => b[1] - a[1]);

    const horasPico = horasOrdenadas.slice(0, 3).map(h => h[0]);
    const horasValles = horasOrdenadas.slice(-3).map(h => h[0]);

    return {
      diaLaborable: promedioLaboral,
      finDeSemana: promedioFinSemana,
      horasPico,
      horasValles,
    };
  }

  proyectarDemanda(
    reservas: readonly Reserva[],
    diasAdelante: number = 30
  ): ProyecciónDemanda[] {
    const patrones = this.detectarPatronesOcupación(reservas);
    const proyecciones: ProyecciónDemanda[] = [];

    const ahora = new Date();

    for (let i = 1; i <= diasAdelante; i++) {
      const fecha = new Date(ahora);
      fecha.setDate(fecha.getDate() + i);

      const diaSemana = fecha.getDay();
      let ocupacionEsperada = 0;

      if (diaSemana >= 1 && diaSemana <= 5) {
        ocupacionEsperada = patrones.diaLaborable || 50;
      } else {
        ocupacionEsperada = patrones.finDeSemana || 60;
      }

      proyecciones.push({
        fecha,
        ocupacionEsperada: Math.max(0, Math.min(100, ocupacionEsperada)),
        confianza: 75,
      });
    }

    return proyecciones;
  }

  sugerirPreciosDinámicos(
    ocupación: number,
    precioBase: number,
    ocupacionObjetivo: number = 80
  ): PreciosDinámicos {
    let factor = 1;
    let razon = "Precio normal";

    if (ocupación > ocupacionObjetivo) {
      factor = 1 + (ocupación - ocupacionObjetivo) / 100;
      razon = "Alta demanda - Precio aumentado";
    } else if (ocupación < ocupacionObjetivo * 0.5) {
      factor = 0.7;
      razon = "Baja demanda - Precio reducido";
    } else if (ocupación < ocupacionObjetivo) {
      factor = 0.85;
      razon = "Demanda moderada - Descuento aplicado";
    }

    factor = Math.max(0.5, Math.min(2.0, factor));
    const precioFinal = Math.round(precioBase * factor);

    return {
      precioBase,
      factor: Math.round(factor * 100) / 100,
      precioFinal,
      razon,
    };
  }

  calcularIngresoEstimado(
    reservas: readonly Reserva[],
    precioPromedio: number
  ): number {
    const confirmadas = reservas.filter(r => r.estado === "confirmada" || r.estado === "completada");
    return confirmadas.length * precioPromedio;
  }
}
