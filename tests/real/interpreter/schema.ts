/**
 * Formato del corpus del Intérprete (JSONL).
 */

export type CorpusOrigin = "synthetic" | "real_anonymized";
export type CorpusSplit = "dev" | "test";

export type IntentType =
  | "aceptacion"
  | "cancelacion"
  | "declaracion_pago"
  | "cobro_parcial"
  | "entrega"
  | "ambiguo"
  | "saludo"
  | "otro";

export interface InterpreterCorpusCase {
  readonly id: string;
  readonly message: string;
  readonly context: {
    readonly subjectId: string;
    readonly allowedTransitionIds: readonly string[];
    readonly hasAttachments: boolean;
    readonly parteDirectory?: readonly {
      readonly ref: string;
      readonly label: string;
    }[];
  };
  readonly expected: {
    readonly transitionId: string | null;
    readonly intentLabel: string;
    readonly ambiguous: boolean;
    readonly mustAskClarification?: boolean;
    readonly amountEquals?: readonly number[];
  };
  readonly ambiguous: boolean;
  readonly origin: CorpusOrigin;
  readonly split: CorpusSplit;
  readonly intentType: IntentType;
  /** Notas del etiquetador */
  readonly notes?: string;
}
