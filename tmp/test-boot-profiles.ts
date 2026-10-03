#!/usr/bin/env npx tsx
/**
 * Script para probar todos los perfiles a través de bootProfile
 * (simula lo que hace npm run web -- --profile)
 */

import { bootProfile, allBootableIds } from "../web/boot-profile.js";

interface BootResult {
  profileId: string;
  success: boolean;
  error?: string;
}

const results: BootResult[] = [];

function testBootProfile(id: string): BootResult {
  try {
    const boot = bootProfile(id);
    return {
      profileId: id,
      success: true,
    };
  } catch (e) {
    const err = e as Error;
    return {
      profileId: id,
      success: false,
      error: err.message,
    };
  }
}

function main() {
  console.log("=".repeat(80));
  console.log("Testing ALL Profiles via bootProfile (npm run web simulation)");
  console.log("=".repeat(80));

  const ids = allBootableIds();

  for (const id of ids) {
    const result = testBootProfile(id);
    results.push(result);

    const status = result.success ? "✓ PASS" : "✗ FAIL";
    console.log(`${status} ${id}`);

    if (!result.success) {
      console.log(`  Error: ${result.error}`);
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
    }
    process.exit(1);
  }
}

main();
