/**
 * Nivel 5 (parte ejecutable) — concurrencia e idempotencia in-process.
 * Carreras multi-proceso / BD compartida: no_construido hasta adaptador maduro.
 */

import { describe, expect, it } from "vitest";
import { deriveState } from "../../core/derivation.js";
import { ventaArchetype } from "../../archetypes/venta.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../../policies/compiler.js";
import {
  attemptJudgedAdvance,
  collectFactRequests,
  JudgeRejectionError,
} from "../../policies/judge.js";
import {
  FactOptimisticConflictError,
  FactProvider,
} from "../../facts/provider.js";
import { FACT_IDS } from "../../facts/catalog.js";
import { withFactPayload } from "../../facts/index.js";
import type { TransitionEvent } from "../../core/events.js";
import { IdempotencyLedger, identityFromChannel, interpret } from "../../interpreter/index.js";
import type { Interaction } from "../../interpreter/types.js";
import { SqliteEventStore } from "../../adapters/sqlite-event-store.js";
import { EventStoreError } from "../../core/event-store.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "parte_id", "factura_id", "precio", "descuento_pct"],
);

function creditPolicy() {
  return {
    id: "credito-pack",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta" as const,
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "gerente", label: "Gerente" },
    ],
    permissions: [
      {
        id: "perm-aceptar",
        kind: "permiso" as const,
        transitionId: "t_aceptar",
        allowedRoles: ["vendedor", "gerente"],
      },
    ],
    policies: [
      {
        id: "pol-limite-credito",
        kind: "politica" as const,
        transitionId: "t_aceptar",
        requiredFacts: [
          {
            factId: FACT_IDS.PARTE_SALDO_PENDIENTE,
            params: { parteId: "$fields.parte_id" },
          },
        ],
        factCondition: {
          factId: FACT_IDS.PARTE_SALDO_PENDIENTE,
          params: { parteId: "$fields.parte_id" },
          amountField: "importe",
          op: "lte" as const,
          value: 50000,
        },
      },
    ],
  };
}

function baseEvent(
  id: string,
  subjectId: string,
  transitionId: string,
  from: string,
  to: string,
  facts: { parteId: string; importe: number },
): TransitionEvent {
  return withFactPayload(
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
      fromStateId: from,
      toStateId: to,
    },
    facts,
  );
}

describe("Nivel 5 — Concurrencia e idempotencia (ejecutable)", () => {
  it("carrera de crédito: dos pedidos 6k no caben ambos tras deuda 40k (límite 50k)", () => {
    const ruleSet = compilePolicies(creditPolicy(), {
      catalog,
      activationAt: "2026-04-01T00:00:00.000Z",
    });
    const provider = new FactProvider();
    const tenantId = "acme";
    provider.applyEvent(
      tenantId,
      baseEvent("e0", "tx-prev", "t_aceptar", "propuesta", "aceptada", {
        parteId: "cli-2",
        importe: 40000,
      }),
    );

    const tryOrder = (eventId: string, subjectId: string) => {
      const fields = { parte_id: "cli-2", importe: 6000 };
      const requests = collectFactRequests(ruleSet, "t_aceptar", fields);
      const bag = provider.prepare(tenantId, requests);
      try {
        const result = attemptJudgedAdvance({
          subjectId,
          lifecycle: life,
          derived: deriveState(life, []),
          command: {
            transitionId: "t_aceptar",
            eventId,
            actorId: "v1",
            actorKind: "humano",
            occurredAt: "2026-01-02T00:00:00.000Z",
            evidence: {
              kind: "aceptacion",
              reference: "ok",
              recordedAt: "2026-01-02T00:00:00.000Z",
            },
          },
          actor: { id: "v1", kind: "humano", roles: ["vendedor"] },
          evidence: {
            kind: "aceptacion",
            reference: "ok",
            recordedAt: "2026-01-02T00:00:00.000Z",
          },
          fields,
          ruleSet,
          tenantId,
          facts: bag,
        });
        // Orden real: confirmar versión → incorporar evento (como facts.test)
        provider.confirm(bag);
        provider.applyEvent(
          tenantId,
          withFactPayload(result.event, {
            parteId: "cli-2",
            importe: 6000,
          }),
        );
        return "ok" as const;
      } catch (err) {
        if (err instanceof JudgeRejectionError) return "rejected" as const;
        if (err instanceof FactOptimisticConflictError)
          return "conflict" as const;
        throw err;
      }
    };

    const first = tryOrder("e1", "tx-a");
    const second = tryOrder("e2", "tx-b");
    expect(first).toBe("ok");
    expect(second).toBe("rejected");
  });

  it("idempotencia: formulario duplicado → una sola solicitud", () => {
    const ledger = new IdempotencyLedger();
    const identity = identityFromChannel({
      channel: "autoservicio",
      sessionActorId: "u",
      sessionParteId: "p1",
      tenantId: "acme",
      roles: ["cliente"],
    });
    const mk = (id: string): Interaction => ({
      id,
      kind: "formulario",
      channel: "autoservicio",
      occurredAt: "2026-06-01T12:00:00.000Z",
      subjectId: "tx-1",
      clientRequestId: "same-client-req",
      transitionId: "t_aceptar",
      formValues: {
        "evidence.kind": "aceptacion",
        "evidence.reference": "r1",
      },
    });
    const a = interpret(mk("i1"), {
      identity,
      allowedTransitionIds: ["t_aceptar"],
      ledger,
    });
    const b = interpret(mk("i2"), {
      identity,
      allowedTransitionIds: ["t_aceptar"],
      ledger,
    });
    expect(a.kind).toBe("solicitud");
    expect(b.kind).toBe("solicitud");
    if (a.kind === "solicitud" && b.kind === "solicitud") {
      expect(a.request.id).toBe(b.request.id);
      expect(b.idempotentReplay).toBe(true);
    }
  });

  it("SqliteEventStore: append duplicado del mismo id falla (idempotencia de evento)", () => {
    const store = new SqliteEventStore(":memory:");
    const ev: TransitionEvent = {
      id: "ev-dup",
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
    store.append(ev);
    expect(() => store.append(ev)).toThrow(EventStoreError);
    expect(store.all()).toHaveLength(1);
    store.close();
  });
});
