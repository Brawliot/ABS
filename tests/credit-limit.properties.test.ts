/**
 * Propiedad: límite de crédito por Parte.
 * Para cualquier límite y secuencia de ventas a cuenta, el saldo nunca supera el límite
 * (el Juez rechaza t_aceptar cuando saldo+importe > límite).
 * Prueba nueva — no modifica suites existentes.
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { ventaArchetype } from "../archetypes/venta.js";
import { deriveState } from "../core/derivation.js";
import type { TransitionEvent } from "../core/events.js";
import { FactProvider, withFactPayload } from "../facts/index.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import {
  JudgeRejectionError,
  attemptJudgedAdvance,
  collectFactRequests,
} from "../policies/judge.js";
import type { PolicyDocument } from "../policies/types.js";
import { compilePolicyTemplate } from "../contracts/policy-templates/index.js";
import { PROPERTY_SEED, propertyNumRuns } from "../quality/config.js";

const numRuns = propertyNumRuns();

describe("Propiedad — límite crédito cuenta Parte", () => {
  it(
    "saldo nunca supera el límite tras cualquier secuencia de ventas a cuenta",
    () => {
    const life = ventaArchetype.lifecycle;

    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),
        fc.array(fc.integer({ min: 1, max: 2000 }), {
          minLength: 1,
          maxLength: 8,
        }),
        (limite, importes) => {
          const catalog = catalogFromLifecycle(
            life.transitions.map((t) => t.id),
            life.states.map((s) => s.id),
            ["importe", "parte_id"],
          );
          const tpl = compilePolicyTemplate({
            id: "tpl-limite-credito",
            plantilla: "tpl.limite_credito_por_cliente",
            parametros: { por_defecto_eur: limite },
            transitionId: "t_aceptar",
          });
          const doc: PolicyDocument = {
            id: "doc-credito-prop",
            version: "1",
            companyId: "ferreteria",
            archetypeId: "venta",
            roles: [{ id: "dueno", label: "Dueño" }],
            permissions: life.transitions.map((t) => ({
              id: `perm-${t.id}`,
              kind: "permiso" as const,
              transitionId: t.id,
              allowedRoles: ["dueno"],
            })),
            policies: [...tpl.policies],
            compliance: [...tpl.compliance],
          };
          const ruleSet = compilePolicies(doc, {
            catalog,
            activationAt: "2026-01-01T00:00:00.000Z",
          });

          const provider = new FactProvider();
          const tenantId = "prop-credito";
          const parteId = "cli-prop";
          let saldo = 0;
          let n = 0;

          for (const importe of importes) {
            n += 1;
            const subjectId = `tx-venta-${n}`;
            const fields = { parte_id: parteId, importe };
            const requests = collectFactRequests(ruleSet, "t_aceptar", fields);
            const bag = provider.prepare(tenantId, requests);
            const derived = deriveState(life, []);
            const day = String((n % 28) + 1).padStart(2, "0");
            const at = `2026-02-${day}T10:00:00.000Z`;

            try {
              const judged = attemptJudgedAdvance({
                subjectId,
                lifecycle: life,
                derived,
                command: {
                  transitionId: "t_aceptar",
                  eventId: `e-aceptar-${n}`,
                  actorId: "dueno-1",
                  actorKind: "humano",
                  occurredAt: at,
                  evidence: {
                    kind: "aceptacion",
                    reference: "ui",
                    recordedAt: at,
                  },
                },
                actor: {
                  id: "dueno-1",
                  kind: "humano",
                  roles: ["dueno"],
                },
                evidence: {
                  kind: "aceptacion",
                  reference: "ui",
                  recordedAt: at,
                },
                fields,
                ruleSet,
                tenantId,
                facts: bag,
              });
              const ev = withFactPayload(judged.event as TransitionEvent, {
                parteId,
                importe,
              });
              provider.applyEvent(tenantId, ev);
              saldo += importe;
              expect(saldo).toBeLessThanOrEqual(limite);
            } catch (err) {
              if (!(err instanceof JudgeRejectionError)) throw err;
              expect(saldo + importe).toBeGreaterThan(limite);
            }
          }

          expect(saldo).toBeLessThanOrEqual(limite);
        },
      ),
      { numRuns: Math.min(numRuns, 50), seed: PROPERTY_SEED, endOnFailure: true },
    );
  },
  30_000,
);

  it("regresión: plantilla usa $fields.parte_id (+ importe), no {{parte_id}}", () => {
    const tpl = compilePolicyTemplate({
      id: "tpl-limite-credito",
      plantilla: "tpl.limite_credito_por_cliente",
      parametros: { por_defecto_eur: 1500 },
      transitionId: "t_aceptar",
    });
    const fr = tpl.policies[0]?.factRestriction;
    expect(fr?.params.parteId).toBe("$fields.parte_id");
    expect(fr?.amountField).toBe("importe");
    expect(JSON.stringify(tpl)).not.toContain("{{parte_id}}");
  });

  it("escenario adverso ferretería: saldo 2000 > límite 1500 → rechaza t_aceptar", () => {
    const life = ventaArchetype.lifecycle;
    const catalog = catalogFromLifecycle(
      life.transitions.map((t) => t.id),
      life.states.map((s) => s.id),
      ["importe", "parte_id"],
    );
    const tpl = compilePolicyTemplate({
      id: "tpl-limite-credito",
      plantilla: "tpl.limite_credito_por_cliente",
      parametros: { por_defecto_eur: 1500 },
      transitionId: "t_aceptar",
    });
    const doc: PolicyDocument = {
      id: "doc-ferr",
      version: "1",
      companyId: "ferr",
      archetypeId: "venta",
      roles: [{ id: "dueno", label: "Dueño" }],
      permissions: life.transitions.map((t) => ({
        id: `perm-${t.id}`,
        kind: "permiso" as const,
        transitionId: t.id,
        allowedRoles: ["dueno"],
      })),
      policies: [...tpl.policies],
      compliance: [],
    };
    const ruleSet = compilePolicies(doc, {
      catalog,
      activationAt: "2026-01-01T00:00:00.000Z",
    });
    const provider = new FactProvider();
    const tenantId = "ferr-1";
    const parteId = "parte-demo-1";
    provider.applyEvent(
      tenantId,
      withFactPayload(
        {
          id: "seed-deuda",
          kind: "transicion",
          subjectId: "tx-deuda",
          occurredAt: "2026-01-01T00:00:00.000Z",
          actorId: "seed",
          actorKind: "humano",
          evidence: {
            kind: "aceptacion",
            reference: "seed",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
          transitionId: "t_acordar",
          fromStateId: "propuesta",
          toStateId: "acordado",
        } as TransitionEvent,
        { parteId, importe: 2000 },
      ),
    );
    const fields = { parte_id: parteId };
    const bag = provider.prepare(
      tenantId,
      collectFactRequests(ruleSet, "t_aceptar", fields),
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx-venta-1",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "e1",
          actorId: "dueno-1",
          actorKind: "humano",
          occurredAt: "2026-06-01T12:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "ui",
            recordedAt: "2026-06-01T12:00:00.000Z",
          },
        },
        actor: { id: "dueno-1", kind: "humano", roles: ["dueno"] },
        evidence: {
          kind: "aceptacion",
          reference: "ui",
          recordedAt: "2026-06-01T12:00:00.000Z",
        },
        fields,
        ruleSet,
        tenantId,
        facts: bag,
      }),
    ).toThrow(JudgeRejectionError);
  });
});
