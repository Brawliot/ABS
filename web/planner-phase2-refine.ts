/**
 * Planner Phase 2 Refine: Actualizar análisis con feedback del usuario
 */

interface RefineRequest {
  metric: string; // ej: "localizacion", "constraints"
  question: string; // La pregunta que se hizo
  userAnswer: string; // La respuesta del usuario
  originalAnalysis: string; // El análisis original
  originalInput: string; // Input original del negocio
}

const REFINE_SYSTEM_PROMPT = `Eres un experto en análisis de startups.
Tu tarea es refinar un análisis previo basándote en nueva información del usuario.
Proporciona la respuesta actualizada en JSON puro, sin markdown.
Aumenta la confianza si el usuario proporciona información clara.
Mantén el análisis conciso pero informativo.`;

function buildRefinePrompt(
  metric: string,
  question: string,
  userAnswer: string,
  originalAnalysis: string,
  originalInput: string
): string {
  return `MÉTRICA A REFINAR: ${metric}

PREGUNTA HECHA: ${question}

RESPUESTA DEL USUARIO: ${userAnswer}

ANÁLISIS ORIGINAL: ${originalAnalysis}

DESCRIPCIÓN ORIGINAL DEL NEGOCIO: ${originalInput}

Actualiza el análisis considerando la nueva información.
Responde SOLO con JSON en este formato (sin markdown):
{
  "value": "análisis actualizado y más específico",
  "confidence": número 0-100,
  "follow_up_question": "nueva pregunta si aún hay dudas (o null si está claro)"
}`;
}

export async function refinePhase2Metric(req: RefineRequest): Promise<{
  value: string;
  confidence: number;
  follow_up_question: string | null;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no está configurado");
  }

  const prompt = buildRefinePrompt(
    req.metric,
    req.question,
    req.userAnswer,
    req.originalAnalysis,
    req.originalInput
  );

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
          content: REFINE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
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
    const parsed = JSON.parse(content);
    return parsed;
  } catch (e) {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
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

export type { RefineRequest };
