/**
 * SQLite Store para CMS
 * APPEND-ONLY para versiones de páginas
 */

import Database from "better-sqlite3";
import type { PáginaCMS, VorisiónPágina } from "../elements/cms.js";

export class SqliteCMSStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS páginas_cms (
        id TEXT PRIMARY KEY,
        título TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        contenido TEXT,
        tipo TEXT NOT NULL,
        estado TEXT DEFAULT 'borrador',
        categorías TEXT,
        etiquetas TEXT,
        autor_id TEXT,
        vistas INTEGER DEFAULT 0,
        meta_descripción TEXT,
        palabras_clave TEXT,
        fecha_creación TEXT NOT NULL,
        fecha_actualización TEXT NOT NULL,
        fecha_publicación TEXT,
        fecha_programada TEXT
      );

      CREATE TABLE IF NOT EXISTS versiones_página (
        id TEXT PRIMARY KEY,
        página_id TEXT NOT NULL,
        número INTEGER NOT NULL,
        título TEXT NOT NULL,
        contenido TEXT,
        autor_id TEXT,
        cambios_resumen TEXT,
        fecha_creación TEXT NOT NULL,
        FOREIGN KEY (página_id) REFERENCES páginas_cms(id)
      );

      CREATE TABLE IF NOT EXISTS plantillas (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        descripción TEXT,
        tipo TEXT NOT NULL,
        contenido_html TEXT,
        bloques_editables TEXT,
        fecha_creación TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ctas (
        id TEXT PRIMARY KEY,
        página_id TEXT NOT NULL,
        texto TEXT NOT NULL,
        url TEXT NOT NULL,
        tipo TEXT,
        color TEXT,
        posición TEXT,
        clics_registrados INTEGER DEFAULT 0,
        fecha_creación TEXT NOT NULL,
        FOREIGN KEY (página_id) REFERENCES páginas_cms(id)
      );

      CREATE TABLE IF NOT EXISTS comentarios_cms (
        id TEXT PRIMARY KEY,
        página_id TEXT NOT NULL,
        usuario_id TEXT,
        contenido TEXT,
        resolución TEXT,
        estado TEXT DEFAULT 'abierto',
        fecha_creación TEXT NOT NULL,
        fecha_resolución TEXT,
        FOREIGN KEY (página_id) REFERENCES páginas_cms(id)
      );

      CREATE INDEX IF NOT EXISTS idx_páginas_slug ON páginas_cms(slug);
      CREATE INDEX IF NOT EXISTS idx_páginas_estado ON páginas_cms(estado);
      CREATE INDEX IF NOT EXISTS idx_versiones_página ON versiones_página(página_id);
      CREATE INDEX IF NOT EXISTS idx_ctas_página ON ctas(página_id);
    `);
  }

  savePágina(página: PáginaCMS): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO páginas_cms
      (id, título, slug, contenido, tipo, estado, categorías, etiquetas, autor_id, vistas, meta_descripción, palabras_clave, fecha_creación, fecha_actualización, fecha_publicación, fecha_programada)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      página.id,
      página.título,
      página.slug,
      página.contenido,
      página.tipo,
      página.estado,
      JSON.stringify(página.categorías),
      JSON.stringify(página.etiquetas),
      página.autorId,
      página.vistas,
      página.seo.metaDescripción,
      JSON.stringify(página.seo.palabrasClave),
      página.fechaCreación.toISOString(),
      página.fechaActualización.toISOString(),
      página.fechaPublicación?.toISOString() || null,
      página.fechaProgramada?.toISOString() || null
    );
  }

  getPágina(páginaId: string): PáginaCMS | null {
    const stmt = this.db.prepare("SELECT * FROM páginas_cms WHERE id = ?");
    const row = stmt.get(páginaId) as any;

    if (!row) return null;

    return {
      id: row.id,
      título: row.título,
      slug: row.slug,
      contenido: row.contenido,
      bloques: [],
      tipo: row.tipo,
      estado: row.estado,
      categorías: JSON.parse(row.categorías || "[]"),
      etiquetas: JSON.parse(row.etiquetas || "[]"),
      seo: {
        metaDescripción: row.meta_descripción,
        palabrasClave: JSON.parse(row.palabras_clave || "[]"),
        ogTitle: undefined,
        ogDescription: undefined,
        ogImage: undefined,
        canonicalUrl: undefined,
      },
      autorId: row.autor_id,
      vistas: row.vistas,
      fechaCreación: new Date(row.fecha_creación),
      fechaActualización: new Date(row.fecha_actualización),
      fechaPublicación: row.fecha_publicación
        ? new Date(row.fecha_publicación)
        : undefined,
      fechaProgramada: row.fecha_programada
        ? new Date(row.fecha_programada)
        : undefined,
    };
  }

  getAllPáginas(): PáginaCMS[] {
    const stmt = this.db.prepare("SELECT * FROM páginas_cms");
    const rows = stmt.all() as any[];

    return (rows.map((row) => ({
      id: row.id,
      título: row.título,
      slug: row.slug,
      contenido: row.contenido,
      bloques: [],
      tipo: row.tipo,
      estado: row.estado,
      categorías: JSON.parse(row.categorías || "[]"),
      etiquetas: JSON.parse(row.etiquetas || "[]"),
      seo: {
        metaDescripción: row.meta_descripción,
        palabrasClave: JSON.parse(row.palabras_clave || "[]"),
      },
      autorId: row.autor_id,
      vistas: row.vistas,
      fechaCreación: new Date(row.fecha_creación),
      fechaActualización: new Date(row.fecha_actualización),
      fechaPublicación: row.fecha_publicación
        ? new Date(row.fecha_publicación)
        : undefined,
      fechaProgramada: row.fecha_programada
        ? new Date(row.fecha_programada)
        : undefined,
    }) as unknown) as PáginaCMS[];
  }

  saveVersión(versión: VorisiónPágina): void {
    const stmt = this.db.prepare(`
      INSERT INTO versiones_página
      (id, página_id, número, título, contenido, autor_id, cambios_resumen, fecha_creación)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      versión.id,
      versión.páginaId,
      versión.número,
      versión.título,
      versión.contenido,
      versión.autorId,
      versión.cambiosResumen,
      versión.fechaCreación.toISOString()
    );
  }

  getVersionesPágina(páginaId: string): VorisiónPágina[] {
    const stmt = this.db.prepare(
      "SELECT * FROM versiones_página WHERE página_id = ? ORDER BY número DESC"
    );
    const rows = stmt.all(páginaId) as any[];

    return rows.map((row) => ({
      id: row.id,
      páginaId: row.página_id,
      número: row.número,
      título: row.título,
      contenido: row.contenido,
      autorId: row.autor_id,
      cambiosResumen: row.cambios_resumen,
      fechaCreación: new Date(row.fecha_creación),
    }));
  }

  close(): void {
    this.db.close();
  }
}
