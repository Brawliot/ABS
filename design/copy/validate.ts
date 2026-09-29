/**
 * Validador determinista de plantillas de copy.
 */

import { findForbiddenJargon } from "./jargon.js";
import {
  COPY_MAX_LENGTH,
  CopyValidationError,
  type CopyKind,
  type CopyTemplate,
  type InterfaceCopyPack,
} from "./types.js";

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function extractTemplateVariables(template: string): readonly string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VAR_RE.source, "g");
  while ((m = re.exec(template)) !== null) {
    out.add(m[1]!);
  }
  return [...out].sort();
}

export function validateCopyTemplate(t: CopyTemplate): readonly string[] {
  const issues: string[] = [];
  const max = COPY_MAX_LENGTH[t.kind];
  if (t.template.length > max) {
    issues.push(
      `${t.key}: longitud ${t.template.length} > máx ${max} (${t.kind})`,
    );
  }
  const jargon = findForbiddenJargon(t.template);
  if (jargon.length > 0) {
    issues.push(`${t.key}: jerga prohibida [${jargon.join(", ")}]`);
  }
  const inTemplate = extractTemplateVariables(t.template);
  const required = new Set(t.requiredVariables);
  for (const v of inTemplate) {
    if (!required.has(v)) {
      issues.push(
        `${t.key}: variable {{${v}}} en plantilla no declarada en requiredVariables`,
      );
    }
  }
  for (const v of t.requiredVariables) {
    if (!inTemplate.includes(v)) {
      issues.push(
        `${t.key}: requiredVariable "${v}" no aparece en la plantilla`,
      );
    }
  }
  // Errores: deben declarar hechos (al menos una variable) salvo plantilla genérica con "accion"
  if (t.kind === "error" && t.requiredVariables.length === 0) {
    issues.push(`${t.key}: plantilla de error sin variables de hechos`);
  }
  return issues;
}

export function validateCopyPack(pack: InterfaceCopyPack): void {
  const issues: string[] = [];
  for (const t of pack.templates) {
    if (t.locale !== pack.locale) {
      issues.push(`${t.key}: locale ${t.locale} ≠ pack ${pack.locale}`);
    }
    issues.push(...validateCopyTemplate(t));
  }
  for (const [from, to] of Object.entries(pack.vocabulary)) {
    const j = findForbiddenJargon(to);
    if (j.length > 0) {
      issues.push(`vocabulario "${from}"→"${to}": jerga [${j.join(", ")}]`);
    }
  }
  if (issues.length > 0) {
    throw new CopyValidationError("Pack de copy inválido", issues);
  }
}

export function assertNoJargonInVisibleText(text: string): void {
  const j = findForbiddenJargon(text);
  if (j.length > 0) {
    throw new CopyValidationError(`Texto con jerga prohibida`, j);
  }
}

export type { CopyKind };
