/**
 * Facturas expedidas (SQLite) y datos fiscales de la empresa emisora.
 *
 * - Numeración correlativa por serie y año, asignada dentro de una
 *   transacción: sin huecos ni duplicados (UNIQUE).
 * - Inmutables: disparadores que abortan cualquier UPDATE o DELETE.
 * - Datos del destinatario cifrados (AES-256-GCM), como la identidad de Parte.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  codigoFactura,
  huellaDe,
  type DatosEmisor,
  type DatosReceptor,
  type Factura,
} from "../elements/factura.js";
import { openPersonal, sealPersonal } from "./identity-crypto.js";

/** Lo que se expide: todo menos numeración, huellas e id. */
export type FacturaBorrador = Omit<
  Factura,
  "id" | "anio" | "numero" | "codigo" | "huellaAnterior" | "huella"
> & { readonly tipoDocumento?: "factura" | "albaran" | "rectificativa" };

interface Row {
  readonly payload: string;
  readonly receptor_cipher: Buffer | null;
  readonly receptor_nonce: Buffer | null;
}

export class FacturaStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacturaStoreError";
  }
}

export class SqliteFacturaStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facturas (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        id TEXT NOT NULL UNIQUE,
        serie TEXT NOT NULL,
        anio INTEGER NOT NULL,
        numero INTEGER NOT NULL,
        expediente_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        receptor_cipher BLOB,
        receptor_nonce BLOB,
        huella TEXT NOT NULL,
        UNIQUE (tenant_id, serie, anio, numero)
      );
      CREATE INDEX IF NOT EXISTS idx_facturas_exp ON facturas(tenant_id, expediente_id);
      CREATE TRIGGER IF NOT EXISTS facturas_no_update BEFORE UPDATE ON facturas
      BEGIN SELECT RAISE(ABORT, 'Las facturas expedidas no se modifican: use una rectificativa'); END;
      CREATE TRIGGER IF NOT EXISTS facturas_no_delete BEFORE DELETE ON facturas
      BEGIN SELECT RAISE(ABORT, 'Las facturas expedidas no se borran: use una rectificativa'); END;

      CREATE TABLE IF NOT EXISTS empresa_fiscal (
        tenant_id TEXT PRIMARY KEY,
        razon_social TEXT NOT NULL,
        nif TEXT NOT NULL,
        domicilio TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Expide: asigna el siguiente número de la serie en el año y encadena la
   * huella con la última factura del tenant. Todo en una transacción.
   */
  expedir(tenantId: string, borrador: FacturaBorrador): Factura {
    const anio = Number(borrador.fechaExpedicion.slice(0, 4));
    return this.db.transaction((): Factura => {
      const max = this.db
        .prepare(
          `SELECT COALESCE(MAX(numero), 0) AS n FROM facturas
           WHERE tenant_id = ? AND serie = ? AND anio = ?`,
        )
        .get(tenantId, borrador.serie, anio) as { n: number };
      const last = this.db
        .prepare(
          `SELECT huella FROM facturas WHERE tenant_id = ? ORDER BY seq DESC LIMIT 1`,
        )
        .get(tenantId) as { huella: string } | undefined;
      const numero = max.n + 1;
      const tipoDocumento = borrador.tipoDocumento || "factura";
      const sinHuella: Omit<Factura, "huella"> = {
        ...borrador,
        tipoDocumento,
        id: `fac-${randomUUID()}`,
        tenantId,
        anio,
        numero,
        codigo: codigoFactura(borrador.serie, anio, numero),
        huellaAnterior: last?.huella ?? "",
      };
      const factura: Factura = { ...sinHuella, huella: huellaDe(sinHuella) };
      const { receptor, ...publico } = factura;
      const sealed = receptor
        ? sealPersonal({
            displayName: receptor.nombre,
            ...(receptor.nif ? { taxId: receptor.nif } : {}),
            ...(receptor.domicilio ? { address: receptor.domicilio } : {}),
          })
        : undefined;
      this.db
        .prepare(
          `INSERT INTO facturas
             (tenant_id, id, serie, anio, numero, expediente_id, payload, receptor_cipher, receptor_nonce, huella)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          tenantId,
          factura.id,
          factura.serie,
          anio,
          numero,
          factura.expedienteId,
          JSON.stringify(publico),
          sealed?.ciphertext ?? null,
          sealed?.nonce ?? null,
          factura.huella,
        );
      return factura;
    })();
  }

  get(tenantId: string, id: string): Factura | undefined {
    const row = this.db
      .prepare(`SELECT payload, receptor_cipher, receptor_nonce FROM facturas WHERE tenant_id = ? AND id = ?`)
      .get(tenantId, id) as Row | undefined;
    return row ? toFactura(row) : undefined;
  }

  /** En orden de expedición. */
  list(tenantId: string): readonly Factura[] {
    const rows = this.db
      .prepare(`SELECT payload, receptor_cipher, receptor_nonce FROM facturas WHERE tenant_id = ? ORDER BY seq ASC`)
      .all(tenantId) as Row[];
    return rows.map(toFactura);
  }

  porExpediente(tenantId: string, expedienteId: string): readonly Factura[] {
    const rows = this.db
      .prepare(
        `SELECT payload, receptor_cipher, receptor_nonce FROM facturas
         WHERE tenant_id = ? AND expediente_id = ? ORDER BY seq ASC`,
      )
      .all(tenantId, expedienteId) as Row[];
    return rows.map(toFactura);
  }

  getEmisor(tenantId: string): DatosEmisor | undefined {
    const row = this.db
      .prepare(`SELECT razon_social, nif, domicilio FROM empresa_fiscal WHERE tenant_id = ?`)
      .get(tenantId) as { razon_social: string; nif: string; domicilio: string } | undefined;
    return row ? { razonSocial: row.razon_social, nif: row.nif, domicilio: row.domicilio } : undefined;
  }

  putEmisor(tenantId: string, e: DatosEmisor, at: string): void {
    this.db
      .prepare(
        `INSERT INTO empresa_fiscal (tenant_id, razon_social, nif, domicilio, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id) DO UPDATE SET
           razon_social = excluded.razon_social, nif = excluded.nif,
           domicilio = excluded.domicilio, updated_at = excluded.updated_at`,
      )
      .run(tenantId, e.razonSocial, e.nif, e.domicilio, at);
  }

  close(): void {
    this.db.close();
  }
}

function toFactura(row: Row): Factura {
  const publico = JSON.parse(row.payload) as Omit<Factura, "receptor">;
  if (!row.receptor_cipher || !row.receptor_nonce) return publico;
  const p = openPersonal(row.receptor_cipher, row.receptor_nonce);
  const receptor: DatosReceptor = {
    nombre: p.displayName,
    ...(p.taxId ? { nif: p.taxId } : {}),
    ...(p.address ? { domicilio: p.address } : {}),
  };
  return { ...publico, receptor };
}
