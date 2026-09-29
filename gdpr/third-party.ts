/**
 * Registro de datos enviados a terceros (basado en LLM-INFRA + correo).
 */

export interface ThirdPartyTransfer {
  readonly provider: string;
  readonly purpose: string;
  readonly dataCategories: readonly string[];
  readonly notSent: readonly string[];
  readonly legalBasisHint: string;
  readonly source: string;
}

/** Borrador operativo — no sustituye DPIA ni contrato. */
export const THIRD_PARTY_REGISTRY: readonly ThirdPartyTransfer[] = [
  {
    provider: "OpenAI (Chat Completions)",
    purpose: "Extracción de intención / diagnóstico / copy / diseño",
    dataCategories: [
      "texto operativo minimizado con refs opacas",
      "ids de transición / catálogo",
      "descripción de negocio (diseñador)",
    ],
    notSent: [
      "nombre completo",
      "email",
      "teléfono",
      "DNI/NIE",
      "IBAN",
      "binarios / capturas",
    ],
    legalBasisHint: "interés legítimo / ejecución contractual — REVISAR",
    source: "llm/LLM-INFRA-REPORT.md + llm/call-kinds.ts",
  },
  {
    provider: "Proveedor de correo (SMTP / API)",
    purpose: "Invitaciones, magic link, recuperación de contraseña",
    dataCategories: ["dirección de correo", "nombre de display", "URL con token"],
    notSent: ["contraseña", "hash argon2", "historial de eventos"],
    legalBasisHint: "ejecución contractual / medidas precontractuales — REVISAR",
    source: "accounts/* + auth routes",
  },
];
