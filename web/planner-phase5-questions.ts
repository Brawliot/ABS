/**
 * Phase 5: Validation and custom department questions
 */

import type { Department, Phase5Output } from "./planner-phase5-handler.js";

interface ValidationResponse {
  departamento: string;
  respuesta: "crítico" | "secundario" | "no_necesario" | "no_seguro";
}

interface CustomDepartmentResponse {
  departamentos_adicionales: string[];
  razon: string;
}

interface Phase5ConsolidatedOutput {
  departamentos_incluidos: Department[];
  departamentos_validados: Department[];
  departamentos_omitidos: Department[];
  departamentos_personalizados: Array<{
    nombre: string;
    clasificacion: "crítico" | "importante";
  }>;
  total_departamentos: number;
}

export function generateValidationQuestions(phase5: Phase5Output): Array<{
  departamento: string;
  pregunta: string;
}> {
  return phase5.departamentos_preguntar.map((dept) => ({
    departamento: dept.nombre,
    pregunta: `¿Necesitas departamento de ${dept.nombre}? (Probabilidad inferida: ${dept.probabilidad}%)`,
  }));
}

export function processValidationResponses(
  phase5: Phase5Output,
  responses: ValidationResponse[]
): {
  departamentos_validados: Department[];
  departamentos_omitidos: Department[];
} {
  const departamentos_validados: Department[] = [];
  const departamentos_omitidos: Department[] = [];

  // Agregar automáticos (>80%)
  departamentos_validados.push(...phase5.departamentos_incluidos);

  // Procesar respuestas de validación
  responses.forEach((resp) => {
    const dept = phase5.departamentos_preguntar.find(
      (d) => d.nombre === resp.departamento
    );
    if (dept) {
      if (resp.respuesta === "no_necesario") {
        departamentos_omitidos.push(dept);
      } else if (resp.respuesta === "crítico" || resp.respuesta === "secundario") {
        departamentos_validados.push({
          ...dept,
          clasificacion: resp.respuesta === "crítico" ? "crítico" : "importante",
        });
      } else if (resp.respuesta === "no_seguro") {
        // Mantener según probabilidad
        departamentos_validados.push(dept);
      }
    }
  });

  // Agregar los omitidos del threshold
  departamentos_omitidos.push(...phase5.departamentos_omitidos);

  return {
    departamentos_validados,
    departamentos_omitidos,
  };
}

export function consolidatePhase5(
  departamentos_validados: Department[],
  departamentos_personalizados: string[] | null
): Phase5ConsolidatedOutput {
  const personalized: Array<{
    nombre: string;
    clasificacion: "crítico" | "importante";
  }> = [];

  if (departamentos_personalizados && departamentos_personalizados.length > 0) {
    departamentos_personalizados.forEach((dept) => {
      personalized.push({
        nombre: dept,
        clasificacion: "importante",
      });
    });
  }

  const all_departments = [
    ...departamentos_validados,
    ...personalized.map((p) => ({
      nombre: p.nombre,
      probabilidad: 0,
      clasificacion: p.clasificacion as "crítico" | "importante" | "secundario",
      origen: "personalizado" as const,
    })),
  ];

  return {
    departamentos_incluidos: all_departments.filter((d) => d.clasificacion === "crítico"),
    departamentos_validados: all_departments.filter((d) => d.clasificacion === "importante"),
    departamentos_omitidos: [],
    departamentos_personalizados: personalized,
    total_departamentos: all_departments.length,
  };
}

export type { ValidationResponse, CustomDepartmentResponse, Phase5ConsolidatedOutput };
