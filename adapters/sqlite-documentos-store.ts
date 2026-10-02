import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type { Documento, Permiso } from "../policies/documentos-acceso.js";
import type { Versión } from "../policies/documentos-versionado.js";
import type { Comentario } from "../policies/documentos-busqueda.js";

export class SqliteDocumentosStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documentos (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        contenido TEXT NOT NULL,
        propietario_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        versión INTEGER DEFAULT 1,
        fecha_creación TEXT NOT NULL,
        fecha_actualización TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS versiones_documento (
        id TEXT PRIMARY KEY,
        documento_id TEXT NOT NULL,
        número INTEGER NOT NULL,
        contenido_anterior TEXT NOT NULL,
        contenido_nuevo TEXT NOT NULL,
        autor TEXT NOT NULL,
        fecha TEXT NOT NULL,
        descripción_cambio TEXT,
        diff TEXT,
        FOREIGN KEY (documento_id) REFERENCES documentos(id),
        UNIQUE(documento_id, número)
      );

      CREATE TABLE IF NOT EXISTS permisos_documento (
        id TEXT PRIMARY KEY,
        documento_id TEXT NOT NULL,
        tipo_compartir TEXT NOT NULL,
        usuario_id TEXT,
        grupo_id TEXT,
        nivel TEXT NOT NULL,
        fecha_vencimiento TEXT,
        contraseña TEXT,
        fecha_creación TEXT NOT NULL,
        FOREIGN KEY (documento_id) REFERENCES documentos(id)
      );

      CREATE TABLE IF NOT EXISTS comentarios (
        id TEXT PRIMARY KEY,
        documento_id TEXT NOT NULL,
        comentario_padre_id TEXT,
        línea INTEGER NOT NULL,
        texto TEXT NOT NULL,
        autor_id TEXT NOT NULL,
        fecha_creación TEXT NOT NULL,
        resuelta INTEGER DEFAULT 0,
        FOREIGN KEY (documento_id) REFERENCES documentos(id)
      );

      CREATE TABLE IF NOT EXISTS links_públicos (
        código TEXT PRIMARY KEY,
        documento_id TEXT NOT NULL,
        url TEXT NOT NULL,
        nivel TEXT NOT NULL,
        contraseña TEXT,
        vencimiento TEXT,
        fecha_creación TEXT NOT NULL,
        FOREIGN KEY (documento_id) REFERENCES documentos(id)
      );

      CREATE INDEX IF NOT EXISTS idx_documentos_propietario ON documentos(propietario_id);
      CREATE INDEX IF NOT EXISTS idx_versiones_documento ON versiones_documento(documento_id);
      CREATE INDEX IF NOT EXISTS idx_permisos_documento ON permisos_documento(documento_id);
      CREATE INDEX IF NOT EXISTS idx_permisos_usuario ON permisos_documento(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_comentarios_documento ON comentarios(documento_id);
      CREATE INDEX IF NOT EXISTS idx_comentarios_línea ON comentarios(línea);
      CREATE INDEX IF NOT EXISTS idx_links_documento ON links_públicos(documento_id);
    `);
  }

  guardarDocumento(doc: Documento): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documentos
      (id, nombre, contenido, propietario_id, tipo, versión, fecha_creación, fecha_actualización)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      doc.id,
      doc.nombre,
      doc.contenido,
      doc.propietario_id,
      doc.tipo,
      doc.versión,
      doc.fecha_creación.toISOString(),
      doc.fecha_actualización.toISOString()
    );
  }

  obtenerDocumento(id: string): Documento | undefined {
    const stmt = this.db.prepare("SELECT * FROM documentos WHERE id = ?");
    const row = stmt.get(id) as any;

    if (!row) return undefined;

    return {
      id: row.id,
      nombre: row.nombre,
      contenido: row.contenido,
      propietario_id: row.propietario_id,
      tipo: row.tipo,
      versión: row.versión,
      fecha_creación: new Date(row.fecha_creación),
      fecha_actualización: new Date(row.fecha_actualización),
      permisos: this.obtenerPermisos(row.id),
    };
  }

  guardarPermiso(permiso: Permiso): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO permisos_documento
      (id, documento_id, tipo_compartir, usuario_id, grupo_id, nivel, fecha_vencimiento, contraseña, fecha_creación)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      permiso.id,
      permiso.documento_id,
      permiso.tipo_compartir,
      permiso.usuario_id ?? null,
      permiso.grupo_id ?? null,
      permiso.nivel,
      permiso.fecha_vencimiento?.toISOString() ?? null,
      permiso.contraseña ?? null,
      permiso.fecha_creación.toISOString()
    );
  }

  obtenerPermisos(documento_id: string): Permiso[] {
    const stmt = this.db.prepare(
      "SELECT * FROM permisos_documento WHERE documento_id = ?"
    );
    const rows = stmt.all(documento_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      documento_id: row.documento_id,
      tipo_compartir: row.tipo_compartir,
      usuario_id: row.usuario_id,
      grupo_id: row.grupo_id,
      nivel: row.nivel,
      fecha_vencimiento: row.fecha_vencimiento
        ? new Date(row.fecha_vencimiento)
        : undefined,
      contraseña: row.contraseña,
      fecha_creación: new Date(row.fecha_creación),
    }));
  }

  guardarVersión(versión: Versión): void {
    // Extrae documento_id del contexto (debe ser pasado)
    const stmt = this.db.prepare(`
      INSERT INTO versiones_documento
      (id, documento_id, número, contenido_anterior, contenido_nuevo, autor, fecha, descripción_cambio, diff)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Nota: documento_id necesita ser pasado como parámetro adicional
    // Por ahora, creamos un ID único para la versión
    stmt.run(
      randomUUID(),
      "doc-id", // Esto debería venir del contexto
      versión.número,
      versión.contenido_anterior,
      versión.contenido_nuevo,
      versión.autor,
      versión.fecha.toISOString(),
      versión.descripción_cambio ?? null,
      versión.diff ?? null
    );
  }

  obtenerHistorialVersiones(documento_id: string): Versión[] {
    const stmt = this.db.prepare(
      "SELECT * FROM versiones_documento WHERE documento_id = ? ORDER BY número"
    );
    const rows = stmt.all(documento_id) as any[];

    return rows.map((row) => ({
      número: row.número,
      contenido_anterior: row.contenido_anterior,
      contenido_nuevo: row.contenido_nuevo,
      autor: row.autor,
      fecha: new Date(row.fecha),
      descripción_cambio: row.descripción_cambio,
      diff: row.diff,
    }));
  }

  guardarComentario(comentario: Comentario): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO comentarios
      (id, documento_id, comentario_padre_id, línea, texto, autor_id, fecha_creación, resuelta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      comentario.id,
      comentario.documento_id,
      null, // comentario_padre_id si es respuesta
      comentario.línea,
      comentario.texto,
      comentario.autor_id,
      comentario.fecha_creación.toISOString(),
      comentario.resuelta ? 1 : 0
    );
  }

  obtenerComentarios(documento_id: string): Comentario[] {
    const stmt = this.db.prepare(
      "SELECT * FROM comentarios WHERE documento_id = ? ORDER BY línea, fecha_creación"
    );
    const rows = stmt.all(documento_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      documento_id: row.documento_id,
      línea: row.línea,
      texto: row.texto,
      autor_id: row.autor_id,
      fecha_creación: new Date(row.fecha_creación),
      resuelta: row.resuelta === 1,
    }));
  }

  guardarLinkPublico(
    código: string,
    documento_id: string,
    url: string,
    nivel: string,
    contraseña?: string,
    vencimiento?: Date
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO links_públicos
      (código, documento_id, url, nivel, contraseña, vencimiento, fecha_creación)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      código,
      documento_id,
      url,
      nivel,
      contraseña ?? null,
      vencimiento?.toISOString() ?? null,
      new Date().toISOString()
    );
  }

  obtenerLinkPublico(código: string) {
    const stmt = this.db.prepare(
      "SELECT * FROM links_públicos WHERE código = ?"
    );
    const row = stmt.get(código) as any;

    if (!row) return undefined;

    return {
      código: row.código,
      documento_id: row.documento_id,
      url: row.url,
      nivel: row.nivel,
      contraseña: row.contraseña,
      vencimiento: row.vencimiento
        ? new Date(row.vencimiento)
        : undefined,
    };
  }

  close(): void {
    this.db.close();
  }
}
