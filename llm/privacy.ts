/**
 * Minimización antes de enviar al proveedor.
 * Sustituye PII evidente por referencias opacas.
 */

import { createHash } from "node:crypto";

const EMAIL =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE =
  /(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{3,4}(?!\w)/g;
const DNI_NIE = /\b(?:\d{8}[A-Za-z]|[XYZxyz]\d{7}[A-Za-z])\b/g;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi;
const IBAN_SIMPLE = /\bES\d{2}(?:\s?\d{4}){5}\b/gi;
const CARD = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
/** Nombre: Nombre Apellido (heurística conservadora en ES). */
const PERSON_NAME =
  /\b(?:Sr\.?|Sra\.?|Don|Doña)?\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2}\b/g;

export interface MinimizeOptions {
  /** Mapa id técnico → etiqueta de referencia (subjectId → subject:…). */
  readonly refs?: Readonly<Record<string, string>>;
  /** Si true, también aplica heurística de nombres propios. */
  readonly scrubNames?: boolean;
}

export interface MinimizeResult {
  readonly text: string;
  readonly redacted: readonly string[];
  readonly contentHash: string;
}

function hashContent(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function redactAll(
  input: string,
  pattern: RegExp,
  label: string,
  bucket: string[],
): string {
  return input.replace(pattern, () => {
    bucket.push(label);
    return `[${label}]`;
  });
}

/**
 * Minimiza un string: email, teléfono, DNI, IBAN, tarjeta; opcional nombres.
 * Sustituye ids conocidos por refs estables.
 */
export function minimizeText(
  raw: string,
  options?: MinimizeOptions,
): MinimizeResult {
  const redacted: string[] = [];
  let text = raw;

  if (options?.refs) {
    const entries = Object.entries(options.refs).sort(
      (a, b) => b[0].length - a[0].length,
    );
    for (const [id, ref] of entries) {
      if (!id) continue;
      if (text.includes(id)) {
        text = text.split(id).join(ref);
        redacted.push(`ref:${ref}`);
      }
    }
  }

  text = redactAll(text, EMAIL, "EMAIL", redacted);
  text = redactAll(text, IBAN_SIMPLE, "IBAN", redacted);
  text = redactAll(text, IBAN, "IBAN", redacted);
  text = redactAll(text, CARD, "CARD", redacted);
  text = redactAll(text, DNI_NIE, "DOC_ID", redacted);
  text = redactAll(text, PHONE, "PHONE", redacted);
  if (options?.scrubNames !== false) {
    text = redactAll(text, PERSON_NAME, "NAME", redacted);
  }

  return {
    text,
    redacted: [...new Set(redacted)],
    contentHash: hashContent(text),
  };
}

/**
 * Serializa payload desconocido y aplica minimización.
 */
export function minimizePayload(
  payload: unknown,
  options?: MinimizeOptions,
): MinimizeResult {
  if (typeof payload === "string") {
    return minimizeText(payload, options);
  }
  let raw: string;
  try {
    raw = JSON.stringify(payload);
  } catch {
    raw = String(payload);
  }
  return minimizeText(raw, options);
}

/** Comprueba que no quedan patrones PII obvios tras minimizar. */
export function assertNoObviousPii(text: string): readonly string[] {
  const hits: string[] = [];
  if (EMAIL.test(text)) hits.push("email");
  EMAIL.lastIndex = 0;
  if (DNI_NIE.test(text)) hits.push("doc_id");
  DNI_NIE.lastIndex = 0;
  if (IBAN_SIMPLE.test(text) || IBAN.test(text)) hits.push("iban");
  IBAN_SIMPLE.lastIndex = 0;
  IBAN.lastIndex = 0;
  if (CARD.test(text)) hits.push("card");
  CARD.lastIndex = 0;
  return hits;
}
