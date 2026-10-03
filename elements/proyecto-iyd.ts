/**
 * Tipos para I+D (Investigación + Desarrollo) - Fase 4B
 * Gestión de proyectos, experimentos, MVPs y roll-outs
 */

export type EstadoProyecto = "planificación" | "desarrollo" | "pruebas" | "completado" | "cancelado";
export type TipoProyecto = "MVprime" | "producto" | "mejora" | "investigacion";
export type TipoExperimento = "ab" | "multivariado" | "piloto";
export type EstadoRollout = "planificado" | "5%" | "25%" | "100%" | "revertido";

export interface Hito {
  id: string;
  nombre: string;
  fechaEstimada: Date;
  fechaReal?: Date;
  completado: boolean;
  dependencias: string[]; // IDs de hitos de los que depende
}

export interface RegistroTiempoTrabajo {
  id: string;
  empleadoId: string;
  empleadoNombre: string;
  horasTrabajadas: number;
  fecha: Date;
  descripcion: string;
}

export interface RegistroGasto {
  id: string;
  concepto: string; // herramientas, servicios, hardware, etc.
  monto: number;
  moneda: string;
  fecha: Date;
  descripcion: string;
}

export interface ResumenPresupuesto {
  presupuestoEstimado: number;
  costoHoras: number;
  costosDirectos: number;
  totalGastado: number;
  sobreCostoEnPorc: number;
  proyeccióFinal?: number;
}

export interface ResultadoProyecto {
  éxito: boolean;
  métrica: string; // qué se midió
  metrícaValor: number;
  metrícaUnidad: string;
  roi: number; // retorno sobre inversión
  aprendizajes: string[];
  recomendación: string;
}

export interface ProyectoIyD {
  id: string;
  nombre: string;
  tipo: TipoProyecto;
  estado: EstadoProyecto;
  objetivo: string;
  equipo: string[]; // IDs de empleados
  presupuestoEstimado: number;
  hitos: Hito[];
  tiempoTrabajo: RegistroTiempoTrabajo[];
  gastos: RegistroGasto[];
  resultado?: ResultadoProyecto;
  fechaCreación: Date;
  fechaCompletado?: Date;
}

export interface ReporteProyecto {
  proyectoId: string;
  nombre: string;
  estado: EstadoProyecto;
  progreso: number; // % completado
  hitos: {
    nombre: string;
    completado: boolean;
    retrasoDías?: number;
  }[];
  presupuesto: ResumenPresupuesto;
  productividad: {
    horasTrabajadas: number;
    personas: number;
    horasPorPersona: number;
  };
  resultado?: ResultadoProyecto;
}

export interface Experimento {
  id: string;
  nombre: string;
  tipo: TipoExperimento;
  descripción: string;
  hipótesis: string;
  grupoControl: {
    tamaño: number;
    métrica: string;
    resultado: number;
  };
  grupoTratamiento: {
    tamaño: number;
    métrica: string;
    resultado: number;
  };
  confianza: number; // % confianza estadística (95%)
  nivelSignificancia: number; // p-value
  ganador?: "control" | "tratamiento" | "empate";
  fechaInicio: Date;
  fechaFinal?: Date;
}

export interface ResultadoExperimento {
  experimentoId: string;
  diferencia: number;
  porcentajeChange: number;
  pValue: number;
  esSignificante: boolean;
  confianzaEstadística: number;
  ganador: "control" | "tratamiento" | "empate";
  tamaño_Muestra_Requerido?: number;
}

export interface PortfolioExperimentos {
  experimentos: Experimento[];
  tasaÉxito: number; // % de experimentos con ganador significante
  learningRate: number; // experimentos completados / tiempo
  impactoPromedio: number;
}

export interface IntegracióProducción {
  proyectoId: string;
  featureName: string;
  estadoRollout: EstadoRollout;
  porcentajeActual: number;
  métricas: {
    nombre: string;
    baseline: number;
    actual: number;
    cambio: number;
  }[];
  revertido: boolean;
  motivoReversión?: string;
  documentación: string;
}
