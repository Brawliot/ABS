/**
 * Propiedades del compositor: nunca entrega composición inválida; determinismo.
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { composeBusinessProfile } from "../../composer/compose.js";
import { validateComposition } from "../../archetypes/composition.js";
import { validateLifecycle } from "../../core/validator.js";
import { requireArchetype } from "../../archetypes/catalog.js";
import { known, unknownField } from "../../contracts/business-profile/field.js";
import { validateBusinessProfile } from "../../contracts/business-profile/validate.js";
import type { ArchetypeId } from "../../archetypes/types.js";
import {
  PROPERTY_SEED,
  propertyNumRuns,
} from "../../quality/config.js";

const numRuns = propertyNumRuns();
const fcParams: fc.Parameters<unknown> = {
  numRuns,
  seed: PROPERTY_SEED,
  endOnFailure: true,
};

const ARCHES: ArchetypeId[] = [
  "venta",
  "servicio_proyecto",
  "uso_temporal",
  "suscripcion",
];

function minimalProfile(input: {
  dominant: ArchetypeId;
  withFinanciera: boolean;
  aPlazos: "true" | "false" | "unknown";
  cuentaParte: boolean;
}): Record<string, unknown> {
  const processes: {
    id: string;
    archetypeId: ArchetypeId;
    label: string;
  }[] = [
    {
      id: `lc.${input.dominant}`,
      archetypeId: input.dominant,
      label: input.dominant,
    },
  ];
  if (input.withFinanciera && input.dominant !== "financiera") {
    processes.push({
      id: "lc.financiera",
      archetypeId: "financiera",
      label: "financiera",
    });
  }
  const aPlazos =
    input.aPlazos === "unknown"
      ? unknownField()
      : input.aPlazos === "true"
        ? known({ enabled: true as const })
        : known(false);
  const aCredito = input.cuentaParte
    ? known({ kind: "cuenta_parte" as const, limitePorDefectoEur: 1000 })
    : known(false);

  return {
    schemaVersion: "1.2.0",
    identity: { companyId: "prop-co" },
    policyMeta: {
      documentVersion: "1.0.0",
      dominantArchetypeId: input.dominant,
    },
    processes: known(processes),
    channels: known(["backoffice"]),
    paymentMode: known(input.aPlazos === "true" ? "financiado" : "inmediato"),
    cobros: {
      aCredito,
      aPlazos,
      fianzas: known(false),
      cuotasRecurrentes: known(false),
      pagosPorHitos: known(false),
    },
    resourceSubtypes: known([]),
    naturalezaBienes: known([]),
    location: { status: "not_applicable" },
    capabilities: {
      hasPartes: known(true),
      hasMovimientos: known(true),
      hasFormalDocuments: known(false),
      hasFiscalCompliance: known(false),
      hasCalendar: known(false),
    },
    roles: known([{ id: "gerente", label: "Gerente" }]),
    calendar: { status: "not_applicable" },
    permissions: known([]),
    permissionFallback: known({ roleId: "gerente" }),
    compliance: known([]),
    catalogFields: known(["importe", "parte_id"]),
    organization: { status: "not_applicable" },
    businessPolicies: { status: "not_applicable" },
    pipelineStateIds: { status: "not_applicable" },
  };
}

describe(`Compositor propiedades (${numRuns} seeds)`, () => {
  it("nunca entrega composición inválida; siempre determinista", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ARCHES),
        fc.boolean(),
        fc.constantFrom("true" as const, "false" as const, "unknown" as const),
        fc.boolean(),
        (dominant, withFinanciera, aPlazos, cuentaParte) => {
          // cuenta_parte + financiera process: compositor prohíbe secundaria
          const raw = minimalProfile({
            dominant,
            withFinanciera,
            aPlazos,
            cuentaParte,
          });
          const profile = validateBusinessProfile(raw);
          const a = composeBusinessProfile(profile);
          const b = composeBusinessProfile(profile);
          expect(a.ok).toBe(b.ok);
          if (!a.ok) {
            expect(a.code).toMatch(/INVALID|INCOMPLETE|CONTRADICTION/);
            return;
          }
          expect(b.ok && b.compositionHash).toBe(a.compositionHash);
          if (a.composition) {
            expect(validateComposition(a.composition).ok).toBe(true);
            expect(
              validateLifecycle(requireArchetype(a.composition.dominant).lifecycle)
                .ok,
            ).toBe(true);
            for (const s of a.composition.secondaries) {
              expect(
                validateLifecycle(
                  requireArchetype(s.secondaryArchetypeId).lifecycle,
                ).ok,
              ).toBe(true);
            }
          }
          // unknown aPlazos ⇒ pregunta, no financiera inventada (salvo proceso ya presente y no forbidden)
          if (aPlazos === "unknown" && !withFinanciera) {
            expect(a.questions.some((q) => q.field === "cobros.aPlazos")).toBe(
              true,
            );
            expect(
              a.composition?.secondaries.some(
                (s) => s.secondaryArchetypeId === "financiera",
              ) ?? false,
            ).toBe(false);
          }
        },
      ),
      fcParams,
    );
  });
});
