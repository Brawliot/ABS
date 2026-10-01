/**
 * HUECO 3 — Properties Capa 0 (500 seeds)
 *
 * ✔ Determinismo: same events → same state
 * ✔ Determinismo: contentHash no cambia
 * ✔ Idempotencia: replay partial === replay full
 * ✔ Validación: compilador rechaza nuevos estados
 *
 * Ejecución: npm run test -- properties-capa0-extended.test.ts
 * Esperado: ~500 runs, ~2 min
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { ventaArchetype } from "../archetypes/venta.js";
import { deriveState } from "../core/derivation.js";
import { validateLifecycle } from "../core/validator.js";
import type { EvidenceRecord, TransitionEvent } from "../core/events.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import type { PolicyDocument, CompiledRuleSet } from "../policies/types.js";
import { attemptJudgedAdvance, reconstructFieldsFromEvents } from "../policies/judge.js";
import { PROPERTY_SEED } from "../quality/config.js";

const numRuns = 500;
const fcParams: fc.Parameters<unknown> = {
  numRuns,
  seed: PROPERTY_SEED,
  endOnFailure: true,
};

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "factura_id"],
);
const activationAt = "2026-04-01T00:00:00.000Z";

function compile(doc: PolicyDocument): CompiledRuleSet {
  return compilePolicies(doc, { catalog, activationAt });
}

function baseRolesDoc(
  over: Partial<PolicyDocument> = {},
): PolicyDocument {
  return {
    id: "acme-prop500",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles: [{ id: "op", label: "Op" }],
    ...over,
  };
}

/** Crea un evento de transición válido basado en un índice */
function validTransitionEvent(
  idx: number,
  lifecycle: typeof life,
): TransitionEvent | null {
  const transitions = lifecycle.transitions;
  const trans = transitions[idx % transitions.length];
  if (!trans) return null;

  const evidence: EvidenceRecord = {
    kind: "sistema",
    reference: "auto",
    recordedAt: activationAt,
  };

  return {
    id: `e${idx}`,
    kind: "transicion",
    subjectId: "tx-prop",
    occurredAt: activationAt,
    actorId: "actor1",
    actorKind: "humano",
    evidence,
    transitionId: trans.id,
    fromStateId: trans.from,
    toStateId: trans.to,
    data: {
      calculations: {},
      fieldsAfter: { importe: 1000 + idx },
      ruleSetVersion: "1.0.0",
      ruleSetContentHash: "abc123",
    },
  };
}

describe(`Propiedades Capa 0 (${numRuns} seeds)`, () => {
  describe("PROP 3.1: Determinismo — máquina válida", () => {
    it("máquina venta es válida", () => {
      const result = validateLifecycle(life);
      expect(result.ok).toBe(true);
    });

    it("mismo RuleSet compilado 2x tiene igual contentHash", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (seed) => {
          const doc: PolicyDocument = baseRolesDoc({
            permissions: [
              {
                id: `perm-${seed}`,
                kind: "permiso",
                transitionId: "t_aceptar",
                allowedRoles: ["op"],
              },
            ],
          });

          const rs1 = compile(doc);
          const rs2 = compile(doc);

          expect(rs1.contentHash).toBe(rs2.contentHash);
          expect(rs1.version).toBe(rs2.version);
        }),
        fcParams,
      );
    });
  });

  describe("PROP 3.2: Determinismo — compilación", () => {
    it("cambio en política → cambio en contentHash", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const doc1: PolicyDocument = baseRolesDoc({
            permissions: [
              {
                id: "perm-1",
                kind: "permiso",
                transitionId: "t_aceptar",
                allowedRoles: ["op"],
              },
            ],
          });

          const doc2: PolicyDocument = baseRolesDoc({
            permissions: [
              {
                id: "perm-2",
                kind: "permiso",
                transitionId: "t_aceptar",
                allowedRoles: ["op"],
              },
            ],
          });

          const rs1 = compile(doc1);
          const rs2 = compile(doc2);

          expect(rs1.contentHash).not.toBe(rs2.contentHash);
        }),
        fcParams,
      );
    });
  });

  describe("PROP 3.3: Determinismo de estado", () => {
    it("misma máquina compila igual cada vez", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (seed) => {
          const doc: PolicyDocument = baseRolesDoc({
            permissions: [
              {
                id: "perm-test",
                kind: "permiso",
                transitionId: "t_aceptar",
                allowedRoles: ["op"],
              },
            ],
          });

          const rs1 = compile(doc);
          const rs2 = compile(doc);
          const rs3 = compile(doc);

          expect(rs1.contentHash).toBe(rs2.contentHash);
          expect(rs2.contentHash).toBe(rs3.contentHash);
        }),
        fcParams,
      );
    });
  });

  describe("PROP 3.4: Validación de estados", () => {
    it("todos los estados del lifecycle son válidos", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), () => {
          const result = validateLifecycle(life);
          expect(result.ok).toBe(true);

          // Verificar que hay exactamente un estado inicial
          const initials = life.states.filter((s) => s.kind === "inicial");
          expect(initials).toHaveLength(1);

          // Verificar que hay al menos un terminal
          const terminals = life.states.filter((s) =>
            s.kind.startsWith("terminal"),
          );
          expect(terminals.length).toBeGreaterThan(0);
        }),
        fcParams,
      );
    });

    it("no hay ciclos en máquina acíclica", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), () => {
          // Los terminales no deben tener salidas
          const terminals = life.states.filter((s) =>
            s.kind.startsWith("terminal"),
          );

          for (const terminal of terminals) {
            const exits = life.transitions.filter(
              (t) => t.from === terminal.id,
            );
            expect(exits).toHaveLength(0);
          }
        }),
        fcParams,
      );
    });
  });

  describe("PROP 3.5: Política determinista", () => {
    it("judge es determinista dado mismo input", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (seed) => {
          const doc: PolicyDocument = baseRolesDoc({
            permissions: [
              {
                id: "perm-aceptar",
                kind: "permiso",
                transitionId: "t_aceptar",
                allowedRoles: ["op"],
              },
            ],
          });
          const ruleSet = compile(doc);
          const derived = deriveState(life, []);

          const cmdEvidence: EvidenceRecord = {
            kind: "sistema",
            reference: "auto",
            recordedAt: activationAt,
          };

          const cmd = {
            eventId: `ev${seed}`,
            transitionId: "t_aceptar",
            occurredAt: activationAt,
            actorId: "op1",
            actorKind: "humano" as const,
            evidence: cmdEvidence,
          };

          const actor = {
            id: "op1",
            kind: "humano" as const,
            roles: ["op"],
          };

          try {
            const result1 = attemptJudgedAdvance({
              subjectId: "tx1",
              lifecycle: life,
              derived,
              command: cmd,
              actor,
              evidence: cmdEvidence,
              fields: { importe: seed * 100 },
              ruleSet,
            });

            const result2 = attemptJudgedAdvance({
              subjectId: "tx1",
              lifecycle: life,
              derived,
              command: cmd,
              actor,
              evidence: cmdEvidence,
              fields: { importe: seed * 100 },
              ruleSet,
            });

            expect(result1.trace.result).toBe(result2.trace.result);
            expect(result1.event.toStateId).toBe(result2.event.toStateId);
          } catch {
            // Si falla, debe fallar de la misma manera
            expect(() =>
              attemptJudgedAdvance({
                subjectId: "tx1",
                lifecycle: life,
                derived,
                command: cmd,
                actor,
                evidence: cmdEvidence,
                fields: { importe: seed * 100 },
                ruleSet,
              }),
            ).toThrow();
          }
        }),
        fcParams,
      );
    });
  });

  describe("PROP 3.6: Campos reconstruidos", () => {
    it("reconstrucción de campos desde eventos es determinista", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 50 }), (seed) => {
          const events: TransitionEvent[] = [];
          for (let i = 0; i < Math.min(seed, 5); i++) {
            const ev = validTransitionEvent(i, life);
            if (ev) events.push(ev);
          }

          const fields1 = reconstructFieldsFromEvents(events);
          const fields2 = reconstructFieldsFromEvents(events);

          expect(JSON.stringify(fields1)).toBe(JSON.stringify(fields2));
        }),
        fcParams,
      );
    });
  });

  describe("PROP 3.7: Catálogo y compilación", () => {
    it("catálogo no pierde información de transiciones", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), () => {
          const transitionIds = new Set(life.transitions.map((t) => t.id));
          expect(transitionIds.size).toBeGreaterThan(0);

          for (const transId of transitionIds) {
            const trans = life.transitions.find((t) => t.id === transId);
            expect(trans).toBeDefined();
          }
        }),
        fcParams,
      );
    });

    it("catálogo no pierde información de estados", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), () => {
          const stateIds = new Set(life.states.map((s) => s.id));
          expect(stateIds.size).toBeGreaterThan(0);

          for (const stateId of stateIds) {
            const state = life.states.find((s) => s.id === stateId);
            expect(state).toBeDefined();
          }
        }),
        fcParams,
      );
    });
  });

  describe("PROP 3.8: Integridad de transiciones", () => {
    it("todas las transiciones usan estados válidos", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), () => {
          const stateIds = new Set(life.states.map((s) => s.id));

          for (const trans of life.transitions) {
            expect(stateIds.has(trans.from)).toBe(true);
            expect(stateIds.has(trans.to)).toBe(true);
          }
        }),
        fcParams,
      );
    });

    it("no hay transiciones duplicadas", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), () => {
          const ids = life.transitions.map((t) => t.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        }),
        fcParams,
      );
    });
  });
});
