/**
 * Extractor de texto libre para el Intérprete.
 * Reutiliza umbral/confianza del diagnóstico; heurístico offline (como diagnosis).
 * Un LLM real puede implementar InterpreterTextExtractor igual que OpenAiDiagnosisExtractor.
 */

import type { EvidenceKind } from "../core/grammar.js";
import type { InterpreterTextExtractor, TextExtract } from "./types.js";
import { CONFIDENCE_THRESHOLD } from "./types.js";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function vague(t: string): boolean {
  const n = norm(t);
  if (/(acepto|pagad|cancel|entreg|firm|desist|bizum|comprobante)/i.test(n)) {
    return false;
  }
  if (n.length < 8) return true;
  return /^(hola|ok|vale|no se|ns|ayuda|info|\?+|mmm\.+|asdf.*)$/i.test(n);
}

/**
 * Heurístico determinista: palabras clave → transición candidata + confianza.
 * "Ya he pagado" + adjunto → evidencia física pendiente de validar (no pago confirmado).
 */
export class HeuristicInterpreterExtractor implements InterpreterTextExtractor {
  extract(
    text: string,
    context: {
      readonly subjectId: string;
      readonly allowedTransitionIds: readonly string[];
      readonly hasAttachments: boolean;
    },
  ): TextExtract {
    void context.subjectId;
    const t = norm(text);
    const allowed = new Set(context.allowedTransitionIds);

    if (vague(text) || /^(hola|buenas|qué tal)/i.test(t)) {
      return {
        transitionId: null,
        intentLabel: "ambiguo",
        confidence: 0.35,
        evidenceKind: "aceptacion",
        evidencePendingValidation: false,
        fields: {},
        confirmationQuestion:
          "¿Qué quieres hacer: registrar un pago, cancelar, o consultar el estado?",
        candidates: [
          {
            transitionId: "t_cerrar",
            label: "Confirmar cierre / pago",
            confidence: 0.4,
          },
          {
            transitionId: "t_cancelar_aceptada",
            label: "Cancelar",
            confidence: 0.35,
          },
        ].filter((c) => allowed.has(c.transitionId)),
      };
    }

    // Declaración de pago con captura → NO es pago confirmado (sistema)
    if (
      /(ya\s+he\s+pagado|ya\s+pagu[eé]|pagu[eé]|pagado|hecho\s+el\s+pago|transferencia\s+hecha|bizum|comprobante)/i.test(
        t,
      )
    ) {
      const hasCap =
        context.hasAttachments ||
        /(captura|comprobante|screenshot|adjunt|foto|imagen)/i.test(t);
      const transitionId = pick(allowed, ["t_cerrar", "t_pagar", "t_aceptar"]);
      if (hasCap) {
        return {
          transitionId,
          intentLabel: "declaracion_pago",
          confidence: 0.9,
          evidenceKind: "fisica" as EvidenceKind,
          evidenceReferenceType: "captura",
          evidencePendingValidation: true,
          fields: {
            declaracion_pago: true,
            pago_confirmado: false,
          },
        };
      }
      return {
        transitionId,
        intentLabel: "declaracion_pago",
        confidence: 0.72,
        evidenceKind: "fisica" as EvidenceKind,
        evidenceReferenceType: "captura",
        evidencePendingValidation: true,
        fields: {
          declaracion_pago: true,
          pago_confirmado: false,
        },
        confirmationQuestion: "¿Puedes adjuntar el comprobante de pago?",
        candidates: [
          {
            transitionId: transitionId ?? "t_cerrar",
            label: "Declarar pago con comprobante",
            confidence: 0.72,
          },
        ],
      };
    }

    if (/(cancel|anular|no\s+quiero|desist)/i.test(t)) {
      const transitionId = pick(allowed, [
        "t_cancelar_aceptada",
        "t_cancelar_propuesta",
        "t_cancelar",
      ]);
      return {
        transitionId,
        intentLabel: "cancelacion",
        confidence: 0.88,
        evidenceKind: "aceptacion",
        evidencePendingValidation: false,
        fields: {},
      };
    }

    if (/(acepto|de\s+acuerdo|ok\s+firma|firmo)/i.test(t)) {
      const transitionId = pick(allowed, ["t_aceptar", "t_aceptar_nueva_version"]);
      return {
        transitionId,
        intentLabel: "aceptacion",
        confidence: 0.9,
        evidenceKind: "aceptacion",
        evidencePendingValidation: false,
        fields: {},
      };
    }

    if (/(entreg|recib[ií]|ha\s+llegado)/i.test(t)) {
      const transitionId = pick(allowed, [
        "t_entrega_parcial",
        "t_iniciar_entrega",
        "t_cerrar",
      ]);
      return {
        transitionId,
        intentLabel: "entrega",
        confidence: 0.86,
        evidenceKind: "fisica",
        evidenceReferenceType: "albaran",
        evidencePendingValidation: true,
        fields: {},
      };
    }

    // Bajo umbral → confirmación
    return {
      transitionId: null,
      intentLabel: "desconocido",
      confidence: 0.45,
      evidenceKind: "aceptacion",
      evidencePendingValidation: false,
      fields: {},
      confirmationQuestion:
        "No estoy seguro de la acción. ¿Confirmas la transición o prefieres hablar con un agente?",
      candidates: [...allowed].slice(0, 3).map((id) => ({
        transitionId: id,
        label: id,
        confidence: 0.4,
      })),
    };
  }
}

function pick(
  allowed: ReadonlySet<string>,
  preferred: readonly string[],
): string | null {
  for (const id of preferred) {
    if (allowed.has(id)) return id;
  }
  return null;
}

export { CONFIDENCE_THRESHOLD };
