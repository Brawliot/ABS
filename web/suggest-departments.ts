/**
 * Suggest additional departments using Jev + ChatGPT
 */

import { analyzeWithChatGPT } from "./planner-phase2-handler.js";

interface SuggestDepartmentsInput {
  sector: string;
  modelo_negocio: string;
  departamentos_actuales: string[];
  presupuesto: string;
  equipo: string;
}

interface SuggestDepartmentsOutput {
  departamentos_sugeridos: string[];
  razon: string;
}

export async function suggestDepartments(
  input: SuggestDepartmentsInput
): Promise<SuggestDepartmentsOutput> {
  const prompt = `Basándote en este contexto de negocio, ¿hay departamentos CRÍTICOS e INDEPENDIENTES que falten en la lista?

Sector: ${input.sector}
Modelo: ${input.modelo_negocio}
Presupuesto: ${input.presupuesto}
Equipo: ${input.equipo}

Departamentos actuales: ${input.departamentos_actuales.join(", ")}

IMPORTANTE: Solo sugiere departamentos que sean:
1. CRÍTICOS para el negocio
2. INDEPENDIENTES (no sub-función de otro)
3. NO estén ya en la lista

Responde SOLO con JSON:
{
  "departamentos_sugeridos": ["Dept1", "Dept2"],
  "razon": "Explicación breve"
}

Si no hay departamentos faltantes, retorna array vacío.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Eres un experto en estructura organizativa de startups. Sugieres departamentos que faltan.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`ChatGPT API error: ${response.status}`);
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
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {
      departamentos_sugeridos: [],
      razon: "No se pudo procesar sugerencias",
    };
  }
}

export type { SuggestDepartmentsInput, SuggestDepartmentsOutput };
