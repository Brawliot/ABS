/**
 * Restore verificado multiplataforma (Node): pg_dump → destino → mismo count.
 * Sustituye el shell script en Windows CI/dev.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";

const src = process.env.ABS_POSTGRES_URL;
const dst = process.env.ABS_POSTGRES_RESTORE_URL;
if (!src || !dst) {
  console.error("ABS_POSTGRES_URL y ABS_POSTGRES_RESTORE_URL requeridos");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "abs-restore-"));
const dump = join(dir, "dump.sql");
execFileSync(
  "pg_dump",
  [
    "--no-owner",
    "--schema=abs_events",
    "--schema=abs_identity",
    "--schema=abs_outbox",
    "-f",
    dump,
    src,
  ],
  { stdio: "inherit" },
);

const poolDst = new Pool({ connectionString: dst });
await poolDst.query(`
  DROP SCHEMA IF EXISTS abs_events CASCADE;
  DROP SCHEMA IF EXISTS abs_identity CASCADE;
  DROP SCHEMA IF EXISTS abs_outbox CASCADE;
`);
await poolDst.end();

execFileSync("psql", [dst, "-v", "ON_ERROR_STOP=1", "-f", dump], {
  stdio: "inherit",
});

const poolSrc = new Pool({ connectionString: src });
const poolCheck = new Pool({ connectionString: dst });
const a = await poolSrc.query(`SELECT count(*)::text AS c FROM abs_events.events`);
const b = await poolCheck.query(`SELECT count(*)::text AS c FROM abs_events.events`);
await poolSrc.end();
await poolCheck.end();
try {
  unlinkSync(dump);
} catch {
  /* ignore */
}

const srcC = a.rows[0]?.c;
const dstC = b.rows[0]?.c;
if (srcC !== dstC) {
  console.error(`[restore] FAIL origen=${srcC} destino=${dstC}`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, count: Number(srcC) }));
