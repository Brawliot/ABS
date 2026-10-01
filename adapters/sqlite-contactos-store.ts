/**
 * Contactos de cliente (SQLite): múltiples personas de contacto por cliente.
 * Permite indicar quién es el contacto principal.
 */

import Database from "better-sqlite3";

export interface ContactoCliente {
  readonly id?: string;
  readonly clienteId: string;
  readonly nombre: string;
  readonly telefono?: string;
  readonly email?: string;
  readonly cargo?: string;
  readonly esPrincipal: boolean;
  readonly fechaRegistro: string;
}

export class SqliteContactosStore {
  private readonly db: Database.Database;

  constructor(path: string | ":memory:" = ":memory:") {
    this.db = new Database(path);
    if (path !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contactos_cliente (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        cliente_id TEXT NOT NULL,
        nombre TEXT NOT NULL,
        telefono TEXT,
        email TEXT,
        cargo TEXT,
        es_principal BOOLEAN NOT NULL DEFAULT 0,
        fecha_registro TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contactos_cliente ON contactos_cliente(tenant_id, cliente_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_contactos_principal ON contactos_cliente(tenant_id, cliente_id)
      WHERE es_principal = 1;
    `);
  }

  registrarContacto(
    tenantId: string,
    clienteId: string,
    datos: {
      readonly nombre: string;
      readonly telefono?: string;
      readonly email?: string;
      readonly cargo?: string;
      readonly esPrincipal?: boolean;
    },
    id?: string,
  ): string {
    const nombre = datos.nombre.trim();
    if (!nombre) throw new Error("El nombre no puede estar vacío.");
    if (nombre.length > 200) throw new Error("El nombre es demasiado largo.");

    const crypto = require("crypto");
    const contactoId = id || `contacto-${crypto.randomUUID()}`;
    const esPrincipal = datos.esPrincipal ? 1 : 0;

    this.db
      .prepare(
        `INSERT INTO contactos_cliente (id, tenant_id, cliente_id, nombre, telefono, email, cargo, es_principal, fecha_registro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        contactoId,
        tenantId,
        clienteId,
        nombre,
        datos.telefono?.trim() ?? null,
        datos.email?.trim() ?? null,
        datos.cargo?.trim() ?? null,
        esPrincipal,
        new Date().toISOString(),
      );

    return contactoId;
  }

  contactosDelCliente(tenantId: string, clienteId: string): readonly ContactoCliente[] {
    const rows = this.db
      .prepare(
        `SELECT id, cliente_id, nombre, telefono, email, cargo, es_principal, fecha_registro
         FROM contactos_cliente
         WHERE tenant_id = ? AND cliente_id = ?
         ORDER BY es_principal DESC, fecha_registro ASC`,
      )
      .all(tenantId, clienteId) as {
      id: string;
      cliente_id: string;
      nombre: string;
      telefono: string | null;
      email: string | null;
      cargo: string | null;
      es_principal: number;
      fecha_registro: string;
    }[];

    return rows.map((r) => ({
      id: r.id,
      clienteId: r.cliente_id,
      nombre: r.nombre,
      ...(r.telefono ? { telefono: r.telefono } : {}),
      ...(r.email ? { email: r.email } : {}),
      ...(r.cargo ? { cargo: r.cargo } : {}),
      esPrincipal: r.es_principal === 1,
      fechaRegistro: r.fecha_registro,
    }));
  }

  obtenerContacto(tenantId: string, contactoId: string): ContactoCliente | undefined {
    const row = this.db
      .prepare(
        `SELECT id, cliente_id, nombre, telefono, email, cargo, es_principal, fecha_registro
         FROM contactos_cliente
         WHERE tenant_id = ? AND id = ?`,
      )
      .get(tenantId, contactoId) as {
      id: string;
      cliente_id: string;
      nombre: string;
      telefono: string | null;
      email: string | null;
      cargo: string | null;
      es_principal: number;
      fecha_registro: string;
    } | undefined;

    if (!row) return undefined;
    return {
      id: row.id,
      clienteId: row.cliente_id,
      nombre: row.nombre,
      ...(row.telefono ? { telefono: row.telefono } : {}),
      ...(row.email ? { email: row.email } : {}),
      ...(row.cargo ? { cargo: row.cargo } : {}),
      esPrincipal: row.es_principal === 1,
      fechaRegistro: row.fecha_registro,
    };
  }

  establecerPrincipal(tenantId: string, clienteId: string, contactoId: string): void {
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `UPDATE contactos_cliente SET es_principal = 0
           WHERE tenant_id = ? AND cliente_id = ?`,
        )
        .run(tenantId, clienteId);
      this.db
        .prepare(
          `UPDATE contactos_cliente SET es_principal = 1
           WHERE tenant_id = ? AND id = ?`,
        )
        .run(tenantId, contactoId);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  close(): void {
    this.db.close();
  }
}
