/**
 * Ids técnicos generados por el sistema — fuera del BusinessProfile.
 */

export interface SystemIds {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly documentId: string;
  readonly compiledVersion: string;
  /** ISO UTC; defecto en materialize si se omite. */
  readonly activationAt?: string;
}

const DEFAULT_ACTIVATION = "2026-01-01T00:00:00.000Z";

/** Slug estable a partir de companyId. */
export function slugFromCompanyId(companyId: string): string {
  return companyId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Genera ids deterministas. El pack/regresión puede sobrescribir vía options.
 */
export function generateSystemIds(
  companyId: string,
  documentVersion: string,
  overrides?: Partial<SystemIds>,
): SystemIds {
  const slug = slugFromCompanyId(companyId);
  return {
    caseId: overrides?.caseId ?? `case-${slug}`,
    caseVersion: overrides?.caseVersion ?? "1.0.0",
    documentId: overrides?.documentId ?? `pol-${slug}`,
    compiledVersion:
      overrides?.compiledVersion ?? `compiled:${documentVersion}`,
    activationAt: overrides?.activationAt ?? DEFAULT_ACTIVATION,
  };
}
