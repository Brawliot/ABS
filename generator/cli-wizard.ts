/**
 * Wizard interactivo: Crear un negocio desde cero
 * Preguntas → GeneratorInput → UiSpec → AppBootResult
 */

import { createHash } from "node:crypto";
import * as readline from "node:readline";
import type {
  Lifecycle,
  StateNode,
  Transition,
} from "../core/lifecycle.js";
import type { EvidenceKind } from "../core/grammar.js";
import type { GeneratorInput, LifecycleSlice } from "../generator/types.js";
import type { CompiledRuleSet, RoleDef } from "../policies/types.js";
import { generateUiSpec } from "../generator/index.js";
import type { ValidatedUiSpec } from "../presentation/validated.js";
import type { AppBootResult } from "../web/types.js";
import { buildSampleRows, DEFAULT_SAMPLE_PARTES } from "../web/sample-data.js";
import { proposeDesignSystems } from "../design/index.js";

interface WizardAnswers {
  businessName: string;
  companyId: string;
  roles: string[];
  mainStates: string[];
  secondaryProcesses: string[];
  hasCalendar: boolean;
  hasFormalDocuments: boolean;
  hasFiscalCompliance: boolean;
}

/**
 * Preguntas interactivas
 */
async function askQuestions(): Promise<WizardAnswers> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log("\n🚀 Wizard: Crear un nuevo negocio\n");

  const businessName = await question("¿Nombre del negocio? ");
  const rolesInput = await question(
    "¿Roles (separados por coma)? Ej: gerente, vendedor, cliente\n> "
  );
  const statesInput = await question(
    "¿Estados principales (separados por coma)? Ej: propuesta, aceptada, completada\n> "
  );
  const secondaryInput = await question(
    "¿Procesos secundarios (separados por coma, o dejar en blanco)? Ej: pago, inventario\n> "
  );
  const calendar = (
    await question("¿Usa calendario/horario? (s/n): ")
  ).toLowerCase() === "s";
  const documents = (
    await question("¿Tiene documentos formales? (s/n): ")
  ).toLowerCase() === "s";
  const fiscal = (await question("¿Cumplimiento fiscal? (s/n): ")).toLowerCase() === "s";

  rl.close();

  return {
    businessName,
    companyId: `company-${businessName.toLowerCase().replace(/\s+/g, "-")}`,
    roles: rolesInput.split(",").map((r) => r.trim()),
    mainStates: statesInput.split(",").map((s) => s.trim()),
    secondaryProcesses: secondaryInput
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s),
    hasCalendar: calendar,
    hasFormalDocuments: documents,
    hasFiscalCompliance: fiscal,
  };
}

/**
 * Crea un ciclo de vida mínimo a partir de estados
 */
function buildMinimalLifecycle(stateIds: string[]): Lifecycle {
  const commitments = Array.from({ length: Math.max(1, stateIds.length - 1) }, (_, i) => ({
    id: `commit_${i}`,
    label: `Paso ${i + 1}`,
  }));

  const isCancelTerminal = (id: string) => {
    const lower = id.toLowerCase();
    return lower.includes("cancel") || lower.includes("rechaz") || lower.includes("abort");
  };

  const states: StateNode[] = stateIds.map((id, idx) => ({
    id,
    kind: idx === 0 
      ? "inicial" 
      : isCancelTerminal(id)
        ? "terminal_rechazo"
        : idx === stateIds.length - 1
          ? "terminal_exito"
          : "intermedio",
    label: id.replace(/_/g, " "),
    situations: [
      {
        fulfilled: commitments.slice(0, idx).map((c) => c.id),
        pending: commitments.slice(idx).map((c) => c.id),
      },
    ],
  }));

  const transitions: Transition[] = [];
  for (let i = 0; i < stateIds.length - 1; i++) {
    const from = stateIds[i]!;
    const to = stateIds[i + 1]!;
    transitions.push({
      id: `t_${from}_to_${to}`,
      from,
      to,
      requiredEvidence: "aceptacion" as EvidenceKind,
      condition: "true",
      allowedActor: "humano",
      fulfills: [`commit_${i}`],
    } as unknown as Transition);
  }

  return {
    states,
    transitions,
    commitments,
  } as Lifecycle;
}

/**
 * Crea un RuleSet mínimo con guard rules
 */
function buildMinimalRuleSet(
  roles: string[],
  transitions: any[],
  companyId: string,
  businessName: string
): CompiledRuleSet {
  const roleDefs: RoleDef[] = roles.map((r) => ({
    id: r,
    label: r.charAt(0).toUpperCase() + r.slice(1),
  }));

  const rules = transitions.flatMap((t) =>
    roles.map((role) => ({
      id: `guard-${t.id}-${role}`,
      kind: "guard" as const,
      transitionId: t.id,
      action: "ejecutar" as const,
      allowedRoles: [role],
      binding: { mode: "live" as const },
    }))
  );

  const contentHash = createHash("sha256")
    .update(JSON.stringify(rules))
    .digest("hex");

  return {
    version: "1.0.0",
    activationAt: new Date().toISOString(),
    sourceDocumentId: `policy-${companyId}`,
    sourceDocumentVersion: "1.0.0",
    companyId,
    archetypeId: `archetype-${businessName.toLowerCase().replace(/\s+/g, "-")}`,
    contentHash,
    roles: roleDefs,
    rules: rules as any,
    actorDirectory: {},
    deadlines: [],
    goals: [],
  };
}

/**
 * Construye GeneratorInput mínimo
 */
function buildGeneratorInput(answers: WizardAnswers): GeneratorInput {
  const lifecycle = buildMinimalLifecycle(answers.mainStates);
  const ruleSet = buildMinimalRuleSet(
    answers.roles,
    lifecycle.transitions as any,
    answers.companyId,
    answers.businessName
  );

  const lifecycleSlice: LifecycleSlice = {
    id: "lc.main",
    archetypeId: ruleSet.archetypeId,
    lifecycle,
    label: answers.businessName,
    compositionRole: "standalone",
  };

  return {
    caseId: `case-${answers.companyId}`,
    caseVersion: "1.0.0",
    companyId: answers.companyId,
    generatedAt: new Date().toISOString(),
    lifecycles: [lifecycleSlice],
    ruleSet,
    roles: ruleSet.roles,
    channels: ["web"],
    resourceSubtypes: [],
    naturalezaBienes: ["propios_unitarios"],
    paymentMode: "inmediato",
    hasPartes: true,
    hasMovimientos: false,
    hasFormalDocuments: answers.hasFormalDocuments,
    hasFiscalCompliance: answers.hasFiscalCompliance,
    hasCalendar: answers.hasCalendar,
    composition: {
      dominant: "venta" as any,
      secondaries: [],
    },
  };
}

/**
 * Ejecuta el wizard y devuelve AppBootResult
 */
export async function runWizard(): Promise<AppBootResult> {
  const answers = await askQuestions();

  console.log("\n⏳ Generando especificación de UI...\n");

  const input = buildGeneratorInput(answers);
  const spec = generateUiSpec(input);

  console.log(`✅ Negocio "${answers.businessName}" generado`);
  console.log(`   Módulos: ${spec.modules.map((m) => m.id).join(", ")}`);
  console.log(`   Vistas: ${spec.views.length}`);
  console.log(`   Acciones: ${spec.actions.length}`);
  console.log(`   Hash: ${spec.contentHash.slice(0, 8)}...\n`);

  const designSystem = proposeDesignSystems({
    companyId: answers.companyId,
    businessDescription: answers.businessName,
    identity: { brandName: answers.businessName },
  }).proposals[0]!;

  return {
    profileId: `wizard-${answers.companyId}`,
    brandName: answers.businessName,
    spec,
    input,
    designSystem,
    questions: [],
    roles: input.roles,
    samplePartes: DEFAULT_SAMPLE_PARTES,
    sampleRows: [],
    unrendered: [],
  } as AppBootResult;
}

export type { WizardAnswers, GeneratorInput };