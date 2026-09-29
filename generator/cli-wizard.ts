/**
 * Wizard interactivo: Crear un negocio desde cero
 * Preguntas → GeneratorInput → UiSpec → WizardDraft
 * (NO genera AppBootResult directamente; eso lo hace web/cli.ts después de decisiones)
 */

import { createHash } from "node:crypto";
import * as readline from "node:readline";
import { ARCHETYPES, requireArchetype } from "../archetypes/catalog.js";
import type { ArchetypeId } from "../archetypes/types.js";
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
  archetypeId: ArchetypeId;
  secondaryProcesses: string[];
  hasCalendar: boolean;
  hasFormalDocuments: boolean;
  hasFiscalCompliance: boolean;
}

/**
 * Tipos de ciclo que se ofrecen al usuario, en el orden del catálogo.
 * El ciclo de vida sale siempre del arquetipo ya validado; el usuario
 * no escribe estados a mano.
 */
const ARCHETYPE_HINTS: Record<ArchetypeId, string> = {
  venta: "vendes productos (tienda, ferretería, concesionario)",
  servicio_proyecto:
    "haces un trabajo por encargo (peluquería, taller, gestoría, reformas)",
  suscripcion: "cobras un acceso recurrente (gimnasio, academia, software)",
  uso_temporal: "alquilas algo por un tiempo (maquinaria, alojamiento, parking)",
  intermediacion: "pones en contacto a dos partes (inmobiliaria, marketplace)",
  financiera: "gestionas dinero: cobros, pagos, crédito",
};

function parseArchetypeChoice(raw: string): ArchetypeId | undefined {
  const v = raw.trim().toLowerCase();
  const n = Number(v);
  if (Number.isInteger(n) && n >= 1 && n <= ARCHETYPES.length) {
    return ARCHETYPES[n - 1]!.id;
  }
  return ARCHETYPES.find((a) => a.id === v)?.id;
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
  // TODO(futuro): tras elegir el tipo, mostrar los estados del arquetipo y
  // dejar que el usuario los renombre (p. ej. "acordado" → "citado") y
  // active/desactive pasos opcionales. Hoy se usan los estados tal cual.
  const archetypeMenu = ARCHETYPES.map(
    (a, i) => `  ${i + 1}. ${a.label} — ${ARCHETYPE_HINTS[a.id]}`
  ).join("\n");
  let archetypeId: ArchetypeId | undefined;
  while (!archetypeId) {
    archetypeId = parseArchetypeChoice(
      await question(`¿Qué tipo de negocio es?\n${archetypeMenu}\n> `)
    );
    if (!archetypeId) {
      console.log(`Opción no válida. Escribe un número del 1 al ${ARCHETYPES.length}.`);
    }
  }
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
    archetypeId,
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
 * Crea un RuleSet mínimo con guard rules
 */
function buildMinimalRuleSet(
  roles: string[],
  transitions: any[],
  companyId: string,
  archetypeId: ArchetypeId
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
    archetypeId,
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
  const { lifecycle } = requireArchetype(answers.archetypeId);
  const ruleSet = buildMinimalRuleSet(
    answers.roles,
    lifecycle.transitions as any,
    answers.companyId,
    answers.archetypeId
  );

  const lifecycleSlice: LifecycleSlice = {
    id: `lc.${answers.archetypeId}`,
    archetypeId: answers.archetypeId,
    lifecycle,
    label: answers.businessName,
    compositionRole: "dominant",
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
      dominant: answers.archetypeId,
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
      whyThisModules: `Basado en que "${answers.businessName}" es un negocio con roles: ${answers.roles.join(", ")}, tipo de ciclo: ${requireArchetype(answers.archetypeId).label}`,
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