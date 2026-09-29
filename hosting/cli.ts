/**
 * CLI hosting: export / move / bootstrap on-client.
 *
 *   npx tsx hosting/cli.ts export --company co1 --url $ABS_POSTGRES_URL --out tmp/co1.json
 *   npx tsx hosting/cli.ts move --company co1 --from-url ... --to-url ... --registry tmp/reg.sqlite --mode dedicated
 *   npx tsx hosting/cli.ts bootstrap-on-client --company co1 --package tmp/co1.json --url ... --registry tmp/reg.sqlite
 */

import { CompanyDatabaseRegistry } from "./registry.js";
import {
  bootstrapOnClient,
  exportCompanyToFile,
  moveCompany,
} from "./move-company.js";
import type { HostingMode } from "./types.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (!cmd || cmd === "--help") {
    console.log(`Comandos: export | move | bootstrap-on-client`);
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === "export") {
    const company = arg("--company");
    const url = arg("--url") ?? process.env.ABS_POSTGRES_URL;
    const out = arg("--out");
    if (!company || !url || !out) {
      throw new Error("export requiere --company --url --out");
    }
    const pkg = await exportCompanyToFile(url, company, out);
    console.log(
      JSON.stringify({
        ok: true,
        events: pkg.manifest.eventCount,
        hash: pkg.manifest.eventStreamHash,
        out,
      }),
    );
    return;
  }

  if (cmd === "move") {
    const company = arg("--company");
    const fromUrl = arg("--from-url") ?? process.env.ABS_POSTGRES_URL;
    const toUrl = arg("--to-url");
    const registryPath = arg("--registry") ?? ":memory:";
    const mode = (arg("--mode") ?? "dedicated") as HostingMode;
    if (!company || !fromUrl || !toUrl) {
      throw new Error("move requiere --company --from-url --to-url");
    }
    const registry = new CompanyDatabaseRegistry(registryPath);
    registry.upsert({
      companyId: company,
      mode: "shared",
      databaseUrl: fromUrl,
      readOnly: false,
    });
    const result = await moveCompany({
      registry,
      companyId: company,
      targetMode: mode,
      targetDatabaseUrl: toUrl,
    });
    console.log(JSON.stringify({ ok: true, ...result.verification.details }));
    registry.close();
    return;
  }

  if (cmd === "bootstrap-on-client") {
    const company = arg("--company");
    const pkgPath = arg("--package");
    const url = arg("--url");
    const registryPath = arg("--registry") ?? ":memory:";
    if (!company || !pkgPath || !url) {
      throw new Error(
        "bootstrap-on-client requiere --company --package --url",
      );
    }
    const registry = new CompanyDatabaseRegistry(registryPath);
    const check = await bootstrapOnClient({
      registry,
      companyId: company,
      localDatabaseUrl: url,
      packagePath: pkgPath,
    });
    console.log(
      JSON.stringify({
        ok: true,
        mode: "on_client",
        events: check.manifest.eventCount,
        hash: check.manifest.eventStreamHash,
      }),
    );
    registry.close();
    return;
  }

  throw new Error(`Comando desconocido: ${cmd}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
