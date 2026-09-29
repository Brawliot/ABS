/**
 * Infra LLM — pruebas nuevas (no editan suite existente).
 * Deterministas: HeuristicLlmAdapter / fetch inyectado / cassettes. Sin red real.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CassetteLlmAdapter,
  HeuristicLlmAdapter,
  LlmClient,
  LlmProviderError,
  LlmTimeoutError,
  OpenAiLlmAdapter,
  assertNoObviousPii,
  cassetteFingerprint,
  clearMemoryLog,
  estimateCostUsd,
  getMemoryLog,
  loadCassette,
  minimizePayload,
  minimizeText,
  parseAndValidate,
  privacyDocFor,
  resolveConfidenceThreshold,
  withConfidenceSchema,
  type LlmAdapter,
  type LlmCompletionRequest,
  type LlmRawCompletion,
} from "../llm/index.js";
import { adapterInventory } from "../adapters/index.js";

const IntentSchema = withConfidenceSchema({
  transitionId: z.string().nullable(),
  intentLabel: z.string(),
});

afterEach(() => {
  clearMemoryLog();
});

function rawFrom(content: string, latencyMs = 1): LlmRawCompletion {
  return {
    content,
    model: "gpt-4o-mini",
    modelVersion: "gpt-4o-mini-2024",
    provider: "openai",
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latencyMs,
  };
}

class ScriptedAdapter implements LlmAdapter {
  readonly id = "openai" as const;
  private i = 0;
  constructor(private readonly scripts: readonly (() => LlmRawCompletion | Promise<LlmRawCompletion> | Error)[]) {}
  async complete(
    _req: LlmCompletionRequest,
    signal?: AbortSignal,
  ): Promise<LlmRawCompletion> {
    if (signal?.aborted) {
      const e = new Error("Aborted");
      e.name = "AbortError";
      throw e;
    }
    const step = this.scripts[this.i] ?? this.scripts[this.scripts.length - 1]!;
    this.i += 1;
    const out = await step();
    if (out instanceof Error) throw out;
    return out;
  }
}

describe("LLM infra — adaptador e inventario", () => {
  it("marca adaptador llm como built", () => {
    const llm = adapterInventory().find((a) => a.id === "llm");
    expect(llm?.built).toBe(true);
  });

  it("HeuristicLlmAdapter no usa red y devuelve JSON", async () => {
    const a = new HeuristicLlmAdapter(() =>
      JSON.stringify({ confidence: 0.9, transitionId: "t_cerrar", intentLabel: "pago" }),
    );
    const r = await a.complete({
      componentId: "interpreter",
      callKind: "interpreter.extract_intent",
      system: "sys",
      user: "user",
      schemaName: "intent",
      jsonSchema: { type: "object" },
    });
    expect(r.provider).toBe("heuristic");
    expect(JSON.parse(r.content).confidence).toBe(0.9);
  });
});

describe("LLM infra — validación Zod + reintento", () => {
  it("acepta respuesta válida con confidence", () => {
    const data = parseAndValidate(
      JSON.stringify({
        confidence: 0.85,
        transitionId: "t_cerrar",
        intentLabel: "pago",
      }),
      IntentSchema,
    );
    expect(data.transitionId).toBe("t_cerrar");
  });

  it("rechaza JSON mal formado y reintenta una vez hasta éxito", async () => {
    const adapter = new ScriptedAdapter([
      () => rawFrom("NOT_JSON{{{"),
      () =>
        rawFrom(
          JSON.stringify({
            confidence: 0.88,
            transitionId: "t_cancelar_aceptada",
            intentLabel: "cancelar",
          }),
        ),
    ]);
    const client = new LlmClient({ adapter });
    const out = await client.completeStructured({
      componentId: "interpreter",
      callKind: "interpreter.extract_intent",
      system: "extrae intención",
      userPayload: "quiero cancelar subject:tx-1",
      schema: IntentSchema,
      schemaName: "intent",
      jsonSchema: { type: "object", additionalProperties: false },
      failureMode: "noop",
    });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.data.intentLabel).toBe("cancelar");
      expect(out.log.validation).toBe("retry_accepted");
    }
  });

  it("tras dos fallos de esquema aplica failureMode=noop (no inventa)", async () => {
    const adapter = new ScriptedAdapter([
      () => rawFrom("{}"),
      () => rawFrom('{"confidence":"bad"}'),
    ]);
    const client = new LlmClient({ adapter });
    const out = await client.completeStructured({
      componentId: "interpreter",
      callKind: "interpreter.extract_intent",
      system: "s",
      userPayload: "x",
      schema: IntentSchema,
      schemaName: "intent",
      jsonSchema: { type: "object" },
      failureMode: "noop",
    });
    expect(out.kind).toBe("noop");
    expect(out.log.validation).toBe("retry_rejected");
  });

  it("failureMode=heuristic usa fallback determinista", async () => {
    const adapter = new ScriptedAdapter([
      () => {
        throw new LlmProviderError("boom");
      },
    ]);
    const client = new LlmClient({ adapter });
    const out = await client.completeStructured({
      componentId: "consultant",
      callKind: "consultant.extract_query",
      system: "s",
      userPayload: "saldo",
      schema: IntentSchema,
      schemaName: "q",
      jsonSchema: { type: "object" },
      failureMode: "heuristic",
      heuristic: () => ({
        confidence: 0.75,
        transitionId: null,
        intentLabel: "fallback",
      }),
    });
    expect(out.kind).toBe("heuristic_fallback");
    if (out.kind === "heuristic_fallback") {
      expect(out.data.intentLabel).toBe("fallback");
    }
  });
});

describe("LLM infra — timeout y fallo proveedor", () => {
  it("timeout → LlmTimeoutError / ask_clarification", async () => {
    const adapter: LlmAdapter = {
      id: "openai",
      complete: async (_r, signal) =>
        new Promise((_resolve, reject) => {
          const t = setTimeout(() => {
            /* never */
          }, 60_000);
          signal?.addEventListener("abort", () => {
            clearTimeout(t);
            const e = new Error("Aborted");
            e.name = "AbortError";
            reject(e);
          });
        }),
    };
    const client = new LlmClient({ adapter, defaultTimeoutMs: 30 });
    const out = await client.completeStructured({
      componentId: "designer",
      callKind: "designer.propose_tokens",
      system: "s",
      userPayload: "taller",
      schema: IntentSchema,
      schemaName: "d",
      jsonSchema: { type: "object" },
      failureMode: "ask_clarification",
      timeoutMs: 30,
    });
    expect(out.kind).toBe("ask_clarification");
    expect(out.log.outcome).toBe("ask_clarification");
  });

  it("OpenAiLlmAdapter propaga HTTP error vía fetch inyectado", async () => {
    const adapter = new OpenAiLlmAdapter({
      apiKey: "sk-test",
      fetchImpl: (async () =>
        new Response("nope", { status: 503 })) as typeof fetch,
    });
    await expect(
      adapter.complete({
        componentId: "redactor",
        callKind: "redactor.propose_copy",
        system: "s",
        user: "u",
        schemaName: "c",
        jsonSchema: { type: "object" },
      }),
    ).rejects.toBeInstanceOf(LlmProviderError);
  });
});

describe("LLM infra — confianza", () => {
  it("umbral por componente: por debajo pide aclaración", async () => {
    expect(resolveConfidenceThreshold("interpreter")).toBe(0.7);
    const adapter = new ScriptedAdapter([
      () =>
        rawFrom(
          JSON.stringify({
            confidence: 0.4,
            transitionId: null,
            intentLabel: "ambiguo",
          }),
        ),
    ]);
    const client = new LlmClient({ adapter });
    const out = await client.completeStructured({
      componentId: "interpreter",
      callKind: "interpreter.extract_intent",
      system: "s",
      userPayload: "hola",
      schema: IntentSchema,
      schemaName: "intent",
      jsonSchema: { type: "object" },
      failureMode: "noop",
      confidenceThreshold: 0.7,
    });
    expect(out.kind).toBe("ask_clarification");
    if (out.kind === "ask_clarification") {
      expect(out.data?.confidence).toBe(0.4);
    }
  });
});

describe("LLM infra — privacidad / minimización", () => {
  it("elimina email, teléfono, DNI, IBAN y sustituye ids por refs", () => {
    const raw =
      "Cliente Ana Pérez email ana.perez@correo.com tel +34 612 345 678 DNI 12345678Z IBAN ES91 2100 0418 4502 0005 1332 expediente tx-abc-99";
    const m = minimizeText(raw, {
      refs: { "tx-abc-99": "subject:tx-abc-99" },
    });
    expect(m.text).not.toMatch(/ana\.perez@correo\.com/i);
    expect(m.text).not.toMatch(/12345678Z/);
    expect(m.text).not.toMatch(/ES91/);
    expect(m.text).toContain("subject:tx-abc-99");
    expect(m.text).not.toContain("tx-abc-99".replace("tx-abc-99", "SHOULD_NOT"));
    expect(assertNoObviousPii(m.text)).toEqual([]);
    expect(m.redacted.length).toBeGreaterThan(0);
  });

  it("minimizePayload sobre objeto y documenta call kinds RGPD", () => {
    const m = minimizePayload({
      email: "a@b.com",
      msg: "llamar al 600111222",
    });
    expect(m.text).toContain("[EMAIL]");
    expect(privacyDocFor("interpreter.extract_intent")?.outboundForbidden).toContain(
      "email",
    );
    expect(privacyDocFor("diagnosis.extract_answers")).toBeTruthy();
  });

  it("el log no contiene el texto de usuario ni PII", async () => {
    const adapter = new ScriptedAdapter([
      () =>
        rawFrom(
          JSON.stringify({
            confidence: 0.9,
            transitionId: "t_cerrar",
            intentLabel: "ok",
          }),
        ),
    ]);
    const client = new LlmClient({ adapter });
    await client.completeStructured({
      componentId: "interpreter",
      callKind: "interpreter.extract_intent",
      system: "s",
      userPayload: "secret maria.lopez@empresa.es quiere pagar",
      schema: IntentSchema,
      schemaName: "intent",
      jsonSchema: { type: "object" },
      failureMode: "noop",
    });
    const logs = getMemoryLog();
    expect(logs.length).toBe(1);
    const blob = JSON.stringify(logs[0]);
    expect(blob).not.toMatch(/maria\.lopez@empresa\.es/i);
    expect(logs[0]!.userContentHash.length).toBe(16);
    expect(logs[0]!.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    expect(estimateCostUsd("gpt-4o-mini", logs[0]!.usage)).toBeGreaterThanOrEqual(0);
  });
});

describe("LLM infra — cassettes", () => {
  it("record + replay sin llamar al inner en replay", async () => {
    const dir = mkdtempSync(join(tmpdir(), "llm-cass-"));
    let innerCalls = 0;
    const inner: LlmAdapter = {
      id: "openai",
      complete: async () => {
        innerCalls += 1;
        return rawFrom(
          JSON.stringify({
            confidence: 0.91,
            transitionId: "t_aceptar",
            intentLabel: "aceptar",
          }),
        );
      },
    };

    const req: LlmCompletionRequest = {
      componentId: "interpreter",
      callKind: "interpreter.extract_intent",
      system: "sys-cassette",
      user: "minimized user",
      schemaName: "intent",
      jsonSchema: { type: "object" },
    };

    const recorder = new CassetteLlmAdapter({
      inner,
      dir,
      mode: "record",
    });
    await recorder.complete(req);
    expect(innerCalls).toBe(1);
    const fp = cassetteFingerprint(req);
    expect(loadCassette(dir, fp)).toBeTruthy();

    const player = new CassetteLlmAdapter({
      inner,
      dir,
      mode: "replay",
    });
    const replayed = await player.complete(req);
    expect(innerCalls).toBe(1); // no nueva llamada
    expect(replayed.provider).toBe("cassette");
    expect(JSON.parse(replayed.content).intentLabel).toBe("aceptar");

    const client = new LlmClient({
      adapter: inner,
      mode: "replay",
      cassetteDir: dir,
    });
    const out = await client.completeStructured({
      componentId: "interpreter",
      callKind: "interpreter.extract_intent",
      system: "sys-cassette",
      userPayload: "minimized user",
      schema: IntentSchema,
      schemaName: "intent",
      jsonSchema: { type: "object" },
      failureMode: "noop",
    });
    expect(out.kind).toBe("ok");
    expect(innerCalls).toBe(1);

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("LLM infra — timeout tipado", () => {
  it("LlmTimeoutError es distinguible", () => {
    const e = new LlmTimeoutError("t");
    expect(e.name).toBe("LlmTimeoutError");
  });
});
