/**
 * Enriquecimiento de análisis con información de recursos
 */

import { analyzeWithChatGPT, type Phase2Response } from "./planner-phase2-handler.js";

interface ResourcesData {
  budget: number;
  hours: number;
  teamSize: string;
  experience: number;
}

interface EnrichRequest {
  analysis: Phase2Response;
  originalInput: string;
  resources: ResourcesData;
}

export async function enrichAnalysisWithResources(req: EnrichRequest): Promise<Phase2Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no está configurado");
  }

  const resourcesDescription = `
El usuario ha proporcionado estos recursos:
- Presupuesto inicial: $${req.resources.budget} USD
- Tiempo disponible: ${req.resources.hours} horas por semana
- Tamaño del equipo: ${req.resources.teamSize}
- Experiencia en el sector: ${req.resources.experience} años

Considerando estos recursos reales, por favor ajusta y enriquece el análisis anterior.
Actualiza cada métrica si es necesario para que sea realista con estos limitantes.
Mantén la estructura de respuesta igual pero con valores ajustados.
Aumenta la confianza en los campos donde los recursos alinean bien con la idea.
`;

  const enrichPrompt = `
DESCRIPCIÓN ORIGINAL: ${req.originalInput}

ANÁLISIS ANTERIOR:
- Subsector: ${req.analysis.subsector.value} (${req.analysis.subsector.confidence}%)
- Localización: ${req.analysis.localizacion.value} (${req.analysis.localizacion.confidence}%)
- Timeline: ${req.analysis.flexibilidad_timeline.value} (${req.analysis.flexibilidad_timeline.confidence}%)
- Constraints: ${req.analysis.constraints.dinero} (${req.analysis.constraints.confidence}%)
- Claridad: ${req.analysis.claridad_concepto.score}/10 (${req.analysis.claridad_concepto.confidence}%)

${resourcesDescription}

Responde SOLO con JSON en este formato, sin markdown:
{
  "subsector": {
    "value": "subsector ajustado",
    "confidence": número 0-100,
    "follow_up_question": "pregunta siguiente"
  },
  "localizacion": {
    "value": "ubicación ajustada",
    "confidence": número 0-100,
    "follow_up_question": "pregunta siguiente"
  },
  "flexibilidad_timeline": {
    "value": "timeline ajustado",
    "confidence": número 0-100,
    "follow_up_question": "pregunta siguiente"
  },
  "constraints": {
    "dinero": "presupuesto ajustado",
    "excluyentes": ["exclusión 1"],
    "otros": ["otro constraint"],
    "confidence": número 0-100,
    "follow_up_question": "pregunta siguiente"
  },
  "claridad_concepto": {
    "score": número 1-10,
    "razonamiento": "razonamiento",
    "confidence": número 0-100,
    "follow_up_question": "pregunta siguiente"
  }
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Eres un experto en análisis de startups. Ajusta el análisis considerando los recursos reales del usuario.",
        },
        {
          role: "user",
          content: enrichPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ChatGPT API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices[0]?.message.content;

  if (!content) {
    throw new Error("No content in ChatGPT response");
  }

  try {
    const parsed = JSON.parse(content) as Phase2Response;
    return parsed;
  } catch (e) {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as Phase2Response;
        return parsed;
      } catch (e2) {
        console.error("Failed to parse JSON from markdown:", jsonMatch[1]);
        throw new Error("Invalid JSON response from ChatGPT");
      }
    }

    console.error("Failed to parse ChatGPT response:", content);
    throw new Error("Invalid JSON response from ChatGPT");
  }
}

export type { ResourcesData, EnrichRequest };
