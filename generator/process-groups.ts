/**
 * Agrupación primaria de UI por proceso (lifecycle) y secundarios.
 */

import type {
  PresentationChannel,
  ProcessGroupSpec,
  RecorridoSpec,
  ViewSpec,
  ActionSpec,
} from "../presentation/types.js";
import type { GeneratorInput, LifecycleSlice } from "./types.js";
import type { PresentationPanelDecl } from "./presentation-rules.js";

function channelForSlice(
  input: GeneratorInput,
  slice: LifecycleSlice,
): PresentationChannel {
  if (
    slice.label?.toLowerCase().includes("taller") ||
    slice.archetypeId.includes("servicio")
  ) {
    if (input.channels.includes("taller")) return "taller";
  }
  if (input.channels.includes("backoffice")) return "backoffice";
  return input.channels[0] ?? "backoffice";
}

function rolesForLifecycle(
  input: GeneratorInput,
  lifecycleId: string,
  actions: readonly ActionSpec[],
): string[] {
  const roles = new Set<string>();
  for (const a of actions) {
    if (a.lifecycleId !== lifecycleId) continue;
    for (const r of a.visibleRoles) roles.add(r);
  }
  if (roles.size === 0) {
    for (const r of input.roles) roles.add(r.id);
  }
  return [...roles].sort();
}

function resolveCompositionRole(
  input: GeneratorInput,
  slice: LifecycleSlice,
): "dominant" | "secondary" | "standalone" {
  if (slice.compositionRole) return slice.compositionRole;
  if (!input.composition) return "standalone";
  if (slice.archetypeId === input.composition.dominant) return "dominant";
  if (
    input.composition.secondaries.some(
      (s) => s.secondaryArchetypeId === slice.archetypeId,
    )
  ) {
    return "secondary";
  }
  return "standalone";
}

/**
 * Construye processGroups + recorridos por proceso (no por mod.*).
 */
export function buildProcessGroups(
  input: GeneratorInput,
  views: readonly ViewSpec[],
  actions: readonly ActionSpec[],
  panels: readonly PresentationPanelDecl[],
): { processGroups: ProcessGroupSpec[]; recorridos: RecorridoSpec[] } {
  const processGroups: ProcessGroupSpec[] = [];
  const recorridos: RecorridoSpec[] = [];

  for (const slice of input.lifecycles) {
    const role = resolveCompositionRole(input, slice);
    const binding = input.composition?.secondaries.find(
      (s) => s.secondaryArchetypeId === slice.archetypeId,
    );
    const viewIds = views
      .filter(
        (v) =>
          v.lifecycleId === slice.id &&
          (v.kind === "tablero" ||
            v.kind === "lista" ||
            v.kind === "detalle" ||
            v.kind === "formulario"),
      )
      .map((v) => v.id)
      .sort();
    const actionIds = actions
      .filter((a) => a.lifecycleId === slice.id)
      .map((a) => a.id)
      .sort();
    const panelIds = panels
      .filter((p) => {
        if (p.kind === "portal_filtro") return false;
        if (p.kind === "panel_bloqueo") {
          return p.presentation.secondaryArchetypeId === slice.archetypeId;
        }
        if (p.kind === "panel_credito") {
          return p.lifecycleId === slice.id;
        }
        return p.lifecycleId === slice.id;
      })
      .map((p) => `view.${p.id}`)
      .sort();

    const recorridoId = `recorrido.proceso.${slice.id}`;
    recorridos.push({
      id: recorridoId,
      labelKey: `recorrido.proceso.${slice.id}`,
      steps: viewIds,
      roleIds: rolesForLifecycle(input, slice.id, actions),
    });

    processGroups.push({
      id: `proceso.${slice.id}`,
      labelKey: slice.label
        ? `proceso.${slice.id}`
        : `proceso.${slice.archetypeId}`,
      lifecycleId: slice.id,
      archetypeId: slice.archetypeId,
      role,
      ...(binding
        ? {
            bloqueaStateId: binding.bloquea,
            bornInDominantState: binding.bornInDominantState,
          }
        : {}),
      viewIds,
      actionIds,
      panelIds,
      recorridoId,
      channel: channelForSlice(input, slice),
      roleIds: rolesForLifecycle(input, slice.id, actions),
    });
  }

  // Grupo portal (proyección Filtro) si hay panel
  const portal = panels.find((p) => p.kind === "portal_filtro");
  if (portal) {
    const recorridoId = "recorrido.proceso.portal_filtro";
    const viewId = `view.${portal.id}`;
    recorridos.push({
      id: recorridoId,
      labelKey: "recorrido.proceso.portal_filtro",
      steps: [viewId],
      roleIds: [...portal.roleIds],
    });
    processGroups.push({
      id: "proceso.portal_filtro",
      labelKey: "proceso.portal_filtro",
      lifecycleId: "__portal__",
      archetypeId: "__portal__",
      role: "standalone",
      viewIds: [viewId],
      actionIds: [],
      panelIds: [viewId],
      recorridoId,
      channel: portal.channel,
      roleIds: [...portal.roleIds],
    });
  }

  processGroups.sort((a, b) => a.id.localeCompare(b.id));
  recorridos.sort((a, b) => a.id.localeCompare(b.id));
  return { processGroups, recorridos };
}
