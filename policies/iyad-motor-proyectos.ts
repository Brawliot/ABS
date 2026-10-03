/**
 * Motor de Proyectos I+D (Fase 4B)
 * Gestión de proyectos, hitos, tiempo y presupuesto
 */

import type {
  ProyectoIyD,
  Hito,
  RegistroTiempoTrabajo,
  RegistroGasto,
  ResumenPresupuesto,
  ResultadoProyecto,
  ReporteProyecto,
  EstadoProyecto,
  TipoProyecto,
} from "../elements/proyecto-iyd.js";

export class MotorProyectosIyD {
  /**
   * Crea un nuevo proyecto I+D
   */
  crearProyecto(
    id: string,
    nombre: string,
    tipo: TipoProyecto,
    objetivo: string,
    equipo: string[],
    presupuestoEstimado: number,
  ): ProyectoIyD {
    return {
      id,
      nombre,
      tipo,
      estado: "planificación",
      objetivo,
      equipo,
      presupuestoEstimado,
      hitos: [],
      tiempoTrabajo: [],
      gastos: [],
      fechaCreación: new Date(),
    };
  }

  /**
   * Agrega un hito al proyecto
   */
  agregarHito(proyecto: ProyectoIyD, hito: Hito): ProyectoIyD {
    return {
      ...proyecto,
      hitos: [...proyecto.hitos, hito],
    };
  }

  /**
   * Registra tiempo de trabajo
   */
  registrarTiempoTrabajo(
    proyecto: ProyectoIyD,
    empleadoId: string,
    empleadoNombre: string,
    horasTrabajadas: number,
    descripcion: string,
  ): ProyectoIyD {
    const registro: RegistroTiempoTrabajo = {
      id: `tiempo-${Date.now()}`,
      empleadoId,
      empleadoNombre,
      horasTrabajadas,
      fecha: new Date(),
      descripcion,
    };

    return {
      ...proyecto,
      tiempoTrabajo: [...proyecto.tiempoTrabajo, registro],
    };
  }

  /**
   * Registra un gasto
   */
  registrarGasto(
    proyecto: ProyectoIyD,
    concepto: string,
    monto: number,
    moneda: string,
    descripcion: string,
  ): ProyectoIyD {
    const gasto: RegistroGasto = {
      id: `gasto-${Date.now()}`,
      concepto,
      monto,
      moneda,
      fecha: new Date(),
      descripcion,
    };

    return {
      ...proyecto,
      gastos: [...proyecto.gastos, gasto],
    };
  }

  /**
   * Obtiene el presupuesto gastado
   */
  obtenerPresupuestoGastado(proyecto: ProyectoIyD): ResumenPresupuesto {
    // Costo de horas (asumiendo $100 por hora)
    const costoHoras = proyecto.tiempoTrabajo.reduce(
      (total, r) => total + r.horasTrabajadas * 100,
      0,
    );

    // Costos directos
    const costosDirectos = proyecto.gastos.reduce(
      (total, g) => total + g.monto,
      0,
    );

    // Total gastado
    const totalGastado = costoHoras + costosDirectos;

    // Sobrecosto
    const sobreCosto = totalGastado - proyecto.presupuestoEstimado;
    const sobreCostoEnPorc =
      (sobreCosto / proyecto.presupuestoEstimado) * 100;

    // Proyección final
    const progresohitos =
      proyecto.hitos.filter((h) => h.completado).length /
      (proyecto.hitos.length || 1);
    const proyeccioFinal =
      totalGastado + sobreCosto * (1 - progresohitos);

    return {
      presupuestoEstimado: proyecto.presupuestoEstimado,
      costoHoras,
      costosDirectos,
      totalGastado,
      sobreCostoEnPorc,
      proyeccióFinal: Math.max(totalGastado, proyeccioFinal),
    };
  }

  /**
   * Completa un hito
   */
  completarHito(
    proyecto: ProyectoIyD,
    hitoId: string,
  ): ProyectoIyD {
    return {
      ...proyecto,
      hitos: proyecto.hitos.map((h) =>
        h.id === hitoId ? { ...h, completado: true, fechaReal: new Date() } : h,
      ),
    };
  }

  /**
   * Completa el proyecto
   */
  completarProyecto(
    proyecto: ProyectoIyD,
    resultado: ResultadoProyecto,
  ): ProyectoIyD {
    return {
      ...proyecto,
      estado: "completado",
      resultado,
      fechaCompletado: new Date(),
      hitos: proyecto.hitos.map((h) => ({ ...h, completado: true })),
    };
  }

  /**
   * Genera reporte completo del proyecto
   */
  generarReporteProyecto(proyecto: ProyectoIyD): ReporteProyecto {
    const presupuesto = this.obtenerPresupuestoGastado(proyecto);
    const hitosCompletados = proyecto.hitos.filter((h) => h.completado)
      .length;
    const progreso =
      proyecto.hitos.length > 0
        ? (hitosCompletados / proyecto.hitos.length) * 100
        : 0;

    const hitosReporte = proyecto.hitos.map((h) => {
      let retrasoDías: number | undefined = undefined;
      if (h.fechaReal) {
        const diasRetraso = Math.ceil(
          (h.fechaReal.getTime() - h.fechaEstimada.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (diasRetraso > 0) retrasoDías = diasRetraso;
      }
      const resultado: { nombre: string; completado: boolean; retrasoDías?: number } = {
        nombre: h.nombre,
        completado: h.completado,
      };
      if (retrasoDías !== undefined) {
        resultado.retrasoDías = retrasoDías;
      }
      return resultado;
    });

    const horasTrabajadas = proyecto.tiempoTrabajo.reduce(
      (total, r) => total + r.horasTrabajadas,
      0,
    );

    const personas = new Set(
      proyecto.tiempoTrabajo.map((r) => r.empleadoId),
    ).size;

    const reporte: ReporteProyecto = {
      proyectoId: proyecto.id,
      nombre: proyecto.nombre,
      estado: proyecto.estado,
      progreso,
      hitos: hitosReporte,
      presupuesto,
      productividad: {
        horasTrabajadas,
        personas,
        horasPorPersona:
          personas > 0 ? horasTrabajadas / personas : 0,
      },
    };

    if (proyecto.resultado) {
      reporte.resultado = proyecto.resultado;
    }

    return reporte;
  }
}
