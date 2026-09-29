/**
 * Jerga interna prohibida en textos visibles.
 */

export const FORBIDDEN_JARGON: readonly string[] = [
  "guarda",
  "guardas",
  "transición",
  "transicion",
  "transiciones",
  "evento",
  "eventos",
  "estado",
  "estados",
  "tenant",
  "tenancy",
  "ruleset",
  "rule set",
  "lifecycle",
  "metaobjeto",
  "compiledruleset",
  "domain event",
  "eventstore",
  "event store",
  "factbag",
  "predicate",
  "invariante",
  "arquetipo",
  "overlay",
  "uispec",
];

/**
 * Detecta jerga prohibida (palabra completa, case-insensitive, sin acentos).
 */
export function findForbiddenJargon(text: string): readonly string[] {
  const norm = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const found: string[] = [];
  for (const term of FORBIDDEN_JARGON) {
    const t = term.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const re = new RegExp(`(^|[^a-z0-9_])${escapeRe(t)}([^a-z0-9_]|$)`, "i");
    if (re.test(norm)) found.push(term);
  }
  return found;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
