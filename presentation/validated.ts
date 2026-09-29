/**
 * Sello de UiSpec validada en runtime.
 * El renderizador y la persistencia solo aceptan specs selladas.
 */

import type { UiSpec } from "./types.js";
import type { UiSpecValidationReport } from "./uispec-validator.js";

export const UISPEC_VALIDATION_SEAL = Symbol.for("abs.uispec.validated");

export interface ValidatedUiSpec extends UiSpec {
  readonly [UISPEC_VALIDATION_SEAL]: true;
  readonly validationReport: UiSpecValidationReport;
}

export function isValidatedUiSpec(spec: UiSpec): spec is ValidatedUiSpec {
  return (
    typeof spec === "object" &&
    spec !== null &&
    UISPEC_VALIDATION_SEAL in spec &&
    (spec as ValidatedUiSpec)[UISPEC_VALIDATION_SEAL] === true
  );
}

export function sealValidatedUiSpec(
  spec: UiSpec,
  report: UiSpecValidationReport,
): ValidatedUiSpec {
  const sealed = Object.freeze({
    ...spec,
    [UISPEC_VALIDATION_SEAL]: true as const,
    validationReport: report,
  });
  return sealed as ValidatedUiSpec;
}
