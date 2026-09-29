/**
 * Extractor (LLM): solo traduce texto libre → 7 respuestas + confianza.
 * Nunca elige arquetipo. Proveedor: OpenAI · modelo: gpt-4o-mini.
 */

import {
  DIAGNOSIS_QUESTIONS,
  DiagnosisQuestionIds,
  type DiagnosisQuestionId,
  type ExtractedAnswer,
  type ExtractorOutput,
} from "./questions.js";

export const EXTRACTOR_PROVIDER = "openai" as const;
export const EXTRACTOR_MODEL = "gpt-4o-mini" as const;

export interface DiagnosisExtractor {
  extract(naturalLanguageDescription: string): ExtractorOutput | Promise<ExtractorOutput>;
}

/**
 * Stub determinista para tests unitarios: devuelve un mapa fijo.
 */
export class StructuredExtractor implements DiagnosisExtractor {
  constructor(private readonly fixed: ExtractorOutput) {}

  extract(_naturalLanguageDescription: string): ExtractorOutput {
    return this.fixed;
  }
}

const ARCHETYPE_LINES = [
  "venta",
  "servicio_proyecto",
  "suscripcion",
  "uso_temporal",
  "intermediacion",
  "financiera",
] as const;

/** JSON Schema estricto del salida del extractor (OpenAI Structured Outputs). */
export const EXTRACTOR_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["questionId", "value", "confidence"],
        properties: {
          questionId: {
            type: "string",
            enum: [...DiagnosisQuestionIds],
          },
          value: {
            anyOf: [
              { type: "boolean" },
              { type: "string", enum: [...ARCHETYPE_LINES] },
            ],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

export class ExtractorSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractorSchemaError";
  }
}

/**
 * Valida forma del JSON del extractor (sin clasificar).
 * Rechaza cualquier salida que no cumpla el esquema de las 7 preguntas.
 */
export function assertExtractorOutput(output: unknown): asserts output is ExtractorOutput {
  if (!output || typeof output !== "object") {
    throw new ExtractorSchemaError("Extractor: salida no es un objeto");
  }
  const obj = output as Record<string, unknown>;
  if (!Array.isArray(obj.answers)) {
    throw new ExtractorSchemaError("Extractor: answers debe ser un array");
  }
  if (obj.answers.length !== DiagnosisQuestionIds.length) {
    throw new ExtractorSchemaError(
      `Extractor: se exigen exactamente ${DiagnosisQuestionIds.length} respuestas; hay ${obj.answers.length}`,
    );
  }

  const seen = new Set<string>();
  for (const raw of obj.answers) {
    if (!raw || typeof raw !== "object") {
      throw new ExtractorSchemaError("Extractor: cada answer debe ser un objeto");
    }
    const a = raw as Record<string, unknown>;
    if (
      typeof a.questionId !== "string" ||
      !(DiagnosisQuestionIds as readonly string[]).includes(a.questionId)
    ) {
      throw new ExtractorSchemaError(
        `Extractor: questionId inválido: ${String(a.questionId)}`,
      );
    }
    if (seen.has(a.questionId)) {
      throw new ExtractorSchemaError(
        `Extractor: questionId duplicado: ${a.questionId}`,
      );
    }
    seen.add(a.questionId);

    if (typeof a.confidence !== "number" || Number.isNaN(a.confidence)) {
      throw new ExtractorSchemaError(
        `Extractor: confianza inválida en ${a.questionId}`,
      );
    }
    if (a.confidence < 0 || a.confidence > 1) {
      throw new ExtractorSchemaError(
        `Extractor: confianza fuera de [0,1] en ${a.questionId}`,
      );
    }

    const q = DIAGNOSIS_QUESTIONS.find((d) => d.id === a.questionId)!;
    if (q.answerType === "boolean") {
      if (typeof a.value !== "boolean") {
        throw new ExtractorSchemaError(
          `Extractor: ${a.questionId} exige boolean; recibido ${typeof a.value}`,
        );
      }
    } else if (q.answerType === "archetype_line") {
      if (
        typeof a.value !== "string" ||
        !(ARCHETYPE_LINES as readonly string[]).includes(a.value)
      ) {
        throw new ExtractorSchemaError(
          `Extractor: linea_mas_ingresos debe ser un arquetipo cerrado; recibido ${String(a.value)}`,
        );
      }
    }
  }

  for (const id of DiagnosisQuestionIds) {
    if (!seen.has(id)) {
      throw new ExtractorSchemaError(`Extractor: falta respuesta para ${id}`);
    }
  }
}

export function parseAndAssertExtractorOutput(raw: string): ExtractorOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ExtractorSchemaError("Extractor: JSON inválido");
  }
  assertExtractorOutput(parsed);
  return parsed;
}

const SYSTEM_PROMPT = `Eres el extractor del motor de diagnóstico ABS.
Tu ÚNICA tarea es traducir una descripción libre de negocio a exactamente 7 respuestas
del cuestionario cerrado. NUNCA elijas ni sugieras un arquetipo como decisión final:
solo rellena los campos. El clasificador por reglas decidirá después.

Preguntas:
1. cliente_se_queda (boolean): ¿El cliente se queda con lo recibido?
2. debe_volver (boolean): ¿Debe volver lo recibido?
3. pago_periodico_acceso (boolean): ¿Paga periódicamente por un acceso?
4. se_produce_despues (boolean): ¿Se produce el valor después del acuerdo (proyecto/servicio)?
5. tercero_conecta (boolean): ¿Un tercero entrega/recibe y cobras por conectar?
6. dinero_o_cobertura (boolean): ¿Entregas dinero o cobertura (crédito, seguro, factoring…)?
7. linea_mas_ingresos (enum): cuál línea parece generar más ingresos entre:
   venta | servicio_proyecto | suscripcion | uso_temporal | intermediacion | financiera
   (esto NO es la clasificación final; es solo la percepción de ingresos).

Confianza: número de 0 a 1. Si el texto es vago o contradictorio, baja la confianza (<0.85).
Si "se queda" y "debe volver" ambos parecen verdaderos (p. ej. leasing con opción a compra),
márcalos true con confianza media-baja; no inventes un arquetipo.

Responde SOLO con JSON que cumpla el esquema.`;

export type OpenAiChatFn = (params: {
  system: string;
  user: string;
  model: string;
  schema: typeof EXTRACTOR_JSON_SCHEMA;
}) => Promise<string>;

async function defaultOpenAiChat(params: {
  system: string;
  user: string;
  model: string;
  schema: typeof EXTRACTOR_JSON_SCHEMA;
  apiKey: string;
}): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "diagnosis_extractor",
          strict: true,
          schema: params.schema,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new ExtractorSchemaError("Extractor: OpenAI no devolvió content");
  }
  return content;
}

export interface OpenAiExtractorOptions {
  readonly apiKey?: string;
  readonly model?: string;
  /** Inyectable para tests / offline. */
  readonly chat?: OpenAiChatFn;
}

/**
 * Extractor real vía OpenAI (gpt-4o-mini por defecto).
 * Valida el JSON contra el esquema antes de devolverlo.
 */
export class OpenAiDiagnosisExtractor implements DiagnosisExtractor {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly chat: OpenAiChatFn | undefined;

  constructor(options: OpenAiExtractorOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? EXTRACTOR_MODEL;
    this.chat = options.chat;
  }

  async extract(naturalLanguageDescription: string): Promise<ExtractorOutput> {
    const text = naturalLanguageDescription.trim();
    if (!text) {
      throw new ExtractorSchemaError("Extractor: descripción vacía");
    }

    let raw: string;
    if (this.chat) {
      raw = await this.chat({
        system: SYSTEM_PROMPT,
        user: text,
        model: this.model,
        schema: EXTRACTOR_JSON_SCHEMA,
      });
    } else {
      if (!this.apiKey) {
        throw new Error(
          "OpenAiDiagnosisExtractor: falta OPENAI_API_KEY (o inyecta options.chat)",
        );
      }
      raw = await defaultOpenAiChat({
        system: SYSTEM_PROMPT,
        user: text,
        model: this.model,
        schema: EXTRACTOR_JSON_SCHEMA,
        apiKey: this.apiKey,
      });
    }

    return parseAndAssertExtractorOutput(raw);
  }
}

/**
 * Traductor determinista offline (sin API): mismas 7 respuestas, sin elegir arquetipo.
 * Se usa solo cuando no hay clave OpenAI para poder medir el pipeline e2e.
 * No sustituye al extractor LLM en producción.
 */
export class HeuristicDiagnosisExtractor implements DiagnosisExtractor {
  extract(naturalLanguageDescription: string): ExtractorOutput {
    const t = naturalLanguageDescription.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

    const seQueda = matchAny(t, [
      "vende",
      "venta",
      "tienda",
      "se lleva",
      "se queda",
      "compra",
      "contado",
      "dropshipping",
      "ecommerce",
      "producto",
    ]) && !matchAny(t, ["alquiler", "alquila", "devolver", "vuelve", "leasing", "renting"]);

    const debeVolver = matchAny(t, [
      "alquiler",
      "alquila",
      "devolver",
      "debe volver",
      "vuelve",
      "leasing",
      "renting",
      "uso temporal",
      "furgoneta",
      "maquinaria",
    ]);

    const periodico = matchAny(t, [
      "mensual",
      "cuota",
      "suscripcion",
      "saas",
      "abon",
      "periodico",
      "recurrente",
      "tarifa fija",
      "gimnasio",
      "coworking",
    ]);

    const produce = matchAny(t, [
      "consultoria",
      "proyecto",
      "implement",
      "obra",
      "tratamiento",
      "servicio",
      "taller",
      "sesiones",
      "alcance",
      "hitos",
    ]);

    const tercero = matchAny(t, [
      "marketplace",
      "comision",
      "conect",
      "intermedi",
      "plataforma",
      "p2p",
      "airbnb",
      "dropshipping",
    ]);

    const dinero = matchAny(t, [
      "prestamo",
      "credito",
      "financi",
      "seguro",
      "factoring",
      "cobertura",
      "microcredit",
      "leasing",
    ]);

    // Contradicción venta+devolución / leasing con opción
    const contradiccionQuedaVuelve =
      (matchAny(t, ["vende", "venta", "se queda"]) &&
        matchAny(t, ["devolver", "debe volver", "vuelve"])) ||
      matchAny(t, ["leasing", "opcion de compra", "opcion a compra"]);

    const answers: ExtractedAnswer[] = [
      {
        questionId: "cliente_se_queda",
        value: contradiccionQuedaVuelve ? true : seQueda,
        confidence: vague(t) ? 0.4 : contradiccionQuedaVuelve ? 0.7 : 0.9,
      },
      {
        questionId: "debe_volver",
        value: contradiccionQuedaVuelve ? true : debeVolver,
        confidence: vague(t) ? 0.4 : contradiccionQuedaVuelve ? 0.7 : 0.9,
      },
      {
        questionId: "pago_periodico_acceso",
        value: periodico,
        confidence: vague(t) ? 0.4 : 0.88,
      },
      {
        questionId: "se_produce_despues",
        value: produce && !seQueda,
        confidence: vague(t) ? 0.4 : 0.88,
      },
      {
        questionId: "tercero_conecta",
        value: tercero,
        confidence: vague(t) ? 0.4 : 0.88,
      },
      {
        questionId: "dinero_o_cobertura",
        value: dinero,
        confidence: vague(t) ? 0.4 : 0.88,
      },
      {
        questionId: "linea_mas_ingresos",
        value: guessLine({
          seQueda: contradiccionQuedaVuelve ? true : seQueda,
          debeVolver: contradiccionQuedaVuelve ? true : debeVolver,
          periodico,
          produce,
          tercero,
          dinero,
        }),
        confidence: vague(t) ? 0.35 : 0.85,
      },
    ];

    const out = { answers };
    assertExtractorOutput(out);
    return out;
  }
}

function matchAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

function vague(t: string): boolean {
  return (
    t.length < 25 ||
    matchAny(t, ["no se", "algo con", "raro", "trueque", "gratis", "no cobramos"])
  );
}

function guessLine(flags: {
  seQueda: boolean;
  debeVolver: boolean;
  periodico: boolean;
  produce: boolean;
  tercero: boolean;
  dinero: boolean;
}): string {
  if (flags.tercero) return "intermediacion";
  if (flags.dinero && !flags.debeVolver) return "financiera";
  if (flags.debeVolver) return "uso_temporal";
  if (flags.periodico) return "suscripcion";
  if (flags.produce) return "servicio_proyecto";
  if (flags.seQueda) return "venta";
  return "venta";
}

export function createDiagnosisExtractor(
  options: OpenAiExtractorOptions = {},
): DiagnosisExtractor {
  if (options.chat || options.apiKey || process.env.OPENAI_API_KEY) {
    return new OpenAiDiagnosisExtractor(options);
  }
  return new HeuristicDiagnosisExtractor();
}

export type { DiagnosisQuestionId };
