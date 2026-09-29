/**
 * Intérprete — convierte interacciones en solicitudes de transición.
 * NUNCA ejecuta: entrega la solicitud al Juez (u outcome de confirmación).
 */

import type { ActorKind, EvidenceKind } from "../core/grammar.js";
import type { PresentationChannel } from "../presentation/types.js";

/** Reutiliza el umbral del diagnóstico. */
export { CONFIDENCE_THRESHOLD } from "../diagnosis/questions.js";

export type InteractionKind = "boton" | "formulario" | "mensaje";

export type EvidenceValidationStatus =
  | "pendiente_validacion"
  | "lista_para_juez";

export interface InteractionAttachment {
  readonly id: string;
  readonly mediaType: string;
  readonly label?: string;
}

/** Entrada cruda desde canal (UI o mensajería). */
export interface Interaction {
  readonly id: string;
  readonly kind: InteractionKind;
  readonly channel: PresentationChannel;
  readonly occurredAt: string;
  readonly text?: string;
  /** Acción estructurada (botón / submit). */
  readonly actionId?: string;
  readonly transitionId?: string;
  readonly formValues?: Readonly<Record<string, string>>;
  readonly attachments?: readonly InteractionAttachment[];
  /** Idempotencia cliente (doble clic). */
  readonly clientRequestId?: string;
  readonly subjectId: string;
}

/** Identidad resuelta desde el canal de origen. */
export interface ChannelIdentity {
  readonly actorId: string;
  readonly actorKind: ActorKind;
  readonly roles: readonly string[];
  readonly parteId?: string;
  readonly tenantId: string;
}

/**
 * Solicitud lista para el Juez (él ejecuta; el Intérprete no).
 * No incluye lifecycle/derived/ruleSet: los aporta el orquestador.
 */
export interface TransitionRequest {
  readonly id: string;
  readonly subjectId: string;
  readonly transitionId: string;
  readonly actorId: string;
  readonly actorKind: ActorKind;
  readonly parteId?: string;
  readonly tenantId: string;
  readonly occurredAt: string;
  readonly evidence: {
    readonly kind: EvidenceKind;
    readonly reference: string;
    readonly recordedAt: string;
    readonly referenceType?: string;
  };
  /** Capturas / declaraciones: pendiente hasta validación — no es pago confirmado. */
  readonly evidenceValidationStatus: EvidenceValidationStatus;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly confidence: number;
  readonly source: "estructurado" | "texto";
  readonly interactionId: string;
  readonly intentLabel: string;
}

export type InterpreterOutcome =
  | {
      readonly kind: "solicitud";
      readonly request: TransitionRequest;
      /** true si se reutilizó por idempotencia. */
      readonly idempotentReplay: boolean;
    }
  | {
      readonly kind: "confirmacion";
      readonly question: string;
      readonly confidence: number;
      readonly candidates: readonly {
        readonly transitionId: string;
        readonly label: string;
        readonly confidence: number;
      }[];
      readonly interactionId: string;
    }
  | {
      readonly kind: "derivacion_humana";
      readonly reason: string;
      readonly confidence: number;
      readonly draft?: Partial<TransitionRequest>;
      readonly interactionId: string;
    };

export interface TextExtract {
  readonly transitionId: string | null;
  readonly intentLabel: string;
  readonly confidence: number;
  readonly evidenceKind: EvidenceKind;
  readonly evidenceReferenceType?: string;
  readonly evidencePendingValidation: boolean;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly confirmationQuestion?: string;
  readonly candidates?: readonly {
    readonly transitionId: string;
    readonly label: string;
    readonly confidence: number;
  }[];
  /** true si el extractor detectó ambigüedad (debe aclarar, no actuar). */
  readonly ambiguous?: boolean;
  readonly parteRefs?: readonly string[];
  readonly amounts?: readonly {
    readonly amount: number;
    readonly currency?: string;
    readonly label?: string;
  }[];
  readonly dates?: readonly {
    readonly raw: string;
    readonly iso?: string;
    readonly role?: string;
  }[];
}

export interface ExtractContext {
  readonly subjectId: string;
  readonly allowedTransitionIds: readonly string[];
  readonly hasAttachments: boolean;
  /** Directorio de Partes conocidas (refs ya anonimizadas) para desambiguar. */
  readonly parteDirectory?: readonly {
    readonly ref: string;
    readonly label: string;
  }[];
}

export interface InterpreterTextExtractor {
  extract(text: string, context: ExtractContext): TextExtract;
}

/** Extractor asíncrono (LLM). El sync HeuristicInterpreterExtractor no lo implementa. */
export interface AsyncInterpreterTextExtractor {
  extractAsync(text: string, context: ExtractContext): Promise<TextExtract>;
}

export class InterpreterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterpreterError";
  }
}
