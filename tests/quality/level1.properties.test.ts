/**
 * Nivel 1 — Propiedades generativas (fast-check).
 * Semillas: 200 CI / 2000 nightly. Semilla fija 0xA11CE.
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { validateLifecycle } from "../../core/validator.js";
import { deriveState } from "../../core/derivation.js";
import { MetaObjectRegistry, MetaObjectRegistryError } from "../../core/metaobject.js";
import type { Lifecycle, Transition } from "../../core/lifecycle.js";
import { ventaArchetype } from "../../archetypes/venta.js";
import { minimalExampleLifecycle } from "../../archetypes/minimal-example.js";
import {
  catalogFromLifecycle,
  compilePolicies,
  hashCanonical,
} from "../../policies/compiler.js";
import type { PolicyDocument } from "../../policies/types.js";
import {
  attemptJudgedAdvance,
  JudgeRejectionError,
} from "../../policies/judge.js";
import {
  buildConcesionariaGeneratorInput,
  generateUiSpec,
  structuralHash,
} from "../../generator/index.js";
import {
  PROPERTY_SEED,
  propertyNumRuns,
} from "../../quality/config.js";
import type { TransitionEvent } from "../../core/events.js";

const numRuns = propertyNumRuns();

const fcParams: fc.Parameters<unknown> = {
  numRuns,
  seed: PROPERTY_SEED,
  endOnFailure: true,
};

function corruptLifecycle(base: Lifecycle, mode: number): Lifecycle {
  const life = structuredClone(base) as Lifecycle & {
    states: Lifecycle["states"][number][];
    transitions: Transition[];
  };
  const m = Math.abs(mode) % 4;
  if (m === 0 && life.states[0]) {
    // Sin inicial: convertir el único inicial en intermedio
    life.states = life.states.map((s) =>
      s.kind === "inicial" ? { ...s, kind: "intermedio" as const } : s,
    );
  } else if (m === 1) {
    // Terminal con salida
    const term = life.states.find((s) => s.kind.startsWith("terminal"));
    const other = life.states.find((s) => s.id !== term?.id);
    if (term && other) {
      life.transitions.push({
        id: `t_bad_exit_${mode}`,
        from: term.id,
        to: other.id,
        condition: "bad",
        requiredEvidence: "sistema",
        allowedActor: "sistema",
        fulfills: [],
      });
    }
  } else if (m === 2) {
    life.transitions.push({
      id: `t_dup_${life.transitions[0]?.id ?? "x"}`,
      from: life.states[0]!.id,
      to: life.states[0]!.id,
      condition: "x",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: [],
    });
    // Forzar id duplicado
    if (life.transitions[0]) {
      life.transitions[life.transitions.length - 1] = {
        ...life.transitions[life.transitions.length - 1]!,
        id: life.transitions[0].id,
      };
    }
  } else {
    // Endpoint desconocido
    life.transitions.push({
      id: `t_ghost_${mode}`,
      from: "no_existe",
      to: "tampoco",
      condition: "x",
      requiredEvidence: "sistema",
      allowedActor: "humano",
      fulfills: [],
    });
  }
  return life;
}

describe(`Nivel 1 — Propiedades (${numRuns} seeds, seed=${PROPERTY_SEED})`, () => {
  it("ninguna máquina inválida se registra en MetaObjectRegistry", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (mode) => {
        const bad = corruptLifecycle(minimalExampleLifecycle, mode);
        const v = validateLifecycle(bad);
        expect(v.ok).toBe(false);
        const reg = new MetaObjectRegistry();
        expect(() =>
          reg.register({
            identity: {
              id: `bad-${mode}`,
              elementKind: "transaccion",
              grammarVersion: "1.1.0",
            },
            definition: { subtype: "venta", fields: [] },
            lifecycle: bad,
            invariants: [],
          }),
        ).toThrow(MetaObjectRegistryError);
      }),
      fcParams,
    );
  });

  it("mismo input de políticas produce el mismo CompiledRuleSet (contentHash)", () => {
    const life = ventaArchetype.lifecycle;
    const catalog = catalogFromLifecycle(
      life.transitions.map((t) => t.id),
      life.states.map((s) => s.id),
      ["importe", "factura_id"],
    );
    const baseDoc: PolicyDocument = {
      id: "prop-det",
      version: "1.0.0",
      companyId: "acme",
      archetypeId: "venta",
      roles: [{ id: "op", label: "Op" }],
      permissions: [
        {
          id: "p1",
          kind: "permiso",
          transitionId: "t_aceptar",
          allowedRoles: ["op"],
        },
      ],
    };
    fc.assert(
      fc.property(fc.constant(null), () => {
        const a = compilePolicies(baseDoc, {
          catalog,
          activationAt: "2026-01-01T00:00:00.000Z",
          compiledVersion: "v1",
        });
        const b = compilePolicies(baseDoc, {
          catalog,
          activationAt: "2026-01-01T00:00:00.000Z",
          compiledVersion: "v1",
        });
        expect(a.contentHash).toBe(b.contentHash);
        expect(hashCanonical(a.rules)).toBe(hashCanonical(b.rules));
      }),
      fcParams,
    );
  });

  it("reproducir la misma secuencia de eventos da el mismo estado derivado", () => {
    const life = ventaArchetype.lifecycle;
    const mk = (
      id: string,
      tid: string,
      from: string,
      to: string,
    ): TransitionEvent => ({
      id,
      kind: "transicion",
      subjectId: "tx-prop",
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: "u",
      actorKind: "humano",
      evidence: {
        kind: "aceptacion",
        reference: "r",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      transitionId: tid,
      fromStateId: from,
      toStateId: to,
    });
    // Prefijo feliz fijo
    const events: TransitionEvent[] = [
      mk("e1", "t_aceptar", "propuesta", "aceptada"),
    ];
    fc.assert(
      fc.property(fc.boolean(), () => {
        const a = deriveState(life, events);
        const b = deriveState(life, [...events]);
        expect(a.currentStateId).toBe(b.currentStateId);
        expect([...a.fulfilledCommitmentIds].sort()).toEqual(
          [...b.fulfilledCommitmentIds].sort(),
        );
      }),
      fcParams,
    );
  });

  it("mismo GeneratorInput produce misma UiSpec (contentHash + structuralHash)", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const input = buildConcesionariaGeneratorInput(
          "2026-06-01T00:00:00.000Z",
        );
        const a = generateUiSpec(input);
        const b = generateUiSpec(input);
        expect(a.contentHash).toBe(b.contentHash);
        expect(structuralHash(a)).toBe(structuralHash(b));
      }),
      fcParams,
    );
  });

  it("Juez: mismo comando rechazado produce la misma razón estable", () => {
    const life = ventaArchetype.lifecycle;
    const catalog = catalogFromLifecycle(
      life.transitions.map((t) => t.id),
      life.states.map((s) => s.id),
      ["importe"],
    );
    const ruleSet = compilePolicies(
      {
        id: "j",
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
    const derived = deriveState(life, []);
    const attempt = () => {
      try {
        attemptJudgedAdvance({
          subjectId: "tx",
          lifecycle: life,
          derived,
          command: {
            transitionId: "t_aceptar",
            eventId: "e",
            actorId: "x",
            actorKind: "humano",
            occurredAt: "2026-01-01T00:00:00.000Z",
            evidence: {
              kind: "aceptacion",
              reference: "r",
              recordedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          actor: { id: "x", kind: "humano", roles: ["becario"] },
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
          fields: { importe: 1 },
          ruleSet,
        });
        return null;
      } catch (err) {
        if (err instanceof JudgeRejectionError) return err.trace.reason;
        throw err;
      }
    };
    fc.assert(
      fc.property(fc.nat({ max: 100 }), () => {
        const r1 = attempt();
        const r2 = attempt();
        expect(r1).not.toBeNull();
        expect(r1).toBe(r2);
      }),
      fcParams,
    );
  });
});
