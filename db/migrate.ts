/**
 * Migraciones versionadas (UP/DOWN) para PostgreSQL.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "migrations");

export async function migrateUp(pool: Pool): Promise<readonly string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS abs_events;
      CREATE TABLE IF NOT EXISTS abs_events.schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".up.sql"))
      .sort();
    for (const file of files) {
      const version = file.replace(/\.up\.sql$/, "");
      const exists = await client.query(
        `SELECT 1 FROM abs_events.schema_migrations WHERE version = $1`,
        [version],
      );
      if ((exists.rowCount ?? 0) > 0) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO abs_events.schema_migrations (version) VALUES ($1)
           ON CONFLICT DO NOTHING`,
          [version],
        );
        await client.query("COMMIT");
        applied.push(version);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return applied;
}

export async function migrateDown(
  pool: Pool,
  steps = 1,
): Promise<readonly string[]> {
  const client = await pool.connect();
  const rolled: string[] = [];
  try {
    const { rows } = await client.query<{ version: string }>(
      `SELECT version FROM abs_events.schema_migrations ORDER BY version DESC LIMIT $1`,
      [steps],
    );
    for (const row of rows) {
      const file = `${row.version}.down.sql`;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `DELETE FROM abs_events.schema_migrations WHERE version = $1`,
          [row.version],
        );
        await client.query("COMMIT");
        rolled.push(row.version);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return rolled;
}

/**
 * Aisla consultas al tenant: set_config de sesión + limpieza al devolver al pool.
 * (is_local=true fallaría fuera de transacción: cada query sería otra TX.)
 */
export async function withCompanyContext<T>(
  client: PoolClient,
  companyId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  await client.query(`SELECT set_config('abs.company_id', $1, false)`, [
    companyId,
  ]);
  try {
    return await fn(client);
  } finally {
    await client.query(`SELECT set_config('abs.company_id', '', false)`);
  }
}
