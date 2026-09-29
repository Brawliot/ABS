/**
 * Activación real de cada tpl.* vía Juez (no solo compilación).
 */

import { describe, expect, it } from "vitest";
import { servicioArchetype } from "../archetypes/servicio.js";
import { ventaArchetype } from "../archetypes/venta.js";
import { usoTemporalArchetype } from "../archetypes/uso-temporal.js";
import { financieraArchetype } from "../archetypes/financiera.js";
import {
  hitoPaymentField,
  type HitoPagoSpec,
} from "../archetypes/milestones.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import { FactProvider, withFactPayload } from "../facts/index.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
  collectFactRequests,
  evaluateCompiledRule,
  type GuardContext,
} from "../policies/judge.js";
import { FACT_IDS } from "../facts/index.js";
import type {
  CompiledRuleSet,
  PolicyDocument,
} from "../policies/types.js";
import {
  ALL_POLICY_TEMPLATE_IDS,
  buildHitosTemplateInvocation,
  compilePolicyTemplate,
} from "../contracts/policy-templates/index.js";

const ACTIVATION_AT = "2026-06-01T12:00:00.000Z";

function compileTplDoc(
  tplInv: Parameters<typeof compilePolicyTemplate>[0],
  opts: {
    life: typeof ventaArchetype.lifecycle;
    roles: readonly { id: string; label: string }[];
    extraFields?: readonly string[];
  },
): CompiledRuleSet {
  const tpl = compilePolicyTemplate(tplInv);
  const catalog = catalogFromLifecycle(
    opts.life.transitions.map((t) => t.id),
    opts.life.states.map((s) => s.id),
    opts.extraFields ?? [],
  );
  const doc: PolicyDocument = {
    id: "tpl-act",
    version: "1",
    companyId: "act",
    archetypeId: "test",
    roles: [...opts.roles],
    permissions: [
      ...opts.life.transitions.map((t) => ({
        id: `perm-${t.id}`,
        kind: "permiso" as const,
        transitionId: t.id,
        allowedRoles: opts.roles.map((r) => r.id),
      })),
      ...tpl.permissions,
    ],
    policies: [...tpl.policies],
    compliance: [...tpl.compliance],
  };
  return compilePolicies(doc, { catalog, activationAt: ACTIVATION_AT });
}

function mkEvent(
  life: typeof ventaArchetype.lifecycle,
  transitionId: string,
  subjectId = "tx-act",
): TransitionEvent {
  const tr = life.transitions.find((t) => t.id === transitionId)!;
  const evidenceKind =
    transitionId === "t_ejecutar"
      ? "sistema"
      : transitionId === "t_presentar"
        ? "fisica"
        : "aceptacion";
  return {
    id: `ev-${transitionId}-${subjectId}`,
    kind: "transicion",
    subjectId,
    transitionId,
    fromStateId: tr.from,
    toStateId: tr.to,
    occurredAt: "2026-01-01T00:00:00.000Z",
    actorId: "u1",
    actorKind: "humano",
    evidence: {
      kind: evidenceKind,
      reference: "ok",
      recordedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function mkVentaEvent(transitionId: string): TransitionEvent {
  return mkEvent(ventaArchetype.lifecycle, transitionId);
}

function mkServicioEvent(
  transitionId: string,
  subjectId = "tx-svc",
): TransitionEvent {
  return mkEvent(servicioArchetype.lifecycle, transitionId, subjectId);
}

describe("Activación real tpl.* (Juez)", () => {
  it("catálogo completo tiene prueba de activación", () => {
    expect(ALL_POLICY_TEMPLATE_IDS.length).toBe(12);
  });

  it("tpl.descuento_maximo_sin_aprobacion bloquea descuento excesivo", () => {
    const life = ventaArchetype.lifecycle;
    const ruleSet = compileTplDoc(
      {
        id: "tpl-desc",
        plantilla: "tpl.descuento_maximo_sin_aprobacion",
        parametros: { porcentaje: 10 },
        transitionId: "t_aceptar",
      },
      {
        life,
        roles: [{ id: "dueno", label: "Dueño" }],
        extraFields: ["descuento_pct"],
      },
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-act",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "e1",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["dueno"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: ACTIVATION_AT,
        },
        fields: { descuento_pct: 15 },
        ruleSet,
      }),
    ).toThrow(JudgeRejectionError);
  });

  it("tpl.importe_requiere_aprobacion rechaza sin importe y exige rol al superar umbral", () => {
    const life = servicioArchetype.lifecycle;
    const ruleSet = compileTplDoc(
      {
        id: "tpl-importe",
        plantilla: "tpl.importe_requiere_aprobacion",
        parametros: { importe_eur: 3000, aprueba: "director_medico" },
        transitionId: "t_acordar",
      },
      {
        life,
        roles: [
          { id: "director_medico", label: "Director" },
          { id: "asistente", label: "Asistente" },
        ],
        extraFields: ["importe"],
      },
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-clin",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_acordar",
          eventId: "e1",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["asistente"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: ACTIVATION_AT,
        },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/importe present/i);

    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-clin",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_acordar",
          eventId: "e2",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["asistente"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: ACTIVATION_AT,
        },
        fields: { importe: 5000 },
        ruleSet,
      }),
    ).toThrow(/director_medico/i);
  });

  it("tpl.limite_credito_por_cliente bloquea venta sobre límite", () => {
    const life = ventaArchetype.lifecycle;
    const ruleSet = compileTplDoc(
      {
        id: "tpl-cred",
        plantilla: "tpl.limite_credito_por_cliente",
        parametros: { por_defecto_eur: 1000 },
        transitionId: "t_aceptar",
      },
      {
        life,
        roles: [{ id: "dueno", label: "Dueño" }],
        extraFields: ["parte_id", "importe"],
      },
    );
    const provider = new FactProvider();
    const tenantId = "act-cred";
    provider.applyEvent(
      tenantId,
      withFactPayload(mkVentaEvent("t_aceptar"), {
        parteId: "cli-1",
        importe: 800,
      }),
    );
    const fields = { parte_id: "cli-1", importe: 500 };
    const bag = provider.prepare(
      tenantId,
      collectFactRequests(ruleSet, "t_aceptar", fields),
    );
    expect(
      bag.get(FACT_IDS.PARTE_SALDO_PENDIENTE, { parteId: "cli-1" }),
    ).toBeGreaterThan(0);
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-cred",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "e1",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["dueno"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: ACTIVATION_AT,
        },
        fields,
        ruleSet,
        tenantId,
        facts: bag,
      }),
    ).toThrow(JudgeRejectionError);
  });

  it("tpl.bloqueo_por_impago rechaza sin dato y con impago activo", () => {
    const life = ventaArchetype.lifecycle;
    const ruleSet = compileTplDoc(
      {
        id: "tpl-impago",
        plantilla: "tpl.bloqueo_por_impago",
        parametros: { dias: 45 },
        transitionId: "t_aceptar",
      },
      {
        life,
        roles: [{ id: "dueno", label: "Dueño" }],
        extraFields: ["dias_impago"],
      },
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-imp",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "e1",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["dueno"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: ACTIVATION_AT,
        },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/dias_impago/i);

    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-imp2",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "e2",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["dueno"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: ACTIVATION_AT,
        },
        fields: { dias_impago: 60 },
        ruleSet,
      }),
    ).toThrow(/Restricción/i);
  });

  it("tpl.plazo_devolucion activa plazo legal en t_cerrar", () => {
    const life = ventaArchetype.lifecycle;
    const ruleSet = compileTplDoc(
      {
        id: "tpl-plazo",
        plantilla: "tpl.plazo_devolucion",
        parametros: { dias: 14 },
        transitionId: "t_cerrar",
      },
      {
        life,
        roles: [{ id: "dueno", label: "Dueño" }],
        extraFields: ["compra_at"],
      },
    );
    const legal = ruleSet.rules.find((r) => r.kind === "legal_deadline");
    expect(legal).toBeDefined();
    const ctx: GuardContext = {
      transactionId: "tx-plazo",
      currentStateId: "en_entrega",
      fields: { compra_at: "2026-06-01T00:00:00.000Z" },
      transitionId: "t_cerrar",
      actor: { id: "u1", kind: "humano", roles: ["dueno"] },
      subjectActorId: "u1",
      evidence: {
        kind: "fisica",
        reference: "factura:1",
        recordedAt: ACTIVATION_AT,
      },
      ruleSet,
      now: "2026-06-05T00:00:00.000Z",
    };
    const v = evaluateCompiledRule(legal!, ctx);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/Plazo legal/i);
  });

  it("tpl.aviso_plazo no bloquea y no usa dataRetention", () => {
    const life = ventaArchetype.lifecycle;
    const tpl = compilePolicyTemplate({
      id: "tpl-aviso",
      plantilla: "tpl.aviso_plazo",
      parametros: { dias_antes: 7 },
      transitionId: "t_cerrar",
    });
    expect(tpl.compliance[0]?.avisoPlazo?.diasAntes).toBe(7);
    expect(tpl.compliance[0]?.dataRetention).toBeUndefined();
    expect(tpl.policies).toHaveLength(0);
    const ruleSet = compileTplDoc(
      {
        id: "tpl-aviso",
        plantilla: "tpl.aviso_plazo",
        parametros: { dias_antes: 7 },
        transitionId: "t_cerrar",
      },
      { life, roles: [{ id: "dueno", label: "Dueño" }] },
    );
    const blocking = ruleSet.rules.filter(
      (r) =>
        r.sourcePolicyId === "tpl-aviso" &&
        r.kind !== "visibility" &&
        r.kind !== "calculation",
    );
    expect(blocking).toHaveLength(0);
  });

  it("tpl.restriccion_saldo_antes_de bloquea cierre con deuda", () => {
    const life = servicioArchetype.lifecycle;
    const ruleSet = compileTplDoc(
      {
        id: "tpl-saldo",
        plantilla: "tpl.restriccion_saldo_antes_de",
        parametros: {},
        transitionId: "t_cerrar",
      },
      {
        life,
        roles: [{ id: "dueno", label: "Dueño" }],
        extraFields: ["parte_id"],
      },
    );
    const provider = new FactProvider();
    const tenantId = "act-saldo";
    provider.applyEvent(
      tenantId,
      withFactPayload(
        {
          id: "ev-deuda",
          kind: "transicion",
          subjectId: "tx-deuda",
          transitionId: "t_acordar",
          fromStateId: "propuesta",
          toStateId: "acordado",
          occurredAt: "2026-01-01T00:00:00.000Z",
          actorId: "u1",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        { parteId: "cli-taller", importe: 500 },
      ),
    );
    const events = [
      mkServicioEvent("t_acordar"),
      mkServicioEvent("t_ejecutar"),
      mkServicioEvent("t_presentar"),
    ];
    const fields = { parte_id: "cli-taller" };
    const bag = provider.prepare(
      tenantId,
      collectFactRequests(ruleSet, "t_cerrar", fields),
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-svc",
        lifecycle: life,
        derived: deriveState(life, events as TransitionEvent[]),
        command: {
          transitionId: "t_cerrar",
          eventId: "e-cerrar",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["dueno"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: ACTIVATION_AT,
        },
        fields,
        ruleSet,
        tenantId,
        facts: bag,
      }),
    ).toThrow(JudgeRejectionError);
  });

  it("tpl.evidencia_requerida exige referenceType en cumplimiento", () => {
    const life = servicioArchetype.lifecycle;
    const ruleSet = compileTplDoc(
      {
        id: "tpl-ev",
        plantilla: "tpl.evidencia_requerida",
        parametros: { evidence: "consentimiento_informado" },
        transitionId: "t_ejecutar",
      },
      { life, roles: [{ id: "medico", label: "Médico" }] },
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-ev",
        lifecycle: life,
        derived: deriveState(life, [mkServicioEvent("t_acordar", "tx-ev")]),
        command: {
          transitionId: "t_ejecutar",
          eventId: "e1",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "omitido",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["medico"] },
        evidence: {
          kind: "aceptacion",
          reference: "omitido",
          referenceType: "omitido",
          recordedAt: ACTIVATION_AT,
        },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/consentimiento_informado/i);
  });

  it("tpl.fianza_condicional bloquea reserva grande sin fianza", () => {
    const life = usoTemporalArchetype.lifecycle;
    const ruleSet = compileTplDoc(
      {
        id: "tpl-fianza",
        plantilla: "tpl.fianza_condicional",
        parametros: { umbral_comensales: 10 },
        transitionId: "t_reservar",
      },
      {
        life,
        roles: [{ id: "gerente", label: "Gerente" }],
        extraFields: ["tamano_grupo", "fianza_eur"],
      },
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-fianza",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_reservar",
          eventId: "e1",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["gerente"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: ACTIVATION_AT,
        },
        fields: { tamano_grupo: 12, fianza_eur: 0 },
        ruleSet,
      }),
    ).toThrow(/fianza_eur/i);
  });

  it("tpl.permiso_excepcion restringe t_cancelar al rol indicado", () => {
    const life = ventaArchetype.lifecycle;
    const ruleSet = compileTplDoc(
      {
        id: "tpl-perm-exc",
        plantilla: "tpl.permiso_excepcion",
        parametros: { rol: "dueno" },
        transitionId: "t_cancelar_propuesta",
      },
      {
        life,
        roles: [
          { id: "dueno", label: "Dueño" },
          { id: "becario", label: "Becario" },
        ],
      },
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-perm",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_cancelar_propuesta",
          eventId: "e1",
          actorId: "u2",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u2", kind: "humano", roles: ["becario"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: ACTIVATION_AT,
        },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/rol/i);
  });

  it("tpl.limite_plazos_financiacion bloquea plazo largo sin aprobación", () => {
    const life = financieraArchetype.lifecycle;
    const ruleSet = compileTplDoc(
      {
        id: "tpl-plazos",
        plantilla: "tpl.limite_plazos_financiacion",
        parametros: { meses_max_sin_aprobacion: 12 },
        transitionId: "t_aprobar",
      },
      {
        life,
        roles: [{ id: "gerente", label: "Gerente" }],
        extraFields: ["plazos_meses"],
      },
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-fin",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aprobar",
          eventId: "e1",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["gerente"] },
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: ACTIVATION_AT,
        },
        fields: { plazos_meses: 24 },
        ruleSet,
      }),
    ).toThrow(/plazos_meses/i);
  });

  it("tpl.hitos_pago bloquea avance de fase sin cobro previo", () => {
    const life = servicioArchetype.lifecycle;
    const hitos: HitoPagoSpec[] = [
      {
        id: "h1",
        fase: "anticipo",
        pct: 30,
        bornInDominantState: "acordado",
        bloquea: "en_ejecucion",
      },
      {
        id: "h2",
        fase: "final",
        pct: 70,
        bornInDominantState: "en_ejecucion",
        bloquea: "en_espera",
      },
    ];
    const inv = buildHitosTemplateInvocation(
      {
        id: "tpl-hitos",
        plantilla: "tpl.hitos_pago",
        parametros: {},
      },
      hitos,
    );
    const ruleSet = compileTplDoc(inv, {
      life,
      roles: [{ id: "gerente", label: "Gerente" }],
      extraFields: [
        hitoPaymentField("h1", 0),
        hitoPaymentField("h2", 1),
      ],
    });
    const native = ruleSet.rules.some(
      (r) =>
        r.kind === "condition" &&
        r.transitionId === "t_presentar" &&
        "predicate" in r &&
        r.predicate.field === "hito_anterior_cobrado",
    );
    expect(native).toBe(true);
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-hitos",
        lifecycle: life,
        derived: deriveState(life, [
          mkServicioEvent("t_acordar", "tx-hitos"),
          mkServicioEvent("t_ejecutar", "tx-hitos"),
        ]),
        command: {
          transitionId: "t_presentar",
          eventId: "e-pres",
          actorId: "u1",
          actorKind: "humano",
          occurredAt: ACTIVATION_AT,
          evidence: {
            kind: "fisica",
            reference: "entrega",
            recordedAt: ACTIVATION_AT,
          },
        },
        actor: { id: "u1", kind: "humano", roles: ["gerente"] },
        evidence: {
          kind: "fisica",
          reference: "entrega",
          recordedAt: ACTIVATION_AT,
        },
        fields: { hito_anterior_cobrado: false },
        ruleSet,
      }),
    ).toThrow(JudgeRejectionError);
  });
});
