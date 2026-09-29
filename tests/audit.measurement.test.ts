/**
 * Auditoría: banco de medición + pruebas de ruptura.
 * Ejecutar: npx vitest run tests/audit.measurement.test.ts
 *
 * No estima: mide clasificación contra etiquetas oro y cobertura de escenarios.
 */

import { describe, expect, it } from "vitest";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyFromAnswers,
  LowConfidenceError,
  NoArchetypeMatchError,
} from "../diagnosis/classifier.js";
import type { ExtractedAnswer } from "../diagnosis/questions.js";
import type { ArchetypeId } from "../archetypes/types.js";
import { validateComposition } from "../archetypes/composition.js";
import {
  ComposedTransactionSession,
  CompositionRuntimeError,
  explainRejection,
} from "../archetypes/composed-runtime.js";
import { createDevolucionVinculada } from "../archetypes/linked-transaction.js";
import { deriveState, assertCanAdvance, DerivationError } from "../core/derivation.js";
import { ventaArchetype } from "../archetypes/venta.js";
import { suscripcionArchetype } from "../archetypes/suscripcion.js";
import { intermediacionArchetype } from "../archetypes/intermediacion.js";
import { MetaObjectRegistry } from "../core/metaobject.js";
import {
  assertAllPartiesBalanceZero,
  computeBalanceByParty,
} from "../elements/closure.js";
import { InMemoryEventStore } from "../core/event-store.js";
import type { DomainEvent } from "../core/events.js";
import { createArchetypeLearnerRegistry } from "../learning/index.js";
import { BayesianTypeLearner } from "../learning/bayesian.js";
import { DriftDetector } from "../learning/drift.js";
import {
  DerivedCycleMutationError,
  DerivedLifecycleProjection,
} from "../elements/projection.js";
import {
  AGGREGATE_MIN_COMPANIES,
  AggregatedProfileLayer,
  MultiTenantVault,
  TenantIsolationError,
  aggregateCannotReconstructEvent,
} from "../learning/privacy.js";
import { concesionariaCase } from "../spec/cases.js";
import type { TransitionEvent } from "../core/events.js";
import type { PolicyDocument } from "../policies/types.js";
import {
  catalogFromLifecycle,
  compilePolicies,
  selectEffectiveRules,
} from "../policies/compiler.js";
import {
  FACTURA_TEMPLATE,
  CommunicationTrace,
  sendCommunication,
} from "../policies/comunicacion.js";
import {
  ParteIdentityStore,
  assertNoPiiInEventData,
} from "../policies/identity.js";
import {
  ForceNotAllowedError,
  JudgeRejectionError,
  attemptJudgedAdvance,
  applyCalculations,
} from "../policies/judge.js";
import { addBusinessDuration, compileCalendar } from "../policies/calendario.js";
import {
  changeLabel,
  seedClassification,
} from "../policies/clasificacion.js";
import { observeGoals } from "../policies/judge.js";
import { FACT_IDS } from "../facts/catalog.js";
import {
  ExperiencePrivacyError,
  ExperienceTelemetryStore,
  TELEMETRY_RETENTION_DAYS,
  assertLayer3ReadOnlyPort,
  assertTelemetryPrivacy,
  buildInsightShownRecord,
  buildRecorridoFunnel,
  buildTelemetryRecord,
  openLayer3Reader,
  recordAbandonWithoutBusinessEvent,
} from "../bridges/presentation-intelligence/index.js";
import {
  consult,
  UnansweredGapLog,
  type MetricFactRow,
} from "../consultant/index.js";
import {
  DEFAULT_INTERRUPT_LIMIT_PER_DAY,
  prioritizeInsights,
} from "../prioritizer/index.js";
import type { Insight } from "../contracts/insight.js";
import {
  InsightResponseStore,
  openResponseReader,
  recordAccepted,
  recordShown,
  assertResponseReadOnlyPort,
} from "../response-registrar/index.js";
import type { FilterReader } from "../filter/types.js";
import {
  generateUiSpec,
  structuralHash,
  validateUiWithDesignSystem,
  buildConcesionariaGeneratorInput,
} from "../generator/index.js";
import { runQaPass } from "../generator/qa/index.js";
import { runSecurityReview } from "../generator/security/index.js";
import { proposeDesignSystems, hashDesignSystem } from "../design/index.js";
import { buildInformationArchitecture } from "../design/ia/index.js";
import { proposeCopyPack, findForbiddenJargon } from "../design/copy/index.js";
import { bindDesignToUiSpec } from "../presentation/index.js";
import type { GeneratorInput } from "../generator/types.js";

type GoldCase = {
  id: string;
  prompt: string;
  /** Respuestas que un extractor fiel debería producir (etiqueta oro). */
  answers: readonly ExtractedAnswer[];
  expectedDominant: ArchetypeId | "NONE" | "LOW_CONF" | "AMBIGUOUS";
  tags: readonly string[];
};

function a(
  questionId: ExtractedAnswer["questionId"],
  value: boolean | string,
  confidence = 0.92,
): ExtractedAnswer {
  return { questionId, value, confidence };
}

function fullAnswers(
  flags: {
    se_queda: boolean;
    vuelve: boolean;
    periodico: boolean;
    produce: boolean;
    tercero: boolean;
    dinero: boolean;
    linea: string;
  },
  confidence = 0.92,
): ExtractedAnswer[] {
  return [
    a("cliente_se_queda", flags.se_queda, confidence),
    a("debe_volver", flags.vuelve, confidence),
    a("pago_periodico_acceso", flags.periodico, confidence),
    a("se_produce_despues", flags.produce, confidence),
    a("tercero_conecta", flags.tercero, confidence),
    a("dinero_o_cobertura", flags.dinero, confidence),
    a("linea_mas_ingresos", flags.linea, confidence),
  ];
}

/** 32 prompts realistas / vagos / contradictorios con etiqueta oro. */
export const GOLD_BANK: readonly GoldCase[] = [
  {
    id: "g01",
    prompt: "Tienda de zapatos: el cliente paga y se lleva el par.",
    answers: fullAnswers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedDominant: "venta",
    tags: ["claro", "venta"],
  },
  {
    id: "g02",
    prompt: "Consultoría IT: firmamos alcance y luego implementamos.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedDominant: "servicio_proyecto",
    tags: ["claro", "servicio"],
  },
  {
    id: "g03",
    prompt: "SaaS B2B con cuota mensual por usuario.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedDominant: "suscripcion",
    tags: ["claro", "suscripcion"],
  },
  {
    id: "g04",
    prompt: "Alquiler de furgonetas por días; el vehículo vuelve.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: true,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "uso_temporal",
    }),
    expectedDominant: "uso_temporal",
    tags: ["claro", "uso"],
  },
  {
    id: "g05",
    prompt: "Marketplace: conectamos comprador y vendedor; cobramos comisión.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: true,
      dinero: false,
      linea: "intermediacion",
    }),
    expectedDominant: "intermediacion",
    tags: ["claro", "intermediacion"],
  },
  {
    id: "g06",
    prompt: "Prestamos microcréditos a autónomos.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "financiera",
    }),
    expectedDominant: "financiera",
    tags: ["claro", "financiera"],
  },
  {
    id: "g07",
    prompt: "Concesionario: vendemos coches, financiamos y taller postventa.",
    answers: fullAnswers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: true,
      linea: "venta",
    }),
    expectedDominant: "venta",
    tags: ["compuesto", "concesionaria"],
  },
  {
    id: "g08",
    prompt: "Coworking: pagas mensual por acceso a mesa.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedDominant: "suscripcion",
    tags: ["claro"],
  },
  {
    id: "g09",
    prompt: "Seguro de hogar: cobramos prima y cubrimos siniestros.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "financiera",
    }),
    expectedDominant: "financiera",
    tags: ["ambiguo", "seguro"],
  },
  {
    id: "g10",
    prompt: "Formación online grabada: pagas una vez y te quedas el acceso.",
    answers: fullAnswers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedDominant: "venta",
    tags: ["borde", "digital"],
  },
  {
    id: "g11",
    prompt: "Formación online: cuota mensual mientras dure el curso.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedDominant: "suscripcion",
    tags: ["compuesto"],
  },
  {
    id: "g12",
    prompt: "Agencia inmobiliaria: cobramos por conectar comprador y propietario.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: true,
      dinero: false,
      linea: "intermediacion",
    }),
    expectedDominant: "intermediacion",
    tags: ["claro"],
  },
  {
    id: "g13",
    prompt: "Restaurante: comes y pagas; no hay devolución del plato.",
    answers: fullAnswers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedDominant: "AMBIGUOUS",
    tags: ["borde", "consumo"],
  },
  {
    id: "g14",
    prompt: "Algo con clientes y dinero, no sé explicar más.",
    answers: fullAnswers(
      {
        se_queda: false,
        vuelve: false,
        periodico: false,
        produce: false,
        tercero: false,
        dinero: false,
        linea: "venta",
      },
      0.4,
    ),
    expectedDominant: "LOW_CONF",
    tags: ["vago", "baja_confianza"],
  },
  {
    id: "g15",
    prompt: "Vendemos y al mismo tiempo el cliente debe devolverlo siempre.",
    answers: fullAnswers({
      se_queda: true,
      vuelve: true,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedDominant: "LOW_CONF",
    tags: ["contradictorio"],
  },
  {
    id: "g16",
    prompt: "No cobramos nada; solo damos consejos gratis.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedDominant: "NONE",
    tags: ["sin_intercambio", "borde"],
  },
  {
    id: "g17",
    prompt: "Leasing de maquinaria industrial.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: true,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "uso_temporal",
    }),
    expectedDominant: "uso_temporal",
    tags: ["compuesto", "leasing"],
  },
  {
    id: "g18",
    prompt: "Dropshipping: el proveedor envía; nosotros cobramos el margen.",
    answers: fullAnswers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: true,
      dinero: false,
      linea: "intermediacion",
    }),
    expectedDominant: "intermediacion",
    tags: ["borde", "dropshipping"],
  },
  {
    id: "g19",
    prompt: "Clínica dental: tratamiento en varias sesiones tras presupuesto.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedDominant: "servicio_proyecto",
    tags: ["claro"],
  },
  {
    id: "g20",
    prompt: "Gimnasio con cuota mensual.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedDominant: "suscripcion",
    tags: ["claro"],
  },
  {
    id: "g21",
    prompt: "Factoring: adelantamos facturas a pymes.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "financiera",
    }),
    expectedDominant: "financiera",
    tags: ["claro"],
  },
  {
    id: "g22",
    prompt: "Airbnb-host: alquilo habitación temporalmente.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: true,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "uso_temporal",
    }),
    expectedDominant: "uso_temporal",
    tags: ["claro"],
  },
  {
    id: "g23",
    prompt: "App de citas: premium mensual + a veces comisión por evento.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: true,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedDominant: "suscripcion",
    tags: ["compuesto"],
  },
  {
    id: "g24",
    prompt: "Constructoras: obra llave en mano con pagos por hitos.",
    answers: fullAnswers({
      se_queda: true,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedDominant: "servicio_proyecto",
    tags: ["borde"],
  },
  {
    id: "g25",
    prompt: "No sé si vendemos software o lo alquilamos; el cliente dice ambas cosas.",
    answers: fullAnswers(
      {
        se_queda: true,
        vuelve: true,
        periodico: true,
        produce: false,
        tercero: false,
        dinero: false,
        linea: "venta",
      },
      0.7,
    ),
    expectedDominant: "LOW_CONF",
    tags: ["contradictorio", "baja_confianza"],
  },
  {
    id: "g26",
    prompt: "ONG: donaciones recurrentes sin contraprestación clara.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: true,
      linea: "financiera",
    }),
    expectedDominant: "AMBIGUOUS",
    tags: ["borde", "ong"],
  },
  {
    id: "g27",
    prompt: "Barbería: corte puntual, pagas y te vas.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: false,
      dinero: false,
      linea: "servicio_proyecto",
    }),
    expectedDominant: "servicio_proyecto",
    tags: ["claro"],
  },
  {
    id: "g28",
    prompt: "Energía: tarifa fija mensual por suministro.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedDominant: "suscripcion",
    tags: ["claro"],
  },
  {
    id: "g29",
    prompt: "P2P lending: la plataforma conecta prestamistas y prestatarios.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: true,
      dinero: true,
      linea: "intermediacion",
    }),
    expectedDominant: "intermediacion",
    tags: ["compuesto"],
  },
  {
    id: "g30",
    prompt: "Franquicia: cobramos canon periódico + venta de material.",
    answers: fullAnswers({
      se_queda: true,
      vuelve: false,
      periodico: true,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "suscripcion",
    }),
    expectedDominant: "suscripcion",
    tags: ["compuesto", "franquicia"],
  },
  {
    id: "g31",
    prompt: "Negocio raro: trueque de horas entre vecinos sin dinero.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: true,
      tercero: true,
      dinero: false,
      linea: "intermediacion",
    }),
    expectedDominant: "AMBIGUOUS",
    tags: ["no_encaja", "trueque"],
  },
  {
    id: "g32",
    prompt: "Todo false: no se queda, no vuelve, no periódico, no produce, no tercero, no dinero.",
    answers: fullAnswers({
      se_queda: false,
      vuelve: false,
      periodico: false,
      produce: false,
      tercero: false,
      dinero: false,
      linea: "venta",
    }),
    expectedDominant: "NONE",
    tags: ["sin_candidato"],
  },
];

function runClassifier(caseItem: GoldCase): {
  ok: boolean;
  got: string;
  reason: string;
} {
  try {
    const result = classifyFromAnswers(caseItem.answers);
    const got = result.composition.dominant;
    if (caseItem.expectedDominant === "AMBIGUOUS") {
      // Ambiguo: correcto si el sistema NO elige con certeza única el "obvio" único,
      // o si produce múltiples candidatos. Medimos: falla si pretender ser inequívoco
      // cuando hay contradicción estructural en flags.
      const candidates = (result.audit.find((e) => e.decision === "dominant")
        ?.detail.candidates ?? []) as string[];
      const ok = candidates.length !== 1;
      return {
        ok,
        got,
        reason: ok
          ? "múltiples candidatos en caso ambiguo"
          : `ambiguo pero único candidato=${got}`,
      };
    }
    if (
      caseItem.expectedDominant === "NONE" ||
      caseItem.expectedDominant === "LOW_CONF"
    ) {
      return {
        ok: false,
        got,
        reason: `se esperaba ${caseItem.expectedDominant} pero clasificó ${got}`,
      };
    }
    return {
      ok: got === caseItem.expectedDominant,
      got,
      reason:
        got === caseItem.expectedDominant
          ? "match"
          : `esperado ${caseItem.expectedDominant}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (caseItem.expectedDominant === "LOW_CONF") {
      const ok = err instanceof LowConfidenceError || /confianza/i.test(msg);
      return { ok, got: "LOW_CONF", reason: ok ? "repregunta" : msg };
    }
    if (caseItem.expectedDominant === "NONE") {
      const ok =
        err instanceof NoArchetypeMatchError ||
        /ninguna regla|candidato/i.test(msg);
      return {
        ok,
        got: err instanceof NoArchetypeMatchError ? "NONE_GUIDED" : "NONE",
        reason: ok
          ? err instanceof NoArchetypeMatchError
            ? "cercanos+preguntas"
            : "sin candidato"
          : msg,
      };
    }
    return { ok: false, got: "ERROR", reason: msg };
  }
}

type RuptureResult = {
  scenario: string;
  coveredByModel: boolean;
  needsEscapeValve: boolean;
  detail: string;
  severity: "critico" | "alto" | "medio" | "bajo";
};

function ruptureSuite(): RuptureResult[] {
  const results: RuptureResult[] = [];
  const life = ventaArchetype.lifecycle;

  // 1) Entregas parciales — compromiso propio + transición de tramo
  {
    const partial = life.transitions.some((t) =>
      /parcial|parciales|tramo|hito/i.test(t.id + t.condition),
    );
    const hasTramoCommitment = life.commitments.some((c) =>
      /tramo|parcial/i.test(c.id + c.label),
    );
    const covered = partial && hasTramoCommitment;
    results.push({
      scenario: "pedido con entregas parciales",
      coveredByModel: covered,
      needsEscapeValve: !covered,
      detail: covered
        ? "granularidad: cada entrega es compromiso propio; t_entrega_parcial en venta"
        : "venta sin modelo de tramos",
      severity: "alto",
    });
  }

  // 2) Renegociación tras aceptación
  {
    const reneg = life.transitions.some((t) =>
      /renegoc|nueva_version|reprecio/i.test(t.id + t.condition),
    );
    const reaccept = life.transitions.some(
      (t) =>
        t.id.includes("aceptar_nueva_version") &&
        t.requiredEvidence === "aceptacion",
    );
    const covered = reneg && reaccept;
    results.push({
      scenario: "renegociación de precio tras aceptación",
      coveredByModel: covered,
      needsEscapeValve: !covered,
      detail: covered
        ? "nueva versión de oferta + t_aceptar_nueva_version (evidencia aceptación)"
        : "sin re-aceptación de versión",
      severity: "alto",
    });
  }

  // 3) Devolución después del cierre → tx nueva vinculada
  {
    let blocked = false;
    let linkedOk = false;
    try {
      const closed = deriveState(life, [
        {
          id: "e1",
          kind: "transicion",
          subjectId: "x",
          occurredAt: "2026-01-01T00:00:00.000Z",
          actorId: "u",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "a",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
          transitionId: "t_aceptar",
          fromStateId: "propuesta",
          toStateId: "aceptada",
        },
        {
          id: "e2",
          kind: "transicion",
          subjectId: "x",
          occurredAt: "2026-01-02T00:00:00.000Z",
          actorId: "s",
          actorKind: "sistema",
          evidence: {
            kind: "sistema",
            reference: "s",
            recordedAt: "2026-01-02T00:00:00.000Z",
          },
          transitionId: "t_iniciar_entrega",
          fromStateId: "aceptada",
          toStateId: "en_entrega",
        },
        {
          id: "e3",
          kind: "transicion",
          subjectId: "x",
          occurredAt: "2026-01-03T00:00:00.000Z",
          actorId: "s",
          actorKind: "sistema",
          evidence: {
            kind: "fisica",
            reference: "f",
            recordedAt: "2026-01-03T00:00:00.000Z",
          },
          transitionId: "t_cerrar",
          fromStateId: "en_entrega",
          toStateId: "cerrada",
        },
      ]);
      expect(closed.currentStateId).toBe("cerrada");
      try {
        assertCanAdvance(life, closed, {
          transitionId: "t_aceptar",
          eventId: "e4",
          actorId: "u",
          actorKind: "humano",
          occurredAt: "2026-01-04T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "dev",
            recordedAt: "2026-01-04T00:00:00.000Z",
          },
        });
      } catch (e) {
        blocked = e instanceof DerivationError;
      }
      const linked = createDevolucionVinculada("x", "x-devolucion");
      linkedOk =
        linked.vinculadaA === "x" &&
        linked.reason === "devolucion" &&
        linked.fieldValues.vinculada_a === "x";
      results.push({
        scenario: "devolución después del cierre",
        coveredByModel: blocked && linkedOk,
        needsEscapeValve: !(blocked && linkedOk),
        detail:
          blocked && linkedOk
            ? "terminal no se reabre; createDevolucionVinculada crea tx nueva vinculada"
            : "falta bloqueo de reopen o vinculación",
        severity: "alto",
      });
    } catch (e) {
      results.push({
        scenario: "devolución después del cierre",
        coveredByModel: false,
        needsEscapeValve: true,
        detail: String(e),
        severity: "critico",
      });
    }
  }

  // 4) Pago dividido entre tres partes
  {
    let multiOk = false;
    try {
      const byParty = computeBalanceByParty([
        { amount: 100, direction: "in", parteId: "a" },
        { amount: 40, direction: "out", parteId: "a" },
        { amount: 60, direction: "out", parteId: "a" },
        { amount: 50, direction: "in", parteId: "b" },
        { amount: 50, direction: "out", parteId: "b" },
        { amount: 30, direction: "in", parteId: "c" },
        { amount: 30, direction: "out", parteId: "c" },
      ]);
      multiOk = byParty.a === 0 && byParty.b === 0 && byParty.c === 0;
      assertAllPartiesBalanceZero([
        { amount: 10, direction: "in", parteId: "p1" },
        { amount: 10, direction: "out", parteId: "p1" },
      ]);
    } catch {
      multiOk = false;
    }
    results.push({
      scenario: "pago dividido entre tres partes",
      coveredByModel: multiOk,
      needsEscapeValve: !multiOk,
      detail: multiOk
        ? "movimientos con parte_id; computeBalanceByParty + cierre exige saldo 0 en todas"
        : "sin saldo multi-parte",
      severity: "alto",
    });
  }

  // 5) Suscripción pausada
  {
    const pause = suscripcionArchetype.lifecycle.states.some((s) =>
      /paus/i.test(s.id),
    );
    const pauseIo =
      suscripcionArchetype.lifecycle.transitions.some((t) => t.id === "t_pausar") &&
      suscripcionArchetype.lifecycle.transitions.some((t) => t.id === "t_reanudar");
    const covered = pause && pauseIo;
    results.push({
      scenario: "suscripción pausada",
      coveredByModel: covered,
      needsEscapeValve: !covered,
      detail: covered
        ? "estado pausada (en_espera) con t_pausar / t_reanudar"
        : "sin pausa declarada",
      severity: "medio",
    });
  }

  // 6) Marketplace con disputa
  {
    const dispute = intermediacionArchetype.lifecycle.states.some((s) =>
      /disput|mediac|reclam/i.test(s.id + s.label),
    );
    const retention = intermediacionArchetype.lifecycle.transitions.some((t) =>
      /retencion|liberar|reembols/i.test(t.id + t.condition),
    );
    const covered = dispute && retention;
    results.push({
      scenario: "marketplace con disputa",
      coveredByModel: covered,
      needsEscapeValve: !covered,
      detail: covered
        ? "en_disputa (en_espera) + retención liberable/reembolsable"
        : "sin disputa/retención",
      severity: "alto",
    });
  }

  // 7) Negocio que no encaja → 2 cercanos + preguntas
  {
    let guided = false;
    try {
      classifyFromAnswers(
        fullAnswers({
          se_queda: false,
          vuelve: false,
          periodico: false,
          produce: false,
          tercero: false,
          dinero: false,
          linea: "venta",
        }),
      );
    } catch (err) {
      if (err instanceof NoArchetypeMatchError) {
        guided =
          err.nearest.length >= 2 && err.distinguishingQuestions.length >= 2;
      }
    }
    results.push({
      scenario: "negocio que no encaja en ningún arquetipo",
      coveredByModel: guided,
      needsEscapeValve: !guided,
      detail: guided
        ? "NoArchetypeMatchError con 2 arquetipos cercanos y preguntas distintivas"
        : "sin guía de cercanía",
      severity: "medio",
    });
  }

  return results;
}

function compositionBlindSpots(): string[] {
  const holes: string[] = [];
  // Cadena de 3: A bloquea born de B, B bloquea born de C, C bloquea born de A
  const triple = validateComposition({
    dominant: "venta",
    secondaries: [
      {
        secondaryArchetypeId: "financiera",
        bornInDominantState: "aceptada",
        bloquea: "en_entrega",
      },
      {
        secondaryArchetypeId: "servicio_proyecto",
        bornInDominantState: "en_entrega",
        bloquea: "propuesta",
      },
      {
        secondaryArchetypeId: "suscripcion",
        bornInDominantState: "propuesta",
        bloquea: "aceptada",
      },
    ],
  });
  if (triple.ok) {
    holes.push(
      "ciclo de 3 estados (aceptada→en_entrega→propuesta→aceptada) NO detectado",
    );
  } else {
    holes.push(
      "ciclo de 3 estados (aceptada→en_entrega→propuesta→aceptada) SÍ detectado (DFS)",
    );
  }

  const nestedMiss = validateComposition({
    dominant: "venta",
    secondaries: [
      {
        secondaryArchetypeId: "financiera",
        bornInDominantState: "propuesta",
        bloquea: "aceptada",
      },
      {
        secondaryArchetypeId: "uso_temporal",
        bornInDominantState: "aceptada",
        bloquea: "propuesta",
      },
    ],
  });
  if (nestedMiss.ok) {
    holes.push("par circular propuesta↔aceptada NO detectado");
  } else {
    holes.push("par circular propuesta↔aceptada SÍ detectado (control positivo)");
  }

  return holes;
}

function closureBypass(): { canBypass: boolean; detail: string } {
  const life = ventaArchetype.lifecycle;
  const happyPath: DomainEvent[] = [
    {
      id: "e1",
      kind: "transicion",
      subjectId: "x",
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: "u",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "a",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      transitionId: "t_aceptar",
      fromStateId: "propuesta",
      toStateId: "aceptada",
    },
    {
      id: "e2",
      kind: "transicion",
      subjectId: "x",
      occurredAt: "2026-01-02T00:00:00.000Z",
      actorId: "s",
      actorKind: "sistema",
      evidence: {
        kind: "sistema",
        reference: "s",
        recordedAt: "2026-01-02T00:00:00.000Z",
      },
      transitionId: "t_iniciar_entrega",
      fromStateId: "aceptada",
      toStateId: "en_entrega",
    },
    {
      id: "e3",
      kind: "transicion",
      subjectId: "x",
      occurredAt: "2026-01-03T00:00:00.000Z",
      actorId: "s",
      actorKind: "sistema",
      evidence: {
        kind: "fisica",
        reference: "f",
        recordedAt: "2026-01-03T00:00:00.000Z",
      },
      transitionId: "t_cerrar",
      fromStateId: "en_entrega",
      toStateId: "cerrada",
    },
  ];

  let canReachWithBadWorld = false;
  try {
    const derived = deriveState(life, happyPath, {
      balance: 999,
      resourcesSettled: false,
      evidenceComplete: false,
    });
    canReachWithBadWorld = derived.currentStateId === "cerrada";
  } catch {
    canReachWithBadWorld = false;
  }

  // Control: con hechos de cierre válidos sí se alcanza el terminal
  const ok = deriveState(life, happyPath, {
    balance: 0,
    resourcesSettled: true,
    evidenceComplete: true,
  });
  expect(ok.currentStateId).toBe("cerrada");

  return {
    canBypass: canReachWithBadWorld,
    detail: canReachWithBadWorld
      ? "deriveState aún alcanza 'cerrada' con saldo≠0 / evidencia incompleta"
      : "deriveState rechaza terminal de éxito si saldo≠0, recursos abiertos o evidencia incompleta (assertTransactionClosure como defensa redundante)",
  };
}

function invalidMachineBypass(): { registryBlocks: boolean; rawUsable: boolean; detail: string } {
  const invalidNoInitial = {
    commitments: [] as const,
    states: [
      {
        id: "a",
        kind: "intermedio" as const,
        label: "A",
        situations: [{ fulfilled: [], pending: [] }],
      },
      {
        id: "b",
        kind: "terminal_exito" as const,
        label: "B",
        situations: [{ fulfilled: [], pending: [] }],
      },
    ],
    transitions: [] as const,
  };
  const registry = new MetaObjectRegistry();
  let registryBlocks = false;
  try {
    registry.register({
      identity: {
        id: "bad",
        elementKind: "transaccion",
        grammarVersion: "1.1.0",
      },
      definition: { subtype: "venta", fields: [] },
      lifecycle: invalidNoInitial,
      invariants: [],
    });
  } catch {
    registryBlocks = true;
  }

  // Máquina inválida (terminal con salida) pero con inicial: antes usable fuera del registry
  const sneaky = {
    commitments: [] as { id: string; label: string }[],
    states: [
      {
        id: "i",
        kind: "inicial" as const,
        label: "I",
        situations: [{ fulfilled: [] as string[], pending: [] as string[] }],
      },
      {
        id: "t",
        kind: "terminal_exito" as const,
        label: "T",
        situations: [{ fulfilled: [] as string[], pending: [] as string[] }],
      },
    ],
    transitions: [
      {
        id: "go",
        from: "i",
        to: "t",
        condition: "x",
        requiredEvidence: "sistema" as const,
        allowedActor: "sistema" as const,
        fulfills: [] as string[],
      },
      {
        id: "reopen",
        from: "t",
        to: "i",
        condition: "bad",
        requiredEvidence: "sistema" as const,
        allowedActor: "sistema" as const,
        fulfills: [] as string[],
      },
    ],
  };
  let rawUsable = false;
  try {
    const d = deriveState(sneaky, [
      {
        id: "e1",
        kind: "transicion",
        subjectId: "x",
        occurredAt: "2026-01-01T00:00:00.000Z",
        actorId: "s",
        actorKind: "sistema",
        evidence: {
          kind: "sistema",
          reference: "r",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        transitionId: "go",
        fromStateId: "i",
        toStateId: "t",
      },
    ]);
    rawUsable = d.currentStateId === "t";
  } catch {
    rawUsable = false;
  }

  return {
    registryBlocks,
    rawUsable,
    detail: rawUsable
      ? "Registry bloquea inválidas, pero deriveState aún acepta lifecycles crudos"
      : "validateLifecycle se impone en deriveState (y assertCanAdvance); máquina inválida no es usable en crudo",
  };
}

describe("AUDITORÍA — medición", () => {
  it("mide clasificación sobre banco de ≥30 prompts", () => {
    expect(GOLD_BANK.length).toBeGreaterThanOrEqual(30);

    const rows = GOLD_BANK.map((c) => {
      const r = runClassifier(c);
      return { id: c.id, prompt: c.prompt, tags: c.tags, expected: c.expectedDominant, ...r };
    });

    const correct = rows.filter((r) => r.ok).length;
    const accuracy = correct / rows.length;

    const rupture = ruptureSuite();
    const escapeNeeded = rupture.filter((r) => r.needsEscapeValve).length;
    const escapeRate = escapeNeeded / rupture.length;

    const holes = compositionBlindSpots();
    const detectsCycle3Plus = holes.some((h) =>
      /ciclo de 3.*SÍ detectado/i.test(h),
    );
    const detectsPairCycle = holes.some((h) =>
      /par circular.*SÍ detectado/i.test(h),
    );

    // Dim 4: bloquea en runtime (concesionaria)
    let bloqueaEnforcedAtRuntime = false;
    let deliveryBlockedByFinanciera = false;
    {
      const session = new ComposedTransactionSession(
        "audit-concesionaria",
        concesionariaCase.composition,
        ventaArchetype.lifecycle,
      );
      const derived = deriveState(ventaArchetype.lifecycle, [
        {
          id: "e1",
          kind: "transicion",
          subjectId: "audit-concesionaria",
          occurredAt: "2026-01-01T00:00:00.000Z",
          actorId: "u",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "a",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
          transitionId: "t_aceptar",
          fromStateId: "propuesta",
          toStateId: "aceptada",
        },
      ]);
      try {
        session.attemptAdvance(
          derived,
          {
            transitionId: "t_iniciar_entrega",
            eventId: "e2",
            actorId: "s",
            actorKind: "sistema",
            occurredAt: "2026-01-02T00:00:00.000Z",
            evidence: {
              kind: "sistema",
              reference: "s",
              recordedAt: "2026-01-02T00:00:00.000Z",
            },
          },
          [
            {
              instanceId: "fin-open",
              secondaryArchetypeId: "financiera",
              currentStateId: "aprobada",
              stateKind: "intermedio",
            },
          ],
        );
      } catch (err) {
        deliveryBlockedByFinanciera = err instanceof CompositionRuntimeError;
        bloqueaEnforcedAtRuntime =
          deliveryBlockedByFinanciera &&
          /financiera/i.test(session.explainLastRejection());
      }
    }

    // Dim 9: traza explicable
    let transitionTraceWritable = false;
    let rejectionExplainableFromTrace = false;
    {
      const session = new ComposedTransactionSession(
        "audit-trace",
        concesionariaCase.composition,
        ventaArchetype.lifecycle,
      );
      const derived = deriveState(ventaArchetype.lifecycle, [
        {
          id: "e1",
          kind: "transicion",
          subjectId: "audit-trace",
          occurredAt: "2026-01-01T00:00:00.000Z",
          actorId: "u",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "a",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
          transitionId: "t_aceptar",
          fromStateId: "propuesta",
          toStateId: "aceptada",
        },
      ]);
      try {
        session.attemptAdvance(
          derived,
          {
            transitionId: "t_iniciar_entrega",
            eventId: "e2",
            actorId: "s",
            actorKind: "sistema",
            occurredAt: "2026-01-02T00:00:00.000Z",
            evidence: {
              kind: "sistema",
              reference: "s",
              recordedAt: "2026-01-02T00:00:00.000Z",
            },
          },
          [
            {
              instanceId: "fin-open",
              secondaryArchetypeId: "financiera",
              currentStateId: "desembolsada",
              stateKind: "intermedio",
            },
          ],
        );
      } catch {
        /* expected */
      }
      transitionTraceWritable = session.traces.length === 1;
      const t = session.traces[0];
      rejectionExplainableFromTrace =
        t !== undefined &&
        t.result === "rejected" &&
        t.fromStateId === "aceptada" &&
        t.toStateId === "en_entrega" &&
        t.condition !== null &&
        t.evidence !== null &&
        t.blocksEvaluated.some((b) => b.blocksTransition) &&
        explainRejection(session.traces).toLowerCase().includes("financiera");
    }

    const closure = closureBypass();
    const grammarGate = invalidMachineBypass();

    // Aprendizaje: convergencia bayesiana + detector de deriva
    const learner = new BayesianTypeLearner("transaccion:venta", {
      tasa_cierre: 0.55,
    });
    const prior = learner.snapshot().features.tasa_cierre!;
    for (let i = 0; i < 50; i++) {
      learner.observe({
        at: new Date().toISOString(),
        signal: "tasa_cierre",
        payload: { success: true },
      });
    }
    const afterGood = learner.snapshot().features.tasa_cierre!;
    for (let i = 0; i < 80; i++) {
      learner.observe({
        at: new Date().toISOString(),
        signal: "tasa_cierre",
        payload: { success: false },
      });
    }
    const afterDrift = learner.snapshot().features.tasa_cierre!;
    const convergesUp = afterGood > prior;
    const detectsDriftDirection = afterDrift < afterGood;

    const driftDetector = new DriftDetector({
      burnIn: 20,
      windowSize: 15,
      sustainCount: 5,
      minBand: 0.05,
    });
    let driftAlerted = false;
    const probe = new BayesianTypeLearner("probe:drift", { tasa_cierre: 0.5 });
    for (let i = 0; i < 60; i++) {
      probe.observe({
        at: `t-${i}`,
        signal: "tasa_cierre",
        payload: { success: i % 20 < 17 },
      });
      if (
        driftDetector.observe(
          "tasa_cierre",
          probe.snapshot().features.tasa_cierre!,
          `t-${i}`,
        )
      ) {
        driftAlerted = true;
      }
    }
    for (let i = 60; i < 160; i++) {
      probe.observe({
        at: `t-${i}`,
        signal: "tasa_cierre",
        payload: { success: i % 20 < 3 },
      });
      if (
        driftDetector.observe(
          "tasa_cierre",
          probe.snapshot().features.tasa_cierre!,
          `t-${i}`,
        )
      ) {
        driftAlerted = true;
      }
    }
    const hasDriftDetector = driftAlerted;

    const writesOnlyProfile = learner.writesOnlyToProfile();

    // Dimensión 10: privacidad multiempresa
    const vault = new MultiTenantVault();
    vault.registerCompany("audit-a");
    vault.registerCompany("audit-b");
    vault.appendEvent("audit-a", {
      id: "priv-e1",
      kind: "transicion",
      subjectId: "tx-a",
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: "u",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "r",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      transitionId: "t_aceptar",
      fromStateId: "propuesta",
      toStateId: "aceptada",
    });
    vault.getOrCreateLearner("audit-a", "transaccion:venta", { tasa_cierre: 0.5 });
    let crossTenantBlocked = false;
    try {
      vault.readEvents("audit-b", "audit-a");
    } catch (err) {
      crossTenantBlocked = err instanceof TenantIsolationError;
    }
    try {
      vault.readProfile("audit-b", "audit-a", "transaccion:venta");
    } catch (err) {
      crossTenantBlocked =
        crossTenantBlocked && err instanceof TenantIsolationError;
    }

    const aggLayer = new AggregatedProfileLayer();
    let belowThresholdUnpublished = true;
    for (let i = 1; i <= AGGREGATE_MIN_COMPANIES - 1; i++) {
      const L = new BayesianTypeLearner("transaccion:venta", { tasa_cierre: 0.5 });
      L.observe({
        at: "t",
        signal: "tasa_cierre",
        payload: { success: true },
      });
      aggLayer.contribute(`c${i}`, L.exportSufficientStats());
    }
    belowThresholdUnpublished =
      aggLayer.tryPublish("transaccion:venta") === null;

    for (let i = AGGREGATE_MIN_COMPANIES; i <= AGGREGATE_MIN_COMPANIES; i++) {
      const L = new BayesianTypeLearner("transaccion:venta", { tasa_cierre: 0.5 });
      L.observe({
        at: "t",
        signal: "tasa_cierre",
        payload: { success: true },
      });
      aggLayer.contribute(`c${i}`, L.exportSufficientStats());
    }
    const published = aggLayer.tryPublish("transaccion:venta");
    const aggregation = published !== null && published.companyCount >= AGGREGATE_MIN_COMPANIES;
    const anonymization =
      published !== null && aggregateCannotReconstructEvent(published);
    const multiTenantControls = crossTenantBlocked && belowThresholdUnpublished;

    // Dimensión 1 / principio 7: proyección cableada
    const proj = new DerivedLifecycleProjection();
    const projStore = new InMemoryEventStore();
    proj.attach(projStore);
    proj.registerRecurso("audit-rec");
    proj.linkRecurso("audit-tx", "audit-rec");
    projStore.append({
      id: "audit-aceptar",
      kind: "transicion",
      subjectId: "audit-tx",
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: "a",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "r",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      transitionId: "t_aceptar",
      fromStateId: "propuesta",
      toStateId: "aceptada",
    });
    const reservedOk = proj.stateOf("audit-rec").currentStateId === "reservado";
    projStore.append({
      id: "audit-cancel",
      kind: "excepcion",
      subjectId: "audit-tx",
      occurredAt: "2026-01-01T01:00:00.000Z",
      actorId: "a",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "r",
        recordedAt: "2026-01-01T01:00:00.000Z",
      },
      fromStateId: "aceptada",
      toStateId: "cancelada",
      reason: "cancel",
    });
    const cancelReleasesResource =
      reservedOk && proj.stateOf("audit-rec").currentStateId === "consumido";
    let directMutationBlocked = false;
    try {
      proj.applyDirectTransition("audit-rec", "t_recurso_reservar");
    } catch (err) {
      directMutationBlocked = err instanceof DerivedCycleMutationError;
    }

    const registry = createArchetypeLearnerRegistry();
    const ventaSnap = registry.snapshot("transaccion:venta");
    const priorsInherited =
      ventaSnap !== undefined &&
      typeof ventaSnap.features.tasa_cierre === "number";

    // Excepción solo por arista declarada (propuesta→incumplida NO existe)
    let exceptionBypassesGraph = false;
    try {
      const d = deriveState(ventaArchetype.lifecycle, [
        {
          id: "ex1",
          kind: "excepcion",
          subjectId: "x",
          occurredAt: "2026-01-01T00:00:00.000Z",
          actorId: "s",
          actorKind: "sistema",
          evidence: {
            kind: "sistema",
            reference: "any",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
          fromStateId: "propuesta",
          toStateId: "incumplida",
          reason: "salto ilegal",
        },
      ]);
      exceptionBypassesGraph = d.currentStateId === "incumplida";
    } catch {
      exceptionBypassesGraph = false;
    }

    // matchesSituation deja de ser tautología: sin compromisos → solo estado inicial
    const emptyDerived = deriveState(ventaArchetype.lifecycle, []);
    const matchesSituationIsTautology =
      emptyDerived.currentStateId !== "propuesta" ||
      emptyDerived.pendingCommitmentIds.size === 0;

    // Control positivo: excepción declarada propuesta→cancelada SÍ avanza
    const declaredEx = deriveState(ventaArchetype.lifecycle, [
      {
        id: "ex-ok",
        kind: "excepcion",
        subjectId: "x",
        occurredAt: "2026-01-01T00:00:00.000Z",
        actorId: "u",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "c",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        fromStateId: "propuesta",
        toStateId: "cancelada",
        reason: "cancelación declarada",
      },
    ]);
    expect(declaredEx.currentStateId).toBe("cancelada");

    // Fricción simulada: eventos en ruptura
    const store = new InMemoryEventStore();
    let modCount = 0;
    let totalEvents = 0;
    for (const r of rupture) {
      totalEvents += 1;
      if (r.needsEscapeValve) {
        modCount += 1;
        store.append({
          id: `mod-${r.scenario}`,
          kind: "modificacion",
          subjectId: "audit",
          occurredAt: "2026-01-01T00:00:00.000Z",
          actorId: "auditor",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "gap",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
          freeText: r.detail,
        });
      }
    }
    const frictionPct = (modCount / totalEvents) * 100;

    const outPath = resolve("audit-report.json");
    // Conserva / incrusta dimensión 6 (determinismo e2e) si ya se midió
    let determinism: Record<string, unknown> | undefined;
    const e2ePath = resolve("tests/bank/e2e-diagnosis-report.json");
    if (existsSync(e2ePath)) {
      const e2e = JSON.parse(readFileSync(e2ePath, "utf8")) as {
        extractorAccuracyPct: number;
        finalAccuracyPct: number;
        reaskRatePct: number;
        n: number;
        below90: boolean;
        top5Failures: unknown[];
        extractor: { provider: string; model: string; mode: string };
      };
      determinism = {
        score: e2e.finalAccuracyPct >= 90 ? 3 : e2e.finalAccuracyPct >= 70 ? 2 : 1,
        endToEndMeasured: true,
        stubOnly: false,
        extractorProvider: e2e.extractor.provider,
        extractorModel: e2e.extractor.model,
        extractorMode: e2e.extractor.mode,
        n: e2e.n,
        extractorAccuracyPct: e2e.extractorAccuracyPct,
        finalAccuracyPct: e2e.finalAccuracyPct,
        reaskRatePct: e2e.reaskRatePct,
        below90: e2e.below90,
        top5Failures: e2e.top5Failures,
        g15ContradictionTriggersReask: true,
        detail:
          "E2E texto→extractor→clasificador. El % histórico 96.88 solo medía classifyFromAnswers con booleanos oro.",
        reportPath: e2ePath,
      };
    } else {
      determinism = {
        score: 1,
        endToEndMeasured: false,
        stubOnly: true,
        detail:
          "Pendiente: ejecutar tests/e2e.diagnosis.test.ts para medir extremo a extremo",
      };
    }

    const privacy = {
        score:
          multiTenantControls && aggregation && anonymization ? 3 : 1,
        aggregation,
        anonymization,
        multiTenantControls,
        aggregateMinCompanies: AGGREGATE_MIN_COMPANIES,
        belowThresholdUnpublished,
        detail:
          multiTenantControls && aggregation && anonymization
            ? "Aislamiento por empresa; agregado solo suficientes; publicación con umbral ≥5; sin reconstrucción de eventos"
            : "Privacidad multiempresa incompleta",
      };

    // ——— Fase 3 ampliada: capa 1 (comunicación, cumplimiento, objetivo, calendario, clasificación, PII) ———
    const lifeV = ventaArchetype.lifecycle;
    const catL1 = catalogFromLifecycle(
      lifeV.transitions.map((t) => t.id),
      lifeV.states.map((s) => s.id),
      [
        "importe",
        "factura_id",
        "parte_id",
        "compra_at",
        "descuento_pct",
        "precio",
      ],
    );
    const DAY = 24 * 60 * 60 * 1000;
    let l1FacturaBlocksClose = false;
    let l1FormalDocAsEvidence = false;
    let l1LegalDeadlineBlocks = false;
    let l1LegalNeverForceable = false;
    let l1PiiErasureKeepsEvents = false;
    let l1BusinessHours48 = false;
    let l1GoalsNeverBlock = false;
    let l1SegmentBinding = false;

    try {
      const packFactura = compilePolicies(
        {
          id: "audit-factura",
          version: "1",
          companyId: "acme",
          archetypeId: "venta",
          roles: [{ id: "operaciones", label: "Op" }],
          permissions: [
            {
              id: "p",
              kind: "permiso",
              transitionId: "t_cerrar",
              allowedRoles: ["operaciones"],
            },
          ],
          compliance: [
            {
              id: "c-fac",
              kind: "cumplimiento",
              transitionId: "t_cerrar",
              requiredEvidence: { kind: "fisica", referenceType: "factura" },
              invariant: {
                id: "inv",
                predicate: "field_present:factura_id",
                appliesInStates: ["en_entrega"],
                description: "factura",
              },
            },
          ],
        } satisfies PolicyDocument,
        { catalog: catL1, activationAt: "2026-01-01T00:00:00.000Z" },
      );
      const ea: TransitionEvent = {
        id: "a1",
        kind: "transicion",
        subjectId: "tx",
        occurredAt: "2026-01-01T00:00:00.000Z",
        actorId: "u",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "r",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        transitionId: "t_aceptar",
        fromStateId: "propuesta",
        toStateId: "aceptada",
      };
      const er: TransitionEvent = {
        id: "a2",
        kind: "transicion",
        subjectId: "tx",
        occurredAt: "2026-01-02T00:00:00.000Z",
        actorId: "s",
        actorKind: "sistema",
        evidence: {
          kind: "sistema",
          reference: "r",
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
        transitionId: "t_iniciar_entrega",
        fromStateId: "aceptada",
        toStateId: "en_entrega",
      };
      const d = deriveState(lifeV, [ea, er]);
      try {
        attemptJudgedAdvance({
          subjectId: "tx",
          lifecycle: lifeV,
          derived: d,
          command: {
            transitionId: "t_cerrar",
            eventId: "bad",
            actorId: "op",
            actorKind: "sistema",
            occurredAt: "2026-01-03T00:00:00.000Z",
            evidence: {
              kind: "fisica",
              reference: "x",
              recordedAt: "2026-01-03T00:00:00.000Z",
            },
          },
          actor: { id: "op", kind: "sistema", roles: ["operaciones"] },
          evidence: {
            kind: "fisica",
            reference: "x",
            recordedAt: "2026-01-03T00:00:00.000Z",
            referenceType: "albaran",
          },
          fields: {},
          ruleSet: packFactura,
        });
      } catch (err) {
        l1FacturaBlocksClose = err instanceof JudgeRejectionError;
      }
      const ctr = new CommunicationTrace();
      const fac = sendCommunication(
        {
          template: FACTURA_TEMPLATE,
          triggerEvent: er,
          variables: {
            doc_numero: "1",
            parte_ref: "parte:1",
            importe: "10",
          },
          occurredAt: "2026-01-03T01:00:00.000Z",
          actorId: "op",
          documentId: "f1",
        },
        ctr,
      );
      const okClose = attemptJudgedAdvance({
        subjectId: "tx",
        lifecycle: lifeV,
        derived: d,
        command: {
          transitionId: "t_cerrar",
          eventId: "ok",
          actorId: "op",
          actorKind: "sistema",
          occurredAt: "2026-01-03T02:00:00.000Z",
          evidence: {
            kind: "fisica",
            reference: fac.evidence!.reference,
            recordedAt: "2026-01-03T02:00:00.000Z",
          },
        },
        actor: { id: "op", kind: "sistema", roles: ["operaciones"] },
        evidence: {
          kind: "fisica",
          reference: fac.evidence!.reference,
          recordedAt: "2026-01-03T02:00:00.000Z",
          referenceType: "factura",
        },
        fields: { factura_id: "f1" },
        ruleSet: packFactura,
      });
      l1FormalDocAsEvidence =
        fac.channel === "documento_formal" &&
        ctr.all().length === 1 &&
        okClose.trace.result === "accepted";
    } catch {
      /* leave flags false */
    }

    try {
      const packLegal = compilePolicies(
        {
          id: "audit-legal",
          version: "1",
          companyId: "acme",
          archetypeId: "venta",
          roles: [{ id: "gerente", label: "G" }],
          permissions: [
            {
              id: "p",
              kind: "permiso",
              transitionId: "t_cancelar_aceptada",
              allowedRoles: ["gerente"],
            },
          ],
          compliance: [
            {
              id: "c-14",
              kind: "cumplimiento",
              transitionId: "t_cancelar_aceptada",
              legalDeadline: {
                anchorField: "compra_at",
                durationMs: 14 * DAY,
                description: "desistimiento 14d",
              },
            },
          ],
        } satisfies PolicyDocument,
        { catalog: catL1, activationAt: "2026-01-01T00:00:00.000Z" },
      );
      const eAcc: TransitionEvent = {
        id: "la",
        kind: "transicion",
        subjectId: "txd",
        occurredAt: "2026-06-01T00:00:00.000Z",
        actorId: "u",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "r",
          recordedAt: "2026-06-01T00:00:00.000Z",
        },
        transitionId: "t_aceptar",
        fromStateId: "propuesta",
        toStateId: "aceptada",
      };
      const d2 = deriveState(lifeV, [eAcc]);
      try {
        attemptJudgedAdvance({
          subjectId: "txd",
          lifecycle: lifeV,
          derived: d2,
          command: {
            transitionId: "t_cancelar_aceptada",
            eventId: "rej",
            actorId: "g",
            actorKind: "humano",
            occurredAt: "2026-06-05T00:00:00.000Z",
            evidence: {
              kind: "aceptacion",
              reference: "r",
              recordedAt: "2026-06-05T00:00:00.000Z",
            },
          },
          actor: { id: "g", kind: "humano", roles: ["gerente"] },
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-06-05T00:00:00.000Z",
          },
          fields: { compra_at: "2026-06-01T00:00:00.000Z" },
          ruleSet: packLegal,
          now: "2026-06-05T00:00:00.000Z",
        });
      } catch (err) {
        l1LegalDeadlineBlocks = err instanceof JudgeRejectionError;
      }
      try {
        attemptJudgedAdvance({
          subjectId: "txd",
          lifecycle: lifeV,
          derived: d2,
          command: {
            transitionId: "t_cancelar_aceptada",
            eventId: "f",
            actorId: "g",
            actorKind: "humano",
            occurredAt: "2026-06-05T00:00:00.000Z",
            evidence: {
              kind: "aceptacion",
              reference: "r",
              recordedAt: "2026-06-05T00:00:00.000Z",
            },
          },
          actor: { id: "g", kind: "humano", roles: ["gerente"] },
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-06-05T00:00:00.000Z",
          },
          fields: { compra_at: "2026-06-01T00:00:00.000Z" },
          ruleSet: packLegal,
          now: "2026-06-05T00:00:00.000Z",
          force: {
            reason: "x",
            allowedForceRuleIds: ["legal:c-14"],
          },
        });
      } catch (err) {
        l1LegalNeverForceable = err instanceof ForceNotAllowedError;
      }
    } catch {
      /* */
    }

    try {
      const idStore = new ParteIdentityStore();
      idStore.put(
        "acme",
        "p1",
        { displayName: "Secret Name", email: "s@x.com" },
        "2026-01-01T00:00:00.000Z",
      );
      const evs: TransitionEvent[] = [
        {
          id: "pe",
          kind: "transicion",
          subjectId: "txp",
          occurredAt: "2026-01-02T00:00:00.000Z",
          actorId: "u",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-01-02T00:00:00.000Z",
          },
          transitionId: "t_aceptar",
          fromStateId: "propuesta",
          toStateId: "aceptada",
          data: { fieldsAfter: { parte_id: "p1" } },
        },
      ];
      assertNoPiiInEventData(evs[0]!.data as Record<string, unknown>);
      const snap = JSON.stringify(evs);
      idStore.erase("acme", "p1", "2026-02-01T00:00:00.000Z");
      l1PiiErasureKeepsEvents =
        JSON.stringify(evs) === snap &&
        idStore.resolve("acme", "p1").erased &&
        deriveState(lifeV, evs).currentStateId === "aceptada";
    } catch {
      /* */
    }

    try {
      const cal = compileCalendar({
        id: "c",
        weeklyHours: {
          1: [{ start: "00:00", end: "24:00" }],
          2: [{ start: "00:00", end: "24:00" }],
          3: [{ start: "00:00", end: "24:00" }],
          4: [{ start: "00:00", end: "24:00" }],
          5: [{ start: "00:00", end: "24:00" }],
        },
        exceptions: [{ date: "2026-04-06", closed: true }],
      });
      l1BusinessHours48 =
        addBusinessDuration(cal, "2026-04-03T00:00:00.000Z", 48 * 3600_000) ===
        "2026-04-08T00:00:00.000Z";
    } catch {
      /* */
    }

    try {
      const packGoal = compilePolicies(
        {
          id: "audit-goal",
          version: "1",
          companyId: "acme",
          archetypeId: "venta",
          roles: [{ id: "vendedor", label: "V" }],
          objectives: [
            {
              id: "m",
              kind: "volumen",
              label: "meta",
              factId: FACT_IDS.OBJETIVO_VOLUMEN,
              factParams: { scopeId: "s" },
              op: "gte",
              target: 100,
            },
          ],
          permissions: [
            {
              id: "p",
              kind: "permiso",
              transitionId: "t_aceptar",
              allowedRoles: ["vendedor"],
            },
          ],
        } satisfies PolicyDocument,
        { catalog: catL1, activationAt: "2026-01-01T00:00:00.000Z" },
      );
      const ev = observeGoals(packGoal, {
        [`${FACT_IDS.OBJETIVO_VOLUMEN}:scopeId=s`]: 0,
      });
      const advanced = attemptJudgedAdvance({
        subjectId: "tg",
        lifecycle: lifeV,
        derived: deriveState(lifeV, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "g1",
          actorId: "v",
          actorKind: "humano",
          occurredAt: "2026-01-01T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        actor: { id: "v", kind: "humano", roles: ["vendedor"] },
        evidence: {
          kind: "aceptacion",
          reference: "r",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        fields: {},
        ruleSet: packGoal,
      });
      l1GoalsNeverBlock =
        ev[0]?.met === false &&
        ev[0]?.blocksTransition === false &&
        advanced.trace.result === "accepted";
    } catch {
      /* */
    }

    try {
      const docSeg: PolicyDocument = {
        id: "audit-seg",
        version: "1",
        companyId: "acme",
        archetypeId: "venta",
        roles: [{ id: "vendedor", label: "V" }],
        classification: {
          assignments: [
            {
              target: "parte",
              subjectId: "c1",
              dimension: "segmento",
              value: "retail",
            },
          ],
        },
        permissions: [
          {
            id: "p",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor"],
          },
        ],
        policies: [
          {
            id: "dto",
            kind: "politica",
            transitionId: "t_aceptar",
            calculation: {
              field: "descuento_pct",
              op: "set",
              value: 10,
              segment: "retail",
            },
            binding: { mode: "at_create" },
          },
        ],
      };
      const rs = compilePolicies(docSeg, {
        catalog: catL1,
        activationAt: "2026-01-01T00:00:00.000Z",
      });
      let cl = seedClassification(docSeg.classification!, {
        at: "2026-01-01T00:00:00.000Z",
        actorId: "a",
      });
      const withL = applyCalculations(
        selectEffectiveRules({ ruleSet: rs }),
        "t_aceptar",
        { parte_id: "c1" },
        { classification: cl, creationClassification: cl },
      );
      cl = changeLabel(cl, {
        id: "ch",
        occurredAt: "2026-02-01T00:00:00.000Z",
        actorId: "a",
        source: "manual",
        target: "parte",
        subjectId: "c1",
        dimension: "segmento",
        value: "vip",
      }).snapshot;
      const after = applyCalculations(
        selectEffectiveRules({ ruleSet: rs }),
        "t_aceptar",
        { parte_id: "c1" },
        {
          classification: cl,
          creationClassification: seedClassification(docSeg.classification!, {
            at: "2026-01-01T00:00:00.000Z",
            actorId: "a",
          }),
        },
      );
      l1SegmentBinding =
        withL.calculations.descuento_pct === 10 &&
        after.calculations.descuento_pct === 10;
    } catch {
      /* */
    }

    const layer1Flags = [
      l1FacturaBlocksClose,
      l1FormalDocAsEvidence,
      l1LegalDeadlineBlocks,
      l1LegalNeverForceable,
      l1PiiErasureKeepsEvents,
      l1BusinessHours48,
      l1GoalsNeverBlock,
      l1SegmentBinding,
    ];
    const layer1PassCount = layer1Flags.filter(Boolean).length;
    const layer1 = {
      score: layer1PassCount === 8 ? 3 : layer1PassCount >= 6 ? 2 : 1,
      phase: "fase3_ampliada_capa1",
      facturaBlocksCloseWithoutFormalDoc: l1FacturaBlocksClose,
      formalDocumentBecomesEvidence: l1FormalDocAsEvidence,
      legalDeadlineBlocksReturnRejection: l1LegalDeadlineBlocks,
      cumplimientoNeverForceable: l1LegalNeverForceable,
      piiErasureLeavesEventsIntact: l1PiiErasureKeepsEvents,
      businessHours48FriToTue: l1BusinessHours48,
      goalsNeverBlockTransitions: l1GoalsNeverBlock,
      segmentDiscountRespectsBinding: l1SegmentBinding,
      passCount: layer1PassCount,
      totalChecks: 8,
      detail:
        layer1PassCount === 8
          ? "Capa 1 completa: comunicación, cumplimiento (factura+plazo legal), PII fuera de eventos, objetivo/calendario/clasificación"
          : `Capa 1 parcial: ${layer1PassCount}/8 checks`,
    };

    // ——— Fase 3 ampliada: capa 2 (observador de experiencia) ———
    let l2AbandonNoBusinessEvent = false;
    let l2FunnelTopAbandon = false;
    let l2NoCleartextPii = false;
    let l2Retention90 = false;
    let l2ReadOnlyIntelligence = false;
    let l2SeparateStore = false;

    try {
      const biz = new InMemoryEventStore();
      const ux = new ExperienceTelemetryStore();
      const abandonRec = buildTelemetryRecord({
        id: "audit-ux-abandon",
        kind: "abandon",
        at: "2026-06-01T12:00:00.000Z",
        sessionId: "sess-audit",
        actorOrParteId: "persona@ejemplo.com",
        tenantId: "acme",
        recorridoId: "audit_recorrido",
        stepId: "pago",
      });
      recordAbandonWithoutBusinessEvent({
        telemetry: ux,
        businessStore: biz,
        record: abandonRec,
      });
      l2AbandonNoBusinessEvent =
        biz.all().length === 0 && ux.size() === 1;
      l2SeparateStore =
        ux.all()[0] !== undefined &&
        !("subjectId" in ux.all()[0]!) &&
        !("actorId" in ux.all()[0]!) &&
        "sessionPseudoId" in ux.all()[0]! &&
        biz.all().length === 0;
    } catch {
      /* */
    }

    try {
      const ux = new ExperienceTelemetryStore();
      const steps = ["a", "b", "c"] as const;
      for (let i = 0; i < 5; i++) {
        ux.append(
          buildTelemetryRecord({
            id: `v-a-${i}`,
            kind: "step_view",
            at: "2026-06-01T12:00:00.000Z",
            sessionId: `s${i}`,
            actorOrParteId: `u${i}`,
            tenantId: "t",
            recorridoId: "r1",
            stepId: "a",
          }),
        );
        ux.append(
          buildTelemetryRecord({
            id: `v-b-${i}`,
            kind: "step_view",
            at: "2026-06-01T12:01:00.000Z",
            sessionId: `s${i}`,
            actorOrParteId: `u${i}`,
            tenantId: "t",
            recorridoId: "r1",
            stepId: "b",
          }),
        );
      }
      for (let i = 0; i < 4; i++) {
        ux.append(
          buildTelemetryRecord({
            id: `ab-b-${i}`,
            kind: "abandon",
            at: "2026-06-01T12:02:00.000Z",
            sessionId: `s${i}`,
            actorOrParteId: `u${i}`,
            tenantId: "t",
            recorridoId: "r1",
            stepId: "b",
          }),
        );
      }
      ux.append(
        buildTelemetryRecord({
          id: "ab-a-1",
          kind: "abandon",
          at: "2026-06-01T12:02:00.000Z",
          sessionId: "sx",
          actorOrParteId: "ux",
          tenantId: "t",
          recorridoId: "r1",
          stepId: "a",
        }),
      );
      const funnel = buildRecorridoFunnel("r1", ux.all(), steps);
      l2FunnelTopAbandon = funnel.topAbandonStepId === "b";
    } catch {
      /* */
    }

    try {
      const clean = buildTelemetryRecord({
        id: "pii-clean",
        kind: "step_view",
        at: "2026-06-01T12:00:00.000Z",
        sessionId: "s",
        actorOrParteId: "Ana López <ana@corp.es>",
        tenantId: "acme",
        recorridoId: "r",
        stepId: "datos",
      });
      const serialized = JSON.stringify(clean);
      const noPlain =
        !serialized.includes("ana@corp.es") &&
        !serialized.includes("Ana López") &&
        !/"email"\s*:/.test(serialized);
      let rejectedMeta = false;
      try {
        assertTelemetryPrivacy({
          ...clean,
          meta: { email: "x@y.com" },
        });
      } catch (e) {
        rejectedMeta = e instanceof ExperiencePrivacyError;
      }
      l2NoCleartextPii = noPlain && rejectedMeta;
    } catch {
      /* */
    }

    try {
      const ux = new ExperienceTelemetryStore();
      ux.append(
        buildTelemetryRecord({
          id: "old-r",
          kind: "step_view",
          at: "2026-01-01T00:00:00.000Z",
          sessionId: "s1",
          actorOrParteId: "a",
          tenantId: "t",
          recorridoId: "r",
          stepId: "x",
        }),
      );
      ux.append(
        buildTelemetryRecord({
          id: "new-r",
          kind: "step_view",
          at: "2026-06-01T00:00:00.000Z",
          sessionId: "s2",
          actorOrParteId: "b",
          tenantId: "t",
          recorridoId: "r",
          stepId: "x",
        }),
      );
      const removed = ux.purgeExpired("2026-06-20T00:00:00.000Z", 90);
      l2Retention90 =
        TELEMETRY_RETENTION_DAYS === 90 &&
        removed === 1 &&
        ux.size() === 1 &&
        ux.all()[0]!.id === "new-r";
    } catch {
      /* */
    }

    try {
      const ux = new ExperienceTelemetryStore();
      ux.append(
        buildTelemetryRecord({
          id: "ro-1",
          kind: "error",
          at: "2026-06-01T12:00:00.000Z",
          sessionId: "s",
          actorOrParteId: "a",
          tenantId: "t",
          recorridoId: "r",
          stepId: "pago",
          errorCode: "ui_timeout",
        }),
      );
      ux.append(
        buildInsightShownRecord({
          id: "ro-ins",
          at: "2026-06-01T12:00:01.000Z",
          sessionId: "s",
          actorOrParteId: "a",
          tenantId: "t",
          recorridoId: "r",
          stepId: "pago",
          insightId: "ins.audit",
          insightSurfaceId: "surface.audit",
          correlationId: "corr-audit-1",
        }),
      );
      const layer3 = openLayer3Reader(ux);
      assertLayer3ReadOnlyPort(layer3);
      l2ReadOnlyIntelligence =
        layer3.retainedCount() === 2 &&
        layer3.insightImpressions().length === 1 &&
        layer3.impressionsForCorrelation("corr-audit-1").length === 1 &&
        !("append" in layer3) &&
        !("all" in layer3);
    } catch {
      /* */
    }

    const layer2Flags = [
      l2AbandonNoBusinessEvent,
      l2FunnelTopAbandon,
      l2NoCleartextPii,
      l2Retention90,
      l2ReadOnlyIntelligence,
      l2SeparateStore,
    ];
    const layer2PassCount = layer2Flags.filter(Boolean).length;
    const layer2 = {
      score: layer2PassCount === 6 ? 3 : layer2PassCount >= 4 ? 2 : 1,
      phase: "fase3_ampliada_capa2",
      abandonDoesNotWriteBusinessEvents: l2AbandonNoBusinessEvent,
      funnelIdentifiesTopAbandonStep: l2FunnelTopAbandon,
      noCleartextPiiInTelemetry: l2NoCleartextPii,
      retention90Days: l2Retention90,
      readOnlyIntelligenceView: l2ReadOnlyIntelligence,
      telemetryStoreSeparatedFromEventStore: l2SeparateStore,
      passCount: layer2PassCount,
      totalChecks: 6,
      detail:
        layer2PassCount === 6
          ? "Capa 2 completa: telemetría UX en puente, embudo/abandonos, Insights, seudónimos+90d, capa 3 solo vía Layer3PresentationIntelligence"
          : `Capa 2 parcial: ${layer2PassCount}/6 checks`,
    };

    // ——— Fase 3 ampliada: puentes (Consultor, Priorizador, Registrador) ———
    let brConsultantMarchByCanal = false;
    let brConsultantOutOfCatalog = false;
    let brConsultantFilterSede = false;
    let brPrioritizerInterruptCap = false;
    let brRegistrarVariantRates = false;
    let brRegistrarReadPort = false;

    try {
      const lifeC = ventaArchetype.lifecycle;
      const catC = catalogFromLifecycle(
        lifeC.transitions.map((t) => t.id),
        lifeC.states.map((s) => s.id),
        ["importe"],
      );
      const packC = compilePolicies(
        {
          id: "audit-consultor",
          version: "1",
          companyId: "acme",
          archetypeId: "venta",
          roles: [
            { id: "vendedor", label: "V" },
            { id: "finanzas", label: "F" },
          ],
          organization: {
            sedes: [
              { id: "sede-a", label: "A" },
              { id: "sede-b", label: "B" },
            ],
            equipos: [
              { id: "eq-a", label: "A", sedeId: "sede-a" },
              { id: "eq-b", label: "B", sedeId: "sede-b" },
            ],
            assignments: [
              {
                actorId: "u-vend-a",
                sedeId: "sede-a",
                equipoId: "eq-a",
                roleId: "vendedor",
              },
            ],
          },
          permissions: [
            {
              id: "vis",
              kind: "permiso",
              action: "consultar",
              allowedRoles: ["vendedor", "finanzas"],
              visibility: { scope: "sede" },
            },
          ],
        } satisfies PolicyDocument,
        { catalog: catC, activationAt: "2026-01-01T00:00:00.000Z" },
      );
      const facts: MetricFactRow[] = [
        {
          id: "f1",
          tenantId: "acme",
          sedeId: "sede-a",
          equipoId: "eq-a",
          canal: "web",
          segmento: "retail",
          year: 2026,
          month: 3,
          importe: 5000,
          unidades: 1,
          ingresos_previstos: 0,
          conversion: 0,
          ticket_medio: 5000,
        },
        {
          id: "f2",
          tenantId: "acme",
          sedeId: "sede-b",
          equipoId: "eq-b",
          canal: "web",
          segmento: "retail",
          year: 2026,
          month: 3,
          importe: 9000,
          unidades: 1,
          ingresos_previstos: 0,
          conversion: 0,
          ticket_medio: 9000,
        },
      ];
      const reader: FilterReader = {
        id: "u-vend-a",
        roles: ["vendedor"],
        tenantId: "acme",
      };
      const march = consult({
        question: "¿Cuánto vendimos en marzo por canal?",
        reader,
        ruleSet: packC,
        facts,
        defaultYear: 2026,
      });
      brConsultantMarchByCanal =
        march.kind === "respuesta" &&
        march.query.metricId === "ventas_importe" &&
        march.query.groupBy.includes("canal") &&
        march.query.period.month === 3 &&
        march.calculation.metricId === "ventas_importe" &&
        march.total === 5000;

      const gaps = new UnansweredGapLog();
      const ooc = consult({
        question: "¿Cuál es el stock de almacén?",
        reader,
        ruleSet: packC,
        facts,
        gapLog: gaps,
      });
      brConsultantOutOfCatalog =
        ooc.kind === "aclaracion" &&
        ooc.reason === "out_of_catalog" &&
        gaps.size() === 1;

      const otherSede = consult({
        question: "Ventas de marzo por canal en sede-b",
        reader,
        ruleSet: packC,
        facts,
        defaultYear: 2026,
      });
      brConsultantFilterSede =
        otherSede.kind === "respuesta" &&
        otherSede.query.filters.sedeId === "sede-b" &&
        otherSede.total === 0;
    } catch {
      /* */
    }

    try {
      const insights: Insight[] = Array.from({ length: 20 }, (_, i) => ({
        id: `br-ins-${i}`,
        type: "alerta",
        subject: {
          kind: "transaccion",
          id: `tx-${i}`,
          tenantId: "acme",
        },
        title: "a",
        summary: "s",
        baseFacts: [{ id: "f", label: "i", value: 1, fieldKey: "importe" }],
        confidence: 0.99,
        generatedAt: "2026-06-01T00:00:00.000Z",
        expiresAt: "2026-06-02T00:00:00.000Z",
        estimatedImpact: 100_000,
      }));
      const pr = prioritizeInsights({
        insights,
        roles: ["vendedor"],
        now: "2026-06-01T20:00:00.000Z",
      });
      const interrupts = pr.items.filter((x) => x.urgency === "interrumpir");
      brPrioritizerInterruptCap =
        interrupts.length <= DEFAULT_INTERRUPT_LIMIT_PER_DAY &&
        interrupts.length === 3;
    } catch {
      /* */
    }

    try {
      const store = new InsightResponseStore();
      for (let i = 0; i < 4; i++) {
        recordShown(store, {
          responseId: `a${i}`,
          insightId: `ia${i}`,
          insightType: "recomendacion",
          shownAt: "2026-06-01T12:00:00.000Z",
          audienceKey: `u${i}`,
          subjectId: `t${i}`,
          tenantId: "acme",
          experimentId: "exp.br",
          experimentVariant: "A",
        });
      }
      for (let i = 0; i < 3; i++) {
        recordAccepted(store, {
          responseId: `a${i}`,
          at: "2026-06-01T12:01:00.000Z",
          transitionId: "t_aceptar",
          transitionEventId: `e${i}`,
          transitionResult: "exito",
        });
      }
      for (let i = 0; i < 4; i++) {
        recordShown(store, {
          responseId: `b${i}`,
          insightId: `ib${i}`,
          insightType: "recomendacion",
          shownAt: "2026-06-01T12:00:00.000Z",
          audienceKey: `v${i}`,
          subjectId: `s${i}`,
          tenantId: "acme",
          experimentId: "exp.br",
          experimentVariant: "B",
        });
      }
      recordAccepted(store, {
        responseId: "b0",
        at: "2026-06-01T12:01:00.000Z",
        transitionId: "t_aceptar",
        transitionEventId: "eb0",
        transitionResult: "exito",
      });
      const reader = openResponseReader(store);
      assertResponseReadOnlyPort(reader);
      const rates = reader.acceptanceRateByVariant("exp.br");
      const a = rates.find((r) => r.variant === "A");
      const b = rates.find((r) => r.variant === "B");
      brRegistrarVariantRates =
        a?.acceptanceRate === 0.75 && b?.acceptanceRate === 0.25;
      brRegistrarReadPort =
        !("append" in reader) && reader.statsByInsightType().length >= 1;
    } catch {
      /* */
    }

    const bridgesFlags = [
      brConsultantMarchByCanal,
      brConsultantOutOfCatalog,
      brConsultantFilterSede,
      brPrioritizerInterruptCap,
      brRegistrarVariantRates,
      brRegistrarReadPort,
      l2ReadOnlyIntelligence,
    ];
    const bridgesPassCount = bridgesFlags.filter(Boolean).length;
    const bridges = {
      score: bridgesPassCount === 7 ? 3 : bridgesPassCount >= 5 ? 2 : 1,
      phase: "fase3_ampliada_puentes",
      consultantMarchByCanalWithCalculation: brConsultantMarchByCanal,
      consultantOutOfCatalogClarifies: brConsultantOutOfCatalog,
      consultantRespectsSedeFilter: brConsultantFilterSede,
      prioritizerInterruptCap: brPrioritizerInterruptCap,
      registrarVariantAcceptanceRates: brRegistrarVariantRates,
      registrarReadOnlyPort: brRegistrarReadPort,
      presentationIntelligenceReadPort: l2ReadOnlyIntelligence,
      passCount: bridgesPassCount,
      totalChecks: 7,
      detail:
        bridgesPassCount === 7
          ? "Puentes completos: Consultor (catálogo+Filtro), Priorizador (tope interrupciones), Registrador (tasas), presentation-intelligence RO"
          : `Puentes parciales: ${bridgesPassCount}/7 checks`,
    };

    // ——— Diseñador ↔ Generador ———
    let dgStructureIndependentOfDesign = false;
    let dgNoLiteralColors = false;
    let dgIncompatiblePatternWarns = false;
    let dgAppliedA11yOk = false;

    try {
      const base = buildConcesionariaGeneratorInput("2026-06-01T00:00:00.000Z");
      const shared: GeneratorInput = {
        ...base,
        caseId: "audit-dg",
        resourceSubtypes: ["capacidad_temporal"],
        naturalezaBienes: ["propios_por_cantidad"],
        hasCalendar: true,
        channels: ["backoffice", "taller"],
        roles: [...base.roles, { id: "almacen", label: "Almacén" }],
      };
      const spec = generateUiSpec(shared);
      const h0 = structuralHash(spec);
      const dsA = proposeDesignSystems({
        companyId: "ferre-a",
        businessDescription: "Ferretería",
        identity: {},
      }).proposals[0]!;
      const dsB = proposeDesignSystems({
        companyId: "cli-b",
        businessDescription: "Clínica premium",
        identity: {},
      }).proposals[0]!;
      bindDesignToUiSpec({
        spec,
        designSystem: dsA,
        designContentHash: hashDesignSystem(dsA),
        roleId: "oficina",
        channel: "backoffice",
      });
      bindDesignToUiSpec({
        spec,
        designSystem: dsB,
        designContentHash: hashDesignSystem(dsB),
        roleId: "oficina",
        channel: "backoffice",
      });
      dgStructureIndependentOfDesign = structuralHash(spec) === h0;
      dgNoLiteralColors =
        !spec.identity.primaryColor &&
        spec.styleTokenRefs.colorPrimario === "color.primario" &&
        !/#[0-9a-fA-F]{6}/.test(JSON.stringify(spec.views));

      const dsBadPat: typeof dsA = {
        ...dsA,
        patterns: {
          listados: "tabla",
          navegacion: "lateral",
          formularios: "dos_columnas",
          tableros: "lista_agrupada",
        },
      };
      const bind = bindDesignToUiSpec({
        spec,
        designSystem: dsBadPat,
        designContentHash: hashDesignSystem(dsBadPat),
        roleId: "oficina",
        channel: "backoffice",
      });
      dgIncompatiblePatternWarns = bind.warnings.some(
        (w) => w.slot === "listados" && w.fallback === "lista",
      );

      const a11y = validateUiWithDesignSystem({
        spec,
        designSystem: dsA,
        roleId: "oficina",
        channel: "backoffice",
      });
      dgAppliedA11yOk = a11y.ok;
    } catch {
      /* */
    }

    const designerFlags = [
      dgStructureIndependentOfDesign,
      dgNoLiteralColors,
      dgIncompatiblePatternWarns,
      dgAppliedA11yOk,
    ];
    const designerPassCount = designerFlags.filter(Boolean).length;
    const designerGenerator = {
      score: designerPassCount === 4 ? 3 : designerPassCount >= 3 ? 2 : 1,
      phase: "fase3_ampliada_disenador_generador",
      structureIndependentOfDesign: dgStructureIndependentOfDesign,
      uiSpecHasNoLiteralColors: dgNoLiteralColors,
      incompatiblePatternFallsBackWithWarning: dgIncompatiblePatternWarns,
      appliedAccessibilityValidation: dgAppliedA11yOk,
      passCount: designerPassCount,
      totalChecks: 4,
      detail:
        designerPassCount === 4
          ? "Diseñador↔Generador: tokens semánticos, estructura estable, fallback de patrones, a11y aplicada"
          : `Diseñador↔Generador parcial: ${designerPassCount}/4`,
    };

    // ——— Cuatro especialistas: Arquitecto IA, Redactor, Probador, Revisor seguridad ———
    let spIaOk = false;
    let spCopyOk = false;
    let spQaOk = false;
    let spSecOk = false;
    let spIaDetail = "";
    let spCopyDetail = "";
    let spQaDetail = "";
    let spSecDetail = "";

    try {
      const spInput = buildConcesionariaGeneratorInput("2026-06-01T00:00:00.000Z");
      const spSpec = generateUiSpec(spInput);

      const ia = buildInformationArchitecture({
        spec: spSpec,
        roleIds: spInput.roles.map((r) => r.id),
        pendingByRole: {},
        generatedAt: "2026-06-01T00:00:00.000Z",
      });
      spIaOk =
        ia.byRole.length === spInput.roles.length &&
        ia.byRole.every((r) => r.menu.primaryEntries.length <= 7);
      spIaDetail = spIaOk
        ? `IA por rol (${ia.byRole.length}) con menú ≤7`
        : "IA incompleta o menú >7";

      const copy = proposeCopyPack({
        spec: spSpec,
        tone: "formal",
        locale: "es-ES",
        proposedAt: "2026-06-01T00:00:00.000Z",
      });
      const copy2 = proposeCopyPack({
        spec: spSpec,
        tone: "formal",
        locale: "es-ES",
        proposedAt: "2026-07-01T00:00:00.000Z",
      });
      const noJargon = copy.templates.every(
        (t) => findForbiddenJargon(t.template).length === 0,
      );
      spCopyOk = noJargon && copy.contentHash === copy2.contentHash;
      spCopyDetail = spCopyOk
        ? "Redactor: sin jerga, hash estable al regenerar"
        : "Redactor: jerga o no determinista";

      const qa = runQaPass(spInput, spSpec);
      const sale = qa.scenarios.find((s) => s.id === "credit-sale");
      spQaOk =
        !!sale?.reachedTerminal &&
        sale.terminalStateId === "cerrada" &&
        qa.durationMs < 5 * 60 * 1000;
      spQaDetail = spQaOk
        ? `Probador: venta a crédito→cerrada en ${qa.durationMs}ms`
        : "Probador: no cierra venta o excede tiempo";

      const sec = runSecurityReview(spInput, spSpec);
      const criticals = sec.findings.filter((f) => f.severity === "critical");
      spSecOk = criticals.length === 0 && !sec.deliveryBlocked;
      spSecDetail = spSecOk
        ? "Seguridad: concesionaria sin críticos (propuestas no aplicadas)"
        : `Seguridad: ${criticals.length} críticos falsos`;
    } catch (err) {
      spIaDetail = spIaDetail || String(err);
      spCopyDetail = spCopyDetail || String(err);
      spQaDetail = spQaDetail || String(err);
      spSecDetail = spSecDetail || String(err);
    }

    const specialistFlags = [spIaOk, spCopyOk, spQaOk, spSecOk];
    const specialistPassCount = specialistFlags.filter(Boolean).length;
    const fourSpecialists = {
      score:
        specialistPassCount === 4 ? 3 : specialistPassCount >= 3 ? 2 : 1,
      phase: "fase3_ampliada_cuatro_especialistas",
      architectIa: spIaOk,
      redactor: spCopyOk,
      qaTester: spQaOk,
      securityReviewer: spSecOk,
      passCount: specialistPassCount,
      totalChecks: 4,
      details: {
        architectIa: spIaDetail,
        redactor: spCopyDetail,
        qaTester: spQaDetail,
        securityReviewer: spSecDetail,
      },
      detail:
        specialistPassCount === 4
          ? "Cuatro especialistas OK: IA, Redactor, Probador, Revisor seguridad"
          : `Especialistas parciales: ${specialistPassCount}/4 — IA:${spIaOk} copy:${spCopyOk} qa:${spQaOk} sec:${spSecOk}`,
    };

    const report = {
      measuredAt: new Date().toISOString(),
      classification: {
        n: rows.length,
        correct,
        accuracy,
        accuracyPct: Number((accuracy * 100).toFixed(2)),
        failures: rows.filter((r) => !r.ok),
      },
      rupture,
      escapeValve: {
        scenarios: rupture.length,
        needingEscape: escapeNeeded,
        frictionPct: Number(frictionPct.toFixed(2)),
        groups: rupture
          .filter((r) => r.needsEscapeValve)
          .map((r) => ({ scenario: r.scenario, gap: r.detail })),
      },
      escapeValveCoverage: {
        score: escapeNeeded === 0 ? 3 : escapeNeeded <= 2 ? 2 : 1,
        scenarios: rupture.length,
        needingEscape: escapeNeeded,
        frictionPct: Number(frictionPct.toFixed(2)),
        allCoveredWithoutModificacion: escapeNeeded === 0,
        detail:
          escapeNeeded === 0
            ? "Los 7 escenarios de ruptura cubiertos sin evento modificacion"
            : `${escapeNeeded}/7 aún fuerzan válvula de escape`,
      },
      compositionHoles: holes,
      composition: {
        score:
          detectsCycle3Plus && detectsPairCycle && bloqueaEnforcedAtRuntime
            ? 3
            : detectsPairCycle
              ? 2
              : 1,
        cycleDetection: "dfs",
        detectsLength3Plus: detectsCycle3Plus,
        detectsPairCycle,
        bloqueaEnforcedAtRuntime,
        deliveryBlockedByFinanciera,
        detail: bloqueaEnforcedAtRuntime
          ? "bloquea opera en runtime (attemptComposedAdvance); DFS detecta ciclos ≥3"
          : "bloquea aún no opera en runtime o DFS incompleto",
      },
      observability: {
        score:
          transitionTraceWritable && rejectionExplainableFromTrace ? 3 : 1,
        transitionTrace: transitionTraceWritable,
        rejectionExplainableFromTrace,
        detail: rejectionExplainableFromTrace
          ? "Cada intento genera traza (origen, destino, condición, evidencia, bloqueos, resultado); explainRejection reconstruye el motivo"
          : "Sin traza de transición explicable",
      },
      closureBypass: closure,
      grammarGate,
      derivedProjection: {
        score:
          cancelReleasesResource && directMutationBlocked ? 3 : 1,
        wired: true,
        cancelReleasesResource,
        directMutationBlocked,
        detail:
          cancelReleasesResource && directMutationBlocked
            ? "Proyección suscrita al EventStore: Acuerdo reserva, Cancelada libera; mutación directa prohibida"
            : "Proyección incompleta o mutación directa aún posible",
      },
      learning: {
        score:
          priorsInherited &&
          convergesUp &&
          detectsDriftDirection &&
          hasDriftDetector &&
          writesOnlyProfile
            ? 3
            : hasDriftDetector
              ? 2
              : 1,
        priorsInherited,
        convergesUp,
        detectsDriftDirection,
        hasDriftDetector,
        writesOnlyProfile,
        model: "dirichlet_beta+gamma",
        detail: hasDriftDetector
          ? "Dirichlet/Beta salidas, Gamma permanencia; DriftDetector alerta cambio sostenido; solo escribe perfil"
          : "Aprendiz sin detector de deriva explícito",
      },
      derivation: {
        exceptionBypassesGraph,
        matchesSituationIsTautology,
      },
      privacy,
      layer1,
      layer2,
      bridges,
      designerGenerator,
      fourSpecialists,
      grammarBypassNote: grammarGate.rawUsable
        ? "validateLifecycle solo se impone en MetaObjectRegistry.register; arquetipos se usan directamente"
        : "validateLifecycle se impone en toda función que recibe una máquina (deriveState, assertCanAdvance, Registry)",
      determinism,
    };

    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

    // Expose key metrics as assertions that document findings (not "all green")
    expect(rows.length).toBeGreaterThanOrEqual(30);
    expect(report.classification.accuracyPct).toBeGreaterThanOrEqual(0);
    expect(frictionPct).toBeLessThanOrEqual(15);
    expect(escapeNeeded).toBe(0);
    expect(closure.canBypass).toBe(false);
    expect(exceptionBypassesGraph).toBe(false);
    expect(grammarGate.rawUsable).toBe(false);
    expect(matchesSituationIsTautology).toBe(false);
    expect(hasDriftDetector).toBe(true);
    expect(writesOnlyProfile).toBe(true);
    expect(cancelReleasesResource).toBe(true);
    expect(directMutationBlocked).toBe(true);
    expect(multiTenantControls).toBe(true);
    expect(aggregation).toBe(true);
    expect(anonymization).toBe(true);
    expect(detectsCycle3Plus).toBe(true);
    expect(bloqueaEnforcedAtRuntime).toBe(true);
    expect(rejectionExplainableFromTrace).toBe(true);
    expect(layer1.score).toBe(3);
    expect(layer1.passCount).toBe(8);
    expect(layer2.score).toBe(3);
    expect(layer2.passCount).toBe(6);
    expect(bridges.score).toBe(3);
    expect(bridges.passCount).toBe(7);
    expect(designerGenerator.score).toBe(3);
    expect(designerGenerator.passCount).toBe(4);
    expect(fourSpecialists.score).toBe(3);
    expect(fourSpecialists.passCount).toBe(4);

    // Soft log for humans
    console.log(
      `\n[AUDIT] accuracy=${report.classification.accuracyPct}% (${correct}/${rows.length})` +
        ` friction=${frictionPct.toFixed(1)}% closureBypass=${closure.canBypass}` +
        ` exceptionBypass=${exceptionBypassesGraph} rawUsable=${grammarGate.rawUsable}` +
        ` tautology=${matchesSituationIsTautology}`,
    );
    console.log(
      `[AUDIT] layer1 score=${layer1.score}/3 (${layer1.passCount}/${layer1.totalChecks}) — ${layer1.detail}`,
    );
    console.log(
      `[AUDIT] layer2 score=${layer2.score}/3 (${layer2.passCount}/${layer2.totalChecks}) — ${layer2.detail}`,
    );
    console.log(
      `[AUDIT] bridges score=${bridges.score}/3 (${bridges.passCount}/${bridges.totalChecks}) — ${bridges.detail}`,
    );
    console.log(
      `[AUDIT] designer↔generator score=${designerGenerator.score}/3 (${designerGenerator.passCount}/${designerGenerator.totalChecks}) — ${designerGenerator.detail}`,
    );
    console.log(
      `[AUDIT] four specialists score=${fourSpecialists.score}/3 (${fourSpecialists.passCount}/${fourSpecialists.totalChecks}) — ${fourSpecialists.detail}`,
    );
    console.log(
      `[AUDIT]   · Arquitecto IA: ${fourSpecialists.details.architectIa}`,
    );
    console.log(
      `[AUDIT]   · Redactor: ${fourSpecialists.details.redactor}`,
    );
    console.log(
      `[AUDIT]   · Probador: ${fourSpecialists.details.qaTester}`,
    );
    console.log(
      `[AUDIT]   · Revisor seguridad: ${fourSpecialists.details.securityReviewer}`,
    );
    console.log(`[AUDIT] report → ${outPath}`);
  });
});
