/**
 * Tipos para el Simulador Financiero (Fase 4B)
 * Proyecciones, escenarios, sensibilidad y validación
 */

export type ModeloProyeccion = "lineal" | "exponencial" | "estacional" | "polinómico";
export type Tendencia = "alcista" | "bajista" | "lateral";
export type EscenarioTipo = "pesimista" | "realista" | "optimista";

export interface DatoPunto {
  fecha: Date;
  valor: number;
}

export interface ProyeccionLineal {
  modelo: "lineal";
  pendiente: number;
  intercepto: number;
  r2: number;
  predicciones: DatoPunto[];
}

export interface ProyeccionExponencial {
  modelo: "exponencial";
  basee: number; // e o base natural
  exponente: number;
  r2: number;
  predicciones: DatoPunto[];
}

export interface ProyeccionEstacional {
  modelo: "estacional";
  ciclo: number; // longitud del ciclo (ej: 12 meses)
  amplitud: number;
  tendenciaBase: Tendencia;
  r2: number;
  predicciones: DatoPunto[];
}

export interface ProyeccionPolinómica {
  modelo: "polinómico";
  grado: number;
  coeficientes: number[];
  r2: number;
  predicciones: DatoPunto[];
}

export type Proyección =
  | ProyeccionLineal
  | ProyeccionExponencial
  | ProyeccionEstacional
  | ProyeccionPolinómica;

export interface Escenario {
  tipo: EscenarioTipo;
  variacionIngresos: number; // % (ej: -20, 0, +30)
  variacionCostos: number; // % (ej: +15, 0, -10)
  descripcion: string;
  proyeccion: Proyección;
  resultadosProyectados: {
    ingresosProyectados: number[];
    costosProyectados: number[];
    gananciaProyectada: number[];
    periodos: Date[];
  };
}

export interface ComparativaEscenarios {
  pesimista: Escenario;
  realista: Escenario;
  optimista: Escenario;
  tabla: {
    metrica: string;
    pesimista: number;
    realista: number;
    optimista: number;
  }[];
}

export interface AnálisisSensibilidad {
  variable: string; // "precio", "volumen", "costoFijo", etc.
  valorBase: number;
  rango: {
    minimo: number;
    maximo: number;
  };
  impactos: {
    valor: number;
    impactoEnResultado: number; // cambio en ganancia
    porcentaje: number;
  }[];
}

export interface Elasticidad {
  variable: string;
  elasticidad: number; // % cambio resultado / % cambio variable
  interpretacion: "elástica" | "inelástica" | "unitaria";
}

export interface PuntoEquilibrio {
  variable: string;
  valorEquilibrio: number;
  resultadoActual: number;
  margenDeSeguridad: number; // % de cambio permitido antes de pérdida
}

export interface GráficoTornadoSensibilidad {
  variables: {
    nombre: string;
    impactoPositivo: number;
    impactoNegativo: number;
    rangoTotal: number;
  }[];
}

export interface GuardadoSimulación {
  id: string;
  fecha: Date;
  modelo: ModeloProyeccion;
  datoHistórico: DatoPunto[];
  proyección: Proyección;
  r2: number;
  tendencia: Tendencia;
}

export interface ValidacionSimulación {
  simulacionId: string;
  datosReales: DatoPunto[];
  predicciones: DatoPunto[];
  error: number; // RMSE
  acierto: number; // % de predicciones correctas
  desviacionAnalisis: string;
}

export interface AccuracyPorModelo {
  modelo: ModeloProyeccion;
  accuracy: number;
  conteo: number;
  ultimaUsada: Date;
}

export interface RecomendaciónModelo {
  modeloRecomendado: ModeloProyeccion;
  accuracy: number;
  justificación: string;
  datosInsuficientes: boolean;
}
