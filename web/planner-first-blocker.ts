/**
 * Calculate first blocker department using deterministic scoring formula
 */

interface PlannerAnalysisInput {
  phase1: any;
  phase2: any;
  jevPhase2: any;
  phase5: any;
  resources: any;
}

interface DepartmentScore {
  nombre: string;
  criticidad_base: number;
  dependencias_insatisfechas: number;
  riesgo_de_fallo: number;
  cascada_impacto: number;
  tiempo_hasta_impacto: number;
  incertidumbre: number;
  info_pendiente_usuario: number;
  punto_no_retorno: number;
  confirmado: number;
  reversibilidad: number;
  recursos_insuficientes: number;
  score_final: number;
}

interface FirstBlockerResult {
  ranking: Array<{ posicion: number; departamento: string; score: number }>;
  primer_bloqueador: {
    departamento: string;
    score: number;
    variables_criticas: Record<string, number>;
  };
  primer_paso: {
    departamento: string;
    sub_departamento: string;
    tarea: string;
    paso: string;
    descripcion: string;
    duracion_estimada: string;
  };
  timeline_impacto: string;
}

export async function calculateFirstBlocker(
  analysis: PlannerAnalysisInput
): Promise<FirstBlockerResult> {
  const sectors = analysis.phase1?.answers?.sector?.choice || "Desconocido";
  const modelo = analysis.jevPhase2?.modelo_negocio || "Desconocido";
  const presupuesto = analysis.resources?.presupuesto || 40000;
  const equipo = analysis.resources?.equipo || "Solo";
  const ubicacion_confirmada = analysis.jevPhase2?.dependencia === "Ubicación confirmada";

  // Deterministic scoring formula for each department
  const scoringFormula = (variables: any): number => {
    return (
      variables.criticidad_base * 0.2 +
      variables.dependencias_insatisfechas * 0.15 +
      variables.riesgo_de_fallo * 0.15 +
      variables.cascada_impacto * 0.15 +
      variables.tiempo_hasta_impacto * 0.1 +
      variables.incertidumbre * 0.1 +
      variables.info_pendiente_usuario * 0.1 +
      variables.punto_no_retorno * 0.05 -
      variables.confirmado * 0.1 -
      variables.reversibilidad * 0.05 +
      variables.recursos_insuficientes * 0.05
    );
  };

  // Department scores based on context
  const departmentScores: Record<string, any> = {
    "Legal & Compliance": {
      criticidad_base: 90,
      dependencias_insatisfechas: 20,
      riesgo_de_fallo: 95,
      cascada_impacto: 75,
      tiempo_hasta_impacto: 100,
      incertidumbre: 35,
      info_pendiente_usuario: 65,
      punto_no_retorno: 85,
      confirmado: 0,
      reversibilidad: 40,
      recursos_insuficientes: 0,
    },
    Infraestructura: {
      criticidad_base: 85,
      dependencias_insatisfechas: 70,
      riesgo_de_fallo: 80,
      cascada_impacto: 65,
      tiempo_hasta_impacto: 95,
      incertidumbre: ubicacion_confirmada ? 20 : 80,
      info_pendiente_usuario: 75,
      punto_no_retorno: 80,
      confirmado: ubicacion_confirmada ? -100 : 0,
      reversibilidad: 20,
      recursos_insuficientes: presupuesto < 50000 ? 35 : 0,
    },
    Finanzas: {
      criticidad_base: 85,
      dependencias_insatisfechas: 0,
      riesgo_de_fallo: 80,
      cascada_impacto: 95,
      tiempo_hasta_impacto: 100,
      incertidumbre: 10,
      info_pendiente_usuario: 20,
      punto_no_retorno: 60,
      confirmado: -90,
      reversibilidad: 10,
      recursos_insuficientes: 0,
    },
    RRHH: {
      criticidad_base: 70,
      dependencias_insatisfechas: 50,
      riesgo_de_fallo: 60,
      cascada_impacto: 80,
      tiempo_hasta_impacto: 80,
      incertidumbre: 40,
      info_pendiente_usuario: 70,
      punto_no_retorno: 40,
      confirmado: 0,
      reversibilidad: 30,
      recursos_insuficientes: 20,
    },
    Operativo: {
      criticidad_base: 95,
      dependencias_insatisfechas: 60,
      riesgo_de_fallo: 85,
      cascada_impacto: 90,
      tiempo_hasta_impacto: 90,
      incertidumbre: 50,
      info_pendiente_usuario: 80,
      punto_no_retorno: 70,
      confirmado: 0,
      reversibilidad: 35,
      recursos_insuficientes: 25,
    },
    Sanidad: {
      criticidad_base: 80,
      dependencias_insatisfechas: 30,
      riesgo_de_fallo: 90,
      cascada_impacto: 60,
      tiempo_hasta_impacto: 85,
      incertidumbre: 45,
      info_pendiente_usuario: 55,
      punto_no_retorno: 75,
      confirmado: 0,
      reversibilidad: 50,
      recursos_insuficientes: 10,
    },
    Tecnología: {
      criticidad_base: 60,
      dependencias_insatisfechas: 40,
      riesgo_de_fallo: 65,
      cascada_impacto: 50,
      tiempo_hasta_impacto: 60,
      incertidumbre: 55,
      info_pendiente_usuario: 60,
      punto_no_retorno: 35,
      confirmado: 0,
      reversibilidad: 20,
      recursos_insuficientes: 40,
    },
    Marketing: {
      criticidad_base: 65,
      dependencias_insatisfechas: 30,
      riesgo_de_fallo: 55,
      cascada_impacto: 50,
      tiempo_hasta_impacto: 60,
      incertidumbre: 65,
      info_pendiente_usuario: 70,
      punto_no_retorno: 40,
      confirmado: 0,
      reversibilidad: 20,
      recursos_insuficientes: 25,
    },
    Producto: {
      criticidad_base: 85,
      dependencias_insatisfechas: 50,
      riesgo_de_fallo: 80,
      cascada_impacto: 75,
      tiempo_hasta_impacto: 80,
      incertidumbre: 45,
      info_pendiente_usuario: 70,
      punto_no_retorno: 60,
      confirmado: 0,
      reversibilidad: 25,
      recursos_insuficientes: 20,
    },
  };

  // Calculate final scores
  const ranked = Object.entries(departmentScores)
    .map(([nombre, variables]) => ({
      nombre,
      ...variables,
      score_final: scoringFormula(variables),
    }))
    .sort((a, b) => b.score_final - a.score_final);

  const top3 = ranked.slice(0, 3);
  const primeraBlocker = ranked[0];

  return {
    ranking: top3.map((d, i) => ({
      posicion: i + 1,
      departamento: d.nombre,
      score: Math.round(d.score_final * 100) / 100,
    })),
    primer_bloqueador: {
      departamento: primeraBlocker.nombre,
      score: Math.round(primeraBlocker.score_final * 100) / 100,
      variables_criticas: {
        criticidad_base: primeraBlocker.criticidad_base,
        tiempo_hasta_impacto: primeraBlocker.tiempo_hasta_impacto,
        cascada_impacto: primeraBlocker.cascada_impacto,
      },
    },
    primer_paso: {
      departamento: primeraBlocker.nombre,
      sub_departamento: "Preparación",
      tarea: "Diagnóstico inicial",
      paso: "Definir criterios y validar precondiciones",
      descripcion: `Establece qué necesita ${primeraBlocker.nombre.toLowerCase()} para comenzar. Identifica blockers inmediatos.`,
      duracion_estimada: "1-2 horas",
    },
    timeline_impacto: "Impacta proyecto en 1-2 semanas si no se inicia",
  };
}

export type { FirstBlockerResult, PlannerAnalysisInput };
