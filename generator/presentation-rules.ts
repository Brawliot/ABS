/**
 * Reglas de presentación tipadas: paneles derivados de señales del núcleo.
 * No son booleanos de negocio ni condiciones de existencia de pantallas de proceso.
 */

import type {
  PresentationChannel,
  ViewKind,
  ViewSpec,
} from "../presentation/types.js";
import { admittedPatternsForView } from "../presentation/patterns.js";
import type { GeneratorInput } from "./types.js";

export interface PresentationPanelDecl {
  readonly id: string;
  readonly kind: ViewKind;
  readonly labelKey: string;
  readonly lifecycleId: string | null;
  readonly stateId: string | null;
  readonly channel: PresentationChannel;
  readonly roleIds: readonly string[];
  readonly signal: string;
  readonly presentation: Readonly<Record<string, string>>;
}

function rolesByHint(
  input: GeneratorInput,
  hints: readonly string[],
): string[] {
  const ids = input.roles.map((r) => r.id);
  const hit = ids.filter((id) =>
    hints.some((h) => id.toLowerCase().includes(h)),
  );
  return hit.length > 0 ? hit : ids.slice(0, 2);
}

function primaryChannel(
  input: GeneratorInput,
  preferred: PresentationChannel,
): PresentationChannel {
  return input.channels.includes(preferred)
    ? preferred
    : (input.channels[0] ?? preferred);
}

/**
 * Deriva paneles a partir de señales tipadas del núcleo / composición.
 */
export function derivePresentationPanels(
  input: GeneratorInput,
): PresentationPanelDecl[] {
  const panels: PresentationPanelDecl[] = [];

  if (input.resourceSubtypes.includes("capacidad_temporal")) {
    const lc =
      input.lifecycles.find(
        (l) =>
          l.archetypeId === "uso_temporal" ||
          l.archetypeId.includes("servicio") ||
          (l.label ?? "").toLowerCase().includes("taller"),
      ) ?? input.lifecycles[0];
    panels.push({
      id: "panel.agenda_disponibilidad",
      kind: "panel_agenda",
      labelKey: "panel.agenda_disponibilidad",
      lifecycleId: lc?.id ?? null,
      stateId: null,
      channel: primaryChannel(
        input,
        input.channels.includes("taller") ? "taller" : "backoffice",
      ),
      roleIds: rolesByHint(input, [
        "taller",
        "agenda",
        "servicio",
        "operaciones",
      ]),
      signal: "recurso.capacidad_temporal",
      presentation: {
        vista: "agenda_disponibilidad",
        recursoSubtype: "capacidad_temporal",
      },
    });
  }

  const hasRetencion =
    input.lifecycles.some((l) => l.archetypeId === "intermediacion") ||
    input.lifecycles.some((l) => l.archetypeId === "uso_temporal");
  if (hasRetencion) {
    const lc =
      input.lifecycles.find(
        (l) =>
          l.archetypeId === "intermediacion" ||
          l.archetypeId === "uso_temporal",
      ) ?? null;
    panels.push({
      id: "panel.retencion",
      kind: "panel_retencion",
      labelKey: "panel.retencion",
      lifecycleId: lc?.id ?? null,
      stateId: null,
      channel: primaryChannel(input, "backoffice"),
      roleIds: rolesByHint(input, ["finanzas", "gerente", "operaciones"]),
      signal: "movimiento.retencion_abierta",
      presentation: {
        vista: "retencion",
        movimientoSubtype: "retencion",
      },
    });
  }

  if (input.lifecycles.some((l) => l.archetypeId === "suscripcion")) {
    const lc = input.lifecycles.find((l) => l.archetypeId === "suscripcion")!;
    panels.push({
      id: "panel.periodos_cuotas",
      kind: "panel_periodos",
      labelKey: "panel.periodos_cuotas",
      lifecycleId: lc.id,
      stateId: null,
      channel: primaryChannel(input, "backoffice"),
      roleIds: rolesByHint(input, ["finanzas", "comercial", "gerente"]),
      signal: "arquetipo.suscripcion",
      presentation: {
        vista: "periodos_cuotas",
        archetypeId: "suscripcion",
      },
    });
  }

  const financieraSlices = input.lifecycles.filter(
    (l) => l.archetypeId === "financiera",
  );
  for (const lc of financieraSlices) {
    const binding = input.composition?.secondaries.find(
      (s) => s.secondaryArchetypeId === "financiera",
    );
    panels.push({
      id: `panel.credito.${lc.id}`,
      kind: "panel_credito",
      labelKey: "panel.credito",
      lifecycleId: lc.id,
      stateId: null,
      channel: primaryChannel(input, "backoffice"),
      roleIds: rolesByHint(input, ["finanzas", "gerente", "comercial"]),
      signal: "secundario.financiera",
      presentation: {
        vista: "credito",
        archetypeId: "financiera",
        ...(binding
          ? {
              bloquea: binding.bloquea,
              bornInDominantState: binding.bornInDominantState,
            }
          : {}),
      },
    });
  }

  if (input.composition) {
    for (const sec of input.composition.secondaries) {
      const secondaryLc = input.lifecycles.find(
        (l) => l.archetypeId === sec.secondaryArchetypeId,
      );
      panels.push({
        id: `panel.bloqueo.${sec.secondaryArchetypeId}.${sec.bloquea}`,
        kind: "panel_bloqueo",
        labelKey: "panel.bloqueo",
        lifecycleId: secondaryLc?.id ?? null,
        stateId: sec.bloquea,
        channel: primaryChannel(input, "backoffice"),
        roleIds: input.roles.map((r) => r.id),
        signal: "composition.bloquea",
        presentation: {
          vista: "bloqueo",
          secondaryArchetypeId: sec.secondaryArchetypeId,
          bloquea: sec.bloquea,
          bornInDominantState: sec.bornInDominantState,
          reason: `${sec.secondaryArchetypeId} abierto impide avanzar a ${sec.bloquea}`,
        },
      });
    }
  }

  /** Portal = proyección Filtro (visibility + Parte), no condición mod.*. */
  const portalRoles = portalVisibilityRoles(input);
  if (portalRoles.length > 0) {
    panels.push({
      id: "panel.portal_filtro",
      kind: "portal_filtro",
      labelKey: "panel.portal_filtro",
      lifecycleId: null,
      stateId: null,
      channel: input.channels.includes("autoservicio")
        ? "autoservicio"
        : primaryChannel(input, "web"),
      roleIds: portalRoles,
      signal: "filter.visibility_propia",
      presentation: {
        vista: "portal_filtro",
        scope: "propia",
        subjectKind: "parte",
      },
    });
  }

  return panels.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Roles con visibility (consultar) orientada a Parte/cliente → portal.
 */
export function portalVisibilityRoles(input: GeneratorInput): string[] {
  const roles = new Set<string>();
  for (const r of input.ruleSet.rules) {
    if (r.kind !== "visibility") continue;
    for (const role of r.allowedRoles) {
      const low = role.toLowerCase();
      if (
        low.includes("cliente") ||
        low.includes("parte") ||
        r.visibilityScope === "propia"
      ) {
        roles.add(role);
      }
    }
  }
  if (roles.size === 0 && input.channels.includes("autoservicio")) {
    for (const role of input.roles) {
      const low = role.id.toLowerCase();
      if (low.includes("cliente") || low.includes("parte")) {
        roles.add(role.id);
      }
    }
  }
  return [...roles].sort();
}

export function panelToView(panel: PresentationPanelDecl): ViewSpec {
  return {
    id: `view.${panel.id}`,
    kind: panel.kind,
    labelKey: panel.labelKey,
    stateId: panel.stateId,
    lifecycleId: panel.lifecycleId,
    actionIds: [],
    admittedPatterns: admittedPatternsForView(panel.kind),
    presentation: panel.presentation,
  };
}
