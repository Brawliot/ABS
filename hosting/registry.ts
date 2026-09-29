/**
 * Registro central companyId → base de datos.
 * Plano de control local (SQLite): sirve shared/dedicated (nosotros) y on_client (sin nuestros servidores).
 */

import Database from "better-sqlite3";
import type { CompanyRoute, HostingMode } from "./types.js";
import { HostingError } from "./types.js";

export class CompanyDatabaseRegistry {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS company_routes (
        company_id TEXT PRIMARY KEY NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('shared','dedicated','on_client')),
        database_url TEXT NOT NULL,
        read_only INTEGER NOT NULL DEFAULT 0,
        label TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_routes_mode ON company_routes(mode);
    `);
  }

  upsert(route: Omit<CompanyRoute, "updatedAt"> & { updatedAt?: string }): CompanyRoute {
    const updatedAt = route.updatedAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO company_routes (company_id, mode, database_url, read_only, label, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(company_id) DO UPDATE SET
           mode = excluded.mode,
           database_url = excluded.database_url,
           read_only = excluded.read_only,
           label = excluded.label,
           updated_at = excluded.updated_at`,
      )
      .run(
        route.companyId,
        route.mode,
        route.databaseUrl,
        route.readOnly ? 1 : 0,
        route.label ?? null,
        updatedAt,
      );
    return this.require(route.companyId);
  }

  get(companyId: string): CompanyRoute | undefined {
    const row = this.db
      .prepare(
        `SELECT company_id, mode, database_url, read_only, label, updated_at
         FROM company_routes WHERE company_id = ?`,
      )
      .get(companyId) as
      | {
          company_id: string;
          mode: HostingMode;
          database_url: string;
          read_only: number;
          label: string | null;
          updated_at: string;
        }
      | undefined;
    if (!row) return undefined;
    const route: CompanyRoute = {
      companyId: row.company_id,
      mode: row.mode,
      databaseUrl: row.database_url,
      readOnly: row.read_only === 1,
      updatedAt: row.updated_at,
    };
    if (row.label != null) {
      return { ...route, label: row.label };
    }
    return route;
  }

  require(companyId: string): CompanyRoute {
    const r = this.get(companyId);
    if (!r) {
      throw new HostingError(
        `Empresa desconocida en registro: ${companyId}`,
        "unknown_company",
      );
    }
    return r;
  }

  setReadOnly(companyId: string, readOnly: boolean): CompanyRoute {
    const cur = this.require(companyId);
    return this.upsert({ ...cur, readOnly });
  }

  list(): readonly CompanyRoute[] {
    const rows = this.db
      .prepare(
        `SELECT company_id, mode, database_url, read_only, label, updated_at
         FROM company_routes ORDER BY company_id`,
      )
      .all() as Array<{
      company_id: string;
      mode: HostingMode;
      database_url: string;
      read_only: number;
      label: string | null;
      updated_at: string;
    }>;
    return rows.map((row) => {
      const route: CompanyRoute = {
        companyId: row.company_id,
        mode: row.mode,
        databaseUrl: row.database_url,
        readOnly: row.read_only === 1,
        updatedAt: row.updated_at,
      };
      return row.label != null ? { ...route, label: row.label } : route;
    });
  }

  remove(companyId: string): void {
    this.db.prepare(`DELETE FROM company_routes WHERE company_id = ?`).run(companyId);
  }

  close(): void {
    this.db.close();
  }
}
