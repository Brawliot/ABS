/**
 * CAPA 1: Almacenamiento append-only del Vault en SQLite
 * - subirDocumento: hash + rechazo de duplicados
 * - obtenerContenido: retorna Buffer binario
 * - cambiarPermisos: INSERT OR REPLACE
 * - listarDocumentosPorRol
 * - registrarOperacion: append-only
 */

import { randomUUID } from "crypto";
import { createHash } from "crypto";
import Database from "better-sqlite3";
import type {
  Documento,
  NivelPermiso,
  PermisoDocumento,
  DocumentoOperacion,
} from "../elements/documento.js";

export class SqliteVaultStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documentos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        mimetype TEXT NOT NULL,
        tamanio INTEGER NOT NULL,
        propietarioId TEXT NOT NULL,
        expedienteId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS permisos_documento (
        documentoId TEXT NOT NULL,
        roleId TEXT NOT NULL,
        nivel TEXT NOT NULL CHECK(nivel IN ('ver', 'editar', 'descargar')),
        PRIMARY KEY (documentoId, roleId),
        FOREIGN KEY (documentoId) REFERENCES documentos(id)
      );

      CREATE TABLE IF NOT EXISTS operaciones_documento (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL CHECK(tipo IN ('renombrar', 'subir', 'cambiar_permisos')),
        documentoId TEXT NOT NULL,
        propietarioId TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        detalles TEXT NOT NULL,
        FOREIGN KEY (documentoId) REFERENCES documentos(id)
      );

      CREATE INDEX IF NOT EXISTS idx_docs_expediente ON documentos(expedienteId);
      CREATE INDEX IF NOT EXISTS idx_permisos_role ON permisos_documento(roleId);
      CREATE INDEX IF NOT EXISTS idx_operaciones_timestamp ON operaciones_documento(timestamp);
    `);
  }

  subirDocumento(
    nombre: string,
    mimetype: string,
    contenido: Buffer,
    propietarioId: string,
    expedienteId: string,
  ): string {
    const hash = this.calcularHash(contenido);

    // Rechazo de duplicados por hash
    const existente = this.db
      .prepare("SELECT id FROM documentos WHERE hash = ?")
      .get(hash);

    if (existente) {
      throw new Error(`Documento con hash ${hash} ya existe`);
    }

    const id = randomUUID();
    const ahora = new Date().toISOString();

    try {
      this.db
        .prepare(
          `
        INSERT INTO documentos (id, nombre, mimetype, tamanio, propietarioId, expedienteId, createdAt, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          id,
          nombre,
          mimetype,
          contenido.length,
          propietarioId,
          expedienteId,
          ahora,
          hash,
        );

      // Registrar operación
      this.registrarOperacion(id, propietarioId, "subir", {
        nombre,
        mimetype,
        tamanio: contenido.length,
        hash,
      });

      // Almacenar contenido binario (en producción usaría blob storage externo)
      this.almacenarContenido(id, contenido);

      return id;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        throw new Error(`Documento con hash ${hash} ya existe`);
      }
      throw error;
    }
  }

  obtenerContenido(documentoId: string): Buffer {
    const contenido = this.db
      .prepare("SELECT contenido FROM contenidos WHERE documentoId = ?")
      .get(documentoId) as { contenido: string } | undefined;

    if (!contenido) {
      throw new Error(`Contenido no encontrado para documento ${documentoId}`);
    }

    return Buffer.from(contenido.contenido, "base64");
  }

  cambiarPermisos(
    documentoId: string,
    roleId: string,
    nivel: NivelPermiso,
  ): void {
    const doc = this.db
      .prepare("SELECT id, propietarioId FROM documentos WHERE id = ?")
      .get(documentoId) as { id: string; propietarioId: string } | undefined;

    if (!doc) {
      throw new Error(`Documento ${documentoId} no encontrado`);
    }

    this.db
      .prepare(
        `
      INSERT INTO permisos_documento (documentoId, roleId, nivel)
      VALUES (?, ?, ?)
      ON CONFLICT(documentoId, roleId) DO UPDATE SET nivel = excluded.nivel
    `,
      )
      .run(documentoId, roleId, nivel);

    this.registrarOperacion(documentoId, doc.propietarioId, "cambiar_permisos", {
      roleId,
      nivel,
    });
  }

  listarDocumentosPorRol(roleId: string): Documento[] {
    const documentos = this.db
      .prepare(
        `
      SELECT DISTINCT d.id, d.nombre, d.mimetype, d.tamanio, d.propietarioId, d.expedienteId, d.createdAt, d.hash
      FROM documentos d
      INNER JOIN permisos_documento p ON d.id = p.documentoId
      WHERE p.roleId = ?
      ORDER BY d.createdAt DESC
    `,
      )
      .all(roleId) as Array<{
        id: string;
        nombre: string;
        mimetype: string;
        tamanio: number;
        propietarioId: string;
        expedienteId: string;
        createdAt: string;
        hash: string;
      }>;

    return documentos.map((doc) => ({
      ...doc,
      createdAt: new Date(doc.createdAt),
    }));
  }

  obtenerDocumento(documentoId: string): Documento | null {
    const doc = this.db
      .prepare("SELECT * FROM documentos WHERE id = ?")
      .get(documentoId) as {
      id: string;
      nombre: string;
      mimetype: string;
      tamanio: number;
      propietarioId: string;
      expedienteId: string;
      createdAt: string;
      hash: string;
    } | undefined;

    if (!doc) {
      return null;
    }

    return {
      ...doc,
      createdAt: new Date(doc.createdAt),
    };
  }

  obtenerPermiso(documentoId: string, roleId: string): NivelPermiso | null {
    const permiso = this.db
      .prepare(
        "SELECT nivel FROM permisos_documento WHERE documentoId = ? AND roleId = ?",
      )
      .get(documentoId, roleId) as { nivel: NivelPermiso } | undefined;

    return permiso ? permiso.nivel : null;
  }

  listarOperacionesPorDocumento(documentoId: string): DocumentoOperacion[] {
    const ops = this.db
      .prepare(
        "SELECT tipo, documentoId, propietarioId, timestamp, detalles FROM operaciones_documento WHERE documentoId = ? ORDER BY timestamp ASC",
      )
      .all(documentoId) as Array<{
        tipo: string;
        documentoId: string;
        propietarioId: string;
        timestamp: string;
        detalles: string;
      }>;

    return ops.map((op) => ({
      tipo: op.tipo as "renombrar" | "subir" | "cambiar_permisos",
      documentoId: op.documentoId,
      propietarioId: op.propietarioId,
      timestamp: new Date(op.timestamp),
      detalles: JSON.parse(op.detalles),
    }));
  }

  private registrarOperacion(
    documentoId: string,
    propietarioId: string,
    tipo: string,
    detalles: Record<string, unknown>,
  ): void {
    const id = randomUUID();
    const ahora = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO operaciones_documento (id, tipo, documentoId, propietarioId, timestamp, detalles)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, tipo, documentoId, propietarioId, ahora, JSON.stringify(detalles));
  }

  private calcularHash(contenido: Buffer): string {
    return createHash("sha256").update(contenido).digest("hex");
  }

  private almacenarContenido(documentoId: string, contenido: Buffer): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contenidos (
        documentoId TEXT PRIMARY KEY,
        contenido TEXT NOT NULL,
        FOREIGN KEY (documentoId) REFERENCES documentos(id)
      );
    `);

    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO contenidos (documentoId, contenido)
      VALUES (?, ?)
    `,
      )
      .run(documentoId, contenido.toString("base64"));
  }

  close(): void {
    this.db.close();
  }
}
