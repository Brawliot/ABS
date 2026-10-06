/**
 * Jev validation for departments: detect missing departments and validate suggestions
 */

interface JevDepartmentCheckInput {
  sector: string;
  modelo_negocio: string;
  departamentos_actuales: string[];
  presupuesto: string;
  equipo: string;
}

interface JevDepartmentCheckOutput {
  hay_faltantes: boolean;
  confianza: number;
  razon: string;
}

interface JevDepartmentValidateInput {
  sector: string;
  modelo_negocio: string;
  departamentos_propuestos: string[];
  departamentos_originales: string[];
  presupuesto: string;
  equipo: string;
}

interface JevDepartmentValidateOutput {
  departamentos_validos: string[];
  departamentos_rechazados: string[];
  confianza: number;
  razon: string;
}

export async function checkMissingDepartments(
  input: JevDepartmentCheckInput
): Promise<JevDepartmentCheckOutput> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY not configured");

  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemId: "departamentos-check",
      context: {
        sector: input.sector,
        modelo: input.modelo_negocio,
        presupuesto: input.presupuesto,
        equipo: input.equipo,
        departamentos_actuales: input.departamentos_actuales.join(", "),
      },
      questions: [
        {
          id: "missing_depts",
          text: `Dado el sector ${input.sector}, modelo ${input.modelo_negocio}, presupuesto ${input.presupuesto} y equipo ${input.equipo}, ¿faltan departamentos CRÍTICOS e INDEPENDIENTES en esta lista?: ${input.departamentos_actuales.join(", ")}. Responde solo SÍ o NO.`,
          required: true,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Jev API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    answers: Record<
      string,
      { choice: string; confidence: number }
    >;
  };
  const answer = data.answers.missing_depts;

  return {
    hay_faltantes:
      answer.choice.toLowerCase().includes("sí") ||
      answer.choice.toLowerCase().includes("si"),
    confianza: answer.confidence,
    razon: answer.choice,
  };
}

export async function validateDepartments(
  input: JevDepartmentValidateInput
): Promise<JevDepartmentValidateOutput> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY not configured");

  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemId: "departamentos-validate",
      context: {
        sector: input.sector,
        modelo: input.modelo_negocio,
        presupuesto: input.presupuesto,
        equipo: input.equipo,
        departamentos_originales: input.departamentos_originales.join(", "),
        departamentos_propuestos: input.departamentos_propuestos.join(", "),
      },
      questions: [
        {
          id: "validate_depts",
          text: `¿Son los siguientes departamentos válidos, críticos e independientes para un negocio de ${input.sector} con modelo ${input.modelo_negocio}?: ${input.departamentos_propuestos.join(", ")}. Valida cada uno: SÍ o NO para cada uno.`,
          required: true,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Jev API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    answers: Record<
      string,
      { choice: string; confidence: number }
    >;
  };
  const answer = data.answers.validate_depts;

  const depts = input.departamentos_propuestos;
  const choices = answer.choice.split(/[,;]/).map((c) => c.trim().toLowerCase());

  const validos: string[] = [];
  const rechazados: string[] = [];

  depts.forEach((dept, idx) => {
    if (
      choices[idx]?.includes("sí") ||
      choices[idx]?.includes("si")
    ) {
      validos.push(dept);
    } else {
      rechazados.push(dept);
    }
  });

  return {
    departamentos_validos: validos,
    departamentos_rechazados: rechazados,
    confianza: answer.confidence,
    razon: answer.choice,
  };
}

export type {
  JevDepartmentCheckInput,
  JevDepartmentCheckOutput,
  JevDepartmentValidateInput,
  JevDepartmentValidateOutput,
};
