/**
 * Nivel 2 — Integración de puentes con piezas reales (ambos lados).
 */

import { describe, expect, it } from "vitest";
import { deriveState } from "../../core/derivation.js";
import { InMemoryEventStore } from "../../core/event-store.js";
import { ventaArchetype } from "../../archetypes/venta.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../../policies/compiler.js";
import {
  attemptJudgedAdvance,
  JudgeRejectionError,
} from "../../policies/judge.js";
import { FactProvider } from "../../facts/provider.js";
import { FACT_IDS } from "../../facts/catalog.js";
import {
  identityFromChannel,
  interpret,
} from "../../interpreter/index.js";
import type { Interaction } from "../../interpreter/types.js";
import { readThroughFilter, type FilterReader, type FilterRow } from "../../filter/index.js";
import {
  ExperienceTelemetryStore,
  recordAbandonWithoutBusinessEvent,
  buildTelemetryRecord,
} from "../../bridges/presentation-intelligence/index.js";
import { acceptRecommendation } from "../../presenter/index.js";
import type { Insight } from "../../contracts/insight.js";
import {
  generateUiSpec,
  buildConcesionariaGeneratorInput,
  structuralHash,
} from "../../generator/index.js";
import { proposeDesignSystems, hashDesignSystem } from "../../design/index.js";
import { bindDesignToUiSpec } from "../../presentation/bind-design.js";
import { runQaPass } from "../../generator/qa/index.js";
import { runSecurityReview } from "../../generator/security/index.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "parte_id", "factura_id", "base_imponible"],
);

describe("Nivel 2 — Integración puentes", () => {
  it("0↔1: Compilador + Juez rechazan rol no autorizado", () => {
    const ruleSet = compilePolicies(
      {
        id: "int-01",
        version: "1",
        companyId: "c",
        archetypeId: "venta",
        roles: [{ id: "vendedor", label: "V" }],
        permissions: [
          {
            id: "p",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor"],
          },
        ],
      },
      { catalog, activationAt: "2026-01-01T00:00:00.000Z" },
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "e1",
          actorId: "u",
          actorKind: "humano",
          occurredAt: "2026-01-01T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        actor: { id: "u", kind: "humano", roles: ["otro"] },
        evidence: {
          kind: "aceptacion",
          reference: "r",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        fields: { importe: 10 },
        ruleSet,
      }),
    ).toThrow(JudgeRejectionError);
  });

  it("hechos↔juez: FactProvider prepara bolsa sellada por tenant", () => {
    const business = new InMemoryEventStore();
    const provider = new FactProvider();
    provider.attachStore("t1", business);
    const bag = provider.prepare("t1", [
      {
        factId: FACT_IDS.PARTE_SALDO_PENDIENTE,
        params: { parteId: "parte:1" },
      },
    ]);
    expect(bag.tenantId).toBe("t1");
    expect(
      typeof bag.get(FACT_IDS.PARTE_SALDO_PENDIENTE, { parteId: "parte:1" }),
    ).toBe("number");
  });

  it("intérprete no ejecuta el Juez (solo solicitud/confirmación)", () => {
    const identity = identityFromChannel({
      channel: "autoservicio",
      sessionActorId: "u-cli",
      sessionParteId: "parte-1",
      tenantId: "acme",
      roles: ["cliente"],
    });
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
      allowedTransitionIds: ["t_cerrar", "t_aceptar"],
    });
    expect(["solicitud", "confirmacion", "rechazo"].includes(outcome.kind)).toBe(
      true,
    );
  });

  it("filtro: deniega filas de otra sede/tenant vía readThroughFilter", () => {
    const ruleSet = compilePolicies(
      {
        id: "f",
        version: "1",
        companyId: "c",
        archetypeId: "venta",
        roles: [{ id: "vendedor", label: "V" }],
        organization: {
          sedes: [
            { id: "sede-a", label: "A" },
            { id: "sede-b", label: "B" },
          ],
          equipos: [
            { id: "eq-a", label: "EA", sedeId: "sede-a" },
            { id: "eq-b", label: "EB", sedeId: "sede-b" },
          ],
          assignments: [
            {
              actorId: "u-a",
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
            allowedRoles: ["vendedor"],
            visibility: { scope: "sede" },
          },
        ],
      },
      { catalog, activationAt: "2026-01-01T00:00:00.000Z" },
    );
    const rows: FilterRow[] = [
      {
        kind: "transaccion",
        id: "tx-a",
        tenantId: "acme",
        sedeId: "sede-a",
        fields: { importe: 1 },
      },
      {
        kind: "transaccion",
        id: "tx-b",
        tenantId: "acme",
        sedeId: "sede-b",
        fields: { importe: 2 },
      },
    ];
    const reader: FilterReader = {
      id: "u-a",
      roles: ["vendedor"],
      tenantId: "acme",
    };
    const result = readThroughFilter(reader, rows, ruleSet);
    expect(result.items.map((i) => i.row.id)).toEqual(["tx-a"]);
    expect(result.denied.some((d) => d.rowId === "tx-b")).toBe(true);
  });

  it("UX bridge: abandono no escribe en EventStore de negocio", () => {
    const business = new InMemoryEventStore();
    const telemetry = new ExperienceTelemetryStore();
    const record = buildTelemetryRecord({
      id: "ux-1",
      kind: "abandon",
      at: "2026-06-01T12:00:00.000Z",
      sessionId: "sess-1",
      actorOrParteId: "parte-x",
      tenantId: "acme",
      recorridoId: "r1",
      stepId: "pago",
    });
    const { businessEventCount } = recordAbandonWithoutBusinessEvent({
      telemetry,
      businessStore: business,
      record,
    });
    expect(businessEventCount).toBe(0);
    expect(business.all()).toHaveLength(0);
    expect(telemetry.size()).toBe(1);
  });

  it("presentador→intérprete: aceptar recomendación → TransitionRequest", () => {
    const insight: Insight = {
      id: "ins.reco.aceptar",
      type: "recomendacion",
      subject: {
        kind: "transaccion",
        id: "tx-reco-1",
        tenantId: "acme",
        sedeId: "sede-a",
      },
      title: "Aceptar propuesta",
      summary: "Condiciones favorables",
      baseFacts: [
        { id: "f-imp", label: "Importe", value: 500, fieldKey: "importe" },
      ],
      confidence: 0.88,
      generatedAt: "2026-06-01T10:00:00.000Z",
      expiresAt: "2026-12-01T00:00:00.000Z",
      suggestedAction: {
        transitionId: "t_aceptar",
        label: "Aceptar",
        evidenceKind: "aceptacion",
        evidenceReference: "insight-reco",
        fields: { importe: 500 },
      },
      preferredModuleId: "mod.crm",
    };
    const { outcome, request } = acceptRecommendation({
      insight,
      identity: {
        actorId: "u-vend",
        actorKind: "humano",
        roles: ["vendedor"],
        tenantId: "acme",
      },
      interactionId: "click-1",
      occurredAt: "2026-06-01T00:00:00.000Z",
      channel: "backoffice",
      allowedTransitionIds: ["t_aceptar"],
    });
    expect(outcome.kind).toBe("solicitud");
    expect(request?.transitionId).toBe("t_aceptar");
  });

  it("diseñador↔generador: bind no altera structuralHash", () => {
    const spec = generateUiSpec(buildConcesionariaGeneratorInput());
    const h0 = structuralHash(spec);
    const ds = proposeDesignSystems({
      companyId: "c",
      businessDescription: "Concesionaria",
      identity: {},
    }).proposals[0]!;
    bindDesignToUiSpec({
      spec,
      designSystem: ds,
      designContentHash: hashDesignSystem(ds),
      roleId: "comercial",
      channel: "backoffice",
    });
    expect(structuralHash(spec)).toBe(h0);
  });

  it("generador↔probador↔seguridad: venta crédito cierra; sin críticos seguridad", () => {
    const input = buildConcesionariaGeneratorInput();
    const spec = generateUiSpec(input);
    const qa = runQaPass(input, spec);
    const sec = runSecurityReview(input, spec);
    expect(
      qa.scenarios.some((s) => s.id === "credit-sale" && s.reachedTerminal),
    ).toBe(true);
    expect(sec.deliveryBlocked).toBe(false);
  });
});
