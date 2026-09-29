/**
 * Capa 2 — Definición: subtipo cerrado + campos tipados.
 * Los subtipos concretos de cada elemento se declaran en /elements (fase posterior).
 */

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "datetime"
  | "reference"
  | "enum";

export interface FieldSpec {
  readonly name: string;
  readonly type: FieldType;
  readonly required: boolean;
  /** Solo si type === "enum": valores cerrados del campo. */
  readonly enumValues?: readonly string[];
}

export interface Definition {
  /** Subtipo del elemento; debe pertenecer al conjunto cerrado del elemento. */
  readonly subtype: string;
  readonly fields: readonly FieldSpec[];
}

export type FieldValues = Readonly<Record<string, unknown>>;

export function validateFieldValues(
  definition: Definition,
  values: FieldValues,
): string[] {
  const errors: string[] = [];
  const known = new Set(definition.fields.map((f) => f.name));

  for (const key of Object.keys(values)) {
    if (!known.has(key)) {
      errors.push(`Campo desconocido: ${key}`);
    }
  }

  for (const field of definition.fields) {
    const value = values[field.name];
    if (value === undefined || value === null) {
      if (field.required) {
        errors.push(`Campo obligatorio ausente: ${field.name}`);
      }
      continue;
    }
    if (!matchesFieldType(field, value)) {
      errors.push(`Tipo incorrecto en campo: ${field.name}`);
    }
  }

  return errors;
}

function matchesFieldType(field: FieldSpec, value: unknown): boolean {
  switch (field.type) {
    case "string":
    case "reference":
    case "datetime":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return (
        typeof value === "string" &&
        (field.enumValues?.includes(value) ?? false)
      );
    default:
      return false;
  }
}
