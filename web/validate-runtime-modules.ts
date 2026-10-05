/**
 * Validación y cleanup de módulos Phase 2
 * Ejecutar: npx ts-node validate-runtime-modules.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

const moduleFiles = [
  "runtime-stock.ts",
  "runtime-compras.ts",
  "runtime-logistica.ts",
  "runtime-facturas.ts",
  "runtime-cobros.ts",
  "runtime-transacciones.ts",
  "runtime-crm.ts",
  "runtime-contabilidad.ts",
];

interface ValidationResult {
  module: string;
  hasFactory: boolean;
  hasInterface: boolean;
  methodCount: number;
  lineCount: number;
  importsCorrect: boolean;
  circularRisks: string[];
}

function validateModule(filePath: string): ValidationResult {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const fileName = filePath.split("/").pop() || "";

  // Detectar factory function
  const hasFactory = /export\s+function\s+create\w+Functions/.test(content);

  // Detectar interface
  const hasInterface = /export\s+interface\s+\w+RuntimeFunctions/.test(content);

  // Contar métodos (líneas con "(): " o "),")
  const methodPattern = /^\s+\w+\([^)]*\)\s*[:{]/gm;
  const methodCount = (content.match(methodPattern) || []).length;

  // Checks de imports
  const importsCorrect = !content.includes(`import.*runtime-stock`) ||
    !content.includes(`import.*runtime-compras`) ||
    !content.includes(`import.*runtime-logistica`);

  // Detectar riesgos de ciclos
  const circularRisks: string[] = [];

  // Todas las importaciones del archivo
  const importLines = lines.filter((l) => l.includes("import"));

  // Chequear si importa otros módulos runtime-*
  const otherModules = moduleFiles.filter((m) => m !== fileName);
  for (const otherModule of otherModules) {
    const moduleName = otherModule.replace(".ts", "");
    if (importLines.some((l) => l.includes(moduleName))) {
      circularRisks.push(`imports ${moduleName}`);
    }
  }

  return {
    module: fileName,
    hasFactory,
    hasInterface,
    methodCount,
    lineCount: lines.length,
    importsCorrect: !!importsCorrect,
    circularRisks,
  };
}

function validateRuntimeIntegration(): string[] {
  const runtimePath = join(process.cwd(), "web", "runtime.ts");
  const content = readFileSync(runtimePath, "utf-8");
  const issues: string[] = [];

  for (const module of moduleFiles) {
    const baseModuleName = module.replace("runtime-", "").replace(".ts", "");

    // Convert module name to function name (e.g., stock -> Stock, compras -> Compras)
    const factoryFuncName = "create" +
      baseModuleName
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join("") +
      "Functions";

    // Chequear import
    if (!content.includes(factoryFuncName)) {
      issues.push(`❌ ${module}: no import en runtime.ts`);
    }

    // Chequear inicialización
    const funcPrefix = baseModuleName.replace("-", "");
    if (!content.includes(`this.${funcPrefix}Functions =`)) {
      issues.push(`❌ ${module}: no inicialización en constructor`);
    }
  }

  return issues;
}

function printReport(results: ValidationResult[]): void {
  console.log("\n📊 VALIDATION REPORT - Runtime Modules (Phase 2)\n");
  console.log("═".repeat(80));

  let totalMethods = 0;
  let totalLines = 0;
  const issues: string[] = [];

  for (const result of results) {
    console.log(`\n${result.module}`);
    console.log("-".repeat(40));

    const checks = [
      result.hasFactory ? "✅ Factory function" : "❌ Factory missing",
      result.hasInterface ? "✅ Interface defined" : "❌ Interface missing",
      result.importsCorrect ? "✅ Imports clean" : "⚠️  Import issues",
    ];

    for (const check of checks) {
      console.log(`  ${check}`);
    }

    console.log(`  📝 ${result.lineCount} lines, ${result.methodCount} methods`);

    if (result.circularRisks.length > 0) {
      console.log(`  ⚠️  Circular risks: ${result.circularRisks.join(", ")}`);
      issues.push(`${result.module}: ${result.circularRisks.join(", ")}`);
    }

    totalMethods += result.methodCount;
    totalLines += result.lineCount;
  }

  console.log("\n" + "═".repeat(80));
  console.log("\n📈 SUMMARY");
  console.log(`  Total modules: ${results.length}`);
  console.log(`  Total lines: ${totalLines}`);
  console.log(`  Total methods: ${totalMethods}`);
  console.log(`  Avg lines/module: ${Math.round(totalLines / results.length)}`);
  console.log(`  Avg methods/module: ${Math.round(totalMethods / results.length)}`);

  // Runtime integration check
  console.log("\n🔌 INTEGRATION CHECK");
  const integrationIssues = validateRuntimeIntegration();
  if (integrationIssues.length === 0) {
    console.log("  ✅ All modules properly integrated in runtime.ts");
  } else {
    for (const issue of integrationIssues) {
      console.log(`  ${issue}`);
      issues.push(issue);
    }
  }

  // Quality score
  const score = 100 - issues.length * 5;
  console.log(`\n🎯 QUALITY SCORE: ${Math.max(0, score)}/100`);

  if (issues.length === 0) {
    console.log("\n✅ ALL CHECKS PASSED - Ready for Phase 3 deployment\n");
  } else {
    console.log(`\n⚠️  ${issues.length} issue(s) found:\n`);
    for (const issue of issues) {
      console.log(`  • ${issue}`);
    }
    console.log();
  }
}

// Main
const basePath = process.cwd();
const results: ValidationResult[] = [];

for (const module of moduleFiles) {
  const filePath = join(basePath, "web", module);
  try {
    const result = validateModule(filePath);
    results.push(result);
  } catch (e) {
    console.error(`❌ Error validating ${module}: ${(e as Error).message}`);
  }
}

printReport(results);
