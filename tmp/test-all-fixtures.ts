#!/usr/bin/env npx tsx
/**
 * Script para probar TODOS los BusinessProfile fixtures y reportar errores
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBusinessProfile } from "../contracts/business-profile/index.js";
import type { BusinessProfileError } from "../contracts/business-profile/types.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

interface ValidationResult {
  filePath: string;
  success: boolean;
  error?: string;
  details?: string[];
}

const results: ValidationResult[] = [];

function testFixture(filePath: string): ValidationResult {
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    validateBusinessProfile(raw);
    return {
      filePath,
      success: true,
    };
  } catch (e) {
    const err = e as BusinessProfileError;
    return {
      filePath,
      success: false,
      error: err.message,
      details: err.details,
    };
  }
}

function main() {
  console.log("=".repeat(80));
  console.log("Testing ALL Business Profile Fixtures");
  console.log("=".repeat(80));

  // Test concesionaria fixture
  const fixturesDir = join(ROOT, "contracts/business-profile/fixtures");
  const fixtureFiles = readdirSync(fixturesDir).filter((f) =>
    f.endsWith(".json")
  );

  for (const file of fixtureFiles) {
    const filePath = join(fixturesDir, file);
    const result = testFixture(filePath);
    results.push(result);

    const status = result.success ? "✓ PASS" : "✗ FAIL";
    console.log(`${status} ${file}`);

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
    console.log("\nFailing fixtures:");
    for (const result of results.filter((r) => !r.success)) {
      console.log(`\n${result.filePath}:`);
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
