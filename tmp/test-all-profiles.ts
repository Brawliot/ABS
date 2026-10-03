#!/usr/bin/env npx tsx
/**
 * Script para probar TODOS los perfiles y reportar errores de validación
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SampleProfile } from "../contracts/business-profile/samples/sample-types.js";
import { mapSampleToV12 } from "../composer/sample-to-v12.js";
import { validateBusinessProfile } from "../contracts/business-profile/index.js";
import type { BusinessProfileError } from "../contracts/business-profile/types.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const SAMPLES_PATH = join(
  ROOT,
  "contracts/business-profile/samples/business-profiles-10.json"
);

interface ValidationResult {
  profileId: string;
  success: boolean;
  error?: string;
  details?: string[];
}

const results: ValidationResult[] = [];

function testProfile(sample: SampleProfile): ValidationResult {
  try {
    const { profile } = mapSampleToV12(sample);
    validateBusinessProfile(profile);
    return {
      profileId: sample.id,
      success: true,
    };
  } catch (e) {
    const err = e as BusinessProfileError;
    return {
      profileId: sample.id,
      success: false,
      error: err.message,
      details: err.details,
    };
  }
}

function main() {
  console.log("=".repeat(80));
  console.log("Testing ALL Business Profiles for validation errors");
  console.log("=".repeat(80));

  const raw = JSON.parse(readFileSync(SAMPLES_PATH, "utf8")) as {
    perfiles: SampleProfile[];
  };

  for (const sample of raw.perfiles) {
    const result = testProfile(sample);
    results.push(result);

    const status = result.success ? "✓ PASS" : "✗ FAIL";
    console.log(`${status} ${result.profileId}`);

    if (!result.success) {
      console.log(`  Error: ${result.error}`);
      if (result.details && result.details.length > 0) {
        for (const detail of result.details) {
          console.log(`    - ${detail}`);
        }
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailing profiles:");
    for (const result of results.filter((r) => !r.success)) {
      console.log(`\n${result.profileId}:`);
      console.log(`  ${result.error}`);
      if (result.details) {
        for (const detail of result.details) {
          console.log(`  - ${detail}`);
        }
      }
    }
    process.exit(1);
  }
}

main();
