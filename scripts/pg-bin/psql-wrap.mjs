/**
 * Reordena args: opciones antes del URI (psql trata lo posterior al dbname como query).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const real = join(here, "psql-real.exe");
const args = process.argv.slice(2);

let uri = null;
const opts = [];
for (const a of args) {
  if (/^postgres(ql)?:\/\//i.test(a)) uri = a;
  else opts.push(a);
}
if (!uri) {
  console.error("psql-wrap: falta URI postgres://");
  process.exit(2);
}

const r = spawnSync(real, [...opts, uri], { stdio: "inherit", windowsHide: true });
process.exit(r.status ?? 1);
