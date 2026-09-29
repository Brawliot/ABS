/**
 * Propiedades del validador UiSpec.
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  generateUiSpec,
  buildConcesionariaGeneratorInputWithComposition,
} from "../../generator/index.js";
import {
  validateUiSpecReport,
  isValidatedUiSpec,
} from "../../presentation/index.js";
import type { UiSpec } from "../../presentation/types.js";
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

function clone(spec: UiSpec): {
  version: string;
  views: { kind: string; actionIds: string[]; id: string }[];
  actions: { transitionId: string }[];
  localization: { strings: Record<string, string> }[];
  identity: { brandName?: string };
} {
  return JSON.parse(JSON.stringify(spec));
}

type MutMode =
  | "bad_version"
  | "bad_transition"
  | "inject_html"
  | "drop_block_panels"
  | "orphan_action_ref"
  | "literal_hex";

function mutate(spec: UiSpec, mode: MutMode, n: number): UiSpec {
  const bad = clone(spec);
  switch (mode) {
    case "bad_version":
      bad.version = `evil-${n}`;
      break;
    case "bad_transition":
      if (bad.actions[0]) {
        bad.actions[0].transitionId = `t_mut_${n}`;
      }
      break;
    case "inject_html":
      if (bad.localization[0]) {
        bad.localization[0].strings[`m${n}`] = `<script>x=${n}</script>`;
      }
      break;
    case "drop_block_panels":
      bad.views = bad.views.filter((v) => v.kind !== "panel_bloqueo");
      break;
    case "orphan_action_ref":
      if (bad.views[0]) {
        bad.views[0].actionIds = [
          ...bad.views[0].actionIds,
          `action.orphan.${n}`,
        ];
      }
      break;
    case "literal_hex":
      bad.identity.brandName = `#ff00aa mut${n}`;
      break;
    default: {
      const _e: never = mode;
      void _e;
    }
  }
  return bad as unknown as UiSpec;
}

describe(`UiSpec validator propiedades (${numRuns} seeds)`, () => {
  const input = buildConcesionariaGeneratorInputWithComposition();
  const valid = generateUiSpec(input);

  it("UiSpec generada siempre sellada y report.ok", () => {
    expect(isValidatedUiSpec(valid)).toBe(true);
    expect(validateUiSpecReport(valid, input).ok).toBe(true);
  });

  it("mutaciones aleatorias nunca producen UiSpec aceptada que viole reglas", () => {
    const modes: MutMode[] = [
      "bad_version",
      "bad_transition",
      "inject_html",
      "drop_block_panels",
      "orphan_action_ref",
      "literal_hex",
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...modes),
        fc.integer({ min: 0, max: 10_000 }),
        (mode, n) => {
          const bad = mutate(valid, mode, n);
          const report = validateUiSpecReport(bad, input);
          expect(report.ok).toBe(false);
          expect(report.issues.length).toBeGreaterThan(0);
        },
      ),
      fcParams,
    );
  });
});
