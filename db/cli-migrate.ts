/**
 * CLI migraciones: npx tsx db/cli-migrate.ts up|down
 */

import { Pool } from "pg";
import { migrateDown, migrateUp } from "./migrate.js";

async function main(): Promise<void> {
  const url = process.env.ABS_POSTGRES_URL;
  if (!url) {
    console.error("ABS_POSTGRES_URL requerido");
    process.exit(1);
  }
  const cmd = process.argv[2] ?? "up";
  const pool = new Pool({ connectionString: url });
  try {
    if (cmd === "up") {
      const applied = await migrateUp(pool);
      console.log(JSON.stringify({ ok: true, applied }));
    } else if (cmd === "down") {
      const steps = Number(process.argv[3] ?? "1");
      const rolled = await migrateDown(pool, steps);
      console.log(JSON.stringify({ ok: true, rolled }));
    } else {
      console.error("Uso: up | down [n]");
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
