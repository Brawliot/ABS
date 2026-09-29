import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../archetypes/venta.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import {
  FACT_IDS,
  FactAccessError,
  FactOptimisticConflictError,
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
import { PolicyCompileError } from "../policies/types.js";
import type { PolicyDocument } from "../policies/types.js";
import { sealAgainstEventStore } from "../facts/provider.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "parte_id", "factura_id", "precio", "descuento_pct"],
);

function creditPolicy(): PolicyDocument {
  return {
    id: "credito-pack",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "gerente", label: "Gerente" },
    ],
    permissions: [
      {
        id: "perm-aceptar",
        kind: "permiso",
        transitionId: "t_aceptar",
        allowedRoles: ["vendedor", "gerente"],
      },
    ],
    policies: [
      {
        id: "pol-limite-credito",
        kind: "politica",
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
          op: "lte",
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

describe("Proveedor de hechos", () => {
  it("cliente con 42.000 € de deuda no acepta pedido de 12.000 €; traza registra 42.000", () => {
    const ruleSet = compilePolicies(creditPolicy(), {
      catalog,
      activationAt: "2026-04-01T00:00:00.000Z",
    });
    const provider = new FactProvider();
    const tenantId = "acme";

    // Deuda previa: tx abierta con 42000
    provider.applyEvent(
      tenantId,
      baseEvent("e0", "tx-prev", "t_aceptar", "propuesta", "aceptada", {
        parteId: "cli-1",
        importe: 42000,
      }),
    );

    const fields = { parte_id: "cli-1", importe: 12000 };
    const requests = collectFactRequests(ruleSet, "t_aceptar", fields);
    const bag = provider.prepare(tenantId, requests);
    expect(bag.get(FACT_IDS.PARTE_SALDO_PENDIENTE, { parteId: "cli-1" })).toBe(
      42000,
    );

    const derived = deriveState(life, []);
    try {
      attemptJudgedAdvance({
        subjectId: "tx-new",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_aceptar",
          eventId: "enew",
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
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(JudgeRejectionError);
      const trace = (err as JudgeRejectionError).trace;
      const used = Object.values(trace.factsUsed ?? {});
      expect(used.some((u) => u.value === 42000)).toBe(true);
      expect(trace.factsStreamPosition).toBe(1);
      expect(trace.reason).toMatch(/42000|54000|lte/i);
    }
  });

  it("dos pedidos simultáneos de 6.000 € no se aprueban ambos si juntos superan el límite", () => {
    const ruleSet = compilePolicies(creditPolicy(), {
      catalog,
      activationAt: "2026-04-01T00:00:00.000Z",
    });
    // Límite 50k; deuda 40.000 → primer pedido 6.000 OK (46k); segundo no (52k)
    const provider = new FactProvider();
    const tenantId = "acme";
    provider.applyEvent(
      tenantId,
      baseEvent("e0", "tx-prev", "t_aceptar", "propuesta", "aceptada", {
        parteId: "cli-2",
        importe: 40000,
      }),
    );

    const fieldsA = { parte_id: "cli-2", importe: 6000 };
    const fieldsB = { parte_id: "cli-2", importe: 6000 };
    const reqs = collectFactRequests(ruleSet, "t_aceptar", fieldsA);
    const bagA = provider.prepare(tenantId, reqs);
    const bagB = provider.prepare(tenantId, reqs);

    const derived = deriveState(life, []);
    const common = {
      lifecycle: life,
      derived,
      ruleSet,
      tenantId,
      actor: { id: "v1", kind: "humano" as const, roles: ["vendedor"] },
      evidence: {
        kind: "aceptacion" as const,
        reference: "ok",
        recordedAt: "2026-01-02T00:00:00.000Z",
      },
    };

    const okA = attemptJudgedAdvance({
      ...common,
      subjectId: "tx-a",
      command: {
        transitionId: "t_aceptar",
        eventId: "ea",
        actorId: "v1",
        actorKind: "humano",
        occurredAt: "2026-01-02T00:00:00.000Z",
        evidence: common.evidence,
      },
      fields: fieldsA,
      facts: bagA,
    });

    // Confirmar A e incorporar al flujo → versiona el hecho
    const eventA = withFactPayload(okA.event, {
      parteId: "cli-2",
      importe: 6000,
    });
    provider.confirm(bagA);
    provider.applyEvent(tenantId, eventA);

    // B con bolsa antigua → conflicto optimista
    expect(() => provider.confirm(bagB)).toThrow(FactOptimisticConflictError);

    const refreshed = provider.confirmOrRefresh(bagB, reqs);
    expect(refreshed.ok).toBe(false);

    expect(() =>
      attemptJudgedAdvance({
        ...common,
        subjectId: "tx-b",
        command: {
          transitionId: "t_aceptar",
          eventId: "eb",
          actorId: "v1",
          actorKind: "humano",
          occurredAt: "2026-01-02T00:01:00.000Z",
          evidence: common.evidence,
        },
        fields: fieldsB,
        facts: refreshed.bag,
      }),
    ).toThrow(JudgeRejectionError);
  });

  it("reproducir eventos desde cero da los mismos valores en cada posición", () => {
    const provider = new FactProvider();
    const tenantId = "acme";
    const events = [
      baseEvent("e1", "tx1", "t_aceptar", "propuesta", "aceptada", {
        parteId: "p",
        importe: 1000,
      }),
      baseEvent("e2", "tx2", "t_aceptar", "propuesta", "aceptada", {
        parteId: "p",
        importe: 2500,
      }),
      baseEvent("e3", "tx1", "t_cerrar", "en_entrega", "cerrada", {
        parteId: "p",
        importe: 1000,
      }),
    ];
    provider.rebuild(tenantId, events);

    const at1 = provider.projection(tenantId).readAt(
      FACT_IDS.PARTE_SALDO_PENDIENTE,
      { parteId: "p" },
      1,
    );
    const at2 = provider.projection(tenantId).readAt(
      FACT_IDS.PARTE_SALDO_PENDIENTE,
      { parteId: "p" },
      2,
    );
    const at3 = provider.projection(tenantId).readAt(
      FACT_IDS.PARTE_SALDO_PENDIENTE,
      { parteId: "p" },
      3,
    );

    expect(at1.value).toBe(1000);
    expect(at2.value).toBe(3500);
    expect(at3.value).toBe(2500);

    const again = new FactProvider();
    again.rebuild(tenantId, events);
    expect(
      again.projection(tenantId).readAt(
        FACT_IDS.PARTE_SALDO_PENDIENTE,
        { parteId: "p" },
        2,
      ).value,
    ).toBe(3500);
  });

  it("una guarda que intente leer el almacén directamente falla", () => {
    const ctx = sealAgainstEventStore({
      transactionId: "x",
      fields: {},
      eventStore: { all: () => [] },
    } as unknown as Record<string, unknown>);
    expect(() => (ctx as { eventStore: unknown }).eventStore).toThrow(
      FactAccessError,
    );
    expect(() => (ctx as { store: unknown }).store).toThrow(FactAccessError);
  });

  it("compilar una regla que use un hecho inexistente falla", () => {
    const doc: PolicyDocument = {
      ...creditPolicy(),
      policies: [
        {
          id: "bad",
          kind: "politica",
          transitionId: "t_aceptar",
          requiredFacts: [
            { factId: "parte.hecho_fantasma", params: { parteId: "x" } },
          ],
          condition: { field: "importe", op: "gt", value: 0 },
        },
      ],
    };
    expect(() =>
      compilePolicies(doc, {
        catalog,
        activationAt: "2026-04-01T00:00:00.000Z",
      }),
    ).toThrow(PolicyCompileError);
    try {
      compilePolicies(doc, {
        catalog,
        activationAt: "2026-04-01T00:00:00.000Z",
      });
    } catch (err) {
      expect((err as PolicyCompileError).code).toBe("UNKNOWN_FACT");
    }
  });

  it("un hecho nunca incluye datos de otra empresa", () => {
    const provider = new FactProvider();
    provider.applyEvent(
      "acme",
      baseEvent("e1", "tx1", "t_aceptar", "propuesta", "aceptada", {
        parteId: "shared-name",
        importe: 9999,
      }),
    );
    provider.applyEvent(
      "globex",
      baseEvent("e2", "tx2", "t_aceptar", "propuesta", "aceptada", {
        parteId: "shared-name",
        importe: 1,
      }),
    );

    expect(
      provider
        .prepare("acme", [
          {
            factId: FACT_IDS.PARTE_SALDO_PENDIENTE,
            params: { parteId: "shared-name" },
          },
        ])
        .get(FACT_IDS.PARTE_SALDO_PENDIENTE, { parteId: "shared-name" }),
    ).toBe(9999);

    expect(
      provider
        .prepare("globex", [
          {
            factId: FACT_IDS.PARTE_SALDO_PENDIENTE,
            params: { parteId: "shared-name" },
          },
        ])
        .get(FACT_IDS.PARTE_SALDO_PENDIENTE, { parteId: "shared-name" }),
    ).toBe(1);
  });
});
