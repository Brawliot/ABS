/**
 * Intérprete + LLM (infra 8A): cassettes, aclaraciones, fallback, guardrail.
 * No modifica tests/interpreter.test.ts.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CassetteLlmAdapter } from "../llm/cassette.js";
import { LlmClient } from "../llm/client.js";
import { LlmProviderError } from "../llm/types.js";
import type { LlmAdapter, LlmRawCompletion } from "../llm/types.js";
import {
  EvalSimulatorLlmAdapter,
  HeuristicInterpreterExtractor,
  interpretAsync,
  LlmInterpreterExtractor,
} from "../interpreter/index.js";
import type { Interaction } from "../interpreter/types.js";

const ALLOWED = [
  "t_aceptar",
  "t_cerrar",
  "t_cancelar_aceptada",
  "t_entrega_parcial",
] as const;

const identity = {
  actorId: "u-1",
  actorKind: "humano" as const,
  roles: ["vendedor"],
  tenantId: "acme",
};

function raw(content: string): LlmRawCompletion {
  return {
    content,
    model: "test",
    modelVersion: "test-1",
    provider: "openai",
    usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    latencyMs: 1,
  };
}

function intentJson(partial: Record<string, unknown>): string {
  return JSON.stringify({
    confidence: 0.92,
    transitionId: "t_aceptar",
    intentLabel: "aceptacion",
    evidenceKind: "aceptacion",
    evidencePendingValidation: false,
    ambiguous: false,
    clarificationQuestion: null,
    parteRefs: [],
    amounts: [],
    dates: [],
    fields: {},
    candidates: [],
    ...partial,
  });
}

function msg(text: string, id = "i-1"): Interaction {
  return {
    id,
    kind: "mensaje",
    channel: "backoffice",
    occurredAt: "2026-06-01T12:00:00.000Z",
    subjectId: "tx-1",
    text,
  };
}

describe("Intérprete LLM — cassettes", () => {
  it("replay de respuesta grabada produce solicitud con transición permitida", async () => {
    const dir = mkdtempSync(join(tmpdir(), "interp-cass-"));
    const inner: LlmAdapter = {
      id: "openai",
      complete: async () =>
        raw(
          intentJson({
            transitionId: "t_aceptar",
            intentLabel: "aceptacion",
            confidence: 0.93,
          }),
        ),
    };

    const clientRecord = new LlmClient({
      adapter: inner,
      mode: "record",
      cassetteDir: dir,
    });
    const exRecord = new LlmInterpreterExtractor({ client: clientRecord });
    const first = await exRecord.extractAsync("Acepto el presupuesto", {
      subjectId: "tx-1",
      allowedTransitionIds: ALLOWED,
      hasAttachments: false,
    });
    expect(first.transitionId).toBe("t_aceptar");

    let innerCalls = 0;
    const countingInner: LlmAdapter = {
      id: "openai",
      complete: async () => {
        innerCalls += 1;
        throw new Error("no debe llamar al proveedor en replay");
      },
    };
    const clientReplay = new LlmClient({
      adapter: countingInner,
      mode: "replay",
      cassetteDir: dir,
    });
    const exReplay = new LlmInterpreterExtractor({ client: clientReplay });
    const second = await exReplay.extractAsync("Acepto el presupuesto", {
      subjectId: "tx-1",
      allowedTransitionIds: ALLOWED,
      hasAttachments: false,
    });
    expect(second.transitionId).toBe("t_aceptar");
    expect(innerCalls).toBe(0);

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("Intérprete LLM — aclaraciones", () => {
  it("García ambiguo → pregunta concreta, no solicitud", async () => {
    const extractor = new LlmInterpreterExtractor({
      client: new LlmClient({ adapter: new EvalSimulatorLlmAdapter() }),
    });
    const outcome = await interpretAsync(
      msg(
        "Ya le he cobrado a García, 300 en efectivo y el resto el mes que viene",
      ),
      {
        identity,
        allowedTransitionIds: ALLOWED,
        asyncTextExtractor: extractor,
        parteDirectory: [
          { ref: "parte:gperez", label: "García Pérez" },
          { ref: "parte:glopez", label: "García López" },
        ],
      },
    );
    expect(outcome.kind).toBe("confirmacion");
    if (outcome.kind === "confirmacion") {
      // Etiquetas pueden ir tokenizadas (sin acentos) por minimización
      expect(outcome.question).toMatch(/garc[ií]a\s+p[eé]rez|garc[ií]a\s+l[oó]pez/i);
    }
  });

  it("confianza baja / ambiguo → confirmación, nunca actúa por suposición", async () => {
    const adapter: LlmAdapter = {
      id: "openai",
      complete: async () =>
        raw(
          intentJson({
            confidence: 0.4,
            transitionId: "t_cerrar",
            ambiguous: true,
            clarificationQuestion: "¿Importe exacto del cobro?",
            intentLabel: "cobro_parcial",
          }),
        ),
    };
    const extractor = new LlmInterpreterExtractor({
      client: new LlmClient({ adapter }),
    });
    const outcome = await interpretAsync(msg("le cobré algo"), {
      identity,
      allowedTransitionIds: ALLOWED,
      asyncTextExtractor: extractor,
    });
    expect(outcome.kind).not.toBe("solicitud");
    expect(["confirmacion", "derivacion_humana"]).toContain(outcome.kind);
  });
});

describe("Intérprete LLM — fallback proveedor", () => {
  it("fallo del proveedor cae al heurístico de dominio", async () => {
    const failing: LlmAdapter = {
      id: "openai",
      complete: async () => {
        throw new LlmProviderError("proveedor caído");
      },
    };
    const extractor = new LlmInterpreterExtractor({
      client: new LlmClient({ adapter: failing }),
    });
    const text = "Acepto el presupuesto";
    const got = await extractor.extractAsync(text, {
      subjectId: "tx-1",
      allowedTransitionIds: ALLOWED,
      hasAttachments: false,
    });
    const baseline = new HeuristicInterpreterExtractor().extract(text, {
      subjectId: "tx-1",
      allowedTransitionIds: ALLOWED,
      hasAttachments: false,
    });
    expect(got.transitionId).toBe(baseline.transitionId);
    expect(got.intentLabel).toBe(baseline.intentLabel);
  });
});

describe("Intérprete LLM — guardrail transición", () => {
  it("transición inexistente no llega a solicitud (Juez)", async () => {
    const adapter: LlmAdapter = {
      id: "openai",
      complete: async () =>
        raw(
          intentJson({
            confidence: 0.99,
            transitionId: "t_inventada_xyz",
            intentLabel: "fraude",
            ambiguous: false,
            clarificationQuestion: null,
          }),
        ),
    };
    const extractor = new LlmInterpreterExtractor({
      client: new LlmClient({ adapter }),
    });
    const outcome = await interpretAsync(msg("haz magia"), {
      identity,
      allowedTransitionIds: ALLOWED,
      asyncTextExtractor: extractor,
    });
    expect(outcome.kind).toBe("confirmacion");
    if (outcome.kind === "confirmacion") {
      expect(outcome.question.length).toBeGreaterThan(5);
    }
  });

  it("CassetteLlmAdapter envuelve respuestas grabadas sin red", async () => {
    const dir = mkdtempSync(join(tmpdir(), "interp-cass2-"));
    const inner: LlmAdapter = {
      id: "openai",
      complete: async () =>
        raw(
          intentJson({
            transitionId: "t_inventada",
            confidence: 0.95,
          }),
        ),
    };
    const cassette = new CassetteLlmAdapter({
      inner,
      dir,
      mode: "record",
    });
    const client = new LlmClient({ adapter: cassette });
    const extractor = new LlmInterpreterExtractor({ client });
    const outcome = await interpretAsync(msg("cancelar todo"), {
      identity,
      allowedTransitionIds: ["t_aceptar"],
      asyncTextExtractor: extractor,
    });
    expect(outcome.kind).not.toBe("solicitud");
    rmSync(dir, { recursive: true, force: true });
  });
});
