/**
 * Planner Phase 2 with Jev: Detailed business model analysis
 */

interface JevPhase2Question {
  type: "choice";
  description: string;
  criteria: Record<string, string>;
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
    criteria: {
      "B2C Directo": "Vendes directamente al consumidor final",
      "B2B": "Vendes a otras empresas",
      "B2B2C": "Vendes a empresas que venden al consumidor final",
      "C2C": "Marketplace entre consumidores",
      "SaaS": "Software como servicio con suscripción recurrente",
      "Freemium": "Versión gratuita y versión de pago",
      "Híbrido": "Combinación de varios modelos",
      "Otros": "Modelo diferente a los anteriores",
    },
  },
  cliente_objetivo: {
    type: "choice",
    description: "¿Cuál es tu cliente objetivo?",
    criteria: {
      "Individual": "Consumidor individual",
      "Pequeño": "Pequeñas empresas (1-50 personas)",
      "Mediano": "Medianas empresas (51-250 personas)",
      "Grande": "Grandes empresas (250+ personas)",
      "Multinacional": "Empresas multinacionales",
      "Público": "Sector público o administración",
      "ONG": "ONGs o organizaciones sin ánimo de lucro",
      "Mixto": "Varios segmentos",
    },
  },
  presupuesto: {
    type: "choice",
    description: "¿Cuál es tu presupuesto/escala inicial?",
    criteria: {
      "Muy bajo": "Menos de 5.000 euros",
      "Bajo": "Entre 5.000 y 25.000 euros",
      "Medio": "Entre 25.000 y 100.000 euros",
      "Alto": "Entre 100.000 y 500.000 euros",
      "Muy alto": "Entre 500.000 euros y 1 millón",
      "Importante": "Más de 1 millón de euros",
      "Bootstrap": "Autofinanciado sin inversión externa",
    },
  },
  dependencia: {
    type: "choice",
    description: "¿Cuál es tu dependencia de terceros?",
    criteria: {
      "Autónomo": "No depende de terceros (0%)",
      "Baja": "Depende de 1-2 partners clave",
      "Media": "Depende de 3-5 partners clave",
      "Alta": "Depende de 6+ partners clave",
      "Crítica": "No funciona sin partners críticos",
      "Ecosistema": "Modelo de plataforma con múltiples actores",
    },
  },
  experiencia: {
    type: "choice",
    description: "¿Cuál es tu experiencia/expertise?",
    criteria: {
      "Sin": "Sin experiencia relevante",
      "Técnica": "Experiencia técnica o de producto",
      "Comercial": "Experiencia en ventas o comercial",
      "Directiva": "Experiencia en gestión o dirección",
      "Sector": "Experiencia trabajando en este sector",
      "Serial": "Emprendedor serial con múltiples negocios",
      "Múltiple": "Expertise en varias áreas clave",
    },
  },
  validacion: {
    type: "choice",
    description: "¿Cuál es el estado de validación actual?",
    criteria: {
      "Idea": "Idea sin validar con usuarios",
      "Problema": "Problema validado con usuarios",
      "Prototipo": "Solución prototipada",
      "Validada": "Solución validada con usuarios reales",
      "MVP": "MVP en operación con clientes",
      "Producto": "Producto consolidado",
      "Tracción": "Tracción probada con crecimiento",
    },
  },
  equipo: {
    type: "choice",
    description: "¿Cuál es tu equipo/recursos humanos disponibles?",
    criteria: {
      "Solo": "Solo fundador",
      "CoFundador": "Fundador + 1 co-fundador",
      "Pequeño": "Fundador + equipo de 2-3 personas",
      "Reducido": "Equipo pequeño de 4-6 personas",
      "Completo": "Equipo completo de 7+ personas",
      "Freelance": "Solo con freelancers o contratistas",
      "Pool": "Acceso a talent pool flexible",
    },
  },
  regulacion: {
    type: "choice",
    description: "¿Cuál es el nivel de regulación/compliance crítica?",
    criteria: {
      "Ninguna": "Sin regulación relevante",
      "Light": "Regulación light o mínima",
      "Moderada": "Regulación moderada",
      "Fuerte": "Regulación fuerte",
      "Crítica": "Regulación crítica para funcionar",
      "Multi": "Multi-jurisdiccional con regulaciones diferentes",
      "Riesgo": "Riesgo muy alto de cumplimiento",
    },
  },
  capital: {
    type: "choice",
    description: "¿Cuál es tu estructura de capital/financiamiento?",
    criteria: {
      "Propio": "Capital propio / Autofinanciado",
      "Amigos": "Amigos y familia (friends & family)",
      "Angel": "Inversión ángel",
      "Venture": "Capital de venture capital",
      "Deuda": "Préstamos o líneas de crédito",
      "Público": "Financiamiento público o subvenciones",
      "Mixto": "Combinación de varias fuentes",
    },
  },
  vision: {
    type: "choice",
    description: "¿Cuál es tu visión a futuro?",
    criteria: {
      "Vender": "Construir para vender/exit",
      "Crecer": "Crecer como empresa/escala",
      "Lifestyle": "Negocio lifestyle / ingresos recurrentes",
      "Impacto": "Maximizar impacto social o ambiental",
      "Mercado": "Dominar el mercado",
      "Híbrida": "Combinación de crecimiento e impacto",
      "Explorar": "Explorar oportunidades sin rumbo fijo",
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
  capital: string;
  vision: string;
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
    capital: data.answers.capital?.choice || "",
    vision: data.answers.vision?.choice || "",
  };

  return results;
}

export type { AnalyzedPhase2Results, JevPhase2Response };
