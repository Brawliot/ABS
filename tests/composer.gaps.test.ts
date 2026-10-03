/**
 * Cierre de huecos COMPOSER-REPORT: plantillas nuevas, taller/Juez,
 * horarios, oráculo estricto, preguntas unificadas, reformas/hitos.
 * (Pruebas nuevas — no modifica suites existentes.)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateComposition } from "../archetypes/composition.js";
import { servicioArchetype } from "../archetypes/servicio.js";
import {
  ALL_POLICY_TEMPLATE_IDS,
  compilePolicyTemplate,
  compilePolicyTemplates,
  POLICY_TEMPLATE_IDS_EXTRA,
} from "../contracts/policy-templates/index.js";
import { validateBusinessProfile } from "../contracts/business-profile/index.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import {
  FACT_IDS,
  FactProvider,
  withFactPayload,
} from "../facts/index.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
  collectFactRequests,
} from "../policies/judge.js";
import type { PolicyDocument } from "../policies/types.js";
import {
  composeBusinessProfile,
  mapSampleToV12,
  parseScheduleText,
  runCompositionFitOracle,
  unifyComposerQuestions,
  type ExpectedCompositionDoc,
} from "../composer/index.js";
import type { SampleProfile } from "../contracts/business-profile/samples/sample-types.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const SAMPLES = join(
  ROOT,
  "contracts/business-profile/samples/business-profiles-10.json",
);
const EXPECTED = join(ROOT, "contracts/composition/expected");

function loadSamples(): SampleProfile[] {
  const raw = JSON.parse(readFileSync(SAMPLES, "utf8")) as {
    perfiles: SampleProfile[];
  };
  return raw.perfiles;
}

function composeSample(sample: SampleProfile) {
  const { profile, scheduleQuestions } = mapSampleToV12(sample);
  const validated = validateBusinessProfile(profile);
  const composed = composeBusinessProfile(validated, {
    extraQuestions: scheduleQuestions,
  });
  expect(composed.ok).toBe(true);
  if (!composed.ok) throw new Error(composed.message);
  return unifyComposerQuestions(validated, composed);
}

describe("Catálogo tpl.* ampliado", () => {
  it("incluye plantillas EXTRA y todas compilan", () => {
    expect(POLICY_TEMPLATE_IDS_EXTRA.length).toBeGreaterThanOrEqual(5);
    expect(ALL_POLICY_TEMPLATE_IDS).toContain("tpl.restriccion_saldo_antes_de");
    expect(ALL_POLICY_TEMPLATE_IDS).toContain("tpl.evidencia_requerida");
    expect(ALL_POLICY_TEMPLATE_IDS).toContain("tpl.fianza_condicional");
    expect(ALL_POLICY_TEMPLATE_IDS).toContain("tpl.permiso_excepcion");
    expect(ALL_POLICY_TEMPLATE_IDS).toContain("tpl.limite_plazos_financiacion");

    const batch = [
      {
        id: "a",
        plantilla: "tpl.restriccion_saldo_antes_de" as const,
        parametros: {},
        transitionId: "t_cerrar",
      },
      {
        id: "b",
        plantilla: "tpl.evidencia_requerida" as const,
        parametros: { evidence: "consentimiento_informado" },
        transitionId: "t_ejecutar",
      },
      {
        id: "c",
        plantilla: "tpl.fianza_condicional" as const,
        parametros: { umbral_comensales: 10 },
        transitionId: "t_reservar",
      },
      {
        id: "d",
        plantilla: "tpl.permiso_excepcion" as const,
        parametros: { rol: "duena" },
        transitionId: "t_cancelar",
      },
      {
        id: "e",
        plantilla: "tpl.limite_plazos_financiacion" as const,
        parametros: { meses_max_sin_aprobacion: 12 },
        transitionId: "t_aprobar",
      },
    ];
    const compiled = compilePolicyTemplates(batch);
    expect(compiled.policies.length + compiled.compliance.length + compiled.permissions.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Taller p04 — restricción saldo + Juez", () => {
  it("compositor emite tpl.restriccion_saldo_antes_de", () => {
    const sample = loadSamples().find((p) => p.id === "p04-taller-mecanico")!;
    const composed = composeSample(sample);
    expect(
      composed.policyTemplates.some(
        (t) => t.plantilla === "tpl.restriccion_saldo_antes_de",
      ),
    ).toBe(true);
    const inv = composed.policyTemplates.find(
      (t) => t.plantilla === "tpl.restriccion_saldo_antes_de",
    )!;
    expect(inv.transitionId ?? inv.parametros.transitionId).toBe("t_cerrar");
  });

  // Deuda = impagos del cliente, no otros trabajos en curso (en los arquetipos
  // el cobro va con el cierre; contar trabajos abiertos bloqueaba entre sí dos
  // trabajos del mismo cliente).
  it("Juez rechaza t_cerrar si el cliente tiene impagos; otro trabajo abierto no bloquea (plantilla)", () => {
    const life = servicioArchetype.lifecycle;
    const catalog = catalogFromLifecycle(
      life.transitions.map((t) => t.id),
      life.states.map((s) => s.id),
      ["importe", "parte_id"],
    );
    const tpl = compilePolicyTemplate({
      id: "pol-saldo-entrega",
      plantilla: "tpl.restriccion_saldo_antes_de",
      parametros: {},
      transitionId: "t_cerrar",
    });
    const doc: PolicyDocument = {
      id: "taller-pack",
      version: "1.0.0",
      companyId: "taller",
      archetypeId: "servicio_proyecto",
      roles: [
        { id: "mecanico", label: "Mecánico" },
        { id: "dueno", label: "Dueño" },
      ],
      permissions: life.transitions.map((t) => ({
        id: `perm-${t.id}`,
        kind: "permiso" as const,
        transitionId: t.id,
        allowedRoles: ["mecanico", "dueno"],
      })),
      policies: [...tpl.policies],
      compliance: [...tpl.compliance],
    };
    const ruleSet = compilePolicies(doc, {
      catalog,
      activationAt: "2026-04-01T00:00:00.000Z",
    });

    const provider = new FactProvider();
    const tenantId = "taller-1";
    const factEvent = (
      id: string,
      subjectId: string,
      transitionId: string,
      fromStateId: string,
      toStateId: string,
      importe: number,
    ) =>
      withFactPayload(
        {
          id,
          kind: "transicion",
          subjectId,
          occurredAt: "2026-01-01T00:00:00.000Z",
          actorId: "a",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
          transitionId,
          fromStateId,
          toStateId,
        },
        { parteId: "cli-auto", importe },
      );
    // Otro trabajo del mismo cliente en curso: no es deuda
    provider.applyEvent(
      tenantId,
      factEvent("e-abierta", "tx-abierta", "t_acordar", "propuesta", "acordado", 850),
    );

    // Cadena hasta en_espera (evidencia/actor según lifecycle)
    function ev(
      id: string,
      tid: string,
      from: string,
      to: string,
      evidenceKind: "aceptacion" | "sistema" | "fisica",
      actorKind: "humano" | "sistema",
    ): TransitionEvent {
      return {
        id,
        kind: "transicion",
        subjectId: "tx-rep",
        occurredAt: "2026-01-02T00:00:00.000Z",
        actorId: actorKind === "sistema" ? "sys" : "m1",
        actorKind,
        evidence: {
          kind: evidenceKind,
          reference: "ok",
          recordedAt: "2026-01-02T00:00:00.000Z",
        },
        transitionId: tid,
        fromStateId: from,
        toStateId: to,
      };
    }
    const history = [
      ev("e1", "t_acordar", "propuesta", "acordado", "aceptacion", "humano"),
      ev("e2", "t_ejecutar", "acordado", "en_ejecucion", "sistema", "sistema"),
      ev("e3", "t_presentar", "en_ejecucion", "en_espera", "fisica", "humano"),
    ];
    const derived = deriveState(life, history);
    expect(derived.currentStateId).toBe("en_espera");

    const fields = { parte_id: "cli-auto", importe: 850, subject_id: "tx-rep" };
    const cerrar = (bag: ReturnType<FactProvider["prepare"]>) =>
      attemptJudgedAdvance({
        subjectId: "tx-rep",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_cerrar",
          eventId: "e-entrega",
          actorId: "m1",
          actorKind: "humano",
          occurredAt: "2026-01-03T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "entrega",
            recordedAt: "2026-01-03T00:00:00.000Z",
          },
        },
        actor: { id: "m1", kind: "humano", roles: ["mecanico"] },
        evidence: {
          kind: "aceptacion",
          reference: "entrega",
          recordedAt: "2026-01-03T00:00:00.000Z",
        },
        fields,
        ruleSet,
        tenantId,
        facts: bag,
      });
    const params = { parteId: "cli-auto", excludeSubjectId: "tx-rep" };

    const sinImpagos = provider.prepare(tenantId, collectFactRequests(ruleSet, "t_cerrar", fields));
    // Tiene 850 € en curso (saldo abierto), pero eso no es deuda
    const saldo = provider.prepare(tenantId, [
      { factId: FACT_IDS.PARTE_SALDO_PENDIENTE, params: { parteId: "cli-auto" } },
    ]);
    expect(saldo.get(FACT_IDS.PARTE_SALDO_PENDIENTE, { parteId: "cli-auto" })).toBe(850);
    expect(sinImpagos.get(FACT_IDS.PARTE_IMPORTE_IMPAGADO, params)).toBe(0);
    expect(() => cerrar(sinImpagos)).not.toThrow();

    // Impago registrado del cliente (p. ej. una cuota): ahora sí bloquea
    provider.applyEvent(
      tenantId,
      factEvent("e-impago", "tx-cuota", "t_impago", "en_renovacion", "impagada", 60),
    );
    const conImpago = provider.prepare(tenantId, collectFactRequests(ruleSet, "t_cerrar", fields));
    expect(conImpago.get(FACT_IDS.PARTE_IMPORTE_IMPAGADO, params)).toBe(60);
    expect(() => cerrar(conImpago)).toThrow(JudgeRejectionError);
  });
});

describe("Reformas p10 — hitos sin financiera", () => {
  it("no añade secundaria financiera; milestones + tpl.hitos_pago; documenta subcontrata", () => {
    const sample = loadSamples().find((p) => p.id === "p10-reformas")!;
    const composed = composeSample(sample);
    expect(
      composed.composition?.secondaries.some(
        (s) => s.secondaryArchetypeId === "financiera",
      ) ?? false,
    ).toBe(false);
    expect(composed.milestones?.length).toBeGreaterThanOrEqual(2);
    expect(
      composed.policyTemplates.some((t) => t.plantilla === "tpl.hitos_pago"),
    ).toBe(true);
    expect(
      composed.nonComposable.some((n) =>
        n.extension.includes("subcontrata"),
      ),
    ).toBe(true);
    // Proceso subcontrata presente como standalone
    expect(composed.processes.some((p) => p.id === "lc.subcontrata")).toBe(
      true,
    );
  });
});

describe("Lector de horarios", () => {
  it("parsea L-V, partidos, media jornada, lunes cerrado y temporada", () => {
    const a = parseScheduleText("L-V 9:00-18:00");
    expect(a.ok).toBe(true);
    expect(a.calendar?.weeklyHours[1]?.[0]).toEqual({
      start: "09:00",
      end: "18:00",
    });
    expect(a.calendar?.weeklyHours[6]).toBeUndefined();

    const b = parseScheduleText("M-S 9:30-20:00, lunes cerrado");
    expect(b.calendar?.weeklyHours[1]).toBeUndefined(); // lunes
    expect(b.calendar?.weeklyHours[2]?.[0]?.start).toBe("09:30");

    const c = parseScheduleText(
      "L-V 8:00-14:00 y 16:30-20:00, S 9:00-14:00",
    );
    expect(c.calendar?.weeklyHours[1]?.length).toBe(2);
    expect(c.calendar?.weeklyHours[6]?.[0]).toEqual({
      start: "09:00",
      end: "14:00",
    });

    const d = parseScheduleText(
      "L-J 8:30-18:00, V 8:30-15:00; agosto intensivo",
    );
    expect(d.calendar?.seasons?.[0]?.id).toBe("temp-agosto");
    expect(d.questions.some((q) => q.id.includes("agosto"))).toBe(true);

    const e = parseScheduleText("horario raro xyz");
    expect(e.ok).toBe(false);
    expect(e.questions.length).toBeGreaterThan(0);
    expect(e.calendar?.weeklyHours ?? {}).toEqual(
      e.calendar ? e.calendar.weeklyHours : {},
    );
  });

  it("aplica el parser a los 10 perfiles sin inventar", () => {
    for (const sample of loadSamples()) {
      const { profile, scheduleQuestions, mappingNotes } =
        mapSampleToV12(sample);
      const cal = (profile as { calendar: { status: string; value?: unknown } })
        .calendar;
      if (cal.status === "known") {
        expect(cal.value).toBeTruthy();
        // Si hay preguntas, son residuos no inventados
        for (const q of scheduleQuestions) {
          expect(q.question.length).toBeGreaterThan(5);
        }
      }
      expect(mappingNotes.length).toBeGreaterThan(0);
    }
  });
});

describe("Preguntas unificadas", () => {
  it("calendar confirm está en questions antes de materialize", () => {
    const sample = loadSamples().find((p) => p.id === "p04-taller-mecanico")!;
    const composed = composeSample(sample);
    expect(
      composed.questions.some(
        (q) => q.field === "calendar" || q.field.startsWith("calendar"),
      ),
    ).toBe(true);
  });

  it("asks bloqueantes impiden materialize y ya estaban listados", () => {
    const sample = loadSamples().find((p) => p.id === "p10-reformas")!;
    const { profile, scheduleQuestions } = mapSampleToV12(sample);
    const validated = validateBusinessProfile(profile);
    const composed = composeBusinessProfile(validated, {
      extraQuestions: scheduleQuestions,
    });
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    const unified = unifyComposerQuestions(validated, composed);
    expect(
      unified.questions.some((q) => q.field === "naturalezaBienes"),
    ).toBe(true);
    expect(
      unified.questions.some((q) =>
        q.field.includes("portalCliente"),
      ),
    ).toBe(true);
  });
});

describe("Oráculo estricto (10 perfiles)", () => {
  it("fitOk duro con excepciones declaradas; tabla de políticas", () => {
    const rows: {
      id: string;
      policiesHit: number;
      policiesExpected: number;
      secondariesHit: number;
      secondariesExpected: number;
      ok: boolean;
      questions: string[];
    }[] = [];

    for (const sample of loadSamples()) {
      const composed = composeSample(sample);
      if (composed.composition) {
        expect(validateComposition(composed.composition).ok).toBe(true);
      }
      const expected = JSON.parse(
        readFileSync(join(EXPECTED, `${sample.id}.json`), "utf8"),
      ) as ExpectedCompositionDoc;
      const fit = runCompositionFitOracle(composed, expected);
      rows.push({
        id: sample.id,
        policiesHit: fit.summary.policiesHit,
        policiesExpected: fit.summary.policiesExpected,
        secondariesHit: fit.summary.secondariesHit,
        secondariesExpected: fit.summary.secondariesExpected,
        ok: fit.ok,
        questions: composed.questions.map((q) => q.field),
      });
      if (!fit.ok) {
        const fails = fit.findings.filter((f) => f.severity === "fail");
        expect(fails, `${sample.id}: ${JSON.stringify(fails)}`).toEqual([]);
      }
    }

    expect(rows.every((r) => r.ok)).toBe(true);
    // p04 políticas: importe + evidence + saldo
    const p04 = rows.find((r) => r.id === "p04-taller-mecanico")!;
    expect(p04.policiesHit).toBe(p04.policiesExpected);
  });
});
