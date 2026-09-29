import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../archetypes/venta.js";
import { deriveState } from "../core/derivation.js";
import { InMemoryEventStore } from "../core/event-store.js";
import type { DomainEvent, TransitionEvent } from "../core/events.js";
import {
  DeviationObserver,
  ObserverWriteError,
  projectDeviations,
} from "../observer/index.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import {
  ForceNotAllowedError,
  attemptJudgedAdvance,
} from "../policies/judge.js";
import type { CompiledRuleSet, PolicyDocument } from "../policies/types.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "factura_id", "precio"],
);

function pack(): CompiledRuleSet {
  const doc: PolicyDocument = {
    id: "obs-pack",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "gerente", label: "Gerente" },
      { id: "supervisor", label: "Supervisor" },
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
        id: "pol-umbral",
        kind: "politica",
        transitionId: "t_aceptar",
        approval: {
          when: { field: "importe", op: "gt", value: 10000 },
          requiredRole: "gerente",
        },
      },
    ],
    compliance: [
      {
        id: "comp-factura",
        kind: "cumplimiento",
        transitionId: "t_cerrar",
        requiredEvidence: { kind: "fisica", referenceType: "factura" },
        invariant: {
          id: "inv_factura",
          predicate: "field_present:factura_id",
          appliesInStates: ["en_entrega"],
          description: "Factura obligatoria",
        },
      },
    ],
  };
  return compilePolicies(doc, {
    catalog,
    activationAt: "2026-04-01T00:00:00.000Z",
  });
}

const ruleSet = pack();
const guardRuleId = "guard:perm-aceptar";

describe("Vía de forzado", () => {
  it("forzar sin motivo falla; forzar sin permiso de forzado falla", () => {
    const derived = deriveState(life, []);
    const base = {
      subjectId: "tx-f",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_aceptar" as const,
        eventId: "e1",
        actorId: "becario",
        actorKind: "humano" as const,
        occurredAt: "2026-01-01T00:00:00.000Z",
        evidence: {
          kind: "aceptacion" as const,
          reference: "x",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      actor: { id: "becario", kind: "humano" as const, roles: [] as string[] },
      evidence: {
        kind: "aceptacion" as const,
        reference: "x",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      fields: { importe: 100 },
      ruleSet,
    };

    expect(() =>
      attemptJudgedAdvance({
        ...base,
        force: { reason: "", allowedForceRuleIds: [guardRuleId] },
      }),
    ).toThrow(ForceNotAllowedError);

    expect(() =>
      attemptJudgedAdvance({
        ...base,
        force: {
          reason: "urgencia cliente",
          allowedForceRuleIds: ["otra-regla"],
        },
      }),
    ).toThrow(/sin permiso explícito/i);
  });

  it("forzar una guarda de Cumplimiento falla siempre, con cualquier permiso", () => {
    const toEntrega: TransitionEvent[] = [
      {
        id: "a1",
        kind: "transicion",
        subjectId: "tx-c",
        occurredAt: "2026-01-01T00:00:00.000Z",
        actorId: "g",
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
        id: "a2",
        kind: "transicion",
        subjectId: "tx-c",
        occurredAt: "2026-01-01T01:00:00.000Z",
        actorId: "s",
        actorKind: "sistema",
        evidence: {
          kind: "sistema",
          reference: "r",
          recordedAt: "2026-01-01T01:00:00.000Z",
        },
        transitionId: "t_iniciar_entrega",
        fromStateId: "aceptada",
        toStateId: "en_entrega",
      },
    ];
    const derived = deriveState(life, toEntrega);

    const complianceRuleIds = ruleSet.rules
      .filter((r) => r.sourceKind === "cumplimiento")
      .map((r) => r.id);

    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-c",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_cerrar",
          eventId: "c1",
          actorId: "op",
          actorKind: "sistema",
          occurredAt: "2026-01-02T00:00:00.000Z",
          evidence: {
            kind: "fisica",
            reference: "albaran:1",
            recordedAt: "2026-01-02T00:00:00.000Z",
          },
          world: {
            balance: 0,
            resourcesSettled: true,
            evidenceComplete: true,
          },
        },
        actor: { id: "op", kind: "sistema", roles: ["gerente"] },
        evidence: {
          kind: "fisica",
          reference: "albaran:1",
          recordedAt: "2026-01-02T00:00:00.000Z",
          referenceType: "albaran",
        },
        fields: {},
        ruleSet,
        force: {
          reason: "cliente VIP exige cierre",
          allowedForceRuleIds: complianceRuleIds,
        },
      }),
    ).toThrow(ForceNotAllowedError);

    try {
      attemptJudgedAdvance({
        subjectId: "tx-c",
        lifecycle: life,
        derived,
        command: {
          transitionId: "t_cerrar",
          eventId: "c2",
          actorId: "op",
          actorKind: "sistema",
          occurredAt: "2026-01-02T00:00:00.000Z",
          evidence: {
            kind: "fisica",
            reference: "albaran:1",
            recordedAt: "2026-01-02T00:00:00.000Z",
          },
          world: {
            balance: 0,
            resourcesSettled: true,
            evidenceComplete: true,
          },
        },
        actor: { id: "op", kind: "sistema", roles: ["gerente"] },
        evidence: {
          kind: "fisica",
          reference: "albaran:1",
          recordedAt: "2026-01-02T00:00:00.000Z",
          referenceType: "albaran",
        },
        fields: {},
        ruleSet,
        force: {
          reason: "cliente VIP exige cierre",
          allowedForceRuleIds: complianceRuleIds,
        },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ForceNotAllowedError);
      expect((err as Error).message).toMatch(/cumplimiento/i);
    }
  });

  it("una transición forzada aparece en la proyección con su regla y su motivo", () => {
    const derived = deriveState(life, []);
    const forced = attemptJudgedAdvance({
      subjectId: "tx-ok",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_aceptar",
        eventId: "eforce",
        actorId: "sup-1",
        actorKind: "humano",
        occurredAt: "2026-03-15T12:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "force-ok",
          recordedAt: "2026-03-15T12:00:00.000Z",
        },
      },
      actor: { id: "sup-1", kind: "humano", roles: ["supervisor"] },
      evidence: {
        kind: "aceptacion",
        reference: "force-ok",
        recordedAt: "2026-03-15T12:00:00.000Z",
      },
      fields: { importe: 100 },
      ruleSet,
      force: {
        reason: "excepción comercial autorizada por dirección",
        allowedForceRuleIds: [guardRuleId],
      },
    });

    expect(forced.event.data).toMatchObject({
      deviation: {
        kind: "forced_transition",
        skippedRuleId: guardRuleId,
        reason: "excepción comercial autorizada por dirección",
        actorId: "sup-1",
        ruleSetVersion: ruleSet.version,
      },
    });

    const store = new InMemoryEventStore();
    store.append(forced.event);
    store.append({
      id: "mod-1",
      kind: "modificacion",
      subjectId: "tx-ok",
      occurredAt: "2026-03-15T13:00:00.000Z",
      actorId: "sup-1",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "gap",
        recordedAt: "2026-03-15T13:00:00.000Z",
      },
      freeText: "ajuste manual no cubierto",
    });
    store.append({
      id: "auto-1",
      kind: "modificacion",
      subjectId: "tx-ok",
      occurredAt: "2026-03-15T14:00:00.000Z",
      actorId: "sup-1",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "gap",
        recordedAt: "2026-03-15T14:00:00.000Z",
      },
      freeText: "[automation_cancel:auto-renew] cancelada a mano por cliente",
    });

    const observer = new DeviationObserver();
    observer.attach(store);

    const byRule = observer.byRule(guardRuleId);
    expect(byRule).toHaveLength(1);
    expect(byRule[0]).toMatchObject({
      kind: "forced_transition",
      skippedRuleId: guardRuleId,
      reason: "excepción comercial autorizada por dirección",
      actorId: "sup-1",
    });

    expect(observer.byActor("sup-1").length).toBeGreaterThanOrEqual(2);
    expect(
      observer.byPeriod(
        "2026-03-15T00:00:00.000Z",
        "2026-03-15T23:59:59.000Z",
      ).length,
    ).toBeGreaterThanOrEqual(2);

    const kinds = new Set(observer.current().deviations.map((d) => d.kind));
    expect(kinds.has("forced_transition")).toBe(true);
    expect(kinds.has("modification")).toBe(true);
    expect(kinds.has("automation_cancelled")).toBe(true);
  });
});

describe("Observador — solo lectura y reconstrucción", () => {
  it("el Observador no puede escribir en políticas ni reglas compiladas", () => {
    const observer = new DeviationObserver();
    expect(() => observer.writePolicy({ id: "x" })).toThrow(ObserverWriteError);
    expect(() => observer.writeCompiledRuleSet(ruleSet)).toThrow(
      ObserverWriteError,
    );
  });

  it("la proyección se reconstruye idéntica reproduciendo los eventos desde cero", () => {
    const derived = deriveState(life, []);
    const forcedLow = attemptJudgedAdvance({
      subjectId: "tx-r2",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_aceptar",
        eventId: "er2",
        actorId: "sup-1",
        actorKind: "humano",
        occurredAt: "2026-05-01T10:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "r",
          recordedAt: "2026-05-01T10:00:00.000Z",
        },
      },
      actor: { id: "sup-1", kind: "humano", roles: [] },
      evidence: {
        kind: "aceptacion",
        reference: "r",
        recordedAt: "2026-05-01T10:00:00.000Z",
      },
      fields: { importe: 500 },
      ruleSet,
      force: {
        reason: "bypass permiso temporal",
        allowedForceRuleIds: [guardRuleId],
      },
    });

    const events: DomainEvent[] = [
      forcedLow.event,
      {
        id: "m1",
        kind: "modificacion",
        subjectId: "tx-r2",
        occurredAt: "2026-05-01T11:00:00.000Z",
        actorId: "sup-1",
        actorKind: "humano",
        evidence: {
          kind: "aceptacion",
          reference: "g",
          recordedAt: "2026-05-01T11:00:00.000Z",
        },
        freeText: "nota libre",
      },
    ];

    const a = projectDeviations(events);
    const b = projectDeviations([...events]);
    expect(a).toEqual(b);

    const observer = new DeviationObserver();
    observer.rebuild(events);
    const first = structuredClone(observer.current());
    observer.rebuild([]);
    observer.rebuild(events);
    expect(observer.current()).toEqual(first);
  });
});
