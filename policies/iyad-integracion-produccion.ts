/**
 * Motor de Integración a Producción (Fase 4B)
 * Roll-out gradual, monitoreo y reversión
 */

import type {
  ProyectoIyD,
  IntegracióProducción,
  EstadoRollout,
} from "../elements/proyecto-iyd.js";

export class MotorIntegración {
  /**
   * Promueve un MVP a producción
   */
  promoverMVPaProducción(
    proyecto: ProyectoIyD,
    featureName: string,
    documentación: string,
  ): IntegracióProducción {
    return {
      proyectoId: proyecto.id,
      featureName,
      estadoRollout: "5%",
      porcentajeActual: 5,
      métricas: [],
      revertido: false,
      documentación,
    };
  }

  /**
   * Monitorea y avanza el rollout
   */
  monitorearRollout(
    integracion: IntegracióProducción,
    métricas: {
      nombre: string;
      baseline: number;
      actual: number;
    }[],
    aprobarAvance: boolean,
  ): IntegracióProducción {
    if (integracion.revertido) {
      return integracion;
    }

    // Calcular cambios
    const metrícasConCambio = métricas.map((m) => ({
      ...m,
      cambio: m.actual - m.baseline,
    }));

    if (!aprobarAvance) {
      return {
        ...integracion,
        métricas: metrícasConCambio,
      };
    }

    // Avanzar rollout
    const nuevoEstado = this.avanzarEstadoRollout(integracion.estadoRollout);
    const nuevoPorcentaje = this.obtenerPorcentajeRollout(nuevoEstado);

    return {
      ...integracion,
      estadoRollout: nuevoEstado,
      porcentajeActual: nuevoPorcentaje,
      métricas: metrícasConCambio,
    };
  }

  /**
   * Revierte cambios si algo falla
   */
  revertirCambio(
    integracion: IntegracióProducción,
    motivo: string,
  ): IntegracióProducción {
    return {
      ...integracion,
      revertido: true,
      motivoReversión: motivo,
      estadoRollout: "revertido" as EstadoRollout,
      porcentajeActual: 0,
    };
  }

  /**
   * Documenta la funcionalidad
   */
  documentarFuncionality(
    integracion: IntegracióProducción,
    documentacionNueva: string,
  ): IntegracióProducción {
    return {
      ...integracion,
      documentación: documentacionNueva,
    };
  }

  private avanzarEstadoRollout(estado: EstadoRollout): EstadoRollout {
    const secuencia: EstadoRollout[] = ["5%", "25%", "100%"];
    const indice = secuencia.indexOf(estado);

    if (indice === -1 || indice === secuencia.length - 1) {
      return "100%";
    }

    return secuencia[indice + 1] as EstadoRollout;
  }

  private obtenerPorcentajeRollout(estado: EstadoRollout): number {
    const mapping: Record<EstadoRollout, number> = {
      "5%": 5,
      "25%": 25,
      "100%": 100,
      planificado: 0,
      revertido: 0,
    };

    return mapping[estado] || 0;
  }
}
