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
El usuario ha proporcionado estos DATOS VERIFICABLES:
- Presupuesto: $${req.resources.budget} USD (dato real)
- Tiempo disponible: ${req.resources.hours} horas/semana (dato real)
- Equipo: ${req.resources.teamSize} (dato verificable)
- Experiencia sector: ${req.resources.experience} años (dato verificable)

INSTRUCCIONES: Con esta información real y verificable, AUMENTA la confianza en todos los campos.
No revises viabilidad. Solo usa estos datos para VALIDAR y REFORZAR el análisis anterior.
Los datos que el usuario proporciona hacen que tus análisis anteriores sean más fiables y precisos.
Aumenta confianza en TODOS los campos porque ahora tienes información real que respalda tus análisis.
`;

  const enrichPrompt = `
DESCRIPCIÓN ORIGINAL: ${req.originalInput}

ANÁLISIS ANTERIOR:
- Subsector: ${req.analysis.subsector.value} (${req.analysis.subsector.confidence}% confianza)
- Localización: ${req.analysis.localizacion.value} (${req.analysis.localizacion.confidence}% confianza)
- Timeline: ${req.analysis.flexibilidad_timeline.value} (${req.analysis.flexibilidad_timeline.confidence}% confianza)
- Constraints: ${req.analysis.constraints.dinero} (${req.analysis.constraints.confidence}% confianza)

${resourcesDescription}

TAREA: Valida el análisis anterior con estos datos. Aumenta confianza en TODOS los campos.
Mantén los valores igual si son correctos. Aumenta confianza porque ahora tienes datos reales.
La confianza debe crecer con información verificable del usuario.

Responde SOLO con JSON en este formato, sin markdown:
{
  "subsector": {
    "value": "subsector (igual o confirmado)",
    "confidence": número 0-100 (AUMENTADO),
    "follow_up_question": "pregunta siguiente"
  },
  "localizacion": {
    "value": "ubicación (igual o confirmada)",
    "confidence": número 0-100 (AUMENTADO),
    "follow_up_question": "pregunta siguiente"
  },
  "flexibilidad_timeline": {
    "value": "timeline (igual o confirmado)",
    "confidence": número 0-100 (AUMENTADO),
    "follow_up_question": "pregunta siguiente"
  },
  "constraints": {
    "dinero": "presupuesto/recursos",
    "excluyentes": ["exclusión 1"],
    "otros": ["otro constraint"],
    "confidence": número 0-100 (AUMENTADO),
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
          content: "Eres un experto en análisis de startups. El usuario ha proporcionado datos reales sobre su proyecto. Tu tarea es VALIDAR y REFORZAR el análisis anterior aumentando confianza en todos los campos porque ahora tienes información verificable.",
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
