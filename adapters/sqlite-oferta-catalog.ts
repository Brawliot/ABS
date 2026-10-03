/**
 * Catálogo de Ofertas respaldado por SQLite.
 * `oferta_versions` es solo-añadir: cada alta/edición/activación es una versión
 * nueva; la vigente es la de mayor número. Nada se modifica ni se borra.
 */

import Database from "better-sqlite3";
import {
  OfertaCatalogError,
  type IvaTipo,
  type OfertaCatalog,
  type OfertaInput,
  type OfertaRecord,
} from "../elements/oferta.js";
import type { OfertaSubtype } from "../elements/subtypes.js";

interface Row {
  readonly tenant_id: string;
  readonly oferta_id: string;
  readonly version: number;
  readonly subtype: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly precio_centimos: number;
  readonly iva_pct: number;
  readonly unidad: string;
  readonly activa: number;
  readonly created_at: string;
  readonly recorded_at: string;
}

function toRecord(row: Row): OfertaRecord {
  return {
    ofertaId: row.oferta_id,
    tenantId: row.tenant_id,
    version: row.version,
    subtype: row.subtype as OfertaSubtype,
    nombre: row.nombre,
    ...(row.descripcion ? { descripcion: row.descripcion } : {}),
    precioCentimos: row.precio_centimos,
    ivaPct: row.iva_pct as IvaTipo,
    unidad: row.unidad,
    activa: row.activa === 1,
    createdAt: row.created_at,
    updatedAt: row.recorded_at,
  };
}

export class SqliteOfertaCatalog implements OfertaCatalog {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") {
      this.db.pragma("journal_mode = WAL");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS oferta_versions (
        tenant_id TEXT NOT NULL,
        oferta_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        subtype TEXT NOT NULL,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        precio_centimos INTEGER NOT NULL CHECK (precio_centimos >= 0),
        iva_pct INTEGER NOT NULL,
        unidad TEXT NOT NULL,
        activa INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, oferta_id, version)
      );
    `);
  }

  create(
    tenantId: string,
    ofertaId: string,
    input: OfertaInput,
    at: string,
  ): OfertaRecord {
    if (this.get(tenantId, ofertaId)) {
      throw new OfertaCatalogError(`La oferta ${ofertaId} ya existe`);
    }
    return this.insert(tenantId, ofertaId, 1, input, true, at, at);
  }

  update(
    tenantId: string,
    ofertaId: string,
    input: OfertaInput,
    at: string,
  ): OfertaRecord {
    const prev = this.require(tenantId, ofertaId);
    return this.insert(
      tenantId,
      ofertaId,
      prev.version + 1,
      input,
      prev.activa,
      prev.createdAt,
      at,
    );
  }

  setActiva(
    tenantId: string,
    ofertaId: string,
    activa: boolean,
    at: string,
  ): OfertaRecord {
    const prev = this.require(tenantId, ofertaId);
    if (prev.activa === activa) return prev;
    return this.insert(
      tenantId,
      ofertaId,
      prev.version + 1,
      prev,
      activa,
      prev.createdAt,
      at,
    );
  }

  get(tenantId: string, ofertaId: string): OfertaRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM oferta_versions WHERE tenant_id = ? AND oferta_id = ?
         ORDER BY version DESC LIMIT 1`,
      )
      .get(tenantId, ofertaId) as Row | undefined;
    return row ? toRecord(row) : undefined;
  }

  getVersion(
    tenantId: string,
    ofertaId: string,
    version: number,
  ): OfertaRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM oferta_versions
         WHERE tenant_id = ? AND oferta_id = ? AND version = ?`,
      )
      .get(tenantId, ofertaId, version) as Row | undefined;
    return row ? toRecord(row) : undefined;
  }

  list(tenantId: string): readonly OfertaRecord[] {
    const rows = this.db
      .prepare(
        `SELECT v.* FROM oferta_versions v
         JOIN (
           SELECT oferta_id, MAX(version) AS version FROM oferta_versions
           WHERE tenant_id = ? GROUP BY oferta_id
         ) last ON last.oferta_id = v.oferta_id AND last.version = v.version
         WHERE v.tenant_id = ?
         ORDER BY v.nombre COLLATE NOCASE ASC, v.oferta_id ASC`,
      )
      .all(tenantId, tenantId) as Row[];
    return rows.map(toRecord);
  }

  history(tenantId: string, ofertaId: string): readonly OfertaRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM oferta_versions WHERE tenant_id = ? AND oferta_id = ?
         ORDER BY version ASC`,
      )
      .all(tenantId, ofertaId) as Row[];
    return rows.map(toRecord);
  }

  close(): void {
    this.db.close();
  }

  private require(tenantId: string, ofertaId: string): OfertaRecord {
    const rec = this.get(tenantId, ofertaId);
    if (!rec) throw new OfertaCatalogError(`La oferta ${ofertaId} no existe`);
    return rec;
  }

  private insert(
    tenantId: string,
    ofertaId: string,
    version: number,
    input: OfertaInput,
    activa: boolean,
    createdAt: string,
    at: string,
  ): OfertaRecord {
    this.db
      .prepare(
        `INSERT INTO oferta_versions
           (tenant_id, oferta_id, version, subtype, nombre, descripcion,
            precio_centimos, iva_pct, unidad, activa, created_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        ofertaId,
        version,
        input.subtype,
        input.nombre,
        input.descripcion ?? null,
        input.precioCentimos,
        input.ivaPct,
        input.unidad,
        activa ? 1 : 0,
        createdAt,
        at,
      );
    return this.getVersion(tenantId, ofertaId, version)!;
  }
}
