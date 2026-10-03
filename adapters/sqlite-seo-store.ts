/**
 * SQLite Store para SEO
 * APPEND-ONLY para históricos de posiciones
 */

import Database from "better-sqlite3";
import type {
  KeywordMonitoring,
  HistóricoPosición,
} from "../elements/seo.js";

export class SqliteSEOStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS keywords_monitoring (
        id TEXT PRIMARY KEY,
        keyword TEXT NOT NULL,
        url TEXT NOT NULL,
        posición_actual INTEGER,
        posición_anterior INTEGER,
        volumen_búsqueda INTEGER DEFAULT 0,
        dificultad INTEGER DEFAULT 50,
        intención TEXT,
        competencia TEXT,
        activa BOOLEAN DEFAULT 1,
        fecha_última_actualización TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS histórico_posiciones (
        id TEXT PRIMARY KEY,
        keyword_id TEXT NOT NULL,
        posición INTEGER,
        impresiones INTEGER DEFAULT 0,
        clics INTEGER DEFAULT 0,
        ctr REAL DEFAULT 0,
        fecha TEXT NOT NULL,
        FOREIGN KEY (keyword_id) REFERENCES keywords_monitoring(id)
      );

      CREATE TABLE IF NOT EXISTS datos_google_search_console (
        id TEXT PRIMARY KEY,
        keyword TEXT NOT NULL,
        impresiones INTEGER,
        clics INTEGER,
        ctr REAL,
        posición_promedio REAL,
        período TEXT,
        fecha TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alertas_seo (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        keyword TEXT,
        umbral INTEGER,
        activa BOOLEAN DEFAULT 1,
        correo_notificación TEXT,
        fecha_creación TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reportes_seo (
        id TEXT PRIMARY KEY,
        período TEXT,
        puntuación_técnica INTEGER,
        puntuación_seo INTEGER,
        fecha_generación TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_keywords_active ON keywords_monitoring(activa);
      CREATE INDEX IF NOT EXISTS idx_histórico_keyword ON histórico_posiciones(keyword_id);
      CREATE INDEX IF NOT EXISTS idx_histórico_fecha ON histórico_posiciones(fecha);
      CREATE INDEX IF NOT EXISTS idx_gsc_keyword ON datos_google_search_console(keyword);
      CREATE INDEX IF NOT EXISTS idx_alertas_active ON alertas_seo(activa);
    `);
  }

  saveKeyword(keyword: KeywordMonitoring): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO keywords_monitoring
      (id, keyword, url, posición_actual, posición_anterior, volumen_búsqueda, dificultad, intención, competencia, activa, fecha_última_actualización)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      keyword.id,
      keyword.keyword,
      keyword.url,
      keyword.posiciónActual,
      keyword.posiciónAnterior || null,
      keyword.volumenBúsqueda,
      keyword.dificultad,
      keyword.intención,
      JSON.stringify(keyword.competencia),
      keyword.activa ? 1 : 0,
      keyword.fechaÚltimaActualización.toISOString()
    );
  }

  getKeyword(keywordId: string): KeywordMonitoring | null {
    const stmt = this.db.prepare("SELECT * FROM keywords_monitoring WHERE id = ?");
    const row = stmt.get(keywordId) as any;

    if (!row) return null;

    return {
      id: row.id,
      keyword: row.keyword,
      url: row.url,
      posiciónActual: row.posición_actual,
      posiciónAnterior: row.posición_anterior,
      volumenBúsqueda: row.volumen_búsqueda,
      dificultad: row.dificultad,
      intención: row.intención,
      competencia: JSON.parse(row.competencia || "[]"),
      fechaÚltimaActualización: new Date(row.fecha_última_actualización),
      activa: row.activa === 1,
    };
  }

  getAllKeywords(): KeywordMonitoring[] {
    const stmt = this.db.prepare("SELECT * FROM keywords_monitoring");
    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      id: row.id,
      keyword: row.keyword,
      url: row.url,
      posiciónActual: row.posición_actual,
      posiciónAnterior: row.posición_anterior,
      volumenBúsqueda: row.volumen_búsqueda,
      dificultad: row.dificultad,
      intención: row.intención,
      competencia: JSON.parse(row.competencia || "[]"),
      fechaÚltimaActualización: new Date(row.fecha_última_actualización),
      activa: row.activa === 1,
    }));
  }

  saveHistórico(histórico: HistóricoPosición): void {
    const stmt = this.db.prepare(`
      INSERT INTO histórico_posiciones
      (id, keyword_id, posición, impresiones, clics, ctr, fecha)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      histórico.id,
      histórico.keywordId,
      histórico.posición,
      histórico.impresiones,
      histórico.clics,
      histórico.ctr,
      histórico.fecha.toISOString()
    );
  }

  getHistóricoKeyword(keywordId: string): HistóricoPosición[] {
    const stmt = this.db.prepare(
      "SELECT * FROM histórico_posiciones WHERE keyword_id = ? ORDER BY fecha DESC"
    );
    const rows = stmt.all(keywordId) as any[];

    return rows.map((row) => ({
      id: row.id,
      keywordId: row.keyword_id,
      posición: row.posición,
      impresiones: row.impresiones,
      clics: row.clics,
      ctr: row.ctr,
      fecha: new Date(row.fecha),
    }));
  }

  close(): void {
    this.db.close();
  }
}
