/**
 * Ejecuta los 10 perfiles sample con el compositor + UI por proceso + oráculos.
 * npx tsx contracts/composition/run-process-ui-10.mts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateBusinessProfile,
  BusinessProfileError,
} from "../business-profile/index.js";
import type { SampleProfile } from "../business-profile/samples/sample-types.js";
import {
  mapSampleToV12,
  composeBusinessProfile,
  businessProfileThroughComposer,
  runCompositionFitOracle,
  type ExpectedCompositionDoc,
} from "../../composer/index.js";
import { generateUiSpec } from "../../generator/generate.js";
import { runProcessUiOracle } from "../../generator/oracle.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const samplesPath = join(
  HERE,
  "../business-profile/samples/business-profiles-10.json",
);
const expectedDir = join(HERE, "expected");
const samples = JSON.parse(readFileSync(samplesPath, "utf8")) as {
  perfiles: SampleProfile[];
};

const rows: Record<string, unknown>[] = [];

for (const p of samples.perfiles) {
  const { profile, mappingNotes } = mapSampleToV12(p);
  const row: Record<string, unknown> = {
    id: p.id,
    nombre: p.nombre,
    mappingNotes,
    adapter: "composer/mapSampleToV12",
  };
  try {
    const validated = validateBusinessProfile(profile);
    const composed = composeBusinessProfile(validated);
    if (!composed.ok) {
      row.validate = "fail";
      row.composerError = {
        code: composed.code,
        message: composed.message,
        details: composed.details,
        questions: composed.questions,
      };
      rows.push(row);
      continue;
    }

    row.composer = {
      hash: composed.compositionHash,
      dominant: composed.dominant,
      composition: composed.composition,
      questions: composed.questions,
      policyTemplates: composed.policyTemplates.map((t) => t.plantilla),
      nonComposable: composed.nonComposable,
      traces: composed.traces.map((t) => ({
        elementId: t.elementId,
        field: t.field,
        ruleId: t.ruleId,
        decision: t.decision,
      })),
    };

    const expectedPath = join(expectedDir, `${p.id}.json`);
    let fit: unknown;
    try {
      const expected = JSON.parse(
        readFileSync(expectedPath, "utf8"),
      ) as ExpectedCompositionDoc;
      fit = runCompositionFitOracle(composed, expected);
      row.fitOracle = fit;
    } catch {
      row.fitOracle = { skipped: true };
    }

    // Materialize puede fallar por ask (naturaleza/portal) — capturar
    try {
      const pipe = businessProfileThroughComposer(profile, {
        systemIds: {
          caseId: `case-${p.id}`,
          caseVersion: "1.0.0",
          documentId: `pol-${p.id}`,
          compiledVersion: `compiled:1.0.0`,
          activationAt: "2026-01-01T00:00:00.000Z",
        },
      });
      const spec = generateUiSpec(pipe.input);
      const oracle = runProcessUiOracle(pipe.input, spec);
      row.validate = "ok";
      row.confirmations = pipe.materialize.confirmations;
      row.processGroups = (spec.processGroups ?? []).map((g) => ({
        id: g.id,
        role: g.role,
        archetypeId: g.archetypeId,
      }));
      row.oracle = {
        ok: oracle.ok,
        findings: oracle.findings,
        stats: oracle.stats,
      };
    } catch (err) {
      row.validate = "compose_ok_materialize_blocked";
      row.materializeError =
        err instanceof BusinessProfileError
          ? { code: err.code, message: err.message, details: err.details }
          : { message: err instanceof Error ? err.message : String(err) };
    }
  } catch (err) {
    row.validate = "fail";
    row.error =
      err instanceof BusinessProfileError
        ? { code: err.code, message: err.message, details: err.details }
        : { message: err instanceof Error ? err.message : String(err) };
  }
  rows.push(row);
}

const rawPath = join(HERE, "_process-ui-10-raw.json");
writeFileSync(rawPath, JSON.stringify(rows, null, 2), "utf8");

const fitOk = rows.filter((r) => (r.fitOracle as { ok?: boolean })?.ok).length;
const composedOk = rows.filter(
  (r) => r.composer && (r.validate === "ok" || r.validate === "compose_ok_materialize_blocked"),
).length;

const md = `# PROCESS-UI-REPORT — Generador UI + Compositor

**Fecha:** 2026-09-28  
**Adaptador:** \`composer/mapSampleToV12\` + \`composeBusinessProfile\` (ya no \`inferComposition\` heurístico).  
**Artefacto crudo:** \`_process-ui-10-raw.json\`

## Resumen

| Métrica | Valor |
|---------|-------|
| Perfiles | ${rows.length} |
| Composición OK | ${composedOk} |
| Fit oracle OK (sin fails duros) | ${fitOk} |

## Concesionaria

La composición canónica sale del **compositor** (\`buildConcesionariaGeneratorInputFromComposer\`).  
La paridad \`structuralHash\` legacy↔migrado se **retiró**: se sustituye por equivalencia funcional (\`functionalFingerprint\`) + composición de referencia. Ver \`COMPOSER-REPORT.md\`.

## Filas

${rows
  .map((r) => {
    const fit = r.fitOracle as { ok?: boolean; summary?: Record<string, unknown> } | undefined;
    const q = (r.composer as { questions?: { field: string }[] })?.questions ?? [];
    return `### ${r.id}
- validate: \`${r.validate}\`
- preguntas: ${q.map((x) => x.field).join(", ") || "(ninguna)"}
- fit: ${fit && "ok" in fit ? fit.ok : "n/a"} ${fit?.summary ? JSON.stringify(fit.summary) : ""}
`;
  })
  .join("\n")}

---
*Generado por run-process-ui-10.mts*
`;

writeFileSync(join(HERE, "PROCESS-UI-REPORT.md"), md, "utf8");
console.log(`Wrote ${rawPath} (${rows.length} rows, fitOk=${fitOk})`);

// silence unused
void readdirSync;
