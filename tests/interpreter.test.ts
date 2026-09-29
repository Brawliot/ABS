import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  IdempotencyLedger,
  identityFromChannel,
  interpret,
} from "../interpreter/index.js";
import type { Interaction } from "../interpreter/types.js";
import {
  INTERPRETER_MESSAGE_BANK,
  scoreInterpreterCase,
} from "./bank/interpreter-messages.js";

const ALLOWED = [
  "t_aceptar",
  "t_cerrar",
  "t_cancelar_aceptada",
  "t_cancelar_propuesta",
  "t_entrega_parcial",
  "t_iniciar_entrega",
] as const;

const identity = identityFromChannel({
  channel: "autoservicio",
  sessionActorId: "u-cli",
  sessionParteId: "parte-1",
  tenantId: "acme",
  roles: ["cliente"],
});

describe("Intérprete MVP", () => {
  it('"Ya he pagado" con captura → solicitud con evidencia pendiente, no pago confirmado', () => {
    const interaction: Interaction = {
      id: "i-pago",
      kind: "mensaje",
      channel: "autoservicio",
      occurredAt: "2026-06-01T12:00:00.000Z",
      subjectId: "tx-1",
      text: "Ya he pagado, adjunto la captura del bizum.",
      attachments: [
        { id: "img-1", mediaType: "image/jpeg", label: "captura" },
      ],
    };
    const outcome = interpret(interaction, {
      identity,
      allowedTransitionIds: ALLOWED,
    });
    expect(outcome.kind).toBe("solicitud");
    if (outcome.kind !== "solicitud") return;
    expect(outcome.request.transitionId).toBe("t_cerrar");
    expect(outcome.request.evidenceValidationStatus).toBe(
      "pendiente_validacion",
    );
    expect(outcome.request.evidence.kind).toBe("fisica");
    expect(outcome.request.fields.pago_confirmado).toBe(false);
    expect(outcome.request.fields.declaracion_pago).toBe(true);
    // El Intérprete no ejecuta: no hay EventStore ni attemptJudgedAdvance aquí
  });

  it("mensaje ambiguo provoca confirmación, no transición", () => {
    const outcome = interpret(
      {
        id: "i-amb",
        kind: "mensaje",
        channel: "autoservicio",
        occurredAt: "2026-06-01T12:00:00.000Z",
        subjectId: "tx-1",
        text: "Hola",
      },
      { identity, allowedTransitionIds: ALLOWED },
    );
    expect(outcome.kind).toBe("confirmacion");
    if (outcome.kind === "confirmacion") {
      expect(outcome.question.length).toBeGreaterThan(5);
    }
  });

  it("formulario enviado dos veces genera una única solicitud", () => {
    const ledger = new IdempotencyLedger();
    const base = {
      kind: "formulario" as const,
      channel: "backoffice" as const,
      occurredAt: "2026-06-01T12:00:00.000Z",
      subjectId: "tx-1",
      transitionId: "t_aceptar",
      clientRequestId: "form-submit-99",
      formValues: {
        "evidence.kind": "aceptacion",
        "evidence.reference": "firma-1",
      },
    };
    const staff = identityFromChannel({
      channel: "backoffice",
      sessionActorId: "u-vend",
      tenantId: "acme",
      roles: ["vendedor"],
    });
    const a = interpret(
      { ...base, id: "click-1" },
      { identity: staff, allowedTransitionIds: ALLOWED, ledger },
    );
    const b = interpret(
      { ...base, id: "click-2" },
      { identity: staff, allowedTransitionIds: ALLOWED, ledger },
    );
    expect(a.kind).toBe("solicitud");
    expect(b.kind).toBe("solicitud");
    if (a.kind !== "solicitud" || b.kind !== "solicitud") return;
    expect(a.request.id).toBe(b.request.id);
    expect(b.idempotentReplay).toBe(true);
    expect(ledger.size()).toBe(1);
  });

  it("mide precisión del Intérprete con 30 mensajes realistas", () => {
    expect(INTERPRETER_MESSAGE_BANK.length).toBe(30);
    let correct = 0;
    const failures: { id: string; expected: string; got: string }[] = [];

    for (const gold of INTERPRETER_MESSAGE_BANK) {
      const outcome = interpret(
        {
          id: gold.id,
          kind: "mensaje",
          channel: "autoservicio",
          occurredAt: "2026-06-01T12:00:00.000Z",
          subjectId: "tx-bank",
          text: gold.text,
          ...(gold.hasAttachment
            ? {
                attachments: [
                  { id: `att-${gold.id}`, mediaType: "image/png" },
                ],
              }
            : {}),
        },
        { identity, allowedTransitionIds: ALLOWED },
      );

      const projected =
        outcome.kind === "solicitud"
          ? {
              kind: "solicitud" as const,
              transitionId: outcome.request.transitionId,
              intentLabel: outcome.request.intentLabel,
              evidenceValidationStatus:
                outcome.request.evidenceValidationStatus,
              fields: outcome.request.fields,
            }
          : { kind: outcome.kind };

      const ok = scoreInterpreterCase(gold, projected);
      if (ok) correct += 1;
      else {
        failures.push({
          id: gold.id,
          expected: JSON.stringify(gold.expected),
          got: JSON.stringify(projected),
        });
      }
    }

    const accuracy = correct / INTERPRETER_MESSAGE_BANK.length;
    const accuracyPct = Number((accuracy * 100).toFixed(2));
    const report = {
      measuredAt: new Date().toISOString(),
      n: INTERPRETER_MESSAGE_BANK.length,
      correct,
      accuracy,
      accuracyPct,
      extractor: "HeuristicInterpreterExtractor",
      threshold: 0.85,
      failures,
    };
    const outPath = resolve("tests/bank/interpreter-report.json");
    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

    console.log(
      `\n[INTERPRETER] accuracy=${accuracyPct}% (${correct}/${INTERPRETER_MESSAGE_BANK.length}) → ${outPath}`,
    );

    expect(accuracyPct).toBeGreaterThanOrEqual(85);
    expect(failures).toEqual([]);
  });
});
