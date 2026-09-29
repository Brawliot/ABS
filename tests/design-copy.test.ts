/**
 * Criterios Redactor MVP:
 * - Ningún texto visible con jerga prohibida
 * - Rechazo por límite de crédito: deuda, límite y qué hacer
 * - Regenerar sin cambios en la especificación no cambia textos
 */

import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_JARGON,
  findForbiddenJargon,
  proposeCopyPack,
  redactInterfaceCopy,
  resolveCopy,
  resolveJudgeError,
  applyVocabulary,
  CopyValidationError,
  validateCopyPack,
} from "../design/copy/index.js";
import type { JudgeTrace } from "../policies/judge.js";
import type { UiSpec } from "../presentation/types.js";
import { PRESENTATION_SCHEMA_VERSION } from "../presentation/types.js";
import { DEFAULT_STYLE_TOKEN_REFS } from "../presentation/tokens.js";
import { admittedPatternsForView } from "../presentation/patterns.js";

function miniSpec(): UiSpec {
  return {
    id: "ui-copy",
    version: PRESENTATION_SCHEMA_VERSION,
    generatedAt: "2026-06-01T00:00:00.000Z",
    sourceCaseId: "c1",
    sourceCaseVersion: "1",
    sourcePolicyHash: "ph",
    contentHash: "hash-spec-stable",
    modules: [],
    views: [
      {
        id: "view.pedidos",
        kind: "lista",
        labelKey: "view.pedidos",
        stateId: null,
        lifecycleId: "lc.venta",
        actionIds: ["action.cerrar"],
        admittedPatterns: admittedPatternsForView("lista"),
      },
    ],
    actions: [
      {
        id: "action.cerrar",
        transitionId: "t_cerrar",
        lifecycleId: "lc.venta",
        labelKey: "action.cerrar",
        visibleRoles: ["vendedor"],
        requiredEvidenceKind: "fisica",
        evidenceFields: [],
      },
      {
        id: "action.recibir",
        transitionId: "t_recibir",
        lifecycleId: "lc.stock",
        labelKey: "action.recibir",
        visibleRoles: ["almacen"],
        requiredEvidenceKind: "fisica",
        evidenceFields: [],
      },
    ],
    forms: [],
    recorridos: [],
    identity: { brandName: "Acme" },
    localization: [{ locale: "es-ES", strings: {} }],
    content: {},
    styleTokenRefs: DEFAULT_STYLE_TOKEN_REFS,
  };
}

function creditTrace(): JudgeTrace {
  return {
    at: "2026-06-01T12:00:00.000Z",
    subjectId: "pedido-99",
    transitionId: "t_cerrar",
    ruleSetVersion: "1",
    ruleSetContentHash: "abc12345deadbeef",
    guardsEvaluated: [
      {
        phase: "politica",
        ruleId: "pol-limite-credito",
        result: "rejected",
        reason:
          "Restricción: credito supera limite (importe gt 10000)",
      },
    ],
    result: "rejected",
    reason: "Límite de crédito superado",
    appliedRuleId: "pol-limite-credito",
    calculations: {},
    factsUsed: {
      "credito.deuda": { value: 12500, version: 1, streamPosition: 10 },
      "credito.limite": { value: 10000, version: 1, streamPosition: 10 },
    },
  };
}

describe("Redactor de interfaz MVP", () => {
  it("ningún texto visible contiene jerga de la lista prohibida", () => {
    const { pack } = redactInterfaceCopy({
      spec: miniSpec(),
      tone: "formal",
      locale: "es-ES",
      proposedAt: "2026-06-01T10:00:00.000Z",
      vocabulary: {
        "evidencia de entrega": "albarán",
      },
    });

    for (const t of pack.templates) {
      const filled =
        t.requiredVariables.length === 0
          ? t.template
          : t.template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, v) => {
              if (v === "deuda") return "100";
              if (v === "limite") return "50";
              if (v === "importe") return "12000";
              if (v === "accion_label") return "Confirmar cobro";
              if (v === "pedido") return "pedido-1";
              return "x";
            });
      const visible = applyVocabulary(filled, pack.vocabulary);
      expect(
        findForbiddenJargon(visible),
        `${t.key}: ${visible}`,
      ).toEqual([]);
    }

    // Vocabulario de negocio
    expect(
      applyVocabulary("Adjunte la evidencia de entrega firmada", pack.vocabulary),
    ).toContain("albarán");

    expect(FORBIDDEN_JARGON).toContain("tenant");
    expect(FORBIDDEN_JARGON).toContain("guarda");
  });

  it("un rechazo por límite de crédito muestra la deuda, el límite y qué hacer", () => {
    const { pack } = redactInterfaceCopy({
      spec: miniSpec(),
      tone: "formal",
      locale: "es-ES",
      proposedAt: "2026-06-01T10:00:00.000Z",
    });
    // Orden inverso de hechos: alias no debe cruzar deuda/límite
    const msg = resolveJudgeError(pack, {
      ...creditTrace(),
      factsUsed: {
        "credito.limite": { value: 10000, version: 1, streamPosition: 10 },
        "credito.deuda": { value: 12500, version: 1, streamPosition: 10 },
      },
    });
    expect(msg).toContain("10000");
    expect(msg).toContain("12500");
    expect(msg.toLowerCase()).toMatch(/aprobaci[oó]n|responsable/);
    expect(msg.toLowerCase()).toMatch(/reduce|baja|ajust|solicita/);
    expect(findForbiddenJargon(msg)).toEqual([]);
  });

  it("regenerar sin cambios en la especificación no cambia ningún texto", () => {
    const spec = miniSpec();
    const a = proposeCopyPack({
      spec,
      tone: "formal",
      locale: "es-ES",
      proposedAt: "2026-06-01T10:00:00.000Z",
    });
    const b = proposeCopyPack({
      spec,
      tone: "formal",
      locale: "es-ES",
      proposedAt: "2026-07-01T10:00:00.000Z", // distinta fecha no afecta hash de textos
    });
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.templates.map((t) => t.template)).toEqual(
      b.templates.map((t) => t.template),
    );

    const btn = resolveCopy(a, "action.recibir.button");
    expect(btn).toBe("Recibir mercancía");
  });

  it("rechaza plantillas con jerga o hechos inventados en errores", () => {
    const pack = proposeCopyPack({
      spec: miniSpec(),
      tone: "cercano",
      locale: "es-ES",
      proposedAt: "2026-06-01T10:00:00.000Z",
    });
    expect(() =>
      validateCopyPack({
        ...pack,
        templates: [
          ...pack.templates,
          {
            id: "bad",
            kind: "label",
            key: "bad.tenant",
            template: "Elige el tenant correcto",
            requiredVariables: [],
            locale: "es-ES",
          },
        ],
      }),
    ).toThrow(CopyValidationError);
  });
});
