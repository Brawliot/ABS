/**
 * Almacén de Fichas respaldado por SQLite.
 * `ficha_versions` es solo-añadir: cada alta/edición es una versión nueva.
 * Nada se modifica ni se borra.
 */

import Database from "better-sqlite3";
import type { FichaRecord, ValorCampo } from "../elements/ficha.js";

interface Row {
  readonly tenant_id: string;
  readonly ficha_id: string;
  readonly id: string;
  readonly version: number;
  readonly valores: string;
  readonly created_at: string;
  readonly recorded_at: string;
}

function toRecord(row: Row): FichaRecord {
  return {
    fichaId: row.ficha_id,
    id: row.id,
    tenantId: row.tenant_id,
    version: row.version,
    valores: JSON.parse(row.valores),
    createdAt: row.created_at,
    updatedAt: row.recorded_at,
  };
}

export interface IFichaStore {
  crear(
    tenantId: string,
    fichaId: string,
    id: string,
    valores: Record<string, ValorCampo>,
    at: string,
  ): FichaRecord;
  actualizar(
    tenantId: string,
    fichaId: string,
    id: string,
    valores: Record<string, ValorCampo>,
    at: string,
  ): FichaRecord;
  get(tenantId: string, fichaId: string, id: string): FichaRecord | undefined;
  listar(tenantId: string, fichaId: string): readonly FichaRecord[];
  historial(tenantId: string, fichaId: string, id: string): readonly FichaRecord[];
}

export class SqliteFichaStore implements IFichaStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") {
      this.db.pragma("journal_mode = WAL");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ficha_versions (
        tenant_id TEXT NOT NULL,
        ficha_id TEXT NOT NULL,
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        valores TEXT NOT NULL,
        created_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, ficha_id, id, version)
      );
      CREATE TRIGGER IF NOT EXISTS ficha_versions_no_update
      BEFORE UPDATE ON ficha_versions
      BEGIN SELECT RAISE(ABORT, 'No se permite UPDATE en ficha_versions'); END;
      CREATE TRIGGER IF NOT EXISTS ficha_versions_no_delete
      BEFORE DELETE ON ficha_versions
      BEGIN SELECT RAISE(ABORT, 'No se permite DELETE en ficha_versions'); END;
    `);
  }

  crear(
    tenantId: string,
    fichaId: string,
    id: string,
    valores: Record<string, ValorCampo>,
    at: string,
  ): FichaRecord {
    const existing = this.get(tenantId, fichaId, id);
    if (existing) {
      throw new Error(`La ficha ${fichaId}/${id} ya existe`);
    }
    return this.insert(tenantId, fichaId, id, 1, valores, at, at);
  }

  actualizar(
    tenantId: string,
    fichaId: string,
    id: string,
    valores: Record<string, ValorCampo>,
    at: string,
  ): FichaRecord {
    const prev = this.get(tenantId, fichaId, id);
    if (!prev) {
      throw new Error(`La ficha ${fichaId}/${id} no existe`);
    }
    return this.insert(tenantId, fichaId, id, prev.version + 1, valores, prev.createdAt, at);
  }

  get(
    tenantId: string,
    fichaId: string,
    id: string,
  ): FichaRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM ficha_versions
         WHERE tenant_id = ? AND ficha_id = ? AND id = ?
         ORDER BY version DESC LIMIT 1`,
      )
      .get(tenantId, fichaId, id) as Row | undefined;
    return row ? toRecord(row) : undefined;
  }

  listar(tenantId: string, fichaId: string): readonly FichaRecord[] {
    const rows = this.db
      .prepare(
        `SELECT v.* FROM ficha_versions v
         JOIN (
           SELECT id, MAX(version) AS version FROM ficha_versions
           WHERE tenant_id = ? AND ficha_id = ? GROUP BY id
         ) last ON last.id = v.id AND last.version = v.version
         WHERE v.tenant_id = ? AND v.ficha_id = ?
         ORDER BY v.created_at DESC, v.id ASC`,
      )
      .all(tenantId, fichaId, tenantId, fichaId) as Row[];
    return rows.map(toRecord);
  }

  historial(
    tenantId: string,
    fichaId: string,
    id: string,
  ): readonly FichaRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ficha_versions
         WHERE tenant_id = ? AND ficha_id = ? AND id = ?
         ORDER BY version ASC`,
      )
      .all(tenantId, fichaId, id) as Row[];
    return rows.map(toRecord);
  }

  close(): void {
    this.db.close();
  }

  private insert(
    tenantId: string,
    fichaId: string,
    id: string,
    version: number,
    valores: Record<string, ValorCampo>,
    createdAt: string,
    at: string,
  ): FichaRecord {
    this.db
      .prepare(
        `INSERT INTO ficha_versions
           (tenant_id, ficha_id, id, version, valores, created_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(tenantId, fichaId, id, version, JSON.stringify(valores), createdAt, at);
    return this.get(tenantId, fichaId, id)!;
  }
}
