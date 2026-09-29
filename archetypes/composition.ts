/**
 * Validación de máquinas compuestas y detección de bloqueos circulares.
 * Ciclos de cualquier longitud vía DFS sobre el grafo bornIn → bloquea.
 */

import { validateLifecycle, type ValidationIssue } from "../core/validator.js";
import { getArchetype } from "./catalog.js";
import type {
  ArchetypeId,
  ComposedArchetypeSpec,
  SecondaryBinding,
} from "./types.js";

export type CompositionIssueCode =
  | "UNKNOWN_ARCHETYPE"
  | "UNKNOWN_DOMINANT_STATE"
  | "SECONDARY_EQUALS_DOMINANT"
  | "CIRCULAR_BLOCK"
  | "INVALID_SECONDARY_LIFECYCLE"
  | "INVALID_DOMINANT_LIFECYCLE"
  | "GRANULARITY_VIOLATION";

export type CompositionIssue = {
  readonly code: CompositionIssueCode;
  readonly message: string;
};

export type CompositionValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly CompositionIssue[] };

/**
 * Valida la composición dominante + secundarios.
 * Detecta bloqueos circulares de cualquier longitud (DFS).
 */
export function validateComposition(
  composition: ComposedArchetypeSpec,
): CompositionValidationResult {
  const issues: CompositionIssue[] = [];

  const dominant = getArchetype(composition.dominant);
  if (!dominant) {
    issues.push({
      code: "UNKNOWN_ARCHETYPE",
      message: `Arquetipo dominante desconocido: ${composition.dominant}`,
    });
    return { ok: false, issues };
  }

  const dominantValidation = validateLifecycle(dominant.lifecycle);
  if (!dominantValidation.ok) {
    issues.push({
      code: "INVALID_DOMINANT_LIFECYCLE",
      message: formatLifecycleIssues(dominantValidation.issues),
    });
  }

  const dominantStateIds = new Set(dominant.lifecycle.states.map((s) => s.id));

  for (const sec of composition.secondaries) {
    validateSecondary(composition.dominant, sec, dominantStateIds, issues);
  }
  // Detectar granularidad: dos secundarios no pueden ser independientes
const secondaryMap = new Map<string, SecondaryBinding[]>();
for (const sec of composition.secondaries) {
  const key = `${sec.bornInDominantState}|${sec.bloquea}`;
  if (!secondaryMap.has(key)) secondaryMap.set(key, []);
  secondaryMap.get(key)!.push(sec);
}

for (const [key, secs] of secondaryMap) {
  if (secs.length > 1) {
    issues.push({
      code: "GRANULARITY_VIOLATION",
      message: `Dos o más secundarios nacen en el mismo estado y bloquean igual (${key}): ${secs.map((s) => s.secondaryArchetypeId).join(", ")}. Violación de independencia de fallo: deben ser una sola aceptación.`,
    });
  }
}
  detectCircularBlocks(composition, issues);

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function validateSecondary(
  dominantId: ArchetypeId,
  sec: SecondaryBinding,
  dominantStateIds: ReadonlySet<string>,
  issues: CompositionIssue[],
): void {
  if (sec.secondaryArchetypeId === dominantId) {
    issues.push({
      code: "SECONDARY_EQUALS_DOMINANT",
      message: "Un secundario no puede ser el mismo arquetipo que el dominante",
    });
    return;
  }

  const secondary = getArchetype(sec.secondaryArchetypeId);
  if (!secondary) {
    issues.push({
      code: "UNKNOWN_ARCHETYPE",
      message: `Arquetipo secundario desconocido: ${sec.secondaryArchetypeId}`,
    });
    return;
  }

  const secondaryValidation = validateLifecycle(secondary.lifecycle);
  if (!secondaryValidation.ok) {
    issues.push({
      code: "INVALID_SECONDARY_LIFECYCLE",
      message: `${sec.secondaryArchetypeId}: ${formatLifecycleIssues(secondaryValidation.issues)}`,
    });
  }

  if (!dominantStateIds.has(sec.bornInDominantState)) {
    issues.push({
      code: "UNKNOWN_DOMINANT_STATE",
      message: `bornInDominantState desconocido: ${sec.bornInDominantState}`,
    });
  }

  if (!dominantStateIds.has(sec.bloquea)) {
    issues.push({
      code: "UNKNOWN_DOMINANT_STATE",
      message: `bloquea referencia estado desconocido: ${sec.bloquea}`,
    });
  }
}

/**
 * Grafo de dependencias de la máquina compuesta:
 * nodo = estado del dominante; arista bornIn → bloquea por cada binding.
 * Un ciclo implica espera circular de cualquier longitud.
 *
 * Grafo auxiliar entre secundarios: A → B si A.bloquea === B.bornInDominantState
 * (A debe terminar antes de que B pueda nacer / avanzar).
 */
export function detectCircularBlocks(
  composition: ComposedArchetypeSpec,
  issues: CompositionIssue[],
): void {
  for (const sec of composition.secondaries) {
    if (sec.bloquea === sec.bornInDominantState) {
      issues.push({
        code: "CIRCULAR_BLOCK",
        message: `${sec.secondaryArchetypeId}: bloquea no puede ser el mismo estado que bornInDominantState`,
      });
    }
  }

  const stateAdj = buildStateDependencyGraph(composition.secondaries);
  const stateCycle = findCycleDfs(stateAdj);
  if (stateCycle) {
    issues.push({
      code: "CIRCULAR_BLOCK",
      message: `Bloqueo circular de estados (${stateCycle.length}): ${stateCycle.join("→")}`,
    });
  }

  const secondaryAdj = buildSecondaryDependencyGraph(composition.secondaries);
  const secondaryCycle = findCycleDfs(secondaryAdj);
  if (secondaryCycle) {
    issues.push({
      code: "CIRCULAR_BLOCK",
      message: `Bloqueo circular entre arquetipos (${secondaryCycle.length}): ${secondaryCycle.join("→")}`,
    });
  }
}

/** Arista: bornInDominantState → bloquea */
export function buildStateDependencyGraph(
  secondaries: readonly SecondaryBinding[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    if (!adj.has(from)) adj.set(from, new Set());
    adj.get(from)!.add(to);
    if (!adj.has(to)) adj.set(to, new Set());
  };
  for (const sec of secondaries) {
    add(sec.bornInDominantState, sec.bloquea);
  }
  return adj;
}

/** Arista: A → B cuando A.bloquea === B.bornInDominantState */
export function buildSecondaryDependencyGraph(
  secondaries: readonly SecondaryBinding[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    if (!adj.has(from)) adj.set(from, new Set());
    adj.get(from)!.add(to);
    if (!adj.has(to)) adj.set(to, new Set());
  };
  for (const a of secondaries) {
    for (const b of secondaries) {
      if (a.secondaryArchetypeId === b.secondaryArchetypeId) continue;
      if (a.bloquea === b.bornInDominantState) {
        add(a.secondaryArchetypeId, b.secondaryArchetypeId);
      }
    }
  }
  return adj;
}

/**
 * DFS con colores: detecta un ciclo y lo devuelve como lista de nodos
 * (el primer y último son el mismo vértice de cierre, omitido al final
 * salvo que se repita el inicio para legibilidad: n1→n2→…→n1).
 */
export function findCycleDfs(
  adj: ReadonlyMap<string, ReadonlySet<string>>,
): string[] | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (const node of adj.keys()) {
    color.set(node, WHITE);
    parent.set(node, null);
  }

  let cycle: string[] | null = null;

  const visit = (u: string): boolean => {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === WHITE) {
        parent.set(v, u);
        if (visit(v)) return true;
      } else if (c === GRAY) {
        // Ciclo encontrado: reconstruir u → … → v → u
        const path: string[] = [v];
        let cur: string | null = u;
        while (cur !== null && cur !== v) {
          path.push(cur);
          cur = parent.get(cur) ?? null;
        }
        path.push(v);
        path.reverse();
        cycle = path;
        return true;
      }
    }
    color.set(u, BLACK);
    return false;
  };

  for (const node of adj.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      if (visit(node)) break;
    }
  }

  return cycle;
}

function formatLifecycleIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((i) => `${i.code}: ${i.message}`).join("; ");
}
