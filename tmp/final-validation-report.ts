#!/usr/bin/env npx tsx
/**
 * Reporte final de validación de perfiles de BusinessProfile
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SampleProfile } from "../contracts/business-profile/samples/sample-types.js";
import { mapSampleToV12 } from "../composer/sample-to-v12.js";
import { validateBusinessProfile } from "../contracts/business-profile/index.js";
import { bootProfile, allBootableIds } from "../web/boot-profile.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

interface ProfileValidation {
  profileId: string;
  source: "sample" | "fixture" | "bootable";
  schemaPass: boolean;
  logicPass: boolean;
  bootPass: boolean;
  errors: string[];
  contradictions: string[];
}

const validations: ProfileValidation[] = [];

function testSampleProfile(sample: SampleProfile): ProfileValidation {
  const result: ProfileValidation = {
    profileId: sample.id,
    source: "sample",
    schemaPass: false,
    logicPass: false,
    bootPass: false,
    errors: [],
    contradictions: [],
  };

  try {
    const { profile } = mapSampleToV12(sample);
    result.schemaPass = true;

    validateBusinessProfile(profile);
    result.logicPass = true;
  } catch (e) {
    const err = e as any;
    if (err.code === "CONTRADICTION") {
      result.logicPass = false;
      result.contradictions = err.details || [err.message];
    } else {
      result.schemaPass = false;
      result.errors = err.details || [err.message];
    }
  }

  // Test bootability
  try {
    bootProfile(sample.id);
    result.bootPass = true;
  } catch (e) {
    result.bootPass = false;
    result.errors.push((e as Error).message);
  }

  return result;
}

function testFixture(filePath: string, filename: string): ProfileValidation {
  const profileId = filename.replace(".json", "");
  const result: ProfileValidation = {
    profileId,
    source: "fixture",
    schemaPass: false,
    logicPass: false,
    bootPass: false,
    errors: [],
    contradictions: [],
  };

  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    result.schemaPass = true;

    validateBusinessProfile(raw);
    result.logicPass = true;
  } catch (e) {
    const err = e as any;
    if (err.code === "CONTRADICTION") {
      result.logicPass = false;
      result.contradictions = err.details || [err.message];
    } else {
      result.schemaPass = false;
      result.errors = err.details || [err.message];
    }
  }

  return result;
}

function formatStatus(pass: boolean): string {
  return pass ? "✓" : "✗";
}

function main() {
  console.log("\n" + "=".repeat(80));
  console.log("BUSINESS PROFILE VALIDATION REPORT");
  console.log("=".repeat(80));

  // Test samples
  console.log("\n1. Testing SAMPLE profiles from business-profiles-10.json");
  console.log("-".repeat(80));

  const samplesPath = join(ROOT, "contracts/business-profile/samples/business-profiles-10.json");
  const raw = JSON.parse(readFileSync(samplesPath, "utf8")) as {
    perfiles: SampleProfile[];
  };

  for (const sample of raw.perfiles) {
    const val = testSampleProfile(sample);
    validations.push(val);

    const status =
      val.schemaPass && val.logicPass && val.bootPass ? "✓ PASS" : "✗ FAIL";
    console.log(`${status} ${val.profileId}`);

    if (!val.schemaPass) {
      console.log(`  Schema errors: ${val.errors.join("; ")}`);
    }
    if (!val.logicPass && val.contradictions.length > 0) {
      console.log(`  Logic contradictions: ${val.contradictions.join("; ")}`);
    }
  }

  // Test fixtures
  console.log("\n2. Testing FIXTURES from contracts/business-profile/fixtures/");
  console.log("-".repeat(80));

  const fixturesDir = join(ROOT, "contracts/business-profile/fixtures");
  const fixtureFiles = readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !f.startsWith("invalid-")); // Skip intentionally invalid fixtures

  for (const file of fixtureFiles) {
    const filePath = join(fixturesDir, file);
    const val = testFixture(filePath, file);
    validations.push(val);

    const status =
      val.schemaPass && val.logicPass ? "✓ PASS" : "✗ FAIL";
    console.log(`${status} ${file}`);

    if (!val.schemaPass) {
      console.log(`  Schema errors: ${val.errors.join("; ")}`);
    }
    if (!val.logicPass && val.contradictions.length > 0) {
      console.log(`  Logic contradictions: ${val.contradictions.join("; ")}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  const totalPass = validations.filter(
    (v) => v.schemaPass && v.logicPass && v.bootPass
  ).length;
  const totalFail = validations.filter(
    (v) => !(v.schemaPass && v.logicPass && v.bootPass)
  ).length;

  console.log(`Total profiles tested: ${validations.length}`);
  console.log(`Passed: ${totalPass}`);
  console.log(`Failed: ${totalFail}`);

  // Test specific requirements
  const requiredProfiles = [
    "p01-peluqueria",
    "p02-clinica-dental",
    "p05-restaurante",
    "p07-tienda-online",
  ];

  console.log("\n" + "-".repeat(80));
  console.log("Required Profiles Status (from success criteria):");
  console.log("-".repeat(80));

  for (const reqId of requiredProfiles) {
    const val = validations.find((v) => v.profileId === reqId);
    if (val) {
      const pass = val.schemaPass && val.logicPass && val.bootPass;
      const status = pass ? "✓" : "✗";
      console.log(
        `${status} ${reqId} - Schema:${formatStatus(val.schemaPass)} Logic:${formatStatus(val.logicPass)} Boot:${formatStatus(val.bootPass)}`
      );
    } else {
      console.log(`✗ ${reqId} - NOT FOUND`);
    }
  }

  if (totalFail === 0) {
    console.log("\n" + "=".repeat(80));
    console.log("✓ ALL VALIDATIONS PASSED - Ready for deployment");
    console.log("=".repeat(80));
    process.exit(0);
  } else {
    console.log("\n" + "=".repeat(80));
    console.log("✗ SOME VALIDATIONS FAILED - See details above");
    console.log("=".repeat(80));
    process.exit(1);
  }
}

main();
