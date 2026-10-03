/**
 * SQLite Store para Lead Management
 * APPEND-ONLY para eventos, versioning para cambios de estado
 */

import Database from "better-sqlite3";
import type {
  Lead,
  Formulario,
  EnvíoFormulario,
  MailingSecuencia,
  EventoLead,
} from "../elements/lead-management.js";

export class SqliteLeadManagementStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.inicializarTablas();
  }

  private inicializarTablas(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        empresa TEXT,
        teléfono TEXT,
        estado TEXT NOT NULL,
        puntuación INTEGER DEFAULT 0,
        temperatura TEXT DEFAULT 'fría',
        fecha_captura TEXT NOT NULL,
        fecha_último_contacto TEXT,
        fuente TEXT NOT NULL,
        etiquetas TEXT,
        notas TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS formularios (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        descripción TEXT,
        campos TEXT NOT NULL,
        estado TEXT DEFAULT 'borrador',
        cta_texto TEXT,
        cta_color TEXT,
        webhook_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS envíos_formulario (
        id TEXT PRIMARY KEY,
        formulario_id TEXT NOT NULL,
        datos TEXT NOT NULL,
        fecha_envío TEXT NOT NULL,
        ip_origen TEXT,
        user_agent TEXT,
        FOREIGN KEY (formulario_id) REFERENCES formularios(id)
      );

      CREATE TABLE IF NOT EXISTS secuencias (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        descripción TEXT,
        emails TEXT NOT NULL,
        intervalos TEXT NOT NULL,
        activa BOOLEAN DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS asignaciones_secuencia (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        secuencia_id TEXT NOT NULL,
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT,
        email_actual_index INTEGER DEFAULT 0,
        completada BOOLEAN DEFAULT 0,
        FOREIGN KEY (lead_id) REFERENCES leads(id),
        FOREIGN KEY (secuencia_id) REFERENCES secuencias(id)
      );

      CREATE TABLE IF NOT EXISTS registros_nurturing (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        asignacion_id TEXT,
        email_id TEXT,
        tipo TEXT NOT NULL,
        fecha_registro TEXT NOT NULL,
        metadatos TEXT,
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      );

      CREATE TABLE IF NOT EXISTS eventos_lead (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        tipo TEXT NOT NULL,
        puntos INTEGER NOT NULL,
        fecha TEXT NOT NULL,
        metadatos TEXT,
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      );

      CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
      CREATE INDEX IF NOT EXISTS idx_leads_estado ON leads(estado);
      CREATE INDEX IF NOT EXISTS idx_eventos_lead ON eventos_lead(lead_id);
      CREATE INDEX IF NOT EXISTS idx_registros_lead ON registros_nurturing(lead_id);
    `);
  }

  saveLead(lead: Lead): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO leads
      (id, email, nombre, empresa, teléfono, estado, puntuación, temperatura, fecha_captura, fecha_último_contacto, fuente, etiquetas, notas, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      lead.id,
      lead.email,
      lead.nombre,
      lead.empresa || null,
      lead.teléfono || null,
      lead.estado,
      lead.puntuación,
      lead.temperatura,
      lead.fechaCaptura.toISOString(),
      lead.fechaÚltimoContacto?.toISOString() || null,
      lead.fuente,
      JSON.stringify(lead.etiquetas),
      lead.notas || null,
      new Date().toISOString(),
      new Date().toISOString()
    );
  }

  getLead(leadId: string): Lead | null {
    const stmt = this.db.prepare("SELECT * FROM leads WHERE id = ?");
    const row = stmt.get(leadId) as any;

    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      nombre: row.nombre,
      empresa: row.empresa,
      teléfono: row.teléfono,
      estado: row.estado,
      puntuación: row.puntuación,
      temperatura: row.temperatura,
      fechaCaptura: new Date(row.fecha_captura),
      fechaÚltimoContacto: row.fecha_último_contacto
        ? new Date(row.fecha_último_contacto)
        : undefined,
      fuente: row.fuente,
      etiquetas: JSON.parse(row.etiquetas || "[]"),
      notas: row.notas,
    };
  }

  getAllLeads(): Lead[] {
    const stmt = this.db.prepare("SELECT * FROM leads");
    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      nombre: row.nombre,
      empresa: row.empresa,
      teléfono: row.teléfono,
      estado: row.estado,
      puntuación: row.puntuación,
      temperatura: row.temperatura,
      fechaCaptura: new Date(row.fecha_captura),
      fechaÚltimoContacto: row.fecha_último_contacto
        ? new Date(row.fecha_último_contacto)
        : undefined,
      fuente: row.fuente,
      etiquetas: JSON.parse(row.etiquetas || "[]"),
      notas: row.notas,
    }));
  }

  saveEvento(evento: EventoLead): void {
    const stmt = this.db.prepare(`
      INSERT INTO eventos_lead
      (id, lead_id, tipo, puntos, fecha, metadatos)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      evento.id,
      evento.leadId,
      evento.tipo,
      evento.puntos,
      evento.fecha.toISOString(),
      evento.metadatos ? JSON.stringify(evento.metadatos) : null
    );
  }

  getEventosLead(leadId: string): EventoLead[] {
    const stmt = this.db.prepare(
      "SELECT * FROM eventos_lead WHERE lead_id = ? ORDER BY fecha DESC"
    );
    const rows = stmt.all(leadId) as any[];

    return rows.map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      tipo: row.tipo,
      puntos: row.puntos,
      fecha: new Date(row.fecha),
      metadatos: row.metadatos ? JSON.parse(row.metadatos) : undefined,
    }));
  }

  close(): void {
    this.db.close();
  }
}
