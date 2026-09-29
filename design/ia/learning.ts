/**
 * Aprendizaje desde Observador de experiencia → PROPUESTAS (nunca auto-aplicar).
 */

import { createHash } from "node:crypto";
import type { Layer3PresentationIntelligence } from "../../bridges/presentation-intelligence/layer3-reader.js";
import type { RecorridoFunnel } from "../../bridges/presentation-intelligence/types.js";
import type {
  InformationArchitectureProposal,
  IaProposalKind,
} from "./types.js";

export interface ExperienceSignals {
  /** Embudos por recorrido (abandonos frecuentes). */
  readonly funnels?: readonly RecorridoFunnel[];
  /** Lectura formal del Observador de experiencia. */
  readonly experienceReader?: Layer3PresentationIntelligence;
}

export class InformationArchitectureProposalStore {
  private readonly proposals: InformationArchitectureProposal[] = [];

  all(): readonly InformationArchitectureProposal[] {
    return this.proposals;
  }

  pending(): readonly InformationArchitectureProposal[] {
    return this.proposals.filter((p) => p.status === "pending");
  }

  add(proposal: InformationArchitectureProposal): void {
    if (this.proposals.some((p) => p.id === proposal.id)) return;
    this.proposals.push(Object.freeze({ ...proposal }));
  }

  approve(id: string): InformationArchitectureProposal {
    return this.setStatus(id, "approved");
  }

  reject(id: string): InformationArchitectureProposal {
    return this.setStatus(id, "rejected");
  }

  private setStatus(
    id: string,
    status: "approved" | "rejected",
  ): InformationArchitectureProposal {
    const idx = this.proposals.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error(`Propuesta no encontrada: ${id}`);
    const next = { ...this.proposals[idx]!, status };
    this.proposals[idx] = Object.freeze(next);
    return next;
  }
}

function proposalId(
  kind: IaProposalKind,
  roleId: string,
  key: string,
): string {
  return createHash("sha256")
    .update(`${kind}:${roleId}:${key}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Deduce propuestas a partir de telemetría UX.
 * NO reordena la interfaz: solo genera propuestas pendientes de aprobación.
 */
export function proposeFromExperience(input: {
  readonly roleId: string;
  readonly signals: ExperienceSignals;
  readonly at: string;
  readonly store: InformationArchitectureProposalStore;
  readonly stepOrderByRecorrido?: Readonly<Record<string, readonly string[]>>;
}): readonly InformationArchitectureProposal[] {
  const created: InformationArchitectureProposal[] = [];
  const funnels =
    input.signals.funnels ??
    (input.signals.experienceReader
      ? [] // el caller puede precomputar funnels
      : []);

  for (const funnel of funnels) {
    if (!funnel.topAbandonStepId) continue;
    const step = funnel.topAbandonStepId;
    const abandons =
      funnel.steps.find((s) => s.stepId === step)?.abandons ?? 0;
    if (abandons < 3) continue;

    const kind: IaProposalKind = "demote_action";
    const id = proposalId(kind, input.roleId, `${funnel.recorridoId}:${step}`);
    const proposal: InformationArchitectureProposal = {
      id,
      kind,
      roleId: input.roleId,
      rationale: `Paso ${step} concentra abandonos (${abandons}) en ${funnel.recorridoId}; proponer bajar prioridad en menú/inicio`,
      suggested: {
        demoteStepId: step,
        recorridoId: funnel.recorridoId,
      },
      basedOnTelemetry: {
        abandonStepId: step,
        metric: "top_abandon",
      },
      status: "pending",
      createdAt: input.at,
    };
    input.store.add(proposal);
    created.push(proposal);
  }

  // Impresiones de insight sin aceptación → no auto-reordenar; solo propuesta
  if (input.signals.experienceReader) {
    const impressions = input.signals.experienceReader.insightImpressions();
    if (impressions.length >= 5) {
      const id = proposalId(
        "change_home",
        input.roleId,
        `insights:${impressions.length}`,
      );
      const proposal: InformationArchitectureProposal = {
        id,
        kind: "change_home",
        roleId: input.roleId,
        rationale:
          "Varias impresiones de Insight sin señal de aceptación; proponer revisar destacados del inicio",
        suggested: { reviewHomeHighlights: true },
        basedOnTelemetry: {
          ...(impressions[0]?.insightId
            ? { insightId: impressions[0].insightId }
            : {}),
          metric: "insight_impressions",
        },
        status: "pending",
        createdAt: input.at,
      };
      input.store.add(proposal);
      created.push(proposal);
    }
  }

  return created;
}

/**
 * Aplicar una propuesta aprobada es un paso explícito (no automático).
 * Devuelve un patch sugerido; el caller reconstruye la IA y la guarda en overlay.
 */
export function materializeApprovedProposal(
  proposal: InformationArchitectureProposal,
): {
  readonly roleId: string;
  readonly patch: Readonly<Record<string, unknown>>;
} {
  if (proposal.status !== "approved") {
    throw new Error("Solo se materializan propuestas aprobadas");
  }
  return { roleId: proposal.roleId, patch: proposal.suggested };
}
