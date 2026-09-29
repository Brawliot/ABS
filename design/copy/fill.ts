/**
 * Relleno determinista de plantillas (sin LLM en ejecución).
 */

import { CopyFillError, type CopyTemplate } from "./types.js";
import type { BusinessVocabulary } from "./types.js";

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Sustituye {{vars}} solo con valores proporcionados. Nada inventado.
 */
export function fillTemplate(
  template: string,
  variables: Readonly<Record<string, string | number | boolean>>,
  required: readonly string[],
): string {
  for (const r of required) {
    if (!(r in variables)) {
      throw new CopyFillError(`Falta variable requerida: ${r}`);
    }
  }
  return template.replace(VAR_RE, (_, name: string) => {
    if (!(name in variables)) {
      throw new CopyFillError(`Variable no proporcionada: ${name}`);
    }
    return String(variables[name]);
  });
}

export function fillCopyTemplate(
  t: CopyTemplate,
  variables: Readonly<Record<string, string | number | boolean>>,
): string {
  return fillTemplate(t.template, variables, t.requiredVariables);
}

/**
 * Aplica vocabulario de negocio (frases largas primero).
 */
export function applyVocabulary(
  text: string,
  vocabulary: BusinessVocabulary,
): string {
  let out = text;
  const keys = Object.keys(vocabulary).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const v = vocabulary[k]!;
    const re = new RegExp(escapeRe(k), "gi");
    out = out.replace(re, v);
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function fillAndLocalize(
  t: CopyTemplate,
  variables: Readonly<Record<string, string | number | boolean>>,
  vocabulary: BusinessVocabulary,
): string {
  return applyVocabulary(fillCopyTemplate(t, variables), vocabulary);
}
