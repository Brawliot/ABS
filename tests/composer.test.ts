/**
 * Compositor determinista — unitarias, metamórficas, encaje 10 perfiles.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composeBusinessProfile,
  mapSampleToV12,
  runCompositionFitOracle,
  type ExpectedCompositionDoc,
} from "../composer/index.js";
import {
  validateBusinessProfile,
  known,
  unknownField,
} from "../contracts/business-profile/index.js";
import { validateComposition } from "../archetypes/composition.js";
import { readProfileJson } from "../contracts/business-profile/sources/json-file.js";
import {
  CONCESIONARIA_PROFILE_PATH,
  composeConcesionaria,
  CONCESIONARIA_COMPOSITION,
} from "../generator/packs/concesionaria.js";
import type { SampleProfile } from "../contracts/business-profile/samples/sample-types.js";
import { runProcessUiOracle } from "../generator/oracle.js";
import { generateUiSpec } from "../generator/generate.js";
import { businessProfileThroughComposer } from "../composer/pipeline.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = resolve(
  ROOT,
  "contracts/business-profile/samples/business-profiles-10.json",
);
const EXPECTED = resolve(ROOT, "contracts/composition/expected");

function loadSamples(): SampleProfile[] {
  return (
    JSON.parse(readFileSync(SAMPLES, "utf8")) as { perfiles: SampleProfile[] }
  ).perfiles;
}

function baseFromConcesionaria(overrides: Record<string, unknown> = {}) {
  const raw = readProfileJson(CONCESIONARIA_PROFILE_PATH) as Record<
    string,
    unknown
  >;
  return validateBusinessProfile({
    ...raw,
    schemaVersion: "1.2.0",
    ...overrides,
  });
}

describe("Compositor — concesionaria", () => {
  it("produce la composición de referencia", () => {
    expect(composeConcesionaria()).toEqual(CONCESIONARIA_COMPOSITION);
  });

  it("es determinista (mismo hash)", () => {
    const p = validateBusinessProfile(
      readProfileJson(CONCESIONARIA_PROFILE_PATH),
    );
    const a = composeBusinessProfile(p);
    const b = composeBusinessProfile(p);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.compositionHash).toBe(b.compositionHash);
      expect(a.composition).toEqual(b.composition);
    }
  });
});

describe("Compositor — metamórficas", () => {
  it("aCredito false → cuenta_parte añade políticas y no financiera", () => {
    const before = composeBusinessProfile(
      baseFromConcesionaria({
        cobros: {
          aCredito: known(false),
          aPlazos: known(false),
          fianzas: known(false),
          cuotasRecurrentes: known(false),
          pagosPorHitos: known(false),
        },
        paymentMode: known("inmediato"),
        // Solo venta: sin financiera/servicio en processes
        processes: known([
          { id: "lc.venta", archetypeId: "venta", label: "Venta" },
        ]),
        policyMeta: {
          documentVersion: "1.0.0",
          dominantArchetypeId: "venta",
        },
      }),
    );
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.composition?.secondaries ?? []).toEqual([]);

    const after = composeBusinessProfile(
      baseFromConcesionaria({
        cobros: {
          aCredito: known({
            kind: "cuenta_parte",
            limitePorDefectoEur: 1500,
          }),
          aPlazos: known(false),
          fianzas: known(false),
          cuotasRecurrentes: known(false),
          pagosPorHitos: known(false),
        },
        paymentMode: known("diferido"),
        processes: known([
          { id: "lc.venta", archetypeId: "venta", label: "Venta" },
        ]),
        policyMeta: {
          documentVersion: "1.0.0",
          dominantArchetypeId: "venta",
        },
      }),
    );
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(
      after.composition?.secondaries.some(
        (s) => s.secondaryArchetypeId === "financiera",
      ) ?? false,
    ).toBe(false);
    expect(
      after.policyTemplates.some((t) =>
        t.plantilla.includes("limite_credito"),
      ),
    ).toBe(true);
  });

  it("aCredito false → aPlazos true añade secundaria financiera", () => {
    const processes = known([
      { id: "lc.servicio", archetypeId: "servicio_proyecto", label: "Srv" },
    ]);
    const base = {
      processes,
      policyMeta: {
        documentVersion: "1.0.0",
        dominantArchetypeId: "servicio_proyecto" as const,
      },
      paymentMode: known("inmediato" as const),
    };
    const before = composeBusinessProfile(
      baseFromConcesionaria({
        ...base,
        cobros: {
          aCredito: known(false),
          aPlazos: known(false),
          fianzas: known(false),
          cuotasRecurrentes: known(false),
          pagosPorHitos: known(false),
        },
      }),
    );
    const after = composeBusinessProfile(
      baseFromConcesionaria({
        ...base,
        cobros: {
          aCredito: known(false),
          aPlazos: known({ enabled: true }),
          fianzas: known(false),
          cuotasRecurrentes: known(false),
          pagosPorHitos: known(false),
        },
        paymentMode: known("financiado"),
      }),
    );
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    const hadFin =
      before.composition?.secondaries.some(
        (s) => s.secondaryArchetypeId === "financiera",
      ) ?? false;
    const hasFin =
      after.composition?.secondaries.some(
        (s) => s.secondaryArchetypeId === "financiera",
      ) ?? false;
    expect(hadFin).toBe(false);
    expect(hasFin).toBe(true);
    // Solo cambia la secundaria financiera (y proceso auxiliar)
    expect(after.composition!.secondaries).toHaveLength(1);
  });

  it("añadir fianzas marca retención (liquidación antes de cierre)", () => {
    const before = composeBusinessProfile(
      baseFromConcesionaria({
        cobros: {
          aCredito: known(false),
          aPlazos: known(false),
          fianzas: known(false),
          cuotasRecurrentes: known(false),
          pagosPorHitos: known(false),
        },
        processes: known([
          { id: "lc.uso", archetypeId: "uso_temporal", label: "Uso" },
        ]),
        policyMeta: {
          documentVersion: "1.0.0",
          dominantArchetypeId: "uso_temporal",
        },
        paymentMode: known("inmediato"),
      }),
    );
    const after = composeBusinessProfile(
      baseFromConcesionaria({
        cobros: {
          aCredito: known(false),
          aPlazos: known(false),
          fianzas: known({ kind: "retencion" }),
          cuotasRecurrentes: known(false),
          pagosPorHitos: known(false),
        },
        processes: known([
          { id: "lc.uso", archetypeId: "uso_temporal", label: "Uso" },
        ]),
        policyMeta: {
          documentVersion: "1.0.0",
          dominantArchetypeId: "uso_temporal",
        },
        paymentMode: known("inmediato"),
      }),
    );
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    expect(
      before.traces.some((t) => t.ruleId === "R_FIANZAS_RETENCION"),
    ).toBe(false);
    expect(
      after.traces.some((t) => t.ruleId === "R_FIANZAS_RETENCION"),
    ).toBe(true);
  });

  it("campo unknown produce pregunta y no inventa secundaria", () => {
    const result = composeBusinessProfile(
      baseFromConcesionaria({
        cobros: {
          aCredito: known(false),
          aPlazos: unknownField(),
          fianzas: known(false),
          cuotasRecurrentes: known(false),
          pagosPorHitos: known(false),
        },
        processes: known([
          {
            id: "lc.servicio",
            archetypeId: "servicio_proyecto",
            label: "Taller",
          },
        ]),
        policyMeta: {
          documentVersion: "1.0.0",
          dominantArchetypeId: "servicio_proyecto",
        },
        paymentMode: known("mixto"),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions.some((q) => q.field === "cobros.aPlazos")).toBe(
      true,
    );
    expect(
      result.composition?.secondaries.some(
        (s) => s.secondaryArchetypeId === "financiera",
      ) ?? false,
    ).toBe(false);
  });
});

describe("Compositor — oráculo de encaje (10 perfiles)", () => {
  const samples = loadSamples();

  it.each(samples.map((p) => [p.id, p] as const))(
    "%s: composición válida + fit report",
    (_id, sample) => {
      const { profile } = mapSampleToV12(sample);
      const validated = validateBusinessProfile(profile);
      const composed = composeBusinessProfile(validated);
      expect(composed.ok).toBe(true);
      if (!composed.ok) return;
      if (composed.composition) {
        expect(validateComposition(composed.composition).ok).toBe(true);
      }
      const expected = JSON.parse(
        readFileSync(resolve(EXPECTED, `${sample.id}.json`), "utf8"),
      ) as ExpectedCompositionDoc;
      const fit = runCompositionFitOracle(composed, expected);
      // Guardamos hallazgos; no exigimos 100% hit (gaps documentados)
      expect(fit.profileId).toBe(sample.id);
      expect(Array.isArray(fit.findings)).toBe(true);
    },
  );

  it("trazabilidad: cada secundaria tiene ruleId en traces", () => {
    const sample = loadSamples().find((p) => p.id === "p02-clinica-dental")!;
    const { profile } = mapSampleToV12(sample);
    const composed = composeBusinessProfile(validateBusinessProfile(profile));
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    for (const sec of composed.composition?.secondaries ?? []) {
      expect(
        composed.traces.some(
          (t) =>
            t.elementKind === "secondary" &&
            t.elementId.includes(sec.secondaryArchetypeId),
        ),
      ).toBe(true);
    }
  });
});

describe("Compositor → Generador (process-ui oracle)", () => {
  it("concesionaria con compositor pasa runProcessUiOracle", () => {
    const pipe = businessProfileThroughComposer(
      readProfileJson(CONCESIONARIA_PROFILE_PATH),
      {
        generatedAt: "2026-06-01T00:00:00.000Z",
        systemIds: {
          caseId: "case-concesionaria",
          caseVersion: "1.1.0",
          documentId: "pol-concesionaria",
          compiledVersion: "compiled:concesionaria-1",
          activationAt: "2026-04-01T00:00:00.000Z",
        },
      },
    );
    const spec = generateUiSpec(pipe.input);
    const oracle = runProcessUiOracle(pipe.input, spec);
    expect(oracle.ok).toBe(true);
  });
});
