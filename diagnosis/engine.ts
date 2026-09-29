/**
 * Orquestación del diagnóstico: extract → umbral → clasificar → parametrizar → validar.
 */

import { validateComposition } from "../archetypes/composition.js";
import type { ArchetypeId } from "../archetypes/types.js";
import { assertExtractorOutput, type DiagnosisExtractor } from "./extractor.js";
import { classifyFromAnswers, LowConfidenceError } from "./classifier.js";
import {
  type DiagnosisParameterizer,
  validateProposedParameters,
} from "./parameterizer.js";
import type { AuditEntry, DiagnosisSpec } from "./questions.js";

const SPEC_VERSION = "1.1.0";

export class DiagnosisEngine {
  constructor(
    private readonly extractor: DiagnosisExtractor,
    private readonly parameterizer: DiagnosisParameterizer,
  ) {}

  async run(naturalLanguageDescription: string): Promise<DiagnosisSpec> {
    const extracted = await Promise.resolve(
      this.extractor.extract(naturalLanguageDescription),
    );
    assertExtractorOutput(extracted);

    const { composition, audit: classAudit } = classifyFromAnswers(
      extracted.answers,
    );

    const compositionResult = validateComposition(composition);
    if (!compositionResult.ok) {
      throw new Error(
        `Composición inválida: ${compositionResult.issues.map((i) => i.message).join("; ")}`,
      );
    }

    const proposal = this.parameterizer.propose(
      naturalLanguageDescription,
      composition.dominant,
    );
    const validated = validateProposedParameters(
      composition.dominant,
      proposal,
    );
    if (!validated.ok) {
      throw new Error(
        `Parámetros rechazados por esquema: ${validated.errors.join("; ")}`,
      );
    }

    const audit: AuditEntry[] = [
      ...classAudit,
      {
        at: new Date().toISOString(),
        decision: "parameters_accepted",
        detail: { fields: validated.values },
      },
      {
        at: new Date().toISOString(),
        decision: "composition_validated",
        detail: { dominant: composition.dominant },
      },
    ];

    return {
      version: SPEC_VERSION,
      dominant: composition.dominant,
      secondaries: composition.secondaries.map((s) => ({
        archetypeId: s.secondaryArchetypeId,
        bornInDominantState: s.bornInDominantState,
        bloquea: s.bloquea,
      })),
      parameters: validated.values,
      audit,
    };
  }
}

export { LowConfidenceError };
export type { DiagnosisSpec, ArchetypeId };
