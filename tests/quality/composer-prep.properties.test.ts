/**
 * Propiedades: extensiones de compositor-prep no producen máquinas inválidas.
 * Reutiliza infraestructura de level1.properties (fast-check, PROPERTY_SEED).
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { validateLifecycle } from "../../core/validator.js";
import { requireArchetype } from "../../archetypes/catalog.js";
import { validateComposition } from "../../archetypes/composition.js";
import {
  resolveExchangeParties,
  assertExchangeConsistent,
} from "../../elements/exchange-direction.js";
import {
  canReserveCapacity,
  assertCanReserveCapacity,
  PlazaCapacityError,
} from "../../facts/plazas.js";
import {
  hitosToCommitments,
  validateHitosOnDominant,
  validateHitosList,
  type HitoPagoSpec,
} from "../../archetypes/milestones.js";
import {
  assertRetentionSettledBeforeClosure,
  RetentionSettlementError,
} from "../../elements/retention-settlement.js";
import {
  PROPERTY_SEED,
  propertyNumRuns,
} from "../../quality/config.js";
import type { ArchetypeId } from "../../archetypes/types.js";

const numRuns = propertyNumRuns();
const fcParams: fc.Parameters<unknown> = {
  numRuns,
  seed: PROPERTY_SEED,
  endOnFailure: true,
};

const DOMINANTS: readonly ArchetypeId[] = [
  "venta",
  "servicio_proyecto",
  "uso_temporal",
  "suscripcion",
];

function pickStatePair(archId: ArchetypeId): {
  bornIn: string;
  bloquea: string;
} | null {
  const life = requireArchetype(archId).lifecycle;
  const nonTerminal = life.states.filter(
    (s) => !s.kind.startsWith("terminal"),
  );
  if (nonTerminal.length < 2) return null;
  const a = nonTerminal[0]!;
  const b = nonTerminal[1]!;
  return { bornIn: a.id, bloquea: b.id };
}

describe(`Composer-prep propiedades (${numRuns} seeds)`, () => {
  it("dirección de intercambio: Partes distintas siempre coherentes", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("empresa_vende" as const, "empresa_compra" as const),
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ minLength: 1, maxLength: 8 }),
        (direction, emp, contra) => {
          fc.pre(emp !== contra);
          const p = resolveExchangeParties({
            direction,
            empresaParteId: emp,
            contraparteParteId: contra,
          });
          assertExchangeConsistent(p);
          expect(p.compradorParteId).not.toBe(p.vendedorParteId);
        },
      ),
      fcParams,
    );
  });

  it("plazas: reserva válida nunca lanza; inválida siempre lanza", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("cita_individual" as const, "plazas" as const),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (semantics, total, comprometidas, solicitado) => {
          fc.pre(comprometidas <= total);
          const state = {
            recursoId: "r",
            plazasTotales: total,
            comprometidas,
            solicitado,
          };
          const ok = canReserveCapacity(semantics, state);
          if (ok) {
            expect(() => assertCanReserveCapacity(semantics, state)).not.toThrow();
          } else {
            expect(() => assertCanReserveCapacity(semantics, state)).toThrow(
              PlazaCapacityError,
            );
          }
        },
      ),
      fcParams,
    );
  });

  it("hitos sobre dominante: composición + lifecycle dominante válidos", () => {
    fc.assert(
      fc.property(fc.constantFrom(...DOMINANTS), fc.integer({ min: 1, max: 3 }), (dom, n) => {
        const pair = pickStatePair(dom);
        fc.pre(pair !== null);
        const life = requireArchetype(dom).lifecycle;
        expect(validateLifecycle(life).ok).toBe(true);

        const hitos: HitoPagoSpec[] = [];
        const pctEach = Math.floor(100 / n);
        let remaining = 100;
        for (let i = 0; i < n; i++) {
          const pct = i === n - 1 ? remaining : pctEach;
          remaining -= pct;
          hitos.push({
            id: `h${i}`,
            fase: `f${i}`,
            pct,
            bornInDominantState: pair!.bornIn,
            bloquea: pair!.bloquea,
          });
        }
        validateHitosList(hitos);
        expect(hitosToCommitments(hitos).length).toBe(n);
        const v = validateHitosOnDominant(dom, hitos);
        expect(v.ok).toBe(true);
        // La máquina dominante sigue válida (no se muta)
        expect(validateLifecycle(requireArchetype(dom).lifecycle).ok).toBe(true);
      }),
      fcParams,
    );
  });

  it("retención abierta nunca permite cierre; liquidada sí", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), (open) => {
        expect(() =>
          assertRetentionSettledBeforeClosure({
            currentStateId: "cerrada",
            fulfilledCommitmentIds: new Set(["c"]),
            pendingCommitmentIds: new Set(),
            fieldValues: {},
            balance: 0,
            resourcesSettled: true,
            evidenceComplete: true,
            openRetentionAmount: open,
          }),
        ).toThrow(RetentionSettlementError);

        expect(() =>
          assertRetentionSettledBeforeClosure({
            currentStateId: "cerrada",
            fulfilledCommitmentIds: new Set(["c"]),
            pendingCommitmentIds: new Set(),
            fieldValues: {},
            balance: 0,
            resourcesSettled: true,
            evidenceComplete: true,
            openRetentionAmount: 0,
          }),
        ).not.toThrow();
      }),
      fcParams,
    );
  });

  it("ninguna composición con financiera (bloqueo hito) es inválida si estados existen", () => {
    fc.assert(
      fc.property(fc.constantFrom(...DOMINANTS), (dom) => {
        const pair = pickStatePair(dom);
        fc.pre(pair !== null);
        const result = validateComposition({
          dominant: dom,
          secondaries: [
            {
              secondaryArchetypeId: "financiera",
              bornInDominantState: pair!.bornIn,
              bloquea: pair!.bloquea,
            },
          ],
        });
        expect(result.ok).toBe(true);
        expect(validateLifecycle(requireArchetype(dom).lifecycle).ok).toBe(true);
        expect(
          validateLifecycle(requireArchetype("financiera").lifecycle).ok,
        ).toBe(true);
      }),
      fcParams,
    );
  });
});
