/**
 * Por cada plantilla: dato ausente → el Juez rechaza (sin defaults de producción).
 */

import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../archetypes/venta.js";
import { servicioArchetype } from "../archetypes/servicio.js";
import { usoTemporalArchetype } from "../archetypes/uso-temporal.js";
import { financieraArchetype } from "../archetypes/financiera.js";
import { deriveState } from "../core/derivation.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
  evaluateCompiledRule,
} from "../policies/judge.js";
import type { PolicyDocument } from "../policies/types.js";
import {
  ALL_POLICY_TEMPLATE_IDS,
  buildAvisoPlazoInsight,
  buildHitosTemplateInvocation,
  compilePolicyTemplate,
} from "../contracts/policy-templates/index.js";
import type { HitoPagoSpec } from "../archetypes/milestones.js";

const AT = "2026-06-01T12:00:00.000Z";

function pack(
  inv: Parameters<typeof compilePolicyTemplate>[0],
  life: typeof ventaArchetype.lifecycle,
  fields: readonly string[],
  roles = [{ id: "gerente", label: "Gerente" }],
) {
  const tpl = compilePolicyTemplate(inv);
  const catalog = catalogFromLifecycle(
    life.transitions.map((t) => t.id),
    life.states.map((s) => s.id),
    [...fields],
  );
  const doc: PolicyDocument = {
    id: "miss",
    version: "1",
    companyId: "c",
    archetypeId: "t",
    roles,
    permissions: [
      ...life.transitions.map((t) => ({
        id: `p-${t.id}`,
        kind: "permiso" as const,
        transitionId: t.id,
        allowedRoles: roles.map((r) => r.id),
      })),
      ...tpl.permissions,
    ],
    policies: [...tpl.policies],
    compliance: [...tpl.compliance],
  };
  return compilePolicies(doc, { catalog, activationAt: AT });
}

describe("Plantillas — dato ausente rechaza (sin defaults)", () => {
  it("cubre todas las plantillas del catálogo", () => {
    expect(ALL_POLICY_TEMPLATE_IDS.length).toBe(12);
  });

  it("tpl.descuento_maximo_sin_aprobacion: sin descuento_pct rechaza", () => {
    const life = ventaArchetype.lifecycle;
    const ruleSet = pack(
      {
        id: "d",
        plantilla: "tpl.descuento_maximo_sin_aprobacion",
        parametros: { porcentaje: 10 },
        transitionId: "t_aceptar",
      },
      life,
      ["descuento_pct"],
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "x",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "e",
          actorId: "a",
          actorKind: "humano",
          occurredAt: AT,
          evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        },
        actor: { id: "a", kind: "humano", roles: ["gerente"] },
        evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/descuento_pct|Restricción|falta dato/i);
  });

  it("tpl.importe_requiere_aprobacion: sin importe rechaza", () => {
    const life = servicioArchetype.lifecycle;
    const ruleSet = pack(
      {
        id: "i",
        plantilla: "tpl.importe_requiere_aprobacion",
        parametros: { importe_eur: 1000, aprueba: "gerente" },
        transitionId: "t_acordar",
      },
      life,
      ["importe"],
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "x",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_acordar",
          eventId: "e",
          actorId: "a",
          actorKind: "humano",
          occurredAt: AT,
          evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        },
        actor: { id: "a", kind: "humano", roles: ["gerente"] },
        evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/importe/i);
  });

  it("tpl.bloqueo_por_impago: sin dias_impago rechaza", () => {
    const life = ventaArchetype.lifecycle;
    const ruleSet = pack(
      {
        id: "b",
        plantilla: "tpl.bloqueo_por_impago",
        parametros: { dias: 45 },
        transitionId: "t_aceptar",
      },
      life,
      ["dias_impago"],
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "x",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "e",
          actorId: "a",
          actorKind: "humano",
          occurredAt: AT,
          evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        },
        actor: { id: "a", kind: "humano", roles: ["gerente"] },
        evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/dias_impago/i);
  });

  it("tpl.plazo_devolucion: sin ancla rechaza", () => {
    const life = ventaArchetype.lifecycle;
    const ruleSet = pack(
      {
        id: "p",
        plantilla: "tpl.plazo_devolucion",
        parametros: { dias: 14 },
        transitionId: "t_cerrar",
      },
      life,
      ["compra_at"],
    );
    const legal = ruleSet.rules.find((r) => r.kind === "legal_deadline")!;
    const v = evaluateCompiledRule(legal, {
      transactionId: "x",
      currentStateId: "en_entrega",
      fields: {},
      transitionId: "t_cerrar",
      actor: { id: "a", kind: "humano", roles: ["gerente"] },
      subjectActorId: "a",
      evidence: { kind: "fisica", reference: "r", recordedAt: AT },
      ruleSet,
      now: AT,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/compra_at|ancla|falta/i);
  });

  it("tpl.fianza_condicional: sin fianza_eur (restricción) rechaza si aplica", () => {
    const life = usoTemporalArchetype.lifecycle;
    const ruleSet = pack(
      {
        id: "f",
        plantilla: "tpl.fianza_condicional",
        parametros: { umbral_comensales: 1 },
        transitionId: "t_reservar",
      },
      life,
      ["tamano_grupo", "fianza_eur"],
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "x",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_reservar",
          eventId: "e",
          actorId: "a",
          actorKind: "humano",
          occurredAt: AT,
          evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        },
        actor: { id: "a", kind: "humano", roles: ["gerente"] },
        evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/fianza_eur|falta dato|Restricción/i);
  });

  it("tpl.limite_plazos_financiacion: sin plazos_meses rechaza", () => {
    const life = financieraArchetype.lifecycle;
    const ruleSet = pack(
      {
        id: "lp",
        plantilla: "tpl.limite_plazos_financiacion",
        parametros: { meses_max_sin_aprobacion: 12 },
        transitionId: "t_aprobar",
      },
      life,
      ["plazos_meses"],
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "x",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aprobar",
          eventId: "e",
          actorId: "a",
          actorKind: "humano",
          occurredAt: AT,
          evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        },
        actor: { id: "a", kind: "humano", roles: ["gerente"] },
        evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/plazos_meses|falta dato|Restricción/i);
  });

  it("tpl.hitos_pago: sin campo de cobro rechaza", () => {
    const life = servicioArchetype.lifecycle;
    const hitos: HitoPagoSpec[] = [
      {
        id: "h1",
        fase: "a",
        pct: 100,
        bornInDominantState: "acordado",
        bloquea: "en_ejecucion",
      },
    ];
    const inv = buildHitosTemplateInvocation(
      { id: "h", plantilla: "tpl.hitos_pago", parametros: {} },
      hitos,
    );
    const ruleSet = pack(inv, life, ["hito_h1_cobrado"]);
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "x",
        lifecycle: life,
        derived: deriveState(life, [
          {
            id: "e0",
            kind: "transicion",
            subjectId: "x",
            transitionId: "t_acordar",
            fromStateId: "propuesta",
            toStateId: "acordado",
            occurredAt: AT,
            actorId: "a",
            actorKind: "humano",
            evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
          },
        ]),
        command: {
          transitionId: "t_ejecutar",
          eventId: "e",
          actorId: "sys",
          actorKind: "sistema",
          occurredAt: AT,
          evidence: { kind: "sistema", reference: "r", recordedAt: AT },
        },
        actor: { id: "sys", kind: "sistema", roles: ["gerente"] },
        evidence: { kind: "sistema", reference: "r", recordedAt: AT },
        fields: {},
        ruleSet,
      }),
    ).toThrow(JudgeRejectionError);
  });

  it("tpl.aviso_plazo: sin deadline no genera aviso (no bloquea)", () => {
    expect(
      buildAvisoPlazoInsight(
        {
          id: "a",
          plantilla: "tpl.aviso_plazo",
          parametros: { dias_antes: 10 },
        },
        {
          tenantId: "t",
          subjectId: "s",
          deadlineAt: "2026-12-01T00:00:00.000Z",
          now: "2026-01-01T00:00:00.000Z",
          responsibleRoles: ["gerente"],
        },
      ),
    ).toBeNull();
  });

  it("tpl.evidencia_requerida: evidencia incorrecta rechaza", () => {
    const life = servicioArchetype.lifecycle;
    const ruleSet = pack(
      {
        id: "ev",
        plantilla: "tpl.evidencia_requerida",
        parametros: { evidence: "consentimiento_informado" },
        transitionId: "t_ejecutar",
      },
      life,
      [],
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "x",
        lifecycle: life,
        derived: deriveState(life, [
          {
            id: "e0",
            kind: "transicion",
            subjectId: "x",
            transitionId: "t_acordar",
            fromStateId: "propuesta",
            toStateId: "acordado",
            occurredAt: AT,
            actorId: "a",
            actorKind: "humano",
            evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
          },
        ]),
        command: {
          transitionId: "t_ejecutar",
          eventId: "e",
          actorId: "a",
          actorKind: "humano",
          occurredAt: AT,
          evidence: { kind: "aceptacion", reference: "omitido", recordedAt: AT },
        },
        actor: { id: "a", kind: "humano", roles: ["gerente"] },
        evidence: {
          kind: "aceptacion",
          reference: "omitido",
          referenceType: "omitido",
          recordedAt: AT,
        },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/consentimiento|evidencia|Actor permitido/i);
  });

  it("tpl.permiso_excepcion: rol indebido rechaza", () => {
    const life = ventaArchetype.lifecycle;
    const ruleSet = pack(
      {
        id: "pe",
        plantilla: "tpl.permiso_excepcion",
        parametros: { rol: "gerente" },
        transitionId: "t_cancelar_propuesta",
      },
      life,
      [],
      [
        { id: "gerente", label: "G" },
        { id: "becario", label: "B" },
      ],
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "x",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_cancelar_propuesta",
          eventId: "e",
          actorId: "b",
          actorKind: "humano",
          occurredAt: AT,
          evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        },
        actor: { id: "b", kind: "humano", roles: ["becario"] },
        evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        fields: {},
        ruleSet,
      }),
    ).toThrow(/rol/i);
  });

  it("tpl.limite_credito_por_cliente / restriccion_saldo: sin parte_id falla hechos", () => {
    const life = ventaArchetype.lifecycle;
    const ruleSet = pack(
      {
        id: "lc",
        plantilla: "tpl.limite_credito_por_cliente",
        parametros: { por_defecto_eur: 1000 },
        transitionId: "t_aceptar",
      },
      life,
      ["parte_id", "importe"],
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "x",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "e",
          actorId: "a",
          actorKind: "humano",
          occurredAt: AT,
          evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        },
        actor: { id: "a", kind: "humano", roles: ["gerente"] },
        evidence: { kind: "aceptacion", reference: "r", recordedAt: AT },
        fields: { importe: 100 },
        ruleSet,
      }),
    ).toThrow();
  });
});
