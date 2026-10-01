/**
 * Input validation utilities for Capa 1 safety.
 */

/**
 * Validates a company ID format and rejects empty, null, or invalid values.
 * @throws Error if companyId is invalid
 */
export function validateCompanyId(companyId: unknown): asserts companyId is string {
  if (typeof companyId !== "string") {
    throw new Error(`Invalid companyId: must be string, got ${typeof companyId}`);
  }
  if (companyId.length === 0) {
    throw new Error("Invalid companyId: cannot be empty");
  }
  if (companyId.length > 255) {
    throw new Error(`Invalid companyId: exceeds 255 chars (got ${companyId.length})`);
  }
  // Allow alphanumeric + hyphens + underscores + dots (common in tenant IDs)
  if (!/^[a-zA-Z0-9._-]+$/.test(companyId)) {
    throw new Error(
      `Invalid companyId: must contain only alphanumeric, hyphens, underscores, dots. Got: ${companyId}`,
    );
  }
}
