/**
 * Valor de campo del BusinessProfile: known | unknown | not_applicable.
 * "unknown" ≠ "not_applicable".
 */

export type ProfileFieldStatus = "known" | "unknown" | "not_applicable";

export type ProfileField<T> =
  | {
      readonly status: "known";
      readonly value: T;
      readonly confidence?: number;
    }
  | {
      readonly status: "unknown";
      readonly confidence?: number;
    }
  | {
      readonly status: "not_applicable";
      readonly confidence?: number;
    };

export function known<T>(value: T, confidence?: number): ProfileField<T> {
  return confidence === undefined
    ? { status: "known", value }
    : { status: "known", value, confidence };
}

export function unknownField(confidence?: number): ProfileField<never> {
  return confidence === undefined
    ? { status: "unknown" }
    : { status: "unknown", confidence };
}

export function notApplicable(confidence?: number): ProfileField<never> {
  return confidence === undefined
    ? { status: "not_applicable" }
    : { status: "not_applicable", confidence };
}

export function isKnown<T>(
  f: ProfileField<T>,
): f is Extract<ProfileField<T>, { status: "known" }> {
  return f.status === "known";
}

export function isUnknown<T>(f: ProfileField<T>): boolean {
  return f.status === "unknown";
}

export function isNotApplicable<T>(f: ProfileField<T>): boolean {
  return f.status === "not_applicable";
}
