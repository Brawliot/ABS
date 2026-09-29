/**
 * Motor de diagnóstico: 7 preguntas cerradas → dominante + secundarios.
 * La IA solo traduce; las reglas clasifican.
 */

export const CONFIDENCE_THRESHOLD = 0.85;

export const DiagnosisQuestionIds = [
  "cliente_se_queda",
  "debe_volver",
  "pago_periodico_acceso",
  "se_produce_despues",
  "tercero_conecta",
  "dinero_o_cobertura",
  "linea_mas_ingresos",
] as const;

export type DiagnosisQuestionId = (typeof DiagnosisQuestionIds)[number];

export interface DiagnosisQuestion {
  readonly id: DiagnosisQuestionId;
  readonly prompt: string;
  /** Para linea_mas_ingresos las opciones son arquetipos candidatos. */
  readonly answerType: "boolean" | "archetype_line";
}

export const DIAGNOSIS_QUESTIONS: readonly DiagnosisQuestion[] = [
  {
    id: "cliente_se_queda",
    prompt: "¿El cliente se queda con lo recibido?",
    answerType: "boolean",
  },
  {
    id: "debe_volver",
    prompt: "¿Debe volver lo recibido?",
    answerType: "boolean",
  },
  {
    id: "pago_periodico_acceso",
    prompt: "¿Paga periódicamente por un acceso?",
    answerType: "boolean",
  },
  {
    id: "se_produce_despues",
    prompt: "¿Se produce después del acuerdo?",
    answerType: "boolean",
  },
  {
    id: "tercero_conecta",
    prompt: "¿Un tercero entrega o recibe y cobras por conectar?",
    answerType: "boolean",
  },
  {
    id: "dinero_o_cobertura",
    prompt: "¿Entregas dinero o cobertura?",
    answerType: "boolean",
  },
  {
    id: "linea_mas_ingresos",
    prompt: "¿Qué línea genera más ingresos?",
    answerType: "archetype_line",
  },
];

export interface ExtractedAnswer {
  readonly questionId: DiagnosisQuestionId;
  readonly value: boolean | string;
  readonly confidence: number;
}

export interface ExtractorOutput {
  readonly answers: readonly ExtractedAnswer[];
}

export interface AuditEntry {
  readonly at: string;
  readonly decision: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

export interface DiagnosisSpec {
  readonly version: string;
  readonly dominant: string;
  readonly secondaries: readonly {
    readonly archetypeId: string;
    readonly bornInDominantState: string;
    readonly bloquea: string;
  }[];
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly audit: readonly AuditEntry[];
}
