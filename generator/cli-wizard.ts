/**
 * Wizard interactivo: Crear un negocio desde cero
 * Preguntas → GeneratorInput → UiSpec → WizardDraft
 * (NO genera AppBootResult directamente; eso lo hace web/cli.ts después de decisiones)
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
import type {
  WizardDraft,
  ModuleInfo,
  ColorPalette,
  TypographyPreset,
} from "../web/decision-screen-types.js";
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
 * Reordena automáticamente para que terminales vayan al final
 */
function buildMinimalLifecycle(stateIds: string[]): Lifecycle {
  // ✅ NUEVO: Reordenar estados para que terminales vayan al final
  const isCancelTerminal = (id: string) => {
    const lower = id.toLowerCase();
    return lower.includes("cancel") || lower.includes("rechaz") || lower.includes("abort");
  };

  const isLastTerminal = (id: string, idx: number, all: string[]) => {
    return idx === all.length - 1 && !isCancelTerminal(id);
  };

  // Separar: terminales de cancelación, terminales finales, intermedios
  const terminals = stateIds.filter(isCancelTerminal);
  const intermediate = stateIds.filter(id => !isCancelTerminal(id) && stateIds.indexOf(id) !== stateIds.length - 1);
  const finalState = stateIds[stateIds.length - 1];

  // Reordenar: intermedios → final → cancelables
  const orderedStateIds = [...intermediate, finalState!, ...terminals];

  console.log(`ℹ️  Estados reordenados: ${orderedStateIds.join(" → ")}`);

  const commitments = Array.from({ length: Math.max(1, orderedStateIds.length - 1) }, (_, i) => ({
    id: `commit_${i}`,
    label: `Paso ${i + 1}`,
  }));

  const states: StateNode[] = orderedStateIds.map((id, idx) => ({
    id,
    kind: idx === 0 
      ? "inicial" 
      : isCancelTerminal(id)
        ? "terminal_excepcion"
        : idx === orderedStateIds.length - 1
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

  // ✅ NO crear transiciones saliendo de estados terminales
  const transitions: Transition[] = [];
  for (let i = 0; i < orderedStateIds.length - 1; i++) {
    const from = orderedStateIds[i]!;
    const fromState = states[i]!;
    const to = orderedStateIds[i + 1]!;
    
    // Si el estado de origen es terminal, NO crear transición
    if (fromState.kind.startsWith("terminal")) {
      continue;
    }
    
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
 * Convierte ModuleSpec a ModuleInfo (con explicaciones)
 */
function modulesToModuleInfo(
  modules: readonly any[],
  description: string
): ModuleInfo[] {
  const descriptions: Record<string, string> = {
    "mod.tpv": "Sistema de punto de venta para transacciones presenciales",
    "mod.crm": "Gestión de clientes y relaciones comerciales",
    "mod.inventario": "Control de inventario y stock",
    "mod.agenda": "Sistema de citas y horarios",
    "mod.agenda_taller": "Agenda especializada para talleres y servicios",
    "mod.facturacion": "Facturación y cumplimiento fiscal",
    "mod.portal_cliente": "Portal autoservicio para clientes",
  };

  const importance: Record<string, "critical" | "high" | "medium" | "low"> = {
    "mod.crm": "critical",
    "mod.agenda": "high",
    "mod.facturacion": "high",
    "mod.tpv": "high",
    "mod.portal_cliente": "medium",
    "mod.inventario": "medium",
  };

  return modules.map((m: any) => ({
    id: m.id,
    labelKey: m.labelKey,
    name: m.id.replace("mod.", "").replace(/_/g, " ").toUpperCase(),
    description: descriptions[m.id] || "Módulo funcional",
    category: "RECOMMENDED" as const,
    confidence: 0.95,
    reason: "Detectado automáticamente por reglas",
    importance: importance[m.id] || "medium",
    relatedRoles: m.roleIds || [],
  }));
}

/**
 * Extrae información de diseño desde DesignSystem
 */
function extractDesignFromDesignSystem(designSystem: any): {
  colors: ColorPalette;
  typography: TypographyPreset;
  theme: "light" | "dark";
} {
  // TODO: Mapear DesignSystem real a ColorPalette y TypographyPreset
  // Por ahora, defaults
  return {
    colors: {
      primary: "#3B82F6",
      secondary: "#10B981",
      accent: "#F59E0B",
      success: "#10B981",
      warning: "#F59E0B",
      error: "#EF4444",
      background: "#FFFFFF",
      text: "#1F2937",
    },
    typography: {
      fontFamily: "Inter, sans-serif",
      fontSize: {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
        "2xl": 24,
      },
      fontWeight: {
        light: 300,
        regular: 400,
        semibold: 600,
        bold: 700,
      },
      lineHeight: {
        tight: 1.2,
        normal: 1.5,
        relaxed: 1.75,
      },
    },
    theme: "light",
  };
}

/**
 * ✅ NUEVA FUNCIÓN: Genera WizardDraft (lo que sale del generador)
 * No devuelve AppBootResult, solo el draft para que usuario valide
 */
export async function generateWizardDraft(): Promise<WizardDraft> {
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

  const moduleInfo = modulesToModuleInfo(spec.modules, answers.businessName);
  const design = extractDesignFromDesignSystem(designSystem);

  // ✅ Retorna WizardDraft (no AppBootResult)
  return {
    spec,
    designSystem,
    input,
    modules: {
      detected: moduleInfo,
      recommended: [],
      optional: [],
    },
    explanations: {
      whyThisModules: `Basado en que "${answers.businessName}" es un negocio con roles: ${answers.roles.join(", ")}, estados: ${answers.mainStates.join(", ")}`,
      designRationale: "Diseño moderno y profesional optimizado para usabilidad",
      risks: [],
      gaps: [],
    },
    design,
    config: {
      language: "es",
      timezone: "Europe/Madrid",
      currency: "EUR",
      region: "ES",
    },
  };
}

export type { WizardAnswers, GeneratorInput, WizardDraft };