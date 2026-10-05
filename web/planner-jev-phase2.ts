/**
 * Planner Phase 2 with Jev: Detailed business model analysis
 */

interface JevPhase2Question {
  type: "choice";
  description: string;
  properties: {
    oneOf: string[];
  };
}

interface JevPhase2Request {
  state: string;
  model: string;
  questions: Record<string, JevPhase2Question>;
}

interface JevPhase2Answer {
  type: "choice";
  choice?: string;
}

interface JevPhase2Response {
  model: string;
  answers: Record<string, JevPhase2Answer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

const JEV_PHASE2_QUESTIONS: Record<string, JevPhase2Question> = {
  modelo_negocio: {
    type: "choice",
    description: "¿Cuál es tu modelo de negocio?",
    properties: {
      oneOf: [
        "B2C Directo (consumidor final)",
        "B2B (empresa a empresa)",
        "B2B2C",
        "C2C / Marketplace",
        "SaaS / Suscripción",
        "Freemium",
        "Híbrido",
        "Otros",
      ],
    },
  },
  cliente_objetivo: {
    type: "choice",
    description: "¿Cuál es tu cliente objetivo?",
    properties: {
      oneOf: [
        "Consumidor individual",
        "Pequeñas empresas (1-50)",
        "Medianas empresas (51-250)",
        "Grandes empresas (250+)",
        "Multinacionales",
        "Sector público",
        "ONGs",
        "Mixto",
      ],
    },
  },
  presupuesto: {
    type: "choice",
    description: "¿Cuál es tu presupuesto/escala inicial?",
    properties: {
      oneOf: [
        "Muy bajo (< €5k)",
        "Bajo (€5k - €25k)",
        "Medio (€25k - €100k)",
        "Alto (€100k - €500k)",
        "Muy alto (€500k - €1M)",
        "Inversión importante (€1M+)",
        "Bootstrap / Autofinanciado",
      ],
    },
  },
  dependencia: {
    type: "choice",
    description: "¿Cuál es tu dependencia de terceros?",
    properties: {
      oneOf: [
        "Autónomo (0%)",
        "Baja (1-2 partners clave)",
        "Media (3-5 partners clave)",
        "Alta (6+ partners clave)",
        "Crítica (no funciona sin partners)",
        "Ecosistema (modelo plataforma)",
      ],
    },
  },
  experiencia: {
    type: "choice",
    description: "¿Cuál es tu experiencia/expertise?",
    properties: {
      oneOf: [
        "Sin experiencia",
        "Experiencia técnica",
        "Experiencia comercial",
        "Experiencia directiva",
        "Experiencia en el sector",
        "Emprendedor serial",
        "Expertise dual o múltiple",
      ],
    },
  },
  validacion: {
    type: "choice",
    description: "¿Cuál es el estado de validación actual?",
    properties: {
      oneOf: [
        "Idea sin validar",
        "Problema validado",
        "Solución prototipada",
        "Solución validada",
        "MVP en operación",
        "Producto consolidado",
        "Tracción probada",
      ],
    },
  },
  equipo: {
    type: "choice",
    description: "¿Cuál es tu equipo/recursos humanos disponibles?",
    properties: {
      oneOf: [
        "Solo fundador",
        "Fundador + 1 co-fundador",
        "Fundador + equipo (2-3)",
        "Equipo pequeño (4-6)",
        "Equipo completo (7+)",
        "Solo freelancers/contratistas",
        "Acceso a talent pool",
      ],
    },
  },
  regulacion: {
    type: "choice",
    description: "¿Cuál es el nivel de regulación/compliance crítica?",
    properties: {
      oneOf: [
        "Sin regulación relevante",
        "Regulación light",
        "Regulación moderada",
        "Regulación fuerte",
        "Regulación crítica",
        "Multi-jurisdiccional",
        "Riesgo muy alto",
      ],
    },
  },
};

interface AnalyzedPhase2Results {
  modelo_negocio: string;
  cliente_objetivo: string;
  presupuesto: string;
  dependencia: string;
  experiencia: string;
  validacion: string;
  equipo: string;
  regulacion: string;
}

export async function analyzeWithJevPhase2(
  originalInput: string,
  subsector: string,
  localizacion: string,
  timeline: string
): Promise<AnalyzedPhase2Results> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    throw new Error("TYPESAFE_API_KEY no está configurado");
  }

  const state = `
DESCRIPCIÓN ORIGINAL: ${originalInput}

ANÁLISIS REFINADO (Fase 1):
- Subsector: ${subsector}
- Localización: ${localizacion}
- Timeline: ${timeline}

Ahora analiza el modelo de negocio específico con estas preguntas.
`;

  const request: JevPhase2Request = {
    state,
    model: "jev-latest",
    questions: JEV_PHASE2_QUESTIONS,
  };

  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jev Phase 2 API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as JevPhase2Response;

  const results: AnalyzedPhase2Results = {
    modelo_negocio: data.answers.modelo_negocio?.choice || "",
    cliente_objetivo: data.answers.cliente_objetivo?.choice || "",
    presupuesto: data.answers.presupuesto?.choice || "",
    dependencia: data.answers.dependencia?.choice || "",
    experiencia: data.answers.experiencia?.choice || "",
    validacion: data.answers.validacion?.choice || "",
    equipo: data.answers.equipo?.choice || "",
    regulacion: data.answers.regulacion?.choice || "",
  };

  return results;
}

export type { AnalyzedPhase2Results, JevPhase2Response };
