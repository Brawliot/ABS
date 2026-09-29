/**
 * CLI: arranca la app web para un perfil o crea uno nuevo con wizard.
 *
 *   npx tsx web/cli.ts --profile concesionaria
 *   npx tsx web/cli.ts --wizard
 *   npx tsx web/cli.ts --list
 */
import type { AppBootResult } from "./types.js";
import { allBootableIds, bootProfile } from "./boot-profile.js";
import { startWebServer } from "./server.js";
import { runWizard } from "../generator/cli-wizard.js";

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
    boot = await runWizard();
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
  console.log(`\n→ Abrir: ${handle.url}`);
  console.log(`  Salud: ${handle.url}health`);
  console.log(
    `  Dev:   ${handle.url}?role=${boot.roles[0]?.id ?? "gerente"}&parte=parte-demo-1`
  );
  console.log("\nCtrl+C para detener.\n");

  const stop = (): void => {
    void handle.close().then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});