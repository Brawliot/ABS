/**
 * Criterios Presentador MVP (Insights simulados):
 * - Alerta de riesgo junto a su transacción, con hechos base
 * - Rol sin permiso no ve previsión de ingresos
 * - Aceptar recomendación → solicitud que pasa por el Juez
 * - Asignación a variante estable entre sesiones
 */

import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../archetypes/venta.js";
import { deriveState } from "../core/derivation.js";
import type { Insight } from "../contracts/insight.js";
import type { FilterReader } from "../filter/types.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import {
  attemptJudgedAdvance,
  JudgeRejectionError,
} from "../policies/judge.js";
import type { PolicyDocument } from "../policies/types.js";
import type { UiSpec } from "../presentation/types.js";
import { PRESENTATION_SCHEMA_VERSION } from "../presentation/types.js";
import {
  acceptRecommendation,
  assignExperimentVariant,
  presentInsights,
} from "../presenter/index.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "ingresos_previstos", "riesgo_score", "factura_id"],
);
const activationAt = "2026-04-01T00:00:00.000Z";

function compileDoc(over: Partial<PolicyDocument> = {}) {
  const doc: PolicyDocument = {
    id: "presenter-pack",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "finanzas", label: "Finanzas" },
      { id: "gerente", label: "Gerente" },
    ],
    organization: {
      sedes: [{ id: "sede-a", label: "Sede A" }],
      equipos: [{ id: "eq-a", label: "Ventas", sedeId: "sede-a" }],
      assignments: [
        {
          actorId: "u-vend",
          sedeId: "sede-a",
          equipoId: "eq-a",
          roleId: "vendedor",
        },
        {
          actorId: "u-fin",
          sedeId: "sede-a",
          equipoId: "eq-a",
          roleId: "finanzas",
        },
      ],
    },
    permissions: [
      {
        id: "vis-ops",
        kind: "permiso",
        action: "consultar",
        allowedRoles: ["vendedor", "finanzas", "gerente"],
        visibility: { scope: "sede" },
      },
      {
        id: "perm-aceptar",
        kind: "permiso",
        transitionId: "t_aceptar",
        allowedRoles: ["vendedor", "gerente"],
      },
    ],
    ...over,
  };
  return compilePolicies(doc, { catalog, activationAt });
}

const uiSpec: UiSpec = {
  id: "ui-presenter",
  version: PRESENTATION_SCHEMA_VERSION,
  generatedAt: "2026-06-01T00:00:00.000Z",
  sourceCaseId: "case-1",
  sourceCaseVersion: "1",
  sourcePolicyHash: "ph",
  contentHash: "ch",
  modules: [
    {
      id: "mod.ventas",
      labelKey: "mod.ventas",
      ruleId: "r1",
      channel: "backoffice",
      roleIds: ["vendedor", "finanzas", "gerente"],
      viewIds: ["view.tx.detalle", "view.tx.lista"],
      actionIds: ["act.aceptar"],
      recorridoIds: [],
    },
  ],
  views: [
    {
      id: "view.tx.detalle",
      kind: "detalle",
      labelKey: "tx.detalle",
      stateId: null,
      lifecycleId: "venta",
      actionIds: ["act.aceptar"],
      admittedPatterns: {
        listados: ["lista", "tarjetas"],
        navegacion: ["lateral", "superior", "inferior_movil"],
        formularios: ["una_columna", "dos_columnas", "por_pasos"],
        tableros: ["lista_agrupada"],
      },
    },
    {
      id: "view.tx.lista",
      kind: "lista",
      labelKey: "tx.lista",
      stateId: null,
      lifecycleId: "venta",
      actionIds: [],
      admittedPatterns: {
        listados: ["tabla", "lista", "tarjetas"],
        navegacion: ["lateral", "superior", "inferior_movil"],
        formularios: ["una_columna"],
        tableros: ["lista_agrupada"],
      },
    },
  ],
  actions: [
    {
      id: "act.aceptar",
      transitionId: "t_aceptar",
      lifecycleId: "venta",
      labelKey: "aceptar",
      visibleRoles: ["vendedor"],
      requiredEvidenceKind: "aceptacion",
      evidenceFields: [],
    },
  ],
  forms: [],
  recorridos: [],
  identity: { brandName: "Acme" },
  localization: [],
  content: {},
  styleTokenRefs: {
    colorPrimario: "color.primario",
    colorSecundario: "color.secundario",
    colorFondo: "color.fondo",
    colorSuperficie: "color.superficie",
    colorTexto: "color.texto",
    espaciadoM: "espaciado.m",
    tipografiaTitulos: "tipografia.titulos",
    tipografiaCuerpo: "tipografia.cuerpo",
    densidad: "densidad.activa",
    tactilMinimo: "tactil.minimo",
  },
};

const readerVend: FilterReader = {
  id: "u-vend",
  roles: ["vendedor"],
  tenantId: "acme",
};

const readerFin: FilterReader = {
  id: "u-fin",
  roles: ["finanzas"],
  tenantId: "acme",
};

function alertaRiesgo(over: Partial<Insight> = {}): Insight {
  return {
    id: "ins.alerta.riesgo-tx1",
    type: "alerta",
    subject: {
      kind: "transaccion",
      id: "tx-riesgo-1",
      tenantId: "acme",
      sedeId: "sede-a",
      equipoId: "eq-a",
      parteId: "parte-ana",
    },
    title: "Riesgo de impago",
    summary: "La transacción acumula señales de riesgo",
    baseFacts: [
      {
        id: "f-score",
        label: "Score de riesgo",
        value: 87,
        fieldKey: "riesgo_score",
      },
      {
        id: "f-dias",
        label: "Días sin movimiento",
        value: 21,
        fieldKey: "dias_sin_movimiento",
      },
    ],
    confidence: 0.91,
    generatedAt: "2026-06-01T10:00:00.000Z",
    expiresAt: "2026-12-01T00:00:00.000Z",
    preferredModuleId: "mod.ventas",
    preferredViewId: "view.tx.detalle",
    ...over,
  };
}

function previsionIngresos(): Insight {
  return {
    id: "ins.prevision.ingresos",
    type: "prevision",
    subject: {
      kind: "transaccion",
      id: "tx-forecast-1",
      tenantId: "acme",
      sedeId: "sede-a",
      equipoId: "eq-a",
    },
    title: "Previsión de ingresos",
    summary: "Ingresos esperados del mes",
    baseFacts: [
      {
        id: "f-ing",
        label: "Ingresos previstos",
        value: 125000,
        fieldKey: "ingresos_previstos",
      },
    ],
    confidence: 0.78,
    generatedAt: "2026-06-01T10:00:00.000Z",
    expiresAt: "2026-12-01T00:00:00.000Z",
    preferredModuleId: "mod.ventas",
    preferredViewId: "view.tx.detalle",
  };
}

function recomendacionAceptar(): Insight {
  return {
    id: "ins.reco.aceptar",
    type: "recomendacion",
    subject: {
      kind: "transaccion",
      id: "tx-reco-1",
      tenantId: "acme",
      sedeId: "sede-a",
      equipoId: "eq-a",
    },
    title: "Aceptar propuesta",
    summary: "Condiciones favorables para aceptar",
    baseFacts: [
      {
        id: "f-imp",
        label: "Importe",
        value: 500,
        fieldKey: "importe",
      },
    ],
    confidence: 0.88,
    generatedAt: "2026-06-01T10:00:00.000Z",
    expiresAt: "2026-12-01T00:00:00.000Z",
    suggestedAction: {
      transitionId: "t_aceptar",
      label: "Aceptar",
      evidenceKind: "aceptacion",
      evidenceReference: "insight-reco",
      fields: { importe: 500 },
    },
    preferredModuleId: "mod.ventas",
  };
}

describe("Presentador MVP", () => {
  const ruleSet = compileDoc();
  const now = "2026-06-15T12:00:00.000Z";

  it("una alerta de riesgo aparece junto a su transacción, con sus hechos base", () => {
    const insight = alertaRiesgo();
    const result = presentInsights({
      insights: [insight],
      uiSpec,
      reader: readerVend,
      ruleSet,
      now,
      audienceKey: "parte-ana",
    });

    expect(result.omitted).toHaveLength(0);
    expect(result.shown).toHaveLength(1);
    const shown = result.shown[0]!;
    expect(shown.type).toBe("alerta");
    expect(shown.subjectId).toBe("tx-riesgo-1");
    expect(shown.moduleId).toBe("mod.ventas");
    expect(shown.viewId).toBe("view.tx.detalle");
    expect(shown.baseFacts.length).toBeGreaterThanOrEqual(2);
    expect(shown.baseFacts.map((f) => f.id)).toContain("f-score");
  });

  it("un rol sin permiso no ve una previsión de ingresos", () => {
    const insight = previsionIngresos();

    const asVend = presentInsights({
      insights: [insight],
      uiSpec,
      reader: readerVend,
      ruleSet,
      now,
      audienceKey: "u-vend",
    });
    expect(asVend.shown).toHaveLength(0);
    expect(asVend.omitted[0]!.reason).toBe("facts_filtered_empty");

    const asFin = presentInsights({
      insights: [insight],
      uiSpec,
      reader: readerFin,
      ruleSet,
      now,
      audienceKey: "u-fin",
    });
    expect(asFin.shown).toHaveLength(1);
    expect(asFin.shown[0]!.type).toBe("prevision");
    expect(asFin.shown[0]!.baseFacts[0]!.fieldKey).toBe("ingresos_previstos");
  });

  it("aceptar una recomendación genera una solicitud que pasa por el Juez", () => {
    const insight = recomendacionAceptar();
    const { outcome, request } = acceptRecommendation({
      insight,
      identity: {
        actorId: "u-vend",
        actorKind: "humano",
        roles: ["vendedor"],
        tenantId: "acme",
      },
      interactionId: "click-accept-reco",
      occurredAt: now,
      channel: "backoffice",
      allowedTransitionIds: ["t_aceptar"],
    });

    expect(outcome.kind).toBe("solicitud");
    expect(request).not.toBeNull();
    expect(request!.transitionId).toBe("t_aceptar");
    expect(request!.subjectId).toBe("tx-reco-1");
    expect(request!.fields.insight_id).toBe("ins.reco.aceptar");

    const derived = deriveState(life, []);
    const judged = attemptJudgedAdvance({
      subjectId: request!.subjectId,
      lifecycle: life,
      derived,
      command: {
        transitionId: request!.transitionId,
        eventId: "e-from-insight",
        actorId: request!.actorId,
        actorKind: request!.actorKind,
        occurredAt: request!.occurredAt,
        evidence: request!.evidence,
      },
      actor: {
        id: request!.actorId,
        kind: request!.actorKind,
        roles: ["vendedor"],
      },
      evidence: request!.evidence,
      fields: { importe: 500 },
      ruleSet,
    });
    expect(judged.event.kind).toBe("transicion");
    expect(judged.event.transitionId).toBe("t_aceptar");

    // Sin rol → el Juez rechaza (la vía es la normal)
    expect(() =>
      attemptJudgedAdvance({
        subjectId: request!.subjectId,
        lifecycle: life,
        derived,
        command: {
          transitionId: request!.transitionId,
          eventId: "e-deny",
          actorId: "u-extra",
          actorKind: "humano",
          occurredAt: request!.occurredAt,
          evidence: request!.evidence,
        },
        actor: { id: "u-extra", kind: "humano", roles: ["becario"] },
        evidence: request!.evidence,
        fields: { importe: 500 },
        ruleSet,
      }),
    ).toThrow(JudgeRejectionError);
  });

  it("la asignación a una variante no cambia entre sesiones", () => {
    const variants = ["control", "tratamiento_A", "tratamiento_B"] as const;
    const audienceKey = "parte-estable-42";
    const experimentId = "exp.banner.riesgo";

    const v1 = assignExperimentVariant(experimentId, audienceKey, variants);
    const v2 = assignExperimentVariant(experimentId, audienceKey, variants);
    const vSessionB = assignExperimentVariant(
      experimentId,
      audienceKey,
      variants,
    );
    expect(v1).toBe(v2);
    expect(v2).toBe(vSessionB);

    const other = assignExperimentVariant(
      experimentId,
      "otra-parte",
      variants,
    );
    // Misma persona siempre igual; otra persona puede diferir (no lo exigimos)
    expect(variants).toContain(v1);
    expect(variants).toContain(other);

    const withInsight: Insight = {
      ...alertaRiesgo({
        id: "ins.exp",
        experiment: { experimentId, variants },
      }),
    };

    const session1 = presentInsights({
      insights: [withInsight],
      uiSpec,
      reader: readerVend,
      ruleSet,
      now,
      audienceKey,
    });
    const session2 = presentInsights({
      insights: [withInsight],
      uiSpec,
      reader: readerVend,
      ruleSet,
      now,
      audienceKey,
    });
    expect(session1.shown[0]!.experimentVariant).toBe(v1);
    expect(session2.shown[0]!.experimentVariant).toBe(
      session1.shown[0]!.experimentVariant,
    );
  });

  it("no muestra Insights caducados ni sin hechos base", () => {
    const expired = alertaRiesgo({
      id: "ins.old",
      generatedAt: "2025-06-01T10:00:00.000Z",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const result = presentInsights({
      insights: [expired],
      uiSpec,
      reader: readerVend,
      ruleSet,
      now,
      audienceKey: "x",
    });
    expect(result.shown).toHaveLength(0);
    expect(result.omitted[0]!.reason).toBe("expired");
  });
});
