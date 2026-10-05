/**
 * CLI: arranca la app web para un perfil o crea uno nuevo con wizard.
 *
 *   npx tsx web/cli.ts --profile concesionaria
 *   npx tsx web/cli.ts --wizard
 *   npx tsx web/cli.ts --list
 */
import "dotenv/config.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { AppBootResult } from "./types.js";
import type { WizardDraft, UserDecisions } from "./decision-screen-types.js";
import { allBootableIds, bootProfile } from "./boot-profile.js";
import { startWebServer } from "./server.js";
import { generateWizardDraft } from "../generator/cli-wizard.js";
import { DEFAULT_SAMPLE_PARTES } from "./sample-data.js";

// ❌ ELIMINA esto en producción (solo para sesión CLI → web)
let storedWizardDraft: WizardDraft | null = null;

export function getStoredWizardDraft(): WizardDraft | null {
  return storedWizardDraft;
}

export function setStoredWizardDraft(draft: WizardDraft): void {
  storedWizardDraft = draft;
}

export function applyWizardDecisions(
  draft: WizardDraft,
  decisions: UserDecisions
): AppBootResult {
  // TODO: Aplicar cambios de módulos, diseño, config
  // Por ahora, devuelve como está
  return {
    profileId: `wizard-${draft.input.companyId}`,
    brandName: decisions.branding?.brandName ?? draft.spec.identity.brandName,
    spec: draft.spec,
    input: draft.input,
    designSystem: draft.designSystem,
    questions: [],
    roles: draft.input.roles,
    samplePartes: DEFAULT_SAMPLE_PARTES,
    sampleRows: [],
    unrendered: [],
  } as AppBootResult;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  if (hasFlag("--list") || hasFlag("-l")) {
    console.log("Perfiles arrancables:");
    for (const id of allBootableIds()) console.log(`  ${id}`);
    return;
  }

  const portRaw = arg("--port");
  const port = portRaw ? Number(portRaw) : 4173;

  let boot: AppBootResult;
  if (hasFlag("--wizard")) {
    console.log("\n🚀 Wizard Interactivo\n");
    
    // ✅ NUEVO: Generar DRAFT (sin aplicar decisiones todavía)
    const draft = await generateWizardDraft();
    storedWizardDraft = draft;
    
    // Convertir DRAFT a AppBootResult (temporal, sin cambios)
    boot = {
      profileId: `wizard-${draft.input.companyId}`,
      brandName: draft.input.lifecycles[0]?.label ?? "Nuevo Negocio",
      spec: draft.spec,
      input: draft.input,
      designSystem: draft.designSystem,
      questions: [],
      roles: draft.input.roles,
      samplePartes: DEFAULT_SAMPLE_PARTES,
      sampleRows: [],
      unrendered: [],
    } as AppBootResult;
  } else {
    const profile = arg("--profile") ?? arg("-p") ?? "concesionaria";
    console.log(`Arrancando ABS web · perfil=${profile} …`);
    boot = bootProfile(profile);
  }

  console.log(
    `UiSpec sellada: ${boot.spec.id} hash=${boot.spec.contentHash.slice(0, 12)}`
  );
  console.log(
    `Roles: ${boot.roles.map((r: any) => r.id).join(", ")} · preguntas compositor: ${boot.questions.length}`
  );

  const handle = await startWebServer(boot, { port });
  console.log(`\n→ Abrir: ${handle.url}inicio`);
  console.log(`  Salud: ${handle.url}health`);
  
  if (hasFlag("--wizard") && storedWizardDraft) {
    console.log(`  📋 Decision: ${handle.url}wizard/decision`);
  }
  
  console.log(
    `  Dev:   ${handle.url}?role=${boot.roles[0]?.id ?? "gerente"}&parte=parte-demo-1`
  );
  console.log("\nCtrl+C para detener.\n");

  const stop = (): void => {
    void handle.close().then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
}

// Solo al ejecutarse como programa: server.ts importa este módulo (wizard draft)
// y el import no debe arrancar otro servidor.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  void main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}