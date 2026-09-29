/**
 * Validador runtime UiSpec — mutaciones, 10 perfiles, concesionaria, render, rendimiento.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateUiSpec,
  buildConcesionariaGeneratorInput,
  buildConcesionariaGeneratorInputWithComposition,
} from "../generator/index.js";
import {
  validateUiSpec,
  validateUiSpecReport,
  serializeValidatedUiSpec,
  parseAndValidateUiSpec,
  UiSpecValidationError,
  isValidatedUiSpec,
  renderUiSpecHtml,
  PRESENTATION_SCHEMA_VERSION,
} from "../presentation/index.js";
import type { UiSpec, ViewSpec, ActionSpec, FormSpec } from "../presentation/types.js";
import type { GeneratorInput } from "../generator/types.js";
import {
  mapSampleToV12,
  businessProfileThroughComposer,
} from "../composer/index.js";
import { validateBusinessProfile } from "../contracts/business-profile/index.js";
import type { SampleProfile } from "../contracts/business-profile/samples/sample-types.js";
import { known } from "../contracts/business-profile/field.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = resolve(
  ROOT,
  "contracts/business-profile/samples/business-profiles-10.json",
);

function cloneSpec(spec: UiSpec): {
  version: string;
  views: ViewSpec[];
  actions: (ActionSpec & { visibleRoles: string[]; transitionId: string })[];
  forms: { id: string; fields: FormSpec["fields"][number][] }[];
  localization: { locale: string; strings: Record<string, string> }[];
  identity: { brandName?: string; logoUrl?: string };
  contentHash: string;
  [k: string]: unknown;
} {
  return JSON.parse(JSON.stringify(spec));
}

function loadSamples(): SampleProfile[] {
  return (
    JSON.parse(readFileSync(SAMPLES, "utf8")) as { perfiles: SampleProfile[] }
  ).perfiles;
}

function tryComposeInput(sample: SampleProfile): GeneratorInput | null {
  const { profile } = mapSampleToV12(sample);
  // Completar asks que bloquean materialize para poder generar UiSpec
  const raw = profile as Record<string, unknown>;
  if (
    (raw.naturalezaBienes as { status?: string })?.status === "unknown"
  ) {
    raw.naturalezaBienes = known(["propios_por_cantidad"]);
  }
  if ((raw.portalCliente as { status?: string })?.status === "unknown") {
    raw.portalCliente = known({ autoservicio: false });
  }
  if (raw.cobros) {
    const cobros = raw.cobros as Record<string, { status?: string }>;
    for (const key of [
      "aCredito",
      "aPlazos",
      "cuotasRecurrentes",
    ] as const) {
      if (cobros[key]?.status === "unknown") {
        cobros[key] = known(false) as never;
      }
    }
  }
  try {
    validateBusinessProfile(raw);
    const pipe = businessProfileThroughComposer(raw, {
      systemIds: {
        caseId: `case-${sample.id}`,
        caseVersion: "1.0.0",
        documentId: `pol-${sample.id}`,
        compiledVersion: "compiled:1.0.0",
        activationAt: "2026-01-01T00:00:00.000Z",
      },
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    return pipe.input;
  } catch {
    return null;
  }
}

describe("UiSpec validator — concesionaria y perfiles", () => {
  it("concesionaria (con composition) genera UiSpec sellada que pasa", () => {
    const input = buildConcesionariaGeneratorInputWithComposition();
    const spec = generateUiSpec(input);
    expect(isValidatedUiSpec(spec)).toBe(true);
    const report = validateUiSpecReport(spec, input);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("concesionaria base (sin composition) también pasa", () => {
    const input = buildConcesionariaGeneratorInput();
    const spec = generateUiSpec(input);
    expect(isValidatedUiSpec(spec)).toBe(true);
  });

  it("los 10 perfiles (tras resolver asks) generan UiSpec válida", () => {
    const samples = loadSamples();
    const results: { id: string; ok: boolean; views: number; ms: number }[] =
      [];
    for (const sample of samples) {
      const input = tryComposeInput(sample);
      if (!input) {
        results.push({ id: sample.id, ok: false, views: 0, ms: 0 });
        continue;
      }
      const t0 = performance.now();
      const spec = generateUiSpec(input);
      const ms = performance.now() - t0;
      expect(isValidatedUiSpec(spec)).toBe(true);
      results.push({
        id: sample.id,
        ok: true,
        views: spec.views.length,
        ms,
      });
    }
    const passed = results.filter((r) => r.ok);
    expect(passed.length).toBe(samples.length);
    const largest = [...passed].sort((a, b) => b.views - a.views)[0]!;
    // Medición formal de validación sola
    const input = tryComposeInput(
      samples.find((s) => s.id === largest.id)!,
    )!;
    const frozen = generateUiSpec(input);
    const t1 = performance.now();
    validateUiSpecReport(frozen, input);
    const validateMs = performance.now() - t1;
    writeFileSync(
      resolve(ROOT, "presentation/_uispec-validator-bench.json"),
      JSON.stringify(
        { results, largestId: largest.id, largestViews: largest.views, validateMs },
        null,
        2,
      ),
      "utf8",
    );
    expect(validateMs).toBeLessThan(500);
  });
});

describe("UiSpec validator — mutaciones", () => {
  const input = buildConcesionariaGeneratorInputWithComposition();
  const valid = generateUiSpec(input);

  it("versión no soportada", () => {
    const bad = cloneSpec(valid);
    bad.version = "9.9.9";
    const report = validateUiSpecReport(bad as unknown as UiSpec, input);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === "UNSUPPORTED_VERSION")).toBe(
      true,
    );
  });

  it("acción a transición inexistente", () => {
    const bad = cloneSpec(valid);
    bad.actions[0]!.transitionId = "t_no_existe";
    const report = validateUiSpecReport(bad as unknown as UiSpec, input);
    expect(
      report.issues.some((i) => i.code === "REF_ACTION_TRANSITION"),
    ).toBe(true);
  });

  it("rol sin permiso con acción visible", () => {
    const bad = cloneSpec(valid);
    const a = bad.actions[0]!;
    a.visibleRoles = [...a.visibleRoles, "rol_fantasma_sin_guarda"];
    const input2 = {
      ...input,
      roles: [...input.roles, { id: "rol_fantasma_sin_guarda", label: "X" }],
    };
    const report = validateUiSpecReport(bad as unknown as UiSpec, input2);
    expect(
      report.issues.some((i) => i.code === "COHERENCE_ROLE_ACTION"),
    ).toBe(true);
  });

  it("campo sensible en formulario de acción", () => {
    const bad = cloneSpec(valid);
    const form = bad.forms.find((f) => f.id === "form.parte")!;
    form.fields.push({
      name: "email",
      labelKey: "field.email",
      type: "string",
      required: false,
    });
    const a = bad.actions.find((x) => x.formId === "form.parte");
    if (a) {
      a.visibleRoles = ["taller"];
    }
    const input2 = {
      ...input,
      roles: input.roles.some((r) => r.id === "taller")
        ? input.roles
        : [...input.roles, { id: "taller", label: "Taller" }],
    };
    const report = validateUiSpecReport(bad as unknown as UiSpec, input2);
    expect(
      report.issues.some((i) => i.code === "SECURITY_SENSITIVE_FIELD"),
    ).toBe(true);
  });

  it("panel_bloqueo sin elemento de composición", () => {
    const bad = cloneSpec(valid);
    bad.views.push({
      id: "view.panel_bloqueo.fake",
      kind: "panel_bloqueo",
      labelKey: "x",
      stateId: null,
      lifecycleId: null,
      actionIds: [],
      admittedPatterns: valid.views[0]!.admittedPatterns,
      presentation: {
        secondaryArchetypeId: "financiera",
        bloquea: "estado_inventado",
      },
    });
    const report = validateUiSpecReport(bad as unknown as UiSpec, input);
    expect(report.issues.some((i) => i.code === "REF_PANEL")).toBe(true);
  });

  it("HTML inyectado en texto", () => {
    const bad = cloneSpec(valid);
    bad.localization[0]!.strings["evil"] = "<script>alert(1)</script>";
    const report = validateUiSpecReport(bad as unknown as UiSpec, input);
    expect(report.issues.some((i) => i.code === "SECURITY_INJECTION")).toBe(
      true,
    );
  });

  it("falta panel_bloqueo para secundaria de composition", () => {
    const bad = cloneSpec(valid);
    bad.views = bad.views.filter((v) => v.kind !== "panel_bloqueo");
    const report = validateUiSpecReport(bad as unknown as UiSpec, input);
    expect(
      report.issues.some((i) => i.code === "COHERENCE_MISSING_BLOCK"),
    ).toBe(true);
  });

  it("validateUiSpec lanza con lista completa de issues", () => {
    const bad = cloneSpec(valid);
    bad.version = "0.0.0";
    bad.actions[0]!.transitionId = "t_ghost";
    try {
      validateUiSpec(bad as unknown as UiSpec, input);
      expect.fail("debía lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(UiSpecValidationError);
      const err = e as UiSpecValidationError;
      expect(err.issues.length).toBeGreaterThanOrEqual(2);
      expect(err.issues.every((i) => typeof i.path === "string")).toBe(true);
    }
  });
});

describe("UiSpec validator — render y persistencia", () => {
  const input = buildConcesionariaGeneratorInputWithComposition();
  const valid = generateUiSpec(input);

  it("renderUiSpecHtml rechaza UiSpec sin sello", () => {
    const bare = cloneSpec(valid) as unknown as UiSpec;
    expect(() => renderUiSpecHtml(bare)).toThrow(UiSpecValidationError);
    expect(() => renderUiSpecHtml(bare)).toThrow(/NOT_VALIDATED|validada/);
  });

  it("renderUiSpecHtml acepta UiSpec sellada", () => {
    const html = renderUiSpecHtml(valid, { roleId: "comercial" });
    expect(html).toContain("<");
  });

  it("serialize + parseAndValidate redondea", () => {
    const json = serializeValidatedUiSpec(valid);
    const again = parseAndValidateUiSpec(json, input);
    expect(isValidatedUiSpec(again)).toBe(true);
    expect(again.contentHash).toBe(valid.contentHash);
  });

  it("serialize de no sellada falla", () => {
    const bare = cloneSpec(valid) as unknown as ReturnType<
      typeof generateUiSpec
    >;
    expect(() => serializeValidatedUiSpec(bare)).toThrow(UiSpecValidationError);
  });
});
