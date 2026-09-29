/**
 * Shim multiplataforma: ejecuta pg_dump/psql del contenedor oficial
 * cuando no hay cliente nativo (p. ej. Windows local).
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const tool = process.argv[2]; // pg_dump | psql
if (tool !== "pg_dump" && tool !== "psql") {
  console.error("Uso: pg-tool.mjs pg_dump|psql [args...]");
  process.exit(2);
}

const rawArgs = process.argv.slice(3);
const rewritten = rawArgs.map((a) =>
  a
    .replace(/@localhost(?=[:/])/g, "@host.docker.internal")
    .replace(/@127\.0\.0\.1(?=[:/])/g, "@host.docker.internal"),
);

const volumes = new Set();
for (let i = 0; i < rewritten.length; i++) {
  const a = rewritten[i]!;
  if ((a === "-f" || a === "--file") && rewritten[i + 1]) {
    const file = resolve(rewritten[i + 1]!);
    rewritten[i + 1] = file;
    mkdirSync(dirname(file), { recursive: true });
    volumes.add(`${dirname(file)}:${dirname(file)}`);
  }
}

const dockerArgs = [
  "run",
  "--rm",
  "--add-host=host.docker.internal:host-gateway",
];
for (const v of volumes) {
  dockerArgs.push("-v", v);
}
dockerArgs.push("postgres:16-bookworm", tool, ...rewritten);

const r = spawnSync("docker", dockerArgs, {
  stdio: "inherit",
  shell: false,
});
process.exit(r.status ?? 1);
