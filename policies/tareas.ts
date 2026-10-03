import type { TareaCrm } from '../elements/tarea-crm.js';

export interface FiltrosTareas {
  readonly estado?: 'pendiente' | 'completada';
  readonly prioridad?: 'baja' | 'media' | 'alta';
  readonly asignadoA?: string;
  readonly venceAntes?: Date;
  readonly etiquetas?: string[];
  readonly sinAsignar?: boolean;
}

export interface ReporteProductividad {
  readonly tareasCompletadas: number;
  readonly tareasPromedioXDia: number;
  readonly tiempoPromedio: number;
  readonly tasaPrioridad: { alta: number; media: number; baja: number };
}

export class MotorTareas {
  constructor(private readonly tareas: TareaCrm[]) {}

  filtrarTareas(filtros: FiltrosTareas): TareaCrm[] {
    return this.tareas.filter(tarea => {
      if (filtros.estado && tarea.estado !== filtros.estado) return false;
      if (filtros.prioridad && tarea.prioridad !== filtros.prioridad) return false;
      if (filtros.asignadoA && tarea.asignadoA !== filtros.asignadoA) return false;
      if (filtros.venceAntes && tarea.vencimiento && tarea.vencimiento > filtros.venceAntes) {
        return false;
      }
      if (filtros.sinAsignar && tarea.asignadoA) return false;
      if (filtros.etiquetas && filtros.etiquetas.length > 0) {
        const tieneEtiqueta = filtros.etiquetas.some(e => tarea.etiquetaIds.includes(e));
        if (!tieneEtiqueta) return false;
      }
      return true;
    });
  }

  obtenerTareasVencidasHoy(): TareaCrm[] {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    return this.filtrarTareas({
      estado: 'pendiente',
      venceAntes: mañana,
    }).filter(t => t.vencimiento && t.vencimiento >= hoy && t.vencimiento < mañana);
  }

  obtenerTareasProximasAVencer(diasAnticipacion: number = 1): TareaCrm[] {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + diasAnticipacion + 1);

    return this.filtrarTareas({
      estado: 'pendiente',
      venceAntes: limite,
    }).filter(t => t.vencimiento && t.vencimiento > hoy && t.vencimiento <= limite);
  }

  generarReporteProductividad(desde: Date, hasta: Date): ReporteProductividad {
    const tareasCompletadasEnRango = this.tareas.filter(t => {
      if (t.estado !== 'completada' || !t.completadoEn) return false;
      return t.completadoEn >= desde && t.completadoEn <= hasta;
    });

    const tareasCompletadas = tareasCompletadasEnRango.length;
    const diasTranscurridos = (hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24);
    const tareasPromedioXDia = diasTranscurridos > 0 ? tareasCompletadas / diasTranscurridos : 0;

    const tiemposEnDias = tareasCompletadasEnRango.map(t => {
      if (!t.completadoEn) return 0;
      return (t.completadoEn.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    });
    const tiempoPromedio = tiemposEnDias.length > 0
      ? tiemposEnDias.reduce((a, b) => a + b, 0) / tiemposEnDias.length
      : 0;

    const tasaPrioridad = {
      alta: tareasCompletadasEnRango.filter(t => t.prioridad === 'alta').length,
      media: tareasCompletadasEnRango.filter(t => t.prioridad === 'media').length,
      baja: tareasCompletadasEnRango.filter(t => t.prioridad === 'baja').length,
    };

    return {
      tareasCompletadas,
      tareasPromedioXDia,
      tiempoPromedio,
      tasaPrioridad,
    };
  }
}
