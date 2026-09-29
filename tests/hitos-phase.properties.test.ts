/**
 * Propiedad: hitos de pago — ninguna fase avanza sin cobrar el hito anterior.
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { servicioArchetype } from "../archetypes/servicio.js";
import {
  hitoPaymentField,
  transitionIdForBloqueaState,
  validateHitosList,
  type HitoPagoSpec,
} from "../archetypes/milestones.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
} from "../policies/judge.js";
import type { PolicyDocument } from "../policies/types.js";
import {
  buildHitosTemplateInvocation,
  compilePolicyTemplate,
} from "../contracts/policy-templates/index.js";
import { PROPERTY_SEED, propertyNumRuns } from "../quality/config.js";

const numRuns = propertyNumRuns();
const life = servicioArchetype.lifecycle;

const stateChain = ["acordado", "en_ejecucion", "en_espera", "cerrada"] as const;

const PREFIX: Readonly<Record<string, readonly string[]>> = {
  t_ejecutar: ["t_acordar"],
  t_presentar: ["t_acordar", "t_ejecutar"],
  t_cerrar: ["t_acordar", "t_ejecutar", "t_presentar"],
};

function mkEvent(transitionId: string): TransitionEvent {
  const tr = life.transitions.find((t) => t.id === transitionId)!;
  const evidenceKind =
    transitionId === "t_ejecutar"
      ? "sistema"
      : transitionId === "t_presentar"
        ? "fisica"
        : "aceptacion";
  return {
    id: `ev-${transitionId}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "transicion",
    subjectId: "sub-hitos",
    transitionId,
    fromStateId: tr.from,
    toStateId: tr.to,
    occurredAt: "2026-01-01T00:00:00.000Z",
    actorId: "a1",
    actorKind: "humano",
    evidence: {
      kind: evidenceKind,
      reference: `ref:${transitionId}`,
      recordedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function derivedBefore(transitionId: string) {
  const seq = PREFIX[transitionId] ?? [];
  return deriveState(life, seq.map(mkEvent));
}

function evidenceFor(transitionId: string) {
  const kind =
    transitionId === "t_ejecutar"
      ? ("sistema" as const)
      : transitionId === "t_presentar"
        ? ("fisica" as const)
        : ("aceptacion" as const);
  return {
    kind,
    reference: `ev:${transitionId}`,
    recordedAt: "2026-01-01T00:00:00.000Z",
  };
}

function hitosArb(): fc.Arbitrary<readonly HitoPagoSpec[]> {
  return fc
    .integer({ min: 1, max: 3 })
    .chain((n) => {
      const pcts: number[] = [];
      let rem = 100;
      for (let i = 0; i < n - 1; i++) {
        const p = fc.sample(
          fc.integer({ min: 10, max: rem - 10 * (n - 1 - i) }),
          1,
        )[0]!;
        pcts.push(p);
        rem -= p;
      }
      pcts.push(rem);
      return fc.constant(
        pcts.map((pct, i) => ({
          id: `h${i + 1}`,
          fase: `f${i + 1}`,
          pct,
          bornInDominantState: stateChain[i] ?? "acordado",
          bloquea: stateChain[i + 1] ?? "cerrada",
        })),
      );
    })
    .filter((hitos) => {
      try {
        validateHitosList(hitos);
        return true;
      } catch {
        return false;
      }
    });
}

function compileHitosRuleSet(hitos: readonly HitoPagoSpec[]) {
  const inv = buildHitosTemplateInvocation(
    {
      id: "tpl-hitos-prop",
      plantilla: "tpl.hitos_pago",
      parametros: { pattern: "compromisos_pagar_con_bloqueos" },
    },
    hitos,
  );
  const tpl = compilePolicyTemplate(inv);
  const fields = hitos.flatMap((h, i) => [hitoPaymentField(h.id, i)]);
  const catalog = catalogFromLifecycle(
    life.transitions.map((t) => t.id),
    life.states.map((s) => s.id),
    [...new Set(fields)],
  );
  const doc: PolicyDocument = {
    id: "hitos-prop",
    version: "1",
    companyId: "prop",
    archetypeId: "servicio_proyecto",
    roles: [{ id: "gerente", label: "Gerente" }],
    permissions: life.transitions.map((t) => ({
      id: `perm-${t.id}`,
      kind: "permiso" as const,
      transitionId: t.id,
      allowedRoles: ["gerente"],
    })),
    policies: [...tpl.policies],
    compliance: [...tpl.compliance],
  };
  return compilePolicies(doc, {
    catalog,
    activationAt: "2026-01-01T00:00:00.000Z",
  });
}

function attemptHitosAdvance(
  transitionId: string,
  fields: Record<string, unknown>,
  ruleSet: ReturnType<typeof compileHitosRuleSet>,
) {
  const ev = evidenceFor(transitionId);
  const actorKind = transitionId === "t_ejecutar" ? "sistema" : "humano";
  return attemptJudgedAdvance({
    subjectId: "sub-hitos",
    lifecycle: life,
    derived: derivedBefore(transitionId),
    command: {
      transitionId,
      eventId: `e-${transitionId}`,
      actorId: "a1",
      actorKind,
      occurredAt: "2026-01-01T00:00:00.000Z",
      evidence: ev,
    },
    actor: { id: "a1", kind: actorKind, roles: ["gerente"] },
    evidence: ev,
    fields,
    ruleSet,
  });
}

describe("Propiedad — hitos de pago", () => {
  it(
    "sin cobrar el hito exigido, la transición de fase es rechazada",
    () => {
      fc.assert(
        fc.property(hitosArb(), (hitos) => {
          const ruleSet = compileHitosRuleSet(hitos);
          for (let i = 0; i < hitos.length; i++) {
            const h = hitos[i]!;
            const transitionId =
              transitionIdForBloqueaState(h.bloquea) ?? "t_ejecutar";
            const field = hitoPaymentField(h.id, i);
            expect(() =>
              attemptHitosAdvance(
                transitionId,
                { [field]: false },
                ruleSet,
              ),
            ).toThrow(JudgeRejectionError);
          }
        }),
        { numRuns, seed: PROPERTY_SEED },
      );
    },
    30_000,
  );

  it(
    "con hito cobrado, la transición de fase correspondiente no falla por hitos",
    () => {
      fc.assert(
        fc.property(hitosArb(), (hitos) => {
          const ruleSet = compileHitosRuleSet(hitos);
          const h = hitos[0]!;
          const transitionId =
            transitionIdForBloqueaState(h.bloquea) ?? "t_ejecutar";
          const field = hitoPaymentField(h.id, 0);
          const result = attemptHitosAdvance(
            transitionId,
            { [field]: true },
            ruleSet,
          );
          expect(result.event.transitionId).toBe(transitionId);
        }),
        { numRuns, seed: PROPERTY_SEED + 1 },
      );
    },
    30_000,
  );
});
