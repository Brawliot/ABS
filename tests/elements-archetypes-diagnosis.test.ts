import { describe, expect, it } from "vitest";
import { MetaObjectRegistry } from "../core/metaobject.js";
import { validateLifecycle } from "../core/validator.js";
import {
  allNonTransactionElementTemplates,
  assertTransactionClosure,
  assertAllPartiesBalanceZero,
  computeBalance,
  computeBalanceByParty,
  ParteSubtypes,
  OfertaSubtypes,
  TransaccionSubtypes,
} from "../elements/index.js";
import { ARCHETYPES } from "../archetypes/catalog.js";
import {
  validateComposition,
} from "../archetypes/composition.js";
import {
  ALL_ARCHETYPE_CASES,
  assertCaseValid,
  concesionariaCase,
} from "../spec/cases.js";
import {
  classifyFromAnswers,
  LowConfidenceError,
} from "../diagnosis/classifier.js";
import { StructuredExtractor } from "../diagnosis/extractor.js";
import { StructuredParameterizer } from "../diagnosis/parameterizer.js";
import { DiagnosisEngine } from "../diagnosis/engine.js";
import { CONFIDENCE_THRESHOLD } from "../diagnosis/questions.js";
import { createArchetypeLearnerRegistry } from "../learning/index.js";
import type { TransitionEvent } from "../core/events.js";

describe("Elementos (10) y subtipos cerrados", () => {
  it("expone los subtipos cerrados documentados", () => {
    expect(ParteSubtypes).toContain("cliente");
    expect(OfertaSubtypes).toContain("dinero_cobertura");
    expect(TransaccionSubtypes).toHaveLength(6);
  });

  it("cada plantilla no-tx tiene ciclo válido y se registra", () => {
    const registry = new MetaObjectRegistry();
    for (const spec of allNonTransactionElementTemplates()) {
      expect(validateLifecycle(spec.lifecycle)).toEqual({ ok: true });
      const values: Record<string, unknown> = {
        subtype: spec.definition.subtype,
      };
      for (const field of spec.definition.fields) {
        if (field.name === "subtype" || !field.required) continue;
        switch (field.type) {
          case "string":
          case "reference":
          case "datetime":
            values[field.name] = "x";
            break;
          case "number":
            values[field.name] = 1;
            break;
          case "boolean":
            values[field.name] = true;
            break;
          case "enum":
            values[field.name] = field.enumValues![0];
            break;
        }
      }
      expect(() => registry.register(spec, values)).not.toThrow();
    }
  });
});

describe("Elementos — catálogo", () => {
  it("genera plantillas para todos los subtipos no-transacción", () => {
    expect(allNonTransactionElementTemplates().length).toBeGreaterThan(20);
  });
});

describe("Arquetipos (6)", () => {
  it("cada arquetipo tiene máquina válida", () => {
    expect(ARCHETYPES).toHaveLength(6);
    for (const arch of ARCHETYPES) {
      const result = validateLifecycle(arch.lifecycle);
      expect(result, arch.id).toEqual({ ok: true });
    }
  });
});

describe("Composición y bloqueos circulares", () => {
  it("acepta la composición de concesionaria", () => {
    expect(validateComposition(concesionariaCase.composition)).toEqual({
      ok: true,
    });
  });

  it("detecta bloqueo circular entre secundarios", () => {
    const result = validateComposition({
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
          bloquea: "aceptada",
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "CIRCULAR_BLOCK")).toBe(true);
    }
  });

  it("detecta bloquea === bornIn en el mismo binding", () => {
    const result = validateComposition({
      dominant: "venta",
      secondaries: [
        {
          secondaryArchetypeId: "financiera",
          bornInDominantState: "aceptada",
          bloquea: "aceptada",
        },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe("Casos de especificación", () => {
  it("concesionaria pasa el validador completo", () => {
    expect(() => assertCaseValid(concesionariaCase)).not.toThrow();
  });

  it("un caso por arquetipo pasa el validador", () => {
    for (const c of ALL_ARCHETYPE_CASES) {
      expect(() => assertCaseValid(c), c.id).not.toThrow();
    }
  });
});

describe("Cierre de transacción", () => {
  it("exige las 4 invariantes en terminal de éxito", () => {
    expect(() =>
      assertTransactionClosure({
        currentStateId: "cerrada",
        fulfilledCommitmentIds: new Set(["a"]),
        pendingCommitmentIds: new Set(),
        fieldValues: {},
        balance: 0,
        resourcesSettled: true,
        evidenceComplete: true,
      }),
    ).not.toThrow();

    expect(() =>
      assertTransactionClosure({
        currentStateId: "cerrada",
        fulfilledCommitmentIds: new Set(),
        pendingCommitmentIds: new Set(["pendiente"]),
        fieldValues: {},
        balance: 0,
        resourcesSettled: true,
        evidenceComplete: true,
      }),
    ).toThrow(/compromisos/);
  });

  it("calcula saldo de movimientos", () => {
    expect(
      computeBalance([
        { amount: 100, direction: "in" },
        { amount: 40, direction: "out" },
        { amount: 60, direction: "out" },
      ]),
    ).toBe(0);
  });

  it("exige saldo cero en todas las partes (reparto N)", () => {
    expect(
      computeBalanceByParty([
        { amount: 90, direction: "in", parteId: "a" },
        { amount: 30, direction: "out", parteId: "a" },
        { amount: 60, direction: "out", parteId: "a" },
        { amount: 10, direction: "in", parteId: "b" },
        { amount: 10, direction: "out", parteId: "b" },
      ]),
    ).toEqual({ a: 0, b: 0 });
    expect(() =>
      assertAllPartiesBalanceZero([
        { amount: 5, direction: "in", parteId: "x" },
      ]),
    ).toThrow(/Saldo no cero/);
  });
});

describe("Motor de diagnóstico", () => {
  it("repregunta si la confianza < 0.85", () => {
    expect(() =>
      classifyFromAnswers([
        {
          questionId: "cliente_se_queda",
          value: true,
          confidence: CONFIDENCE_THRESHOLD - 0.01,
        },
      ]),
    ).toThrow(LowConfidenceError);
  });

  it("clasifica concesionaria: venta dominante + financiera + servicio", () => {
    const answers = [
      { questionId: "cliente_se_queda" as const, value: true, confidence: 0.95 },
      { questionId: "debe_volver" as const, value: false, confidence: 0.95 },
      {
        questionId: "pago_periodico_acceso" as const,
        value: false,
        confidence: 0.9,
      },
      {
        questionId: "se_produce_despues" as const,
        value: true,
        confidence: 0.9,
      },
      { questionId: "tercero_conecta" as const, value: false, confidence: 0.9 },
      {
        questionId: "dinero_o_cobertura" as const,
        value: true,
        confidence: 0.92,
      },
      {
        questionId: "linea_mas_ingresos" as const,
        value: "venta",
        confidence: 0.9,
      },
    ];

    const { composition } = classifyFromAnswers(answers);
    expect(composition.dominant).toBe("venta");
    expect(
      composition.secondaries.map((s) => s.secondaryArchetypeId).sort(),
    ).toEqual(["financiera", "servicio_proyecto"]);
  });

  it("el motor produce spec versionada con auditoría", async () => {
    const engine = new DiagnosisEngine(
      new StructuredExtractor({
        answers: [
          {
            questionId: "cliente_se_queda",
            value: true,
            confidence: 0.95,
          },
          { questionId: "debe_volver", value: false, confidence: 0.95 },
          {
            questionId: "pago_periodico_acceso",
            value: false,
            confidence: 0.9,
          },
          {
            questionId: "se_produce_despues",
            value: false,
            confidence: 0.9,
          },
          { questionId: "tercero_conecta", value: false, confidence: 0.9 },
          {
            questionId: "dinero_o_cobertura",
            value: false,
            confidence: 0.9,
          },
          {
            questionId: "linea_mas_ingresos",
            value: "venta",
            confidence: 0.9,
          },
        ],
      }),
      new StructuredParameterizer({
        fields: {
          subtype: "venta",
          arquetipo_id: "venta",
          oferta_version_aceptada: 2,
        },
      }),
    );

    const spec = await engine.run("vendo coches al contado");
    expect(spec.version).toBe("1.1.0");
    expect(spec.dominant).toBe("venta");
    expect(spec.audit.length).toBeGreaterThan(0);
    expect(spec.parameters.arquetipo_id).toBe("venta");
  });

  it("rechaza parámetros fuera de esquema", async () => {
    const engine = new DiagnosisEngine(
      new StructuredExtractor({
        answers: [
          {
            questionId: "cliente_se_queda",
            value: true,
            confidence: 0.95,
          },
          { questionId: "debe_volver", value: false, confidence: 0.95 },
          {
            questionId: "pago_periodico_acceso",
            value: false,
            confidence: 0.9,
          },
          {
            questionId: "se_produce_despues",
            value: false,
            confidence: 0.9,
          },
          { questionId: "tercero_conecta", value: false, confidence: 0.9 },
          {
            questionId: "dinero_o_cobertura",
            value: false,
            confidence: 0.9,
          },
          {
            questionId: "linea_mas_ingresos",
            value: "venta",
            confidence: 0.9,
          },
        ],
      }),
      new StructuredParameterizer({
        fields: { subtype: "venta", campo_inventado: true },
      }),
    );

    await expect(engine.run("x")).rejects.toThrow(/Parámetros rechazados/);
  });

  it("contradicción se queda+debe volver → repregunta leasing", () => {
    expect(() =>
      classifyFromAnswers([
        { questionId: "cliente_se_queda", value: true, confidence: 0.95 },
        { questionId: "debe_volver", value: true, confidence: 0.95 },
        {
          questionId: "pago_periodico_acceso",
          value: false,
          confidence: 0.9,
        },
        {
          questionId: "se_produce_despues",
          value: false,
          confidence: 0.9,
        },
        { questionId: "tercero_conecta", value: false, confidence: 0.9 },
        {
          questionId: "dinero_o_cobertura",
          value: false,
          confidence: 0.9,
        },
        {
          questionId: "linea_mas_ingresos",
          value: "venta",
          confidence: 0.9,
        },
      ]),
    ).toThrow(LowConfidenceError);
  });
});

describe("Aprendices bayesianos por tipo", () => {
  it("heredan priors del arquetipo y no se consultan entre sí", () => {
    const registry = createArchetypeLearnerRegistry();
    const venta = registry.getOrCreate("transaccion:venta");
    const servicio = registry.getOrCreate("transaccion:servicio_proyecto");

    const beforeServicio = servicio.snapshot().features;

    const event: TransitionEvent = {
      id: "e1",
      kind: "transicion",
      subjectId: "tx-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: "a1",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "r1",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      transitionId: "t_aceptar",
      fromStateId: "propuesta",
      toStateId: "aceptada",
    };

    registry.dispatch("transaccion:venta", event);

    expect(venta.snapshot().version).toBeGreaterThan(0);
    expect(servicio.snapshot().features).toEqual(beforeServicio);
  });
});
